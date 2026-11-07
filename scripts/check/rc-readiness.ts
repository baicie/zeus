import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { scanSecrets } from './check-secrets'
import {
  findUnexpectedReleaseWorktreeChanges,
  loadReleaseWorktreeSnapshot,
} from '../release/release-worktree'
import { findWorkspacePackages } from '../shared/utils'

export type ReadinessStatus = 'pass' | 'fail' | 'not_run'

export interface ReadinessCheck {
  readonly id: string
  readonly status: ReadinessStatus
  readonly evidence: string
}

export interface ReadinessEvidence {
  readonly status: ReadinessStatus
  readonly evidence: string
}

export const RC_EVIDENCE_SCHEMA = 'zeus.rc-evidence/v3' as const

export const REQUIRED_ONLINE_PRODUCTS = [
  'webc-studio',
  'native-lab',
  'admin',
  'ai-workbench',
] as const

type OnlineProduct = (typeof REQUIRED_ONLINE_PRODUCTS)[number]

export interface RcEvidenceProduct {
  readonly product: OnlineProduct
  readonly url: string
  readonly commit: string
  readonly artifactDigest: string
  readonly imageDigest: string
}

export interface RcDeploymentProduct {
  readonly product: OnlineProduct
  readonly status: 'ONLINE_PASS'
  readonly artifactDigest: string
  readonly imageDigest: string
}

export interface RcDeploymentEvidence {
  readonly decision: 'ONLINE_ACCEPTED'
  readonly transactionStatus: 'PASS'
  readonly coreCommit: string
  readonly uiCommit: string
  readonly acceptanceSha256: string
  readonly transactionSha256: string
  readonly provenanceSha256: string
  readonly products: readonly RcDeploymentProduct[]
}

export interface RcEvidenceDocument {
  readonly schema: typeof RC_EVIDENCE_SCHEMA
  readonly commit: string
  readonly uiCommit: string
  readonly products: readonly RcEvidenceProduct[]
  readonly deployment: RcDeploymentEvidence
  readonly crossPlatform: {
    readonly platforms: readonly string[]
    readonly report: string
    readonly commit: string
  }
  readonly releaseApproval: {
    readonly approver: string
    readonly commit: string
  }
}

export interface ReleasePair {
  readonly coreCommit: string
  readonly uiCommit: string
  readonly runId?: string
  readonly runUrl?: string
}

export interface RcEvidenceStatuses {
  readonly onlineProducts: ReadinessEvidence
  readonly crossPlatform: ReadinessEvidence
  readonly releaseApproval: ReadinessEvidence
}

export interface RcReadinessInput {
  readonly commit: string
  readonly branch: string
  readonly dirty: boolean
  readonly frameworkVersion: string
  readonly sbomComponents: number
  readonly trackedFiles: number
  readonly secretFindings: number
  readonly packedConsumers: ReadinessEvidence
  readonly createZeus: ReadinessEvidence
  readonly onlineProducts: ReadinessEvidence
  readonly crossPlatform: ReadinessEvidence
  readonly releaseApproval: ReadinessEvidence
}

export interface RcReadinessReport {
  readonly schema: 'zeus.rc-readiness/v1'
  readonly readyForReview: boolean
  readonly decision: 'READY_FOR_RELEASE_REVIEW' | 'NOT_READY'
  readonly commit: string
  readonly branch: string
  readonly frameworkVersion: string
  readonly checks: readonly ReadinessCheck[]
  readonly blockers: readonly string[]
}

