/**
 * Canary readiness is intentionally narrower than RC readiness. Canary proves
 * that the current main source can be published as packages; it does not
 * require stable-release deployment, manual A11y or release approval evidence.
 */
import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { isDeepStrictEqual } from 'node:util'

import { scanSecrets } from './check-secrets'
import { listReleaseChanges } from '../release/release-rewrite-guard'
import { zeusFixedPackages } from '../release.config'
import { findWorkspacePackages } from '../shared/utils'

export type CanaryReadinessStatus = 'pass' | 'fail' | 'not_run'

export interface CanaryCheck {
  readonly id: string
  readonly status: CanaryReadinessStatus
  readonly evidence: string
}

export interface CanaryReportEvidence {
  readonly status: CanaryReadinessStatus
  readonly evidence: string
}

export interface CanaryRewritePolicy {
  readonly exactPaths: readonly string[]
  readonly prefixes: readonly string[]
  readonly suffixes: readonly string[]
}

export interface CanaryReadinessInput {
  readonly sourceCommit: string
  readonly headCommit: string
  readonly expectedVersion: string
  readonly actualVersion: string
  readonly changedPaths: readonly string[]
  readonly rewritePolicy: CanaryRewritePolicy
  readonly packageJsonRewriteErrors: readonly string[]
  readonly nativeBinaryPresent: boolean
  readonly packedConsumers: CanaryReportEvidence
  readonly createZeus: CanaryReportEvidence
  readonly secretFindings: number
  readonly sbomComponents: number
  readonly lockfileConsistent: boolean
}

export interface CanaryReadinessReport {
  readonly schema: 'zeus.canary-readiness/v1'
  readonly decision: 'READY_FOR_CANARY_PUBLISH' | 'NOT_READY'
  readonly sourceCommit: string
  readonly version: string
  readonly checks: readonly CanaryCheck[]
  readonly blockers: readonly string[]
}

export function evaluateCanaryReadiness(
  input: CanaryReadinessInput,
): CanaryReadinessReport {
  const unexpected = input.changedPaths.filter(
    file => !isAllowedCanaryRewritePath(file, input.rewritePolicy),
  )
  const sourceCommitValid = /^[0-9a-f]{40}$/i.test(input.sourceCommit)
  const versionValid =
    input.expectedVersion.length > 0 &&
    /-canary\./.test(input.expectedVersion) &&
    input.expectedVersion === input.actualVersion

  const checks: CanaryCheck[] = [
    check(
      'source-commit',
      sourceCommitValid && input.sourceCommit === input.headCommit,
      sourceCommitValid
        ? input.sourceCommit === input.headCommit
          ? `source HEAD ${input.sourceCommit}`
          : `HEAD ${input.headCommit} does not match source ${input.sourceCommit}`
        : `invalid source commit: ${input.sourceCommit || '<missing>'}`,
    ),
    check(
      'version',
      versionValid,
      versionValid
        ? `canary version ${input.expectedVersion}`
        : `package version ${input.actualVersion || '<missing>'} does not match a canary version ${input.expectedVersion || '<missing>'}`,
    ),
    check(
      'worktree',
      unexpected.length === 0,
      unexpected.length === 0
        ? `only release rewrite paths changed (${input.changedPaths.length})`
        : `unexpected changed paths: ${unexpected.join(', ')}`,
    ),
    check(
      'package-json-rewrite',
      input.packageJsonRewriteErrors.length === 0,
      input.packageJsonRewriteErrors.length === 0
        ? 'package.json changes are limited to release metadata'
        : `unexpected package.json changes: ${input.packageJsonRewriteErrors.join(', ')}`,
    ),
    check(
      'native-binaries',
      input.nativeBinaryPresent,
      input.nativeBinaryPresent
        ? 'host native compiler binary is present'
        : 'host native compiler binary is missing',
    ),
    canaryCheck('packed-consumers', input.packedConsumers),
    canaryCheck('create-zeus', input.createZeus),
    check(
      'secret-scan',
      input.secretFindings === 0,
      `${input.secretFindings} high-confidence secret findings`,
    ),
    check(
      'sbom',
      input.sbomComponents > 0,
      `${input.sbomComponents} SBOM components`,
    ),
    check(
      'lockfile',
      input.lockfileConsistent,
      input.lockfileConsistent
        ? 'pnpm lockfile is consistent with the rewritten packages'
        : 'pnpm lockfile is not consistent with the rewritten packages',
    ),
  ]

  const blockers = checks
    .filter(entry => entry.status !== 'pass')
    .map(entry => `${entry.id}: ${entry.evidence}`)

  return {
    schema: 'zeus.canary-readiness/v1',
    decision: blockers.length === 0 ? 'READY_FOR_CANARY_PUBLISH' : 'NOT_READY',
    sourceCommit: input.sourceCommit,
    version: input.expectedVersion,
    checks,
    blockers,
  }
}

