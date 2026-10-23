import { spawnSync } from 'node:child_process'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { pathToFileURL } from 'node:url'

import pico from 'picocolors'
import semver from 'semver'

import { zeusNativePackages } from '../release.config'

const defaultRegistry = 'https://registry.npmjs.org'
const defaultConsistencyRetryDelays = [0, 1_000, 2_000, 5_000, 10_000]

export interface NativeLatestConsistencyOptions {
  retryDelays?: readonly number[]
  wait?: (ms: number) => Promise<void>
}

export interface NativeLatestCleanupPackageReport {
  packageName: string
  initialTags: Record<string, string> | null
  beforeRemovalTags: Record<string, string> | null
  finalTags: Record<string, string> | null
  removal: {
    attempted: boolean
    exitCode: number | null
    stderr: string | null
  }
  error: string | null
}

export interface NativeLatestCleanupReport {
  schemaVersion: 1
  registry: string
  expectedVersion: string | null
  startedAt: string
  finishedAt: string | null
  status: 'running' | 'passed' | 'failed'
  packages: NativeLatestCleanupPackageReport[]
  error: string | null
}

export interface NativeLatestCleanupPolicyInput {
  packages: readonly string[]
  expectedVersion: string
  tagsByPackage: ReadonlyMap<string, Readonly<Record<string, string>>>
}

export interface NativeLatestCleanupDependencies {
  packages: readonly string[]
  expectedVersion: string
  readTags: (pkg: string) => Promise<Record<string, string>>
  removeLatest: (pkg: string) => Promise<void>
  consistency?: NativeLatestConsistencyOptions
  report?: NativeLatestCleanupReport
}

export class NpmCommandError extends Error {
  constructor(
    message: string,
    readonly exitCode: number | null,
    readonly stderr: string,
  ) {
    super(message)
    this.name = 'NpmCommandError'
  }
}

export function getNativeLatestCleanupErrors(
  input: NativeLatestCleanupPolicyInput,
): string[] {
  const errors: string[] = []
  if (
    !semver.valid(input.expectedVersion) ||
    !semver.prerelease(input.expectedVersion)
  ) {
    errors.push(
      `expected version must be a valid prerelease: ${input.expectedVersion}`,
    )
  }

  for (const pkg of input.packages) {
    const tags = input.tagsByPackage.get(pkg)
    if (!tags) {
      errors.push(`${pkg}: dist-tags were not returned`)
    } else if (tags.latest && tags.latest !== input.expectedVersion) {
      errors.push(`${pkg}: latest points to ${tags.latest}, refusing cleanup`)
    }
  }
  return errors
}

export async function cleanupNativeLatestTags(
  dependencies: NativeLatestCleanupDependencies,
): Promise<void> {
  const entries = await Promise.all(
    dependencies.packages.map(async pkg => {
      try {
        const tags = await dependencies.readTags(pkg)
        setReportTags(dependencies.report, pkg, 'initialTags', tags)
        return [pkg, tags] as const
      } catch (error) {
        setReportError(dependencies.report, pkg, error)
        throw error
      }
    }),
  )
  const tagsByPackage = new Map(entries)
  const errors = getNativeLatestCleanupErrors({
    packages: dependencies.packages,
    expectedVersion: dependencies.expectedVersion,
    tagsByPackage,
  })
  if (errors.length) {
    for (const error of errors) setPolicyReportError(dependencies.report, error)
    throw new Error(
      `Native latest cleanup preflight failed:\n- ${errors.join('\n- ')}`,
    )
  }

  for (const pkg of dependencies.packages) {
    const initialTags = tagsByPackage.get(pkg)
    if (!initialTags?.latest) {
      setReportTags(dependencies.report, pkg, 'finalTags', initialTags ?? {})
      continue
    }

    let beforeRemoval: Record<string, string>
    try {
      beforeRemoval = await dependencies.readTags(pkg)
      setReportTags(
        dependencies.report,
        pkg,
        'beforeRemovalTags',
        beforeRemoval,
      )
    } catch (error) {
      setReportError(dependencies.report, pkg, error)
      throw error
    }
    if (beforeRemoval.latest !== dependencies.expectedVersion) {
      const error = new Error(
        `${pkg}: latest changed to ${beforeRemoval.latest ?? '<missing>'} before cleanup; expected ${dependencies.expectedVersion}`,
      )
      setReportError(dependencies.report, pkg, error)
      setReportTags(dependencies.report, pkg, 'finalTags', beforeRemoval)
      throw error
    }

    markRemovalAttempted(dependencies.report, pkg)
    try {
      await dependencies.removeLatest(pkg)
    } catch (error) {
      setReportRemovalError(dependencies.report, pkg, error)
      setReportError(dependencies.report, pkg, error)
      try {
        setReportTags(
          dependencies.report,
          pkg,
          'finalTags',
          await dependencies.readTags(pkg),
        )
      } catch (readError) {
        setReportError(dependencies.report, pkg, readError)
      }
      throw error
    }

    try {
      const finalTags = await assertLatestEventuallyMissing(dependencies, pkg)
      setReportTags(dependencies.report, pkg, 'finalTags', finalTags)
    } catch (error) {
      const lastTags = getLastObservedTags(error)
      if (lastTags)
        setReportTags(dependencies.report, pkg, 'finalTags', lastTags)
      setReportError(dependencies.report, pkg, error)
      throw error
    }
    console.log(pico.green(`${pkg}: removed polluted latest tag`))
  }
}