export function evaluateRcReadiness(
  input: RcReadinessInput,
): RcReadinessReport {
  const checks: ReadinessCheck[] = [
    checkBoolean(
      'clean-worktree',
      !input.dirty,
      input.dirty
        ? 'working tree has uncommitted changes'
        : 'working tree is clean',
    ),
    checkBoolean(
      'sbom',
      input.sbomComponents > 0,
      `${input.sbomComponents} SBOM components`,
      'not_run',
    ),
    checkBoolean(
      'secret-scan',
      input.secretFindings === 0,
      `${input.secretFindings} findings across ${input.trackedFiles} tracked files`,
    ),
    checkEvidence('packed-consumers', input.packedConsumers),
    checkEvidence('create-zeus', input.createZeus),
    checkEvidence('cross-platform', input.crossPlatform),
    checkEvidence('release-approval', input.releaseApproval),
    checkEvidence('online-products', input.onlineProducts),
  ]

  const blockers = checks
    .filter(entry => entry.status !== 'pass')
    .map(entry => `${entry.id}: ${entry.evidence}`)
  const readyForReview = blockers.length === 0

  return {
    schema: 'zeus.rc-readiness/v1',
    readyForReview,
    decision: readyForReview ? 'READY_FOR_RELEASE_REVIEW' : 'NOT_READY',
    commit: input.commit,
    branch: input.branch,
    frameworkVersion: input.frameworkVersion,
    checks,
    blockers,
  }
}

export function evaluateRcEvidence(
  document: unknown,
  currentCommit: string,
  pair?: ReleasePair,
): RcEvidenceStatuses {
  if (!isRecord(document)) {
    return invalidEvidenceStatuses('evidence must be a JSON object')
  }

  const commonErrors: string[] = []
  if (document.schema !== RC_EVIDENCE_SCHEMA) {
    commonErrors.push(`schema must be ${RC_EVIDENCE_SCHEMA}`)
  }
  if (document.commit !== currentCommit) {
    commonErrors.push('top-level commit does not match current HEAD')
  }
  const uiCommit =
    typeof document.uiCommit === 'string' ? document.uiCommit : ''
  if (!/^[0-9a-f]{40}$/i.test(uiCommit)) {
    commonErrors.push('uiCommit must be a full 40-character UI commit')
  }
  if (!pair) {
    commonErrors.push(
      'release pair provenance missing (temp/release/pair.json)',
    )
  } else {
    if (pair.coreCommit !== currentCommit) {
      commonErrors.push('release pair coreCommit does not match current HEAD')
    }
    if (pair.uiCommit !== uiCommit) {
      commonErrors.push('release pair uiCommit does not match the evidence')
    }
  }

  return {
    onlineProducts: evidenceResult(
      [
        ...commonErrors,
        ...validateProducts(document.products, currentCommit, uiCommit),
        ...validateDeployment(
          document.deployment,
          currentCommit,
          uiCommit,
          document.products,
        ),
      ],
      'four HTTPS product URLs and the deployment acceptance are bound to the current HEAD',
    ),
    crossPlatform: evidenceResult(
      [
        ...commonErrors,
        ...validateCrossPlatform(document.crossPlatform, currentCommit),
      ],
      'Linux and Windows evidence is bound to the current HEAD',
    ),
    releaseApproval: evidenceResult(
      [
        ...commonErrors,
        ...validateReleaseApproval(document.releaseApproval, currentCommit),
      ],
      'release approval is bound to the current HEAD',
    ),
  }
}

function validateProducts(
  value: unknown,
  currentCommit: string,
  uiCommit: string,
): string[] {
  if (!Array.isArray(value)) return ['products must be an array']

  const errors: string[] = []
  const seen = new Set<string>()
  for (const [index, entry] of value.entries()) {
    if (!isRecord(entry)) {
      errors.push(`products[${index}] must be an object`)
      continue
    }

    const product = entry.product
    if (
      typeof product !== 'string' ||
      !REQUIRED_ONLINE_PRODUCTS.includes(product as OnlineProduct)
    ) {
      errors.push(`products[${index}].product is not a required product`)
    } else if (seen.has(product)) {
      errors.push(`products contains duplicate ${product}`)
    } else {
      seen.add(product)
    }

    if (typeof entry.url !== 'string' || !isHttpsUrl(entry.url)) {
      errors.push(`products[${index}].url must be an HTTPS URL`)
    }
    if (!isSha256(entry.artifactDigest)) {
      errors.push(`products[${index}].artifactDigest must be sha256:<64 hex>`)
    }
    if (!isSha256(entry.imageDigest)) {
      errors.push(`products[${index}].imageDigest must be sha256:<64 hex>`)
    }
    const expectedCommit = product === 'ai-workbench' ? uiCommit : currentCommit
    if (entry.commit !== expectedCommit) {
      errors.push(
        `products[${index}].commit does not match the ${
          product === 'ai-workbench' ? 'UI' : 'Core'
        } commit`,
      )
    }
  }

  for (const product of REQUIRED_ONLINE_PRODUCTS) {
    if (!seen.has(product)) errors.push(`products is missing ${product}`)
  }
  if (value.length !== REQUIRED_ONLINE_PRODUCTS.length) {
    errors.push(
      `products must contain exactly ${REQUIRED_ONLINE_PRODUCTS.length} entries`,
    )
  }

  return errors
}