export function evaluateCanaryReport(
  value: unknown,
  label: string,
  sourceCommit: string,
): CanaryReportEvidence {
  if (!isRecord(value)) {
    return { status: 'fail', evidence: `${label} report must be an object` }
  }

  const commit = value.sourceCommit
  if (typeof commit !== 'string' || !/^[0-9a-f]{40}$/i.test(commit)) {
    return {
      status: 'fail',
      evidence: `${label} report is missing a full sourceCommit`,
    }
  }
  if (commit !== sourceCommit) {
    return {
      status: 'fail',
      evidence: `${label} report is bound to ${commit}, expected ${sourceCommit}`,
    }
  }

  const passed =
    typeof value.passed === 'boolean'
      ? value.passed
      : Array.isArray(value.results) &&
        value.results.length > 0 &&
        value.results.every(
          entry => isRecord(entry) && entry.status === 'passed',
        )
  return passed
    ? {
        status: 'pass',
        evidence: `${label} report passed for source HEAD`,
      }
    : { status: 'fail', evidence: `${label} report failed` }
}

export function findUnexpectedPackageJsonRewrites(
  root: string,
  changedPaths: readonly string[],
  policy: CanaryRewritePolicy,
): string[] {
  const errors: string[] = []

  for (const file of changedPaths) {
    if (!file.endsWith('package.json')) continue
    if (!isAllowedCanaryRewritePath(file, policy)) continue

    try {
      const before = JSON.parse(git(root, ['show', `HEAD:${file}`])) as Record<
        string,
        unknown
      >
      const after = JSON.parse(
        fs.readFileSync(path.join(root, file), 'utf8'),
      ) as Record<string, unknown>
      for (const manifest of [before, after]) {
        delete manifest.version
        delete manifest.repository
        delete manifest.publishConfig
        if (isCreateZeusTemplatePackage(file)) {
          delete manifest.dependencies
          delete manifest.devDependencies
        }
      }
      if (!isDeepStrictEqual(before, after)) errors.push(file)
    } catch {
      errors.push(file)
    }
  }

  return errors.sort()
}

export function isCreateZeusTemplatePackage(file: string): boolean {
  return /^packages\/devtools\/create-zeus\/templates\/[^/]+\/package\.json$/.test(
    file.replace(/\\/g, '/'),
  )
}

export function isAllowedCanaryRewritePath(
  file: string,
  policy: CanaryRewritePolicy,
): boolean {
  const normalized = file.replace(/\\/g, '/')
  if (policy.exactPaths.includes(normalized)) return true
  if (policy.prefixes.some(prefix => normalized.startsWith(prefix))) return true
  return policy.suffixes.some(
    suffix => normalized === suffix || normalized.endsWith(`/${suffix}`),
  )
}

function check(id: string, passed: boolean, evidence: string): CanaryCheck {
  return { id, status: passed ? 'pass' : 'fail', evidence }
}