async function assertLatestEventuallyMissing(
  dependencies: Pick<
    NativeLatestCleanupDependencies,
    'readTags' | 'consistency'
  >,
  pkg: string,
): Promise<Record<string, string>> {
  const delays =
    dependencies.consistency?.retryDelays ?? defaultConsistencyRetryDelays
  const retryWait = dependencies.consistency?.wait ?? wait
  let current: Record<string, string> = {}

  for (const delay of delays.length ? delays : [0]) {
    if (delay > 0) await retryWait(delay)
    current = await dependencies.readTags(pkg)
    if (current.latest === undefined) return current
  }

  const error = new Error(
    `${pkg}: latest did not converge to <missing>; last observed ${current.latest ?? '<missing>'}`,
  )
  Object.assign(error, { lastTags: current })
  throw error
}

async function main(): Promise<void> {
  const expectedVersion = readOption('--expected-version')
  const confirmation = readOption('--confirm')
  const registry = readOption('--registry') ?? defaultRegistry
  const reportFile = readOption('--report-file')
  const report = reportFile
    ? createNativeLatestCleanupReport(
        registry,
        expectedVersion ?? null,
        zeusNativePackages,
      )
    : undefined

  try {
    await runCleanup({
      expectedVersion,
      confirmation,
      registry,
      report,
    })
    if (report) {
      report.status = 'passed'
      report.finishedAt = new Date().toISOString()
    }
  } catch (error) {
    if (report) {
      report.status = 'failed'
      report.error = formatError(error)
      report.finishedAt = new Date().toISOString()
    }
    throw error
  } finally {
    if (report && reportFile) writeNativeLatestCleanupReport(reportFile, report)
  }
}

async function runCleanup(options: {
  expectedVersion: string | undefined
  confirmation: string | undefined
  registry: string
  report?: NativeLatestCleanupReport
}): Promise<void> {
  const { expectedVersion, confirmation, registry, report } = options
  if (!expectedVersion || !confirmation) {
    throw new Error(
      'Usage: release:cleanup:native-latest --expected-version <version> --confirm <remove-native-latest:version> [--report-file <path>]',
    )
  }
  if (confirmation !== `remove-native-latest:${expectedVersion}`) {
    throw new Error(
      'Native latest cleanup confirmation does not match the version',
    )
  }
  if (!hasNpmAuth(registry)) {
    throw new Error(
      'NODE_AUTH_TOKEN or NPM_TOKEN is required in CI, or npm login must be active for the selected registry',
    )
  }

  const readTags = async (pkg: string): Promise<Record<string, string>> =>
    JSON.parse(
      runNpm(
        ['view', pkg, 'dist-tags', '--json', '--registry', registry],
        `read ${pkg} dist-tags`,
        true,
      ),
    ) as Record<string, string>

  await cleanupNativeLatestTags({
    packages: zeusNativePackages,
    expectedVersion,
    readTags,
    removeLatest: async pkg => {
      runNpm(
        ['dist-tag', 'rm', pkg, 'latest', '--registry', registry],
        `remove ${pkg} latest`,
      )
    },
    report,
  })

  console.log(
    pico.green(
      `Native latest cleanup passed (${zeusNativePackages.length} packages checked).`,
    ),
  )
}