function validateDeployment(
  value: unknown,
  currentCommit: string,
  uiCommit: string,
  products: unknown,
): string[] {
  if (!isRecord(value)) return ['deployment evidence must be an object']
  const errors: string[] = []
  if (value.decision !== 'ONLINE_ACCEPTED') {
    errors.push('deployment.decision must be ONLINE_ACCEPTED')
  }
  if (value.transactionStatus !== 'PASS') {
    errors.push('deployment.transactionStatus must be PASS')
  }
  if (value.coreCommit !== currentCommit) {
    errors.push('deployment.coreCommit does not match current HEAD')
  }
  if (value.uiCommit !== uiCommit) {
    errors.push('deployment.uiCommit does not match the evidence UI commit')
  }
  for (const key of [
    'acceptanceSha256',
    'transactionSha256',
    'provenanceSha256',
  ] as const) {
    if (!isSha256(value[key])) {
      errors.push(`deployment.${key} must be sha256:<64 hex>`)
    }
  }
  const deploymentProducts = Array.isArray(value.products) ? value.products : []
  if (deploymentProducts.length !== REQUIRED_ONLINE_PRODUCTS.length) {
    errors.push('deployment.products must contain exactly four entries')
  }
  const byProduct = new Map<string, Record<string, unknown>>()
  for (const entry of deploymentProducts) {
    if (!isRecord(entry)) {
      errors.push('deployment product must be an object')
      continue
    }
    const product = String(entry.product)
    if (!REQUIRED_ONLINE_PRODUCTS.includes(product as OnlineProduct)) {
      errors.push(`deployment product ${product} is not required`)
      continue
    }
    if (byProduct.has(product)) {
      errors.push(`deployment products contains duplicate ${product}`)
      continue
    }
    if (entry.status !== 'ONLINE_PASS') {
      errors.push(`deployment product ${product} is not ONLINE_PASS`)
    }
    if (!isSha256(entry.artifactDigest)) {
      errors.push(`deployment product ${product} artifactDigest is invalid`)
    }
    if (!isSha256(entry.imageDigest)) {
      errors.push(`deployment product ${product} imageDigest is invalid`)
    }
    byProduct.set(product, entry)
  }
  if (Array.isArray(products)) {
    for (const entry of products) {
      if (!isRecord(entry)) continue
      const product = String(entry.product)
      const deployed = byProduct.get(product)
      if (!deployed) continue
      if (entry.artifactDigest !== deployed.artifactDigest) {
        errors.push(`deployment product ${product} artifactDigest mismatch`)
      }
      if (entry.imageDigest !== deployed.imageDigest) {
        errors.push(`deployment product ${product} imageDigest mismatch`)
      }
    }
  }
  return errors
}

function isSha256(value: unknown): value is string {
  return typeof value === 'string' && /^sha256:[0-9a-f]{64}$/i.test(value)
}

function validateCrossPlatform(
  value: unknown,
  currentCommit: string,
): string[] {
  if (!isRecord(value)) return ['crossPlatform must be an object']

  const errors: string[] = []
  if (!Array.isArray(value.platforms)) {
    errors.push('crossPlatform.platforms must be an array')
  } else {
    for (const platform of ['linux', 'win32']) {
      if (!value.platforms.includes(platform)) {
        errors.push(`crossPlatform.platforms is missing ${platform}`)
      }
    }
  }
  if (typeof value.report !== 'string' || value.report.trim().length === 0) {
    errors.push('crossPlatform.report must be a non-empty string')
  }
  if (value.commit !== currentCommit) {
    errors.push('crossPlatform.commit does not match current HEAD')
  }
  return errors
}

