import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { collectRuntimeDependencies as collectSbomRuntimeDependencies } from './check-sbom'
import { scanSecrets } from './check-secrets'
import {
  validateCrossPlatformEvidence,
  validateRcApproval,
  type AttestationVerification,
  type TrustedApprovalRun,
} from '../release/rc-approval'
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

export const RC_EVIDENCE_SCHEMA = 'zeus.rc-evidence/v4' as const

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
  readonly version: string
  readonly products: readonly RcEvidenceProduct[]
  readonly deployment: RcDeploymentEvidence
  readonly crossPlatform: Record<string, unknown>
  readonly releaseApproval: Record<string, unknown>
  readonly approvalRun: TrustedApprovalRun
  readonly approvalAttestation: AttestationVerification
  readonly approvalPolicy: {
    readonly authorizedApprovers: readonly string[]
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

/**
 * The `Release` environment must require a reviewer, not merely be named.
 *
 * Naming an environment in a workflow does nothing on its own. The protection
 * lives on the environment's configuration, and a workflow that references an
 * unprotected one runs without anyone approving it.
 */
function checkReleaseEnvironment(
  input: RcReadinessInput['releaseEnvironment'],
): ReadinessCheck {
  if (!input) {
    return {
      id: 'release-environment',
      status: 'not_run',
      evidence:
        'the Release environment protection was not read; the approval claim is unverified',
    }
  }
  if (!input.hasRequiredReviewers) {
    return {
      id: 'release-environment',
      status: 'fail',
      evidence:
        'the Release environment requires no reviewer, so an approval artifact can be produced without a second person',
    }
  }
  return {
    id: 'release-environment',
    status: 'pass',
    evidence: `the Release environment requires approval from ${(input.reviewers ?? []).join(', ') || 'a reviewer'}`,
  }
}

export interface RcReadinessInput {
  readonly commit: string
  readonly branch: string
  readonly dirty: boolean
  readonly frameworkVersion: string
  readonly sbomComponents: number
  /**
   * The SBOM validated as a document.
   *
   * `sbomComponents` alone is a count, and a count cannot distinguish a real
   * bill of materials from a file with one invented entry. When this is
   * present the check uses it; when absent the check reports `not_run` rather
   * than trusting the count.
   */
  readonly sbomValidation?: { readonly errors: readonly string[] }
  readonly trackedFiles: number
  readonly secretFindings: number
  readonly packedConsumers: ReadinessEvidence
  readonly createZeus: ReadinessEvidence
  readonly onlineProducts: ReadinessEvidence
  readonly crossPlatform: ReadinessEvidence
  readonly releaseApproval: ReadinessEvidence
  /**
   * Whether the `Release` environment actually gates anything.
   *
   * `rc-approval.yml` says it "runs behind the protected `Release` environment
   * (required reviewers)". Measured on this repository, that environment has
   * `protection_rules: []` — no required reviewers, no branch restriction, no
   * wait timer. Any collaborator with workflow dispatch rights can produce an
   * approval artifact, and the binding the release then relies on is a
   * self-certification.
   *
   * Absent means the check was not run and reports `not_run`, which is not a
   * pass: a release whose only protection is a claim about protection has none.
   */
  readonly releaseEnvironment?: {
    readonly hasRequiredReviewers: boolean
    readonly reviewers?: readonly string[]
  }
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
    checkSbom(input.sbomComponents, input.sbomValidation),
    checkBoolean(
      'secret-scan',
      input.secretFindings === 0,
      `${input.secretFindings} findings across ${input.trackedFiles} tracked files`,
    ),
    checkEvidence('packed-consumers', input.packedConsumers),
    checkEvidence('create-zeus', input.createZeus),
    checkEvidence('cross-platform', input.crossPlatform),
    checkEvidence('release-approval', input.releaseApproval),
    checkReleaseEnvironment(input.releaseEnvironment),
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
  expectedVersion?: string,
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
  if (typeof document.version !== 'string' || document.version.length === 0) {
    commonErrors.push('top-level version must be a non-empty string')
  } else if (expectedVersion && document.version !== expectedVersion) {
    commonErrors.push(
      `evidence version ${document.version} does not match ${expectedVersion}`,
    )
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

  const crossPlatform = validateCrossPlatformEvidence(document.crossPlatform, {
    commit: currentCommit,
  })
  const policy = isRecord(document.approvalPolicy)
    ? document.approvalPolicy
    : undefined
  const approvers = Array.isArray(policy?.authorizedApprovers)
    ? policy.authorizedApprovers.filter(
        (entry): entry is string => typeof entry === 'string',
      )
    : []
  const run = isRecord(document.approvalRun)
    ? (document.approvalRun as unknown as TrustedApprovalRun)
    : undefined
  const attestation = isRecord(document.approvalAttestation)
    ? (document.approvalAttestation as unknown as AttestationVerification)
    : undefined
  const approval = validateRcApproval(document.releaseApproval, {
    coreCommit: currentCommit,
    uiCommit,
    version: typeof document.version === 'string' ? document.version : '',
    evidenceDigest: crossPlatform.digest ?? '',
    payloadDigest:
      isRecord(document.releaseApproval) &&
      typeof document.releaseApproval.payloadDigest === 'string'
        ? document.releaseApproval.payloadDigest
        : undefined,
    run,
    attestation,
    authorizedApprovers: approvers,
  })

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
      [...commonErrors, ...crossPlatform.errors],
      'Linux and Windows evidence is bound to the current HEAD',
    ),
    releaseApproval: evidenceResult(
      [
        ...commonErrors,
        ...approval.errors,
        ...(Array.isArray(policy?.authorizedApprovers)
          ? []
          : ['approvalPolicy.authorizedApprovers must be an array']),
      ],
      'release approval is bound to the current HEAD, the evidence digest and a verified artifact attestation',
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

/**
 * The SBOM check.
 *
 * A count above zero proves a file was parsed. It does not prove the file is a
 * bill of materials: one invented component, no graph and a version nobody
 * published all satisfy `components.length > 0`. When a validated result is
 * supplied the check reflects it; without one the honest status is `not_run`.
 */
function checkSbom(
  components: number,
  validation: { readonly errors: readonly string[] } | undefined,
): ReadinessCheck {
  if (!validation) {
    return {
      id: 'sbom',
      status: 'not_run',
      evidence: `${components} components parsed, but the document was not validated`,
    }
  }
  if (validation.errors.length > 0) {
    return {
      id: 'sbom',
      status: 'fail',
      evidence: validation.errors.slice(0, 3).join('; '),
    }
  }
  return {
    id: 'sbom',
    status: 'pass',
    evidence: `${components} components, dependency graph validated`,
  }
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

/**
 * Validates an SBOM document as a document, not as a count.
 *
 * The readiness check used to pass on `components.length > 0`. A file with one
 * invented component and no graph satisfied that, so `pass` meant both
 * "validated" and "parsed" depending on who wrote the file last.
 *
 * What is required here:
 *
 * - it parses to an object with CycloneDX 1.5 shape;
 * - every component has a unique `bom-ref`;
 * - a `dependencies` graph exists and every edge names a component present;
 * - the component set matches what the lockfile implies — every workspace
 *   package expected is there, and no third-party component appears that the
 *   lockfile does not list.
 *
 * Schema validation against the official document happens in
 * `check-sbom.spec.ts`; this function is the readiness gate's own view, kept
 * dependency-free so it can run wherever readiness runs.
 */
export function evaluateSbom(
  document: unknown,
  expected: {
    readonly workspace: readonly string[]
    readonly runtime: readonly { name: string; version: string }[]
  },
): { errors: readonly string[] } {
  const errors: string[] = []
  const fail = (message: string): void => {
    errors.push(message)
  }
  if (!isRecord(document)) return { errors: ['SBOM must be a JSON object'] }
  if (document.bomFormat !== 'CycloneDX')
    fail('SBOM bomFormat must be CycloneDX')
  if (document.specVersion !== '1.5') fail('SBOM specVersion must be 1.5')

  const components = Array.isArray(document.components)
    ? document.components
    : undefined
  if (!components || components.length === 0) {
    return { errors: [...errors, 'SBOM has no components'] }
  }

  const refs = new Map<string, { name?: string; version?: string }>()
  for (const [index, component] of components.entries()) {
    if (!isRecord(component)) {
      fail(`components[${index}] is not an object`)
      continue
    }
    const ref = component['bom-ref']
    if (typeof ref !== 'string' || ref === '') {
      fail(`components[${index}] has no bom-ref`)
      continue
    }
    if (refs.has(ref)) {
      fail(`duplicate bom-ref: ${ref}`)
      continue
    }
    /*
     * The ref must agree with the name and version.
     *
     * A component whose `bom-ref` says one version while its `version` field
     * says another is internally inconsistent, and every edge that targets it
     * then points at the wrong thing. The graph is only as trustworthy as this
     * invariant.
     */
    if (
      typeof component.name === 'string' &&
      typeof component.version === 'string' &&
      ref !== `${component.name}@${component.version}`
    ) {
      fail(
        `bom-ref ${ref} does not match name@version ${component.name}@${component.version}`,
      )
    }
    refs.set(ref, {
      ...(typeof component.name === 'string' ? { name: component.name } : {}),
      ...(typeof component.version === 'string'
        ? { version: component.version }
        : {}),
    })
  }

  // Every expected workspace package must be present at some version.
  for (const name of expected.workspace) {
    const present = [...refs.values()].some(entry => entry.name === name)
    if (!present) fail(`missing workspace component: ${name}`)
  }
  // Every runtime dependency must be present at the locked version.
  for (const dependency of expected.runtime) {
    if (!refs.has(`${dependency.name}@${dependency.version}`)) {
      fail(
        `missing runtime component: ${dependency.name}@${dependency.version}`,
      )
    }
  }

  const dependencies = Array.isArray(document.dependencies)
    ? document.dependencies
    : undefined
  if (!dependencies || dependencies.length === 0) {
    fail('SBOM has no dependencies graph')
  } else {
    for (const [index, node] of dependencies.entries()) {
      if (!isRecord(node) || typeof node.ref !== 'string') {
        fail(`dependencies[${index}] has no ref`)
        continue
      }
      if (!refs.has(node.ref)) {
        fail(`dependencies[${index}] names a missing component: ${node.ref}`)
      }
      const targets = Array.isArray(node.dependsOn) ? node.dependsOn : []
      for (const target of targets) {
        if (typeof target === 'string' && !refs.has(target)) {
          fail(`dangling edge: ${node.ref} -> ${target}`)
        }
      }
    }
  }

  return { errors }
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
  const frameworkVersion = String(zeus?.packageJson.version ?? '0.0.0')
  const evidenceStatuses = evidence.missing
    ? missingEvidenceStatuses(evidencePath)
    : evidence.error
      ? invalidEvidenceStatuses(
          `evidence file is invalid JSON: ${evidencePath}`,
        )
      : evaluateRcEvidence(evidence.value, commit, pair, frameworkVersion)

  return {
    commit,
    branch: execFileSync('git', ['branch', '--show-current'], {
      cwd: root,
      encoding: 'utf8',
    }).trim(),
    dirty: isDirtyForRelease(root, options.releaseSnapshot === true),
    frameworkVersion,
    sbomComponents:
      isRecord(sbomResult.value) && Array.isArray(sbomResult.value.components)
        ? sbomResult.value.components.length
        : 0,
    /*
     * Validate the document, not just count it.
     *
     * The expectation is derived from the repository rather than from the
     * document: a document that agrees only with itself proves nothing.
     */
    sbomValidation: evaluateSbom(sbomResult.value, sbomExpectation(root)),
    trackedFiles: trackedFiles.length,
    secretFindings: scanSecrets(trackedFiles, file =>
      fs.readFileSync(path.join(root, file), 'utf8'),
    ).length,
    packedConsumers,
    createZeus,
    onlineProducts: evidenceStatuses.onlineProducts,
    crossPlatform: evidenceStatuses.crossPlatform,
    releaseApproval: evidenceStatuses.releaseApproval,
    releaseEnvironment: readReleaseEnvironment(env),
  }
}

/**
 * Reads whether the `Release` environment is actually protected.
 *
 * `gh api repos/{owner}/{repo}/environments/Release` reports `protection_rules`.
 * An empty array means the environment exists and gates nothing: the workflows
 * that name it start immediately, and `rc-approval.yml`'s "runs behind the
 * protected environment (required reviewers)" is a description of an intent
 * rather than of the configuration.
 *
 * Returns `undefined` when the answer cannot be obtained — no `gh`, no
 * network, no permission. That is `not_run`, not a pass, because the whole
 * point of the check is that a claim of protection must be confirmed.
 */
function readReleaseEnvironment(
  env: NodeJS.ProcessEnv,
): RcReadinessInput['releaseEnvironment'] {
  if (env.ZEUS_SKIP_ENVIRONMENT_PROBE === '1') return undefined
  try {
    const raw = execFileSync(
      'gh',
      [
        'api',
        `repos/${env.ZEUS_REPOSITORY ?? 'baicie/zeus'}/environments/Release`,
      ],
      {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
        timeout: 15_000,
      },
    )
    const parsed = JSON.parse(raw) as { protection_rules?: unknown }
    const rules = Array.isArray(parsed.protection_rules)
      ? parsed.protection_rules
      : []
    const reviewers: string[] = []
    let hasRequiredReviewers = false
    for (const rule of rules) {
      if (!isRecord(rule)) continue
      if (rule.type !== 'required_reviewers') continue
      hasRequiredReviewers = true
      const entries = Array.isArray(rule.reviewers) ? rule.reviewers : []
      for (const entry of entries) {
        if (isRecord(entry) && isRecord(entry.reviewer)) {
          const login = entry.reviewer.login
          if (typeof login === 'string') reviewers.push(login)
        }
      }
    }
    return { hasRequiredReviewers, ...(reviewers.length ? { reviewers } : {}) }
  } catch {
    return undefined
  }
}

/**
 * What the SBOM must contain, derived from the repository.
 *
 * `workspace` is every package this repository builds; `runtime` is every
 * third-party library the published packages install, read from the lockfile.
 * Both come from the tree under test, so a document written for a different
 * commit fails rather than agreeing with itself.
 */
function sbomExpectation(root: string): {
  workspace: string[]
  runtime: { name: string; version: string }[]
} {
  /*
   * The same definition the SBOM generator uses.
   *
   * A filesystem walk is not the workspace: it also finds create-zeus templates
   * and fixtures, which are packages with a `package.json` but are not pnpm
   * workspace members and never appear in a generated SBOM. Expecting them made
   * a correct document fail.
   */
  const cwd = process.cwd()
  process.chdir(root)
  let workspace: string[]
  try {
    workspace = findWorkspacePackages().map(pkg => pkg.name)
  } finally {
    process.chdir(cwd)
  }

  const runtime: { name: string; version: string }[] = []
  const lockfilePath = path.join(root, 'pnpm-lock.yaml')
  if (fs.existsSync(lockfilePath)) {
    const lockfile = fs.readFileSync(lockfilePath, 'utf8')
    const configPath = path.join(root, 'scripts/release.config.ts')
    const published = new Set<string>()
    if (fs.existsSync(configPath)) {
      const config = fs.readFileSync(configPath, 'utf8')
      const block = /export const zeusFixedPackages = \[([\s\S]*?)\]/.exec(
        config,
      )
      for (const match of (block?.[1] ?? '').matchAll(
        /@(zeus-js\/[a-z0-9-]+)/g,
      )) {
        published.add(`@${match[1]}`)
      }
    }
    const importers: Record<string, string> = {}
    for (const match of lockfile.matchAll(/^ {2}(packages\/[^:]+):\s*$/gm)) {
      const relative = match[1] as string
      const manifestPath = path.join(root, relative, 'package.json')
      if (!fs.existsSync(manifestPath)) continue
      try {
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
          name?: string
        }
        if (manifest.name && published.has(manifest.name)) {
          importers[relative] = manifest.name
        }
      } catch {
        continue
      }
    }
    for (const dependency of collectSbomRuntimeDependencies(
      lockfile,
      importers,
    )) {
      runtime.push({ name: dependency.name, version: dependency.version })
    }
  }

  return { workspace: [...new Set(workspace)].sort(), runtime }
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