export function createNativeLatestCleanupReport(
  registry: string,
  expectedVersion: string | null,
  packages: readonly string[],
): NativeLatestCleanupReport {
  return {
    schemaVersion: 1,
    registry: sanitizeRegistry(registry),
    expectedVersion,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    status: 'running',
    packages: packages.map(packageName => ({
      packageName,
      initialTags: null,
      beforeRemovalTags: null,
      finalTags: null,
      removal: { attempted: false, exitCode: null, stderr: null },
      error: null,
    })),
    error: null,
  }
}

export function writeNativeLatestCleanupReport(
  file: string,
  report: NativeLatestCleanupReport,
): void {
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
}

function getReportPackage(
  report: NativeLatestCleanupReport | undefined,
  pkg: string,
): NativeLatestCleanupPackageReport | undefined {
  return report?.packages.find(entry => entry.packageName === pkg)
}

function setReportTags(
  report: NativeLatestCleanupReport | undefined,
  pkg: string,
  field: 'initialTags' | 'beforeRemovalTags' | 'finalTags',
  tags: Record<string, string>,
): void {
  const entry = getReportPackage(report, pkg)
  if (entry) entry[field] = { ...tags }
}

function markRemovalAttempted(
  report: NativeLatestCleanupReport | undefined,
  pkg: string,
): void {
  const entry = getReportPackage(report, pkg)
  if (entry) entry.removal.attempted = true
}

function setReportRemovalError(
  report: NativeLatestCleanupReport | undefined,
  pkg: string,
  error: unknown,
): void {
  const entry = getReportPackage(report, pkg)
  if (!entry || !(error instanceof NpmCommandError)) return
  entry.removal.exitCode = error.exitCode
  entry.removal.stderr = summarizeStderr(error.stderr)
}

function setReportError(
  report: NativeLatestCleanupReport | undefined,
  pkg: string,
  error: unknown,
): void {
  const entry = getReportPackage(report, pkg)
  if (entry) entry.error = formatError(error)
}

function setPolicyReportError(
  report: NativeLatestCleanupReport | undefined,
  error: string,
): void {
  if (!report) return
  const entry = report.packages.find(item =>
    error.startsWith(`${item.packageName}:`),
  )
  if (entry) entry.error = error
  else report.error = error
}

function getLastObservedTags(
  error: unknown,
): Record<string, string> | undefined {
  if (!error || typeof error !== 'object') return undefined
  const tags = (error as { lastTags?: unknown }).lastTags
  if (!tags || typeof tags !== 'object' || Array.isArray(tags)) return undefined
  return tags as Record<string, string>
}

function formatError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return summarizeStderr(message)
}

function summarizeStderr(stderr: string): string {
  const normalized = stderr
    .trim()
    .replace(/\s+/g, ' ')
    .replace(
      /(authorization\s*[:=]\s*)(basic|bearer)\s+[^\s;,]+/gi,
      '$1$2 <redacted>',
    )
    .replace(
      /((?:_authToken|_auth|_password|npm[_-]?token|access[_-]?token|token|password)\s*[:=]\s*)[^\s;,]+/gi,
      '$1<redacted>',
    )
    .replace(/(\b[a-z][a-z0-9+.-]*:\/\/)[^/\s@]+@/gi, '$1<redacted>@')
    .replace(
      /([?&](?:_authToken|access[_-]?token|token|auth|password)=)[^&#\s;,]*/gi,
      '$1<redacted>',
    )
  return normalized.length > 2_000
    ? `${normalized.slice(0, 2_000)}...`
    : normalized
}

function sanitizeRegistry(registry: string): string {
  try {
    const url = new URL(registry)
    url.username = ''
    url.password = ''
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return '<invalid registry URL omitted>'
  }
}

function runNpm(args: string[], label: string, capture = false): string {
  const result = spawnSync('npm', args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN ?? process.env.NPM_TOKEN,
    },
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (!capture && result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0) {
    const stderr = result.stderr || result.error?.message || 'unknown npm error'
    throw new NpmCommandError(
      `${label} failed (${result.status ?? 'unknown'}): ${stderr}`,
      result.status,
      stderr,
    )
  }
  return result.stdout.trim()
}

function hasNpmAuth(registry: string): boolean {
  if (process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN) return true

  const result = spawnSync('npm', ['whoami', '--registry', registry], {
    cwd: process.cwd(),
    env: process.env,
    encoding: 'utf8',
    stdio: 'ignore',
    shell: process.platform === 'win32',
  })
  return result.status === 0
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--'))
    throw new Error(`${name} requires a value`)
  return value
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