function validateReleaseApproval(
  value: unknown,
  currentCommit: string,
): string[] {
  if (!isRecord(value)) return ['releaseApproval must be an object']

  const errors: string[] = []
  if (
    typeof value.approver !== 'string' ||
    value.approver.trim().length === 0
  ) {
    errors.push('releaseApproval.approver must be a non-empty string')
  }
  if (value.commit !== currentCommit) {
    errors.push('releaseApproval.commit does not match current HEAD')
  }
  return errors
}

function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      url.protocol === 'https:' &&
      url.hostname.length > 0 &&
      url.username.length === 0 &&
      url.password.length === 0
    )
  } catch {
    return false
  }
}

function evidenceResult(
  errors: readonly string[],
  passedEvidence: string,
): ReadinessEvidence {
  return errors.length === 0
    ? { status: 'pass', evidence: passedEvidence }
    : { status: 'fail', evidence: errors.join('; ') }
}

function invalidEvidenceStatuses(reason: string): RcEvidenceStatuses {
  const result: ReadinessEvidence = { status: 'fail', evidence: reason }
  return {
    onlineProducts: result,
    crossPlatform: result,
    releaseApproval: result,
  }
}

function missingEvidenceStatuses(file: string): RcEvidenceStatuses {
  const result: ReadinessEvidence = {
    status: 'not_run',
    evidence: `evidence file missing: ${file}`,
  }
  return {
    onlineProducts: result,
    crossPlatform: result,
    releaseApproval: result,
  }
}

function checkBoolean(
  id: string,
  passed: boolean,
  evidence: string,
  failedStatus: ReadinessStatus = 'fail',
): ReadinessCheck {
  return { id, status: passed ? 'pass' : failedStatus, evidence }
}

function checkEvidence(id: string, result: ReadinessEvidence): ReadinessCheck {
  return { id, status: result.status, evidence: result.evidence }
}

interface Report {
  readonly passed?: boolean
  readonly results?: readonly { readonly status?: string }[]
  readonly sourceCommit?: string
}

interface JsonReadResult {
  readonly value?: unknown
  readonly missing: boolean
  readonly error?: string
}

function readJson(file: string): JsonReadResult {
  try {
    return { value: JSON.parse(fs.readFileSync(file, 'utf8')), missing: false }
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT') return { missing: true }
    return {
      missing: false,
      error: error instanceof Error ? error.message : String(error),
    }
  }
}

export function evaluateReportEvidence(
  value: unknown,
  label: string,
  currentCommit: string,
): ReadinessEvidence {
  if (!isRecord(value)) {
    return { status: 'fail', evidence: `${label} report must be an object` }
  }

  const report = value as Report
  if (!report.sourceCommit) {
    return {
      status: 'fail',
      evidence: `${label} report is missing sourceCommit`,
    }
  }
  if (report.sourceCommit !== currentCommit) {
    return {
      status: 'fail',
      evidence: `${label} report is bound to ${report.sourceCommit}, expected ${currentCommit}`,
    }
  }
  if (!reportPassed(report)) {
    return { status: 'fail', evidence: `${label} report failed` }
  }
  return {
    status: 'pass',
    evidence: `${label} report passed for current HEAD`,
  }
}

function reportEvidence(
  file: string,
  label: string,
  currentCommit: string,
): ReadinessEvidence {
  const result = readJson(file)
  if (result.missing) {
    return { status: 'not_run', evidence: `${label} report missing` }
  }
  if (result.error) {
    return { status: 'fail', evidence: `${label} report is invalid JSON` }
  }
  return evaluateReportEvidence(result.value, label, currentCommit)
}

