import { execFile } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import pico from 'picocolors'
import semver from 'semver'
import { createVerifier, type Bundle, type BundleVerifier } from 'sigstore'

import { zeusFixedPackages, zeusNativePackages } from '../release.config'

const execFileAsync = promisify(execFile)
const provenancePredicate = 'https://slsa.dev/provenance/v1'
const statementType = 'https://in-toto.io/Statement/v1'
const githubWorkflowBuildType =
  'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1'
const githubHostedBuilder = 'https://github.com/actions/runner/github-hosted'
const githubIssuer = 'https://token.actions.githubusercontent.com'
const retryDelays = [
  0, 2_000, 5_000, 10_000, 20_000, 30_000, 60_000, 120_000, 180_000,
]

export interface DistTagPolicyInput {
  packages?: readonly string[]
  expectedVersion: string
  expectedTag: string
  expectedSha?: string
  requireProvenance: boolean
  tagsByPackage: ReadonlyMap<string, Readonly<Record<string, string>>>
  provenanceByPackage: ReadonlyMap<string, boolean | undefined>
}

export interface ProvenanceExpectation {
  packageName: string
  version: string
  integrity: string
  repository: string
  workflowPath: string
  ref: string
  sha: string
}

interface ProvenanceSourceExpectation {
  repository: string
  workflowPath: string
  ref: string
  sha: string
}

interface RegistryAttestations {
  attestations?: Array<{
    predicateType?: unknown
    bundle?: unknown
  }>
}

export class RetryableRegistryError extends Error {}
class ProvenancePolicyError extends Error {}

export async function settleRegistryBatch<const T extends readonly unknown[]>(
  pending: T,
): Promise<{ -readonly [Key in keyof T]: Awaited<T[Key]> }> {
  const results = await Promise.allSettled(pending)
  const failures = results.filter(
    (result): result is PromiseRejectedResult => result.status === 'rejected',
  )
  const failure =
    failures.find(
      result => !(result.reason instanceof RetryableRegistryError),
    ) ?? failures[0]

  if (failure) throw failure.reason

  return results.map(result => {
    if (result.status === 'rejected') throw result.reason
    return result.value
  }) as { -readonly [Key in keyof T]: Awaited<T[Key]> }
}

export async function runRegistryRetries<T>(
  operation: () => Promise<T>,
  delays: readonly number[] = retryDelays,
  sleep: (ms: number) => Promise<void> = wait,
): Promise<T> {
  let lastError: RetryableRegistryError | undefined

  for (const delay of delays) {
    if (delay > 0) await sleep(delay)
    try {
      return await operation()
    } catch (error) {
      if (!(error instanceof RetryableRegistryError)) throw error
      lastError = error
    }
  }

  throw lastError ?? new Error('Registry retry schedule is empty')
}

