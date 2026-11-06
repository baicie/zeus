/**
 * Host-deployment Stage 2. It is dependency-free at validation time (the
 * workflow runs `pnpm install --ignore-scripts` only after the source guard)
 * and never interpolates workflow inputs into shell text. Paths, tenant ids,
 * digests and release ancestry are validated before any Docker operation.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { verifyProvenance } from './build-info'

export const TENANT_PATTERN = /^[a-z0-9](?:[a-z0-9-]{1,30}[a-z0-9])$/
const SHA_PATTERN = /^[0-9a-f]{40}$/i
const DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/i
const SAFE_FILE = /^[A-Za-z0-9._-]+$/

export interface Stage2Input {
  readonly artifactDir: string
  readonly manifestName: string
  readonly provenanceName: string
  readonly candidateName: string
  readonly tenant: string
  readonly expectedCore: string
  readonly expectedUi: string
  readonly manifestSha256: string
  readonly provenanceSha256: string
  readonly candidateSha256: string
  readonly enabled: string
  readonly ingressVerified: string
  readonly adminEmail: string
  readonly adminPassword: string
  readonly simulate: boolean
}

export function validateTenant(value: string): string {
  if (!TENANT_PATTERN.test(value)) {
    throw new Error(
      'tenant must be 3-32 lowercase letters, digits or hyphens, starting and ending alphanumeric',
    )
  }
  return value
}

export function resolveArtifactFile(root: string, name: string): string {
  const segments = name.split('/')
  if (
    segments.length === 0 ||
    segments.some(
      segment =>
        !SAFE_FILE.test(segment) || segment === '.' || segment === '..',
    ) ||
    path.isAbsolute(name)
  ) {
    throw new Error('artifact path must be a safe relative path')
  }
  const absoluteRoot = fs.realpathSync(root)
  const candidate = path.resolve(absoluteRoot, ...segments)
  if (!candidate.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error('artifact file escapes the approved artifact directory')
  }
  const stat = fs.lstatSync(candidate)
  if (stat.isSymbolicLink()) {
    throw new Error('artifact file must not be a symlink')
  }
  const real = fs.realpathSync(candidate)
  if (real !== candidate || !real.startsWith(`${absoluteRoot}${path.sep}`)) {
    throw new Error('artifact file resolves outside the approved directory')
  }
  if (!stat.isFile()) throw new Error('artifact path must be a regular file')
  return candidate
}

export function validateReleaseIdentity(input: {
  readonly head: string
  readonly main: string
  readonly expectedCore: string
  readonly expectedUi: string
  readonly manifestCore: string
  readonly manifestUi: string
}): string[] {
  const errors: string[] = []
  if (!SHA_PATTERN.test(input.expectedCore)) {
    errors.push('expected Core SHA must be a full commit')
  }
  if (!SHA_PATTERN.test(input.expectedUi)) {
    errors.push('expected UI SHA must be a full commit')
  }
  if (input.head !== input.expectedCore) {
    errors.push('checked-out HEAD does not match the expected Core SHA')
  }
  if (input.manifestCore !== input.expectedCore) {
    errors.push('manifest Core commit does not match the expected Core SHA')
  }
  if (input.manifestUi !== input.expectedUi) {
    errors.push('manifest UI commit does not match the expected UI SHA')
  }
  if (!isAncestor(input.head, input.main)) {
    errors.push('deployment commit is not an ancestor of main')
  }
  return errors
}

export function verifyFileSha256(file: string, expected: string): void {
  if (!DIGEST_PATTERN.test(expected)) {
    throw new Error('expected artifact digest must be sha256:<64 hex>')
  }
  const actual = `sha256:${createHash('sha256')
    .update(fs.readFileSync(file))
    .digest('hex')}`
  if (actual !== expected) {
    throw new Error(`artifact digest mismatch for ${path.basename(file)}`)
  }
}

export function validateStage2Input(input: Stage2Input): string[] {
  const errors: string[] = []
  if (input.enabled !== 'true') errors.push('deployment gate is not enabled')
  if (!input.simulate && input.ingressVerified !== 'true') {
    errors.push('TLS ingress has not been verified')
  }
  try {
    validateTenant(input.tenant)
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error))
  }
  for (const [label, value] of [
    ['Core SHA', input.expectedCore],
    ['UI SHA', input.expectedUi],
    ['manifest digest', input.manifestSha256],
    ['provenance digest', input.provenanceSha256],
    ['candidate digest', input.candidateSha256],
  ] as const) {
    if (!SHA_PATTERN.test(value) && !DIGEST_PATTERN.test(value)) {
      errors.push(`${label} has an invalid format`)
    }
  }
  if (!input.adminEmail || !input.adminPassword) {
    errors.push('acceptance credentials are missing')
  }
  return errors
}

export function readJson(file: string): Record<string, unknown> {
  const value = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${path.basename(file)} must be a JSON object`)
  }
  return value as Record<string, unknown>
}

export function verifyStage2Artifacts(input: {
  readonly artifactDir: string
  readonly input: Stage2Input
}): {
  manifest: Record<string, unknown>
  provenance: Record<string, unknown>
  candidate: Record<string, unknown>
  files: Record<string, string>
} {
  const manifestFile = resolveArtifactFile(
    input.artifactDir,
    input.input.manifestName,
  )
  const provenanceFile = resolveArtifactFile(
    input.artifactDir,
    input.input.provenanceName,
  )
  const candidateFile = resolveArtifactFile(
    input.artifactDir,
    input.input.candidateName,
  )
  verifyFileSha256(manifestFile, input.input.manifestSha256)
  verifyFileSha256(provenanceFile, input.input.provenanceSha256)
  verifyFileSha256(candidateFile, input.input.candidateSha256)
  const manifest = readJson(manifestFile)
  const provenance = readJson(provenanceFile)
  const candidate = readJson(candidateFile)
  if (manifest.schema !== 'zeus.deployment-manifest/v2') {
    throw new Error('manifest schema is not zeus.deployment-manifest/v2')
  }
  if (provenance.schema !== 'zeus.provenance/v1') {
    throw new Error('provenance schema is not zeus.provenance/v1')
  }
  const products = Array.isArray(manifest.products) ? manifest.products : []
  const provenanceResult = verifyProvenance(provenance, {
    coreCommit: String(manifest.coreCommit),
    uiCommit: String(manifest.uiCommit),
    products: products.map(product => ({
      product: String((product as Record<string, unknown>).product),
      artifactDigest: String(
        (product as Record<string, unknown>).artifactDigest,
      ),
      ...(typeof (product as Record<string, unknown>).imageDigest === 'string'
        ? {
            imageDigest: String(
              (product as Record<string, unknown>).imageDigest,
            ),
          }
        : {}),
    })),
  })
  if (provenanceResult.errors.length > 0) {
    throw new Error(provenanceResult.errors.join('; '))
  }
  const candidateImages =
    typeof candidate.images === 'object' && candidate.images !== null
      ? (candidate.images as Record<string, Record<string, unknown>>)
      : {}
  const files: Record<string, string> = {}
  for (const [key, image] of Object.entries(candidateImages)) {
    const archive = resolveArtifactFile(
      input.artifactDir,
      String(image.ociArchive),
    )
    verifyFileSha256(archive, String(image.ociSha256))
    files[key] = archive
  }
  return { manifest, provenance, candidate, files }
}

export function runStage2(
  input: Stage2Input,
  options: { readonly simulate: boolean },
): void {
  const errors = validateStage2Input(input)
  if (errors.length > 0) throw new Error(errors.join('; '))
  const head = git(['rev-parse', 'HEAD'])
  const main = git(['rev-parse', 'origin/main'])
  const artifacts = verifyStage2Artifacts({
    artifactDir: input.artifactDir,
    input,
  })
  const manifest = artifacts.manifest
  const releaseErrors = validateReleaseIdentity({
    head,
    main,
    expectedCore: input.expectedCore,
    expectedUi: input.expectedUi,
    manifestCore: String(manifest.coreCommit),
    manifestUi: String(manifest.uiCommit),
  })
  if (releaseErrors.length > 0) throw new Error(releaseErrors.join('; '))
  if (options.simulate) {
    console.log('STAGE2_SIMULATED_OK')
    return
  }
  for (const archive of Object.values(artifacts.files)) {
    run('docker', ['load', '--input', archive])
  }
  console.log('STAGE2_ARTIFACTS_VERIFIED')
}

function isAncestor(commit: string, main: string): boolean {
  const result = spawnSync(
    'git',
    ['merge-base', '--is-ancestor', commit, main],
    { encoding: 'utf8' },
  )
  return result.status === 0
}

function git(args: readonly string[]): string {
  return execFileSync('git', args, { encoding: 'utf8' }).trim()
}

function run(command: string, args: readonly string[]): void {
  const result = spawnSync(command, args, { stdio: 'inherit' })
  if (result.status !== 0) throw new Error(`${command} failed`)
}

function main(): void {
  const { values } = parseArgs({
    options: { simulate: { type: 'boolean', default: false } },
  })
  const simulate =
    values.simulate === true || process.env.ZEUS_DEPLOY_SIMULATE === 'true'
  const input: Stage2Input = {
    artifactDir: process.env.ZEUS_DEPLOY_ARTIFACT_DIR ?? '',
    manifestName: process.env.ZEUS_DEPLOY_MANIFEST ?? '',
    provenanceName: process.env.ZEUS_DEPLOY_PROVENANCE ?? '',
    candidateName:
      process.env.ZEUS_DEPLOY_CANDIDATE ?? 'deployment-candidate.json',
    tenant: process.env.ZEUS_DEPLOY_TENANT ?? '',
    expectedCore: process.env.ZEUS_DEPLOY_EXPECTED_CORE ?? '',
    expectedUi: process.env.ZEUS_DEPLOY_EXPECTED_UI ?? '',
    manifestSha256: process.env.ZEUS_DEPLOY_MANIFEST_SHA256 ?? '',
    provenanceSha256: process.env.ZEUS_DEPLOY_PROVENANCE_SHA256 ?? '',
    candidateSha256: process.env.ZEUS_DEPLOY_CANDIDATE_SHA256 ?? '',
    enabled: process.env.ZEUS_HOST_DEPLOY_ENABLED ?? '',
    ingressVerified: process.env.ZEUS_DEPLOY_INGRESS_VERIFIED ?? '',
    adminEmail: process.env.ZEUS_ACCEPTANCE_ADMIN_EMAIL ?? '',
    adminPassword: process.env.ZEUS_ACCEPTANCE_ADMIN_PASSWORD ?? '',
    simulate,
  }
  runStage2(input, { simulate: input.simulate })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