function reportPassed(report: Report): boolean {
  if (report.passed !== undefined) return report.passed
  return (
    report.results !== undefined &&
    report.results.length > 0 &&
    report.results.every(entry => entry.status === 'passed')
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function evidenceFile(root: string, env: NodeJS.ProcessEnv): string {
  const configured = env.ZEUS_RC_EVIDENCE_FILE?.trim()
  return configured
    ? path.resolve(root, configured)
    : path.join(root, 'temp/release/rc-evidence.json')
}

export function readRcReadinessInput(
  root = process.cwd(),
  env: NodeJS.ProcessEnv = process.env,
  options: { readonly releaseSnapshot?: boolean } = {},
): RcReadinessInput {
  const packages = findWorkspacePackages()
  const zeus = packages.find(pkg => pkg.name === '@zeus-js/zeus')
  const trackedFiles = execFileSync('git', ['ls-files'], {
    cwd: root,
    encoding: 'utf8',
  })
    .split('\n')
    .filter(Boolean)
  const commit = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()
  const sbomResult = readJson(path.join(root, 'temp/sbom/zeus.cdx.json'))
  const packedConsumers = reportEvidence(
    path.join(root, 'temp/packed-consumers/report.json'),
    'packed consumer',
    commit,
  )
  const createZeus = reportEvidence(
    path.join(root, 'temp/create-zeus/report.json'),
    'create-zeus',
    commit,
  )
  const evidencePath = evidenceFile(root, env)
  const pairPath = env.ZEUS_RELEASE_PAIR_FILE?.trim()
    ? path.resolve(root, env.ZEUS_RELEASE_PAIR_FILE)
    : path.join(root, 'temp/release/pair.json')
  const pairResult = readJson(pairPath)
  const pair =
    !pairResult.missing &&
    !pairResult.error &&
    isRecord(pairResult.value) &&
    typeof pairResult.value.coreCommit === 'string' &&
    typeof pairResult.value.uiCommit === 'string'
      ? (pairResult.value as unknown as ReleasePair)
      : undefined
  const evidence = readJson(evidencePath)
  const evidenceStatuses = evidence.missing
    ? missingEvidenceStatuses(evidencePath)
    : evidence.error
      ? invalidEvidenceStatuses(
          `evidence file is invalid JSON: ${evidencePath}`,
        )
      : evaluateRcEvidence(evidence.value, commit, pair)

  return {
    commit,
    branch: execFileSync('git', ['branch', '--show-current'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    dirty: isDirtyForRelease(root, options.releaseSnapshot === true),
    frameworkVersion: String(zeus?.packageJson.version ?? '0.0.0'),
    sbomComponents:
      isRecord(sbomResult.value) && Array.isArray(sbomResult.value.components)
        ? sbomResult.value.components.length
        : 0,
    trackedFiles: trackedFiles.length,
    secretFindings: scanSecrets(trackedFiles, file =>
      fs.readFileSync(path.join(root, file), 'utf8'),
    ).length,
    packedConsumers,
    createZeus,
    onlineProducts: evidenceStatuses.onlineProducts,
    crossPlatform: evidenceStatuses.crossPlatform,
    releaseApproval: evidenceStatuses.releaseApproval,
  }
}

function isDirtyForRelease(root: string, useSnapshot: boolean): boolean {
  if (useSnapshot) {
    try {
      // `check:release-worktree --capture` runs immediately before this gate in
      // the release precheck. It captures the versioning rewrite, so only
      // changes made after that capture count as unexpected dirt.
      const snapshot = loadReleaseWorktreeSnapshot(root)
      return findUnexpectedReleaseWorktreeChanges(root, snapshot).length > 0
    } catch {
      // A missing snapshot is not permission to ignore dirt.
    }
  }
  return (
    execFileSync('git', ['status', '--porcelain'], {
      cwd: root,
      encoding: 'utf8',
    }).trim().length > 0
  )
}

function main(): void {
  const report = evaluateRcReadiness(
    readRcReadinessInput(process.cwd(), process.env, {
      releaseSnapshot: process.argv.includes('--release-snapshot'),
    }),
  )
  const output = path.resolve('temp/release/rc-readiness.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`${report.decision}: ${path.relative(process.cwd(), output)}`)
  for (const blocker of report.blockers) console.log(`- ${blocker}`)
  if (!report.readyForReview) process.exitCode = 1
}

if (import.meta.url === `file://${path.resolve(process.argv[1] ?? '')}`) {
  main()
}