export async function createVerifierWithRetry(
  create: () => Promise<BundleVerifier>,
  delays: readonly number[] = retryDelays,
  sleep: (ms: number) => Promise<void> = wait,
): Promise<BundleVerifier> {
  return runRegistryRetries(
    async () => {
      try {
        return await create()
      } catch (error) {
        if (!isRetryableTufInitializationError(error)) throw error
        throw new RetryableRegistryError(
          `Sigstore verifier initialization failed: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    },
    delays,
    sleep,
  )
}

export function getDistTagPolicyErrors(input: DistTagPolicyInput): string[] {
  const errors: string[] = []
  const expectedShortSha = input.expectedSha?.slice(0, 8).toLowerCase()

  if (
    expectedShortSha &&
    input.expectedVersion.includes('-canary.') &&
    !input.expectedVersion.toLowerCase().endsWith(`.${expectedShortSha}`)
  ) {
    errors.push(
      `version ${input.expectedVersion} does not identify expected SHA ${expectedShortSha}`,
    )
  }

  for (const pkg of input.packages ?? zeusFixedPackages) {
    const tags = input.tagsByPackage.get(pkg)
    if (!tags) {
      errors.push(`${pkg}: dist-tags were not returned`)
      continue
    }
    if (tags[input.expectedTag] !== input.expectedVersion) {
      errors.push(
        `${pkg}: ${input.expectedTag} points to ${tags[input.expectedTag] ?? '<missing>'}, expected ${input.expectedVersion}`,
      )
    }
    if (
      input.expectedTag !== 'beta' &&
      zeusNativePackages.includes(pkg) &&
      tags.latest &&
      semver.prerelease(tags.latest)
    ) {
      errors.push(`${pkg}: latest must not point to prerelease ${tags.latest}`)
    }
    if (input.requireProvenance && !input.provenanceByPackage.get(pkg)) {
      errors.push(`${pkg}@${input.expectedVersion}: npm provenance is missing`)
    }
  }

  return errors
}

export function getProvenanceStatementErrors(
  statement: unknown,
  expected: ProvenanceExpectation,
): string[] {
  const errors: string[] = []
  const root = asRecord(statement)
  if (!root) return ['provenance statement must be an object']

  if (root._type !== statementType) {
    errors.push(`statement type does not match ${statementType}`)
  }
  if (root.predicateType !== provenancePredicate) {
    errors.push(`predicate type does not match ${provenancePredicate}`)
  }

  const subjects = Array.isArray(root.subject) ? root.subject : []
  const expectedSubject = npmPackageUrl(expected.packageName, expected.version)
  const expectedDigest = integritySha512Hex(expected.integrity)
  if (subjects.length !== 1) {
    errors.push('statement must contain exactly one subject')
  }
  const subject = asRecord(subjects[0])
  const digest = asRecord(subject?.digest)
  if (subject?.name !== expectedSubject) {
    errors.push(`subject does not match ${expectedSubject}`)
  }
  if (digest?.sha512 !== expectedDigest) {
    errors.push('subject sha512 does not match npm dist.integrity')
  }

  const predicate = asRecord(root.predicate)
  const buildDefinition = asRecord(predicate?.buildDefinition)
  if (buildDefinition?.buildType !== githubWorkflowBuildType) {
    errors.push(`build type does not match ${githubWorkflowBuildType}`)
  }

  const externalParameters = asRecord(buildDefinition?.externalParameters)
  const workflow = asRecord(externalParameters?.workflow)
  if (workflow?.repository !== expected.repository) {
    errors.push(`workflow repository does not match ${expected.repository}`)
  }
  if (workflow?.path !== expected.workflowPath) {
    errors.push(`workflow path does not match ${expected.workflowPath}`)
  }
  if (workflow?.ref !== expected.ref) {
    errors.push(`workflow ref does not match ${expected.ref}`)
  }

  const dependencies = Array.isArray(buildDefinition?.resolvedDependencies)
    ? buildDefinition.resolvedDependencies
    : []
  const expectedUri = `git+${expected.repository}@${expected.ref}`
  const source = dependencies
    .map(asRecord)
    .find(dependency => dependency?.uri === expectedUri)
  if (!source) {
    errors.push(`resolved source does not match ${expectedUri}`)
  } else if (asRecord(source.digest)?.gitCommit !== expected.sha) {
    errors.push(`git commit does not match ${expected.sha}`)
  }

  const runDetails = asRecord(predicate?.runDetails)
  const builder = asRecord(runDetails?.builder)
  if (builder?.id !== githubHostedBuilder) {
    errors.push(`builder does not match ${githubHostedBuilder}`)
  }

  return errors
}

async function readDistTags(
  pkg: string,
  registry: string,
): Promise<Record<string, string>> {
  return readNpmJson<Record<string, string>>(pkg, [
    'view',
    pkg,
    'dist-tags',
    '--json',
    '--registry',
    registry,
  ])
}

async function readIntegrity(
  pkg: string,
  version: string,
  registry: string,
): Promise<string> {
  const value = await readNpmJson<unknown>(`${pkg}@${version}`, [
    'view',
    `${pkg}@${version}`,
    'dist.integrity',
    '--json',
    '--registry',
    registry,
  ])
  if (typeof value !== 'string') {
    throw new RetryableRegistryError(
      `${pkg}@${version}: dist.integrity is missing`,
    )
  }
  integritySha512Hex(value)
  return value
}

async function readNpmJson<T>(label: string, args: string[]): Promise<T> {
  let stdout: string
  try {
    ;({ stdout } = await execFileAsync('npm', args, {
      cwd: process.cwd(),
      maxBuffer: 1024 * 1024,
    }))
  } catch (error) {
    const message = npmCommandErrorMessage(error)
    if (isRetryableRegistryMessage(message)) {
      throw new RetryableRegistryError(`${label}: ${message}`)
    }
    throw new ProvenancePolicyError(
      `${label}: npm registry query failed: ${message}`,
    )
  }

  try {
    return JSON.parse(stdout.trim()) as T
  } catch (error) {
    throw new ProvenancePolicyError(
      `${label}: npm registry returned invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

function npmCommandErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error)
  const commandError = error as Error & { stderr?: string; stdout?: string }
  return [commandError.message, commandError.stderr, commandError.stdout]
    .filter(Boolean)
    .join('\n')
}

function isRetryableRegistryMessage(message: string): boolean {
  return (
    /\bE404\b|404 Not Found|\b429\b|\b5\d\d\b/.test(message) ||
    /ETIMEDOUT|ECONNRESET|ECONNABORTED|EAI_AGAIN|ENOTFOUND/.test(message)
  )
}

function isRetryableTufInitializationError(error: unknown): boolean {
  let current: unknown = error
  const seen = new Set<unknown>()

  while (current && typeof current === 'object' && !seen.has(current)) {
    seen.add(current)
    const details = asRecord(current)
    const code = details?.code
    const message = current instanceof Error ? current.message : String(current)
    if (
      (typeof code === 'string' &&
        /^(?:E(?:TIMEDOUT|CONNRESET|CONNABORTED|AI_AGAIN|NOTFOUND))$/.test(
          code,
        )) ||
      isRetryableRegistryMessage(message)
    ) {
      return true
    }
    current = details?.cause
  }

  return false
}

async function verifyPackageProvenance(options: {
  pkg: string
  version: string
  registry: string
  verifier: BundleVerifier
  source: ProvenanceSourceExpectation
}): Promise<void> {
  const integrity = await readIntegrity(
    options.pkg,
    options.version,
    options.registry,
  )
  const attestations = await readRegistryAttestations(
    options.pkg,
    options.version,
    options.registry,
  )
  const provenance = (attestations.attestations ?? []).filter(
    attestation => attestation.predicateType === provenancePredicate,
  )
  if (provenance.length === 0) {
    throw new RetryableRegistryError(
      `${options.pkg}@${options.version}: provenance has not propagated`,
    )
  }
  if (provenance.length !== 1 || !provenance[0]?.bundle) {
    throw new ProvenancePolicyError(
      `${options.pkg}@${options.version}: expected exactly one SLSA provenance bundle`,
    )
  }

  const bundle = provenance[0].bundle as Bundle
  try {
    options.verifier.verify(bundle)
  } catch (error) {
    throw new ProvenancePolicyError(
      `${options.pkg}@${options.version}: Sigstore verification failed: ${error instanceof Error ? error.message : String(error)}`,
    )
  }

  const payload = asRecord(bundle)?.dsseEnvelope
  const encoded = asRecord(payload)?.payload
  if (typeof encoded !== 'string') {
    throw new ProvenancePolicyError(
      `${options.pkg}@${options.version}: signed SLSA payload is missing`,
    )
  }

  let statement: unknown
  try {
    statement = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'))
  } catch (error) {
    throw new ProvenancePolicyError(
      `${options.pkg}@${options.version}: signed SLSA payload is invalid JSON`,
    )
  }

  const errors = getProvenanceStatementErrors(statement, {
    packageName: options.pkg,
    version: options.version,
    integrity,
    ...options.source,
  })
  if (errors.length) {
    throw new ProvenancePolicyError(
      `${options.pkg}@${options.version}: invalid provenance:\n- ${errors.join('\n- ')}`,
    )
  }
}

async function readRegistryAttestations(
  pkg: string,
  version: string,
  registry: string,
): Promise<RegistryAttestations> {
  const base = new URL(registry)
  if (base.protocol !== 'https:') {
    throw new ProvenancePolicyError('Provenance registry must use HTTPS')
  }
  const url = new URL(
    `/-/npm/v1/attestations/${encodeURIComponent(`${pkg}@${version}`)}`,
    base,
  )

  let response: Response
  try {
    response = await fetch(url, {
      headers: { accept: 'application/json' },
      redirect: 'error',
    })
  } catch (error) {
    throw new RetryableRegistryError(
      `${pkg}@${version}: unable to read npm attestations: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
  if (
    response.status === 404 ||
    response.status === 429 ||
    response.status >= 500
  ) {
    throw new RetryableRegistryError(
      `${pkg}@${version}: npm attestation endpoint returned ${response.status}`,
    )
  }
  if (!response.ok) {
    throw new ProvenancePolicyError(
      `${pkg}@${version}: npm attestation endpoint returned ${response.status}`,
    )
  }

  try {
    return (await response.json()) as RegistryAttestations
  } catch (error) {
    throw new ProvenancePolicyError(
      `${pkg}@${version}: npm attestation response is invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

async function verifyWithRetry(options: {
  packages: readonly string[]
  version: string
  tag: string
  sha?: string
  registry: string
  requireProvenance: boolean
  workflowPath?: string
  ref?: string
}): Promise<void> {
  const source = options.requireProvenance
    ? requireProvenanceSource(options)
    : undefined
  const verifier = source
    ? await createVerifierWithRetry(() =>
        createVerifier({
          certificateIssuer: githubIssuer,
          certificateIdentityURI: `^${escapeRegExp(
            `${source.repository}/${source.workflowPath}@${source.ref}`,
          )}$`,
          certificateOIDs: {
            '1.3.6.1.4.1.57264.1.3': source.sha,
            '1.3.6.1.4.1.57264.1.5': 'baicie/zeus',
            '1.3.6.1.4.1.57264.1.6': source.ref,
          },
        }),
      )
    : undefined
  try {
    await runRegistryRetries(async () => {
      const entries = await settleRegistryBatch(
        options.packages.map(async pkg => {
          const [tags] = await settleRegistryBatch([
            readDistTags(pkg, options.registry),
            source && verifier
              ? verifyPackageProvenance({
                  pkg,
                  version: options.version,
                  registry: options.registry,
                  verifier,
                  source,
                })
              : undefined,
          ])
          return [pkg, tags, Boolean(source)] as const
        }),
      )
      const errors = getDistTagPolicyErrors({
        expectedVersion: options.version,
        expectedTag: options.tag,
        expectedSha: options.sha,
        requireProvenance: options.requireProvenance,
        packages: options.packages,
        tagsByPackage: new Map(entries.map(([pkg, tags]) => [pkg, tags])),
        provenanceByPackage: new Map(
          entries.map(([pkg, , provenance]) => [pkg, provenance]),
        ),
      })
      if (errors.length === 0) return
      const permanentErrors = errors.filter(
        error =>
          error.includes('latest must not point to prerelease') ||
          error.startsWith('version '),
      )
      if (permanentErrors.length) {
        throw new ProvenancePolicyError(permanentErrors.join('\n- '))
      }
      throw new RetryableRegistryError(errors.join('\n- '))
    })
  } catch (error) {
    if (error instanceof ProvenancePolicyError) throw error
    const details = error instanceof Error ? error.message : String(error)
    throw new Error(`npm dist-tag verification failed:\n- ${details}`)
  }
}

async function main(): Promise<void> {
  const version = readOption('--version')
  const tag = readOption('--tag')
  const sha = readOption('--sha')
  const workflowPath = readOption('--workflow-path')
  const ref = readOption('--ref')
  const selectedPackage = readOption('--package')
  const registry = readOption('--registry') ?? 'https://registry.npmjs.org'
  const requireProvenance = process.argv.includes('--require-provenance')

  if (!version || !tag) {
    throw new Error(
      'Usage: release:verify:dist-tags --version <version> --tag <tag> [--sha <sha>] [--workflow-path <path> --ref <ref> --require-provenance]',
    )
  }
  if (!semver.valid(version)) throw new Error(`Invalid version: ${version}`)
  if (selectedPackage && !zeusFixedPackages.includes(selectedPackage)) {
    throw new Error(
      `Package is not in the Zeus fixed release group: ${selectedPackage}`,
    )
  }

  const packages = selectedPackage ? [selectedPackage] : zeusFixedPackages

  await verifyWithRetry({
    packages,
    version,
    tag,
    sha,
    registry,
    requireProvenance,
    workflowPath,
    ref,
  })

  console.log(
    pico.green(
      `npm dist-tags passed (${packages.length} package${packages.length === 1 ? '' : 's'}, ${tag} -> ${version}${requireProvenance ? ', signed provenance verified' : ''}).`,
    ),
  )
}

function requireProvenanceSource(options: {
  sha?: string
  workflowPath?: string
  ref?: string
}): ProvenanceSourceExpectation {
  if (!options.sha || !/^[0-9a-f]{40}$/i.test(options.sha)) {
    throw new Error('--sha must be a complete 40-character git SHA')
  }
  if (!options.workflowPath?.startsWith('.github/workflows/')) {
    throw new Error('--workflow-path must be under .github/workflows')
  }
  if (!options.ref?.startsWith('refs/')) {
    throw new Error('--ref must be a complete git ref')
  }
  return {
    repository: 'https://github.com/baicie/zeus',
    workflowPath: options.workflowPath,
    ref: options.ref,
    sha: options.sha.toLowerCase(),
  }
}

function npmPackageUrl(packageName: string, version: string): string {
  const encoded = packageName.startsWith('@')
    ? `%40${packageName.slice(1)}`
    : packageName
  return `pkg:npm/${encoded}@${version}`
}

function integritySha512Hex(integrity: string): string {
  if (!integrity.startsWith('sha512-')) {
    throw new ProvenancePolicyError('npm dist.integrity must use sha512')
  }
  const digest = Buffer.from(integrity.slice('sha512-'.length), 'base64')
  if (digest.length !== 64) {
    throw new ProvenancePolicyError('npm dist.integrity has an invalid sha512')
  }
  return digest.toString('hex')
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--')) {
    throw new Error(`${name} requires a value`)
  }
  return value
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