function canaryCheck(id: string, evidence: CanaryReportEvidence): CanaryCheck {
  return { id, status: evidence.status, evidence: evidence.evidence }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

interface JsonReadResult {
  readonly value?: unknown
  readonly missing: boolean
  readonly error?: string
}

function readJson(file: string): JsonReadResult {
  try {
    return {
      value: JSON.parse(fs.readFileSync(file, 'utf8')) as unknown,
      missing: false,
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { missing: true }
    }
    return {
      missing: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

function reportEvidence(
  root: string,
  relative: string,
  label: string,
  sourceCommit: string,
): CanaryReportEvidence {
  const result = readJson(path.join(root, relative))
  if (result.missing) {
    return { status: 'not_run', evidence: `${label} report missing` }
  }
  if (result.error) {
    return { status: 'fail', evidence: `${label} report is invalid JSON` }
  }
  return evaluateCanaryReport(result.value, label, sourceCommit)
}

export function takeCanaryRewritePolicy(
  root = process.cwd(),
): CanaryRewritePolicy {
  const exact = new Set([
    'package.json',
    'pnpm-lock.yaml',
    'packages/core/compiler-native/index.js',
    'packages/core/compiler-native/index.d.ts',
  ])
  for (const pkg of findWorkspacePackages()) {
    if (!zeusFixedPackages.includes(pkg.name)) continue
    exact.add(
      path
        .relative(root, path.join(pkg.dir, 'package.json'))
        .replace(/\\/g, '/'),
    )
  }
  const templateRoot = path.join(
    root,
    'packages/devtools/create-zeus/templates',
  )
  if (fs.existsSync(templateRoot)) {
    for (const entry of fs.readdirSync(templateRoot, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      exact.add(
        `packages/devtools/create-zeus/templates/${entry.name}/package.json`,
      )
    }
  }

  return {
    exactPaths: [...exact],
    prefixes: ['.changeset/'],
    suffixes: ['CHANGELOG.md'],
  }
}

export function readCanaryReadinessInput(
  root = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
): CanaryReadinessInput {
  const headCommit = git(root, ['rev-parse', 'HEAD'])
  const sourceCommit =
    env.GITHUB_SHA?.trim() || env.ZEUS_SOURCE_COMMIT?.trim() || headCommit
  const actualVersion = readPackageVersion(root)
  const expectedVersion = env.ZEUS_CANARY_VERSION?.trim() ?? ''
  const trackedFiles = git(root, ['ls-files']).split('\n').filter(Boolean)
  const sbom = readJson(path.join(root, 'temp/sbom/zeus.cdx.json'))
  const changedPaths = listReleaseChanges(root)
  const rewritePolicy = takeCanaryRewritePolicy(root)

  return {
    sourceCommit,
    headCommit,
    expectedVersion,
    actualVersion,
    changedPaths,
    rewritePolicy,
    packageJsonRewriteErrors: findUnexpectedPackageJsonRewrites(
      root,
      changedPaths,
      rewritePolicy,
    ),
    nativeBinaryPresent: hasHostNativeBinary(root),
    packedConsumers: reportEvidence(
      root,
      'temp/packed-consumers/report.json',
      'packed consumer',
      sourceCommit,
    ),
    createZeus: reportEvidence(
      root,
      'temp/create-zeus/report.json',
      'create-zeus',
      sourceCommit,
    ),
    secretFindings: scanSecrets(trackedFiles, file =>
      fs.readFileSync(path.join(root, file), 'utf8'),
    ).length,
    sbomComponents:
      isRecord(sbom.value) && Array.isArray(sbom.value.components)
        ? sbom.value.components.length
        : 0,
    lockfileConsistent: checkLockfileConsistency(root),
  }
}

function checkLockfileConsistency(root: string): boolean {
  const result = spawnSync(
    'pnpm',
    ['install', '--frozen-lockfile', '--lockfile-only', '--ignore-scripts'],
    {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    },
  )
  return result.status === 0
}

function hasHostNativeBinary(root: string): boolean {
  const platform = hostPlatformPackage()
  if (!platform) return false
  const suffix = platform.replace(/^compiler-native-/, '')
  const candidates = [
    path.join(
      root,
      'packages/core/compiler-native',
      `zeus-compiler-native.${suffix}.node`,
    ),
    path.join(
      root,
      'packages/core',
      platform,
      `zeus-compiler-native.${suffix}.node`,
    ),
  ]
  return candidates.some(file => fs.existsSync(file))
}

function hostPlatformPackage(): string | undefined {
  const arch = process.arch
  if (process.platform === 'darwin') return `compiler-native-darwin-${arch}`
  if (process.platform === 'win32') return `compiler-native-win32-${arch}-msvc`
  if (process.platform === 'linux') {
    const report = process.report?.getReport() as
      | { header?: { glibcVersionRuntime?: string } }
      | undefined
    return `compiler-native-linux-${arch}-${report?.header?.glibcVersionRuntime ? 'gnu' : 'musl'}`
  }
  return undefined
}

function readPackageVersion(root: string): string {
  return String(
    (
      JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
        version?: unknown
      }
    ).version ?? '',
  )
}

function git(root: string, args: readonly string[]): string {
  return execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
}

function main(): void {
  const report = evaluateCanaryReadiness(readCanaryReadinessInput())
  const output = path.resolve('temp/release/canary-readiness.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`${report.decision}: ${path.relative(process.cwd(), output)}`)
  for (const blocker of report.blockers) console.log(`- ${blocker}`)
  if (report.decision !== 'READY_FOR_CANARY_PUBLISH') process.exitCode = 1
}

if (import.meta.url === `file://${path.resolve(process.argv[1] ?? '')}`) {
  main()
}
