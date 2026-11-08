/**
 * Structured RC approval contract.
 *
 * A release approval is not a free-form string. It is a document that binds:
 *
 * - the approver identity and the GitHub run that produced the approval;
 * - the Core commit, the UI commit and the RC version;
 * - the exact cross-platform evidence digest that was reviewed.
 *
 * Every consumer validates the document against trusted GitHub run metadata and
 * an artifact attestation. A missing, stale, incomplete or mismatched approval
 * fails closed. `"approver": "NOT_RUN"` can never satisfy this contract because
 * the field is an object with a verified login, and the login must equal the
 * actor of the protected approval workflow run.
 */
import { createHash } from 'node:crypto'

export const RC_APPROVAL_SCHEMA = 'zeus.rc-approval/v2' as const
export const CROSS_PLATFORM_SCHEMA = 'zeus.cross-platform-evidence/v1' as const
export const APPROVAL_WORKFLOW_PATH =
  '.github/workflows/rc-approval.yml' as const
export const APPROVAL_WORKFLOW_NAME = 'RC Approval' as const
export const RELEASE_ENVIRONMENT = 'Release' as const
export const APPROVAL_ARTIFACT_NAME = 'rc-approval' as const
export const APPROVAL_PAYLOAD_ARTIFACT_NAME = 'rc-approval-payload' as const
export const RC_APPROVAL_PAYLOAD_SCHEMA = 'zeus.rc-approval-payload/v1' as const
export const RC_REPOSITORY = 'baicie/zeus' as const

/** Approval documents expire; a stale approval cannot authorise a release. */
export const MAX_APPROVAL_AGE_HOURS = 72
/** `expiresAt` may never be further out than this from `approvedAt`. */
export const MAX_APPROVAL_TTL_HOURS = 72
/** Tolerated clock skew when comparing timestamps. */
export const MAX_CLOCK_SKEW_MS = 5 * 60 * 1000

export const REQUIRED_PLATFORMS = ['linux', 'win32'] as const
export type RequiredPlatform = (typeof REQUIRED_PLATFORMS)[number]

/**
 * Test categories that must be present in the evidence for every platform.
 * A compiler build alone is not cross-platform product evidence.
 */
export const REQUIRED_PLATFORM_TESTS = [
  'typecheck',
  'build',
  'create-zeus',
  'native-build',
] as const

export const APPROVER_PERMISSIONS = ['admin', 'maintain'] as const
export type ApproverPermission = (typeof APPROVER_PERMISSIONS)[number]

const SHA256 = /^sha256:[0-9a-f]{64}$/i
const ISO_TIMESTAMP =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

export interface CrossPlatformJobEvidence {
  readonly name: string
  readonly id: string
  readonly conclusion: 'success'
  readonly tested: readonly string[]
}

export interface CrossPlatformArtifactEvidence {
  readonly name: string
  readonly id: string
  readonly digest: string
}

export interface CrossPlatformPlatformEvidence {
  readonly status: 'PASS'
  readonly jobs: readonly CrossPlatformJobEvidence[]
  readonly artifacts: readonly CrossPlatformArtifactEvidence[]
  readonly tested: readonly string[]
  readonly sourceSha: string
  readonly headSha: string
  readonly completedAt: string
}

export interface CrossPlatformEvidenceDocument {
  readonly schema: typeof CROSS_PLATFORM_SCHEMA
  readonly commit: string
  readonly workflow: string
  readonly workflowPath: string
  readonly workflowId: string
  readonly runId: string
  readonly runAttempt: string
  readonly event: string
  readonly platforms: Record<RequiredPlatform, CrossPlatformPlatformEvidence>
  readonly digest: string
}

export interface TrustedApprovalArtifact {
  readonly id: string
  readonly name: string
  readonly digest: string
  readonly expired: boolean
}

export interface TrustedApprovalRun {
  readonly repository: string
  readonly runId: string
  readonly runAttempt: string
  readonly workflowId: string
  readonly workflowPath: string
  readonly workflowName: string
  readonly event: string
  readonly status: string
  readonly conclusion: string
  readonly headSha: string
  readonly actor: string
  readonly environment: string
  /** The approval envelope artifact uploaded by the approval workflow. */
  readonly artifact: TrustedApprovalArtifact | undefined
  /** The payload artifact whose API digest the envelope binds. */
  readonly payloadArtifact: TrustedApprovalArtifact | undefined
}

export interface AttestationVerification {
  readonly verified: boolean
  readonly signerWorkflow?: string
  readonly sourceDigest?: string
  readonly errors?: readonly string[]
}

export interface RcApprovalDocument {
  readonly schema: typeof RC_APPROVAL_SCHEMA
  readonly decision: 'APPROVED'
  readonly version: string
  readonly coreCommit: string
  readonly uiCommit: string
  /** Root version of the paired UI repository at `uiCommit`. */
  readonly uiVersion: string
  readonly approver: {
    readonly login: string
    readonly id: number
    readonly permission: ApproverPermission
  }
  readonly approvedAt: string
  readonly expiresAt: string
  readonly evidenceDigest: string
  readonly source: {
    readonly repository: string
    readonly workflow: string
    readonly workflowPath: string
    readonly runId: string
    readonly runAttempt: string
    readonly event: string
    readonly environment: string
    readonly headSha: string
    readonly conclusion: string
    readonly artifactName: string
    readonly payloadArtifactName: string
    /** GitHub API digest of the payload artifact (zip digest). */
    readonly artifactDigest: string
    /** SHA-256 of the raw payload file bytes. */
    readonly payloadDigest: string
  }
}

export interface RcApprovalContext {
  readonly coreCommit: string
  readonly uiCommit: string
  readonly version: string
  /** Digest of the cross-platform document that was actually reviewed. */
  readonly evidenceDigest: string
  /** SHA-256 of the raw payload file bytes, computed by the verifier. */
  readonly payloadDigest: string | undefined
  readonly run: TrustedApprovalRun | undefined
  readonly attestation: AttestationVerification | undefined
  readonly authorizedApprovers: readonly string[]
  readonly now?: number
  readonly maxAgeHours?: number
}

export interface RcApprovalValidation {
  readonly approved: boolean
  readonly errors: readonly string[]
}

/** Deterministic JSON used for every digest in this module. */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortValue(value))
}

function sortValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValue)
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>
    const sorted: Record<string, unknown> = {}
    for (const key of Object.keys(record).sort()) {
      sorted[key] = sortValue(record[key])
    }
    return sorted
  }
  return value
}

export function digestValue(value: unknown): string {
  return `sha256:${createHash('sha256')
    .update(canonicalJson(value))
    .digest('hex')}`
}

/** Digest of a cross-platform document without its own `digest` field. */
export function crossPlatformDigest(document: unknown): string {
  if (!isRecord(document)) return digestValue(document)
  const { digest: _digest, ...rest } = document
  return digestValue(rest)
}

export function validateCrossPlatformEvidence(
  document: unknown,
  context: {
    readonly commit: string
    readonly now?: number
    readonly maxAgeHours?: number
  },
): RcApprovalValidation & { readonly digest?: string } {
  if (!isRecord(document)) {
    return {
      approved: false,
      errors: ['cross-platform evidence must be an object'],
    }
  }
  const errors: string[] = []
  if (document.schema !== CROSS_PLATFORM_SCHEMA) {
    errors.push(`cross-platform schema must be ${CROSS_PLATFORM_SCHEMA}`)
  }
  if (document.commit !== context.commit) {
    errors.push('cross-platform commit does not match the Core commit')
  }
  if (typeof document.workflow !== 'string' || document.workflow.length === 0) {
    errors.push('cross-platform workflow must be a non-empty string')
  }
  if (document.workflowPath !== '.github/workflows/ci.yml') {
    errors.push('cross-platform workflowPath must be .github/workflows/ci.yml')
  }
  if (!isNumericId(document.workflowId)) {
    errors.push('cross-platform workflowId must be numeric')
  }
  if (!isNumericId(document.runId)) {
    errors.push('cross-platform runId must be numeric')
  }
  if (!isNumericId(document.runAttempt)) {
    errors.push('cross-platform runAttempt must be numeric')
  }
  if (document.event !== 'push' && document.event !== 'workflow_dispatch') {
    errors.push('cross-platform event must be push or workflow_dispatch')
  }

  const platforms = isRecord(document.platforms)
    ? document.platforms
    : undefined
  if (!platforms) {
    errors.push('cross-platform platforms must be an object')
  } else {
    const keys = Object.keys(platforms).sort()
    if (keys.length !== REQUIRED_PLATFORMS.length) {
      errors.push(
        'cross-platform platforms must contain exactly linux and win32',
      )
    }
    for (const platform of REQUIRED_PLATFORMS) {
      const entry = platforms[platform]
      if (!isRecord(entry)) {
        errors.push(`cross-platform platforms.${platform} is missing`)
        continue
      }
      errors.push(...validatePlatformEntry(entry, platform, context))
    }
  }

  if (errors.length === 0) {
    const expected = crossPlatformDigest(document)
    if (document.digest !== expected) {
      errors.push('cross-platform digest does not match the document contents')
    }
  }

  return {
    approved: errors.length === 0,
    errors,
    ...(errors.length === 0 ? { digest: crossPlatformDigest(document) } : {}),
  }
}

function validatePlatformEntry(
  entry: Record<string, unknown>,
  platform: RequiredPlatform,
  context: {
    readonly commit: string
    readonly now?: number
    readonly maxAgeHours?: number
  },
): string[] {
  const errors: string[] = []
  if (entry.status !== 'PASS') {
    errors.push(`cross-platform ${platform} status must be PASS`)
  }
  if (entry.sourceSha !== context.commit) {
    errors.push(`cross-platform ${platform} sourceSha does not match`)
  }
  if (entry.headSha !== context.commit) {
    errors.push(`cross-platform ${platform} headSha does not match`)
  }
  const completedAt = parseTimestamp(entry.completedAt)
  const now = context.now ?? Date.now()
  const maxAgeHours = context.maxAgeHours ?? 168
  if (completedAt === undefined) {
    errors.push(`cross-platform ${platform} completedAt is invalid`)
  } else if (completedAt > now + MAX_CLOCK_SKEW_MS) {
    errors.push(`cross-platform ${platform} completedAt is in the future`)
  } else if (now - completedAt > maxAgeHours * 60 * 60 * 1000) {
    errors.push(`cross-platform ${platform} evidence is stale`)
  }

  const jobs = Array.isArray(entry.jobs) ? entry.jobs : []
  if (jobs.length === 0) {
    errors.push(`cross-platform ${platform} jobs must not be empty`)
  }
  const tested = new Set<string>()
  for (const [index, job] of jobs.entries()) {
    if (!isRecord(job)) {
      errors.push(`cross-platform ${platform} jobs[${index}] must be an object`)
      continue
    }
    if (typeof job.name !== 'string' || job.name.length === 0) {
      errors.push(`cross-platform ${platform} jobs[${index}].name is missing`)
    }
    if (!isNumericId(job.id)) {
      errors.push(
        `cross-platform ${platform} jobs[${index}].id must be numeric`,
      )
    }
    if (job.conclusion !== 'success') {
      errors.push(
        `cross-platform ${platform} jobs[${index}].conclusion must be success`,
      )
    }
    if (!Array.isArray(job.tested) || job.tested.length === 0) {
      errors.push(`cross-platform ${platform} jobs[${index}].tested is empty`)
    } else {
      for (const name of job.tested) {
        if (typeof name === 'string') tested.add(name)
        else
          errors.push(
            `cross-platform ${platform} tested values must be strings`,
          )
      }
    }
  }
  for (const required of REQUIRED_PLATFORM_TESTS) {
    if (!tested.has(required)) {
      errors.push(`cross-platform ${platform} is missing the ${required} test`)
    }
  }

  const artifacts = Array.isArray(entry.artifacts) ? entry.artifacts : []
  if (artifacts.length === 0) {
    errors.push(`cross-platform ${platform} artifacts must not be empty`)
  }
  for (const [index, artifact] of artifacts.entries()) {
    if (!isRecord(artifact)) {
      errors.push(
        `cross-platform ${platform} artifacts[${index}] must be an object`,
      )
      continue
    }
    if (typeof artifact.name !== 'string' || artifact.name.length === 0) {
      errors.push(
        `cross-platform ${platform} artifacts[${index}].name is missing`,
      )
    }
    if (!isNumericId(artifact.id)) {
      errors.push(
        `cross-platform ${platform} artifacts[${index}].id must be numeric`,
      )
    }
    if (typeof artifact.digest !== 'string' || !SHA256.test(artifact.digest)) {
      errors.push(
        `cross-platform ${platform} artifacts[${index}].digest must be sha256:<64 hex>`,
      )
    }
  }
  return errors
}

export function validateRcApproval(
  approval: unknown,
  context: RcApprovalContext,
): RcApprovalValidation {
  if (!isRecord(approval)) {
    return { approved: false, errors: ['release approval must be an object'] }
  }
  const errors: string[] = []
  if (approval.schema !== RC_APPROVAL_SCHEMA) {
    errors.push(`release approval schema must be ${RC_APPROVAL_SCHEMA}`)
  }
  if (approval.decision !== 'APPROVED') {
    errors.push('release approval decision must be APPROVED')
  }
  if (approval.version !== context.version) {
    errors.push('release approval version does not match the release version')
  }
  if (approval.coreCommit !== context.coreCommit) {
    errors.push('release approval coreCommit does not match the Core commit')
  }
  if (approval.uiCommit !== context.uiCommit) {
    errors.push('release approval uiCommit does not match the UI commit')
  }
  if (
    typeof approval.uiVersion !== 'string' ||
    approval.uiVersion.length === 0
  ) {
    errors.push('release approval uiVersion must be a non-empty string')
  }

  const approver = isRecord(approval.approver) ? approval.approver : undefined
  if (!approver) {
    errors.push('release approval approver must be an object')
  } else {
    const login =
      typeof approver.login === 'string' ? approver.login.trim() : ''
    if (login.length === 0) {
      errors.push('release approval approver.login must be a non-empty string')
    } else if (!context.authorizedApprovers.includes(login)) {
      errors.push(`release approval approver ${login} is not authorised`)
    }
    if (!Number.isInteger(approver.id) || Number(approver.id) <= 0) {
      errors.push('release approval approver.id must be a positive integer')
    }
    if (
      typeof approver.permission !== 'string' ||
      !APPROVER_PERMISSIONS.includes(approver.permission as ApproverPermission)
    ) {
      errors.push(
        `release approval approver.permission must be one of ${APPROVER_PERMISSIONS.join(', ')}`,
      )
    }
  }
  if (context.authorizedApprovers.length === 0) {
    errors.push('release approval authorised approver list is empty')
  }

  const maxAgeHours = context.maxAgeHours ?? MAX_APPROVAL_AGE_HOURS
  const now = context.now ?? Date.now()
  const approvedAt = parseTimestamp(approval.approvedAt)
  const expiresAt = parseTimestamp(approval.expiresAt)
  if (approvedAt === undefined) {
    errors.push('release approval approvedAt is invalid')
  } else if (approvedAt > now + MAX_CLOCK_SKEW_MS) {
    errors.push('release approval approvedAt is in the future')
  } else if (now - approvedAt > maxAgeHours * 60 * 60 * 1000) {
    errors.push('release approval is stale')
  }
  if (expiresAt === undefined) {
    errors.push('release approval expiresAt is invalid')
  } else if (expiresAt <= now) {
    errors.push('release approval has expired')
  }
  if (
    approvedAt !== undefined &&
    expiresAt !== undefined &&
    expiresAt - approvedAt > MAX_APPROVAL_TTL_HOURS * 60 * 60 * 1000
  ) {
    errors.push('release approval expiry is longer than the maximum TTL')
  }

  if (approval.evidenceDigest !== context.evidenceDigest) {
    errors.push('release approval evidenceDigest does not match the evidence')
  }
  if (!context.payloadDigest) {
    errors.push('release approval payload file is missing')
  } else if (approval.payloadDigest !== context.payloadDigest) {
    errors.push(
      'release approval payloadDigest does not match the payload file',
    )
  }

  errors.push(...validateApprovalSource(approval.source, context))

  const run = context.run
  if (!run) {
    errors.push('release approval run metadata is missing')
  } else {
    errors.push(...validateRunMetadata(run, approval, context, approver))
  }

  if (!context.attestation) {
    errors.push('release approval artifact attestation is missing')
  } else {
    if (!context.attestation.verified) {
      errors.push('release approval artifact attestation did not verify')
    }
    if (
      context.attestation.signerWorkflow !== undefined &&
      context.attestation.signerWorkflow !== APPROVAL_WORKFLOW_PATH
    ) {
      errors.push(
        'release approval attestation signer workflow is not RC Approval',
      )
    }
    if (
      context.attestation.sourceDigest !== undefined &&
      context.attestation.sourceDigest !== context.coreCommit
    ) {
      errors.push('release approval attestation source digest does not match')
    }
    for (const error of context.attestation.errors ?? []) {
      errors.push(`release approval attestation: ${error}`)
    }
  }

  return { approved: errors.length === 0, errors }
}

function validateApprovalSource(
  value: unknown,
  context: RcApprovalContext,
): string[] {
  if (!isRecord(value)) return ['release approval source must be an object']
  const errors: string[] = []
  if (value.repository !== RC_REPOSITORY) {
    errors.push(`release approval source.repository must be ${RC_REPOSITORY}`)
  }
  if (value.workflow !== APPROVAL_WORKFLOW_NAME) {
    errors.push(
      `release approval source.workflow must be ${APPROVAL_WORKFLOW_NAME}`,
    )
  }
  if (value.workflowPath !== APPROVAL_WORKFLOW_PATH) {
    errors.push(
      `release approval source.workflowPath must be ${APPROVAL_WORKFLOW_PATH}`,
    )
  }
  if (!isNumericId(value.runId)) {
    errors.push('release approval source.runId must be numeric')
  }
  if (!isNumericId(value.runAttempt)) {
    errors.push('release approval source.runAttempt must be numeric')
  }
  if (value.event !== 'workflow_dispatch') {
    errors.push('release approval source.event must be workflow_dispatch')
  }
  if (value.environment !== RELEASE_ENVIRONMENT) {
    errors.push(
      `release approval source.environment must be ${RELEASE_ENVIRONMENT}`,
    )
  }
  if (value.headSha !== context.coreCommit) {
    errors.push(
      'release approval source.headSha does not match the Core commit',
    )
  }
  if (value.conclusion !== 'success') {
    errors.push('release approval source.conclusion must be success')
  }
  if (value.artifactName !== APPROVAL_ARTIFACT_NAME) {
    errors.push(
      `release approval source.artifactName must be ${APPROVAL_ARTIFACT_NAME}`,
    )
  }
  if (value.payloadArtifactName !== APPROVAL_PAYLOAD_ARTIFACT_NAME) {
    errors.push(
      `release approval source.payloadArtifactName must be ${APPROVAL_PAYLOAD_ARTIFACT_NAME}`,
    )
  }
  if (
    typeof value.artifactDigest !== 'string' ||
    !SHA256.test(value.artifactDigest)
  ) {
    errors.push(
      'release approval source.artifactDigest must be sha256:<64 hex>',
    )
  }
  if (
    typeof value.payloadDigest !== 'string' ||
    !SHA256.test(value.payloadDigest)
  ) {
    errors.push('release approval source.payloadDigest must be sha256:<64 hex>')
  }
  return errors
}

function validateRunMetadata(
  run: TrustedApprovalRun,
  approval: Record<string, unknown>,
  context: RcApprovalContext,
  approver: Record<string, unknown> | undefined,
): string[] {
  const source = isRecord(approval.source) ? approval.source : {}
  const errors: string[] = []
  if (run.repository !== RC_REPOSITORY) {
    errors.push('approval run repository is not the release repository')
  }
  if (run.runId !== String(source.runId ?? '')) {
    errors.push('approval run id does not match the downloaded artifact run')
  }
  if (run.runAttempt !== String(source.runAttempt ?? '')) {
    errors.push('approval run attempt does not match the approval document')
  }
  if (run.workflowPath !== APPROVAL_WORKFLOW_PATH) {
    errors.push('approval run was not produced by the RC Approval workflow')
  }
  if (run.workflowName !== APPROVAL_WORKFLOW_NAME) {
    errors.push('approval run workflow name is not RC Approval')
  }
  if (run.event !== 'workflow_dispatch') {
    errors.push('approval run was not triggered by workflow_dispatch')
  }
  if (run.status !== 'completed') {
    errors.push('approval run is not completed')
  }
  if (run.conclusion !== 'success') {
    errors.push('approval run conclusion is not success')
  }
  if (run.headSha !== context.coreCommit) {
    errors.push('approval run headSha does not match the Core commit')
  }
  const login =
    approver && typeof approver.login === 'string' ? approver.login : ''
  if (login.length === 0 || run.actor !== login) {
    errors.push('approval run actor does not match the approver identity')
  }
  if (run.environment !== RELEASE_ENVIRONMENT) {
    errors.push(
      `approval run is not protected by the ${RELEASE_ENVIRONMENT} environment`,
    )
  }
  if (!run.artifact) {
    errors.push('approval run has no rc-approval artifact')
  } else {
    if (run.artifact.name !== APPROVAL_ARTIFACT_NAME) {
      errors.push('approval artifact name is not rc-approval')
    }
    if (run.artifact.expired) {
      errors.push('approval artifact has expired')
    }
    if (!SHA256.test(run.artifact.digest)) {
      errors.push('approval artifact has no valid digest')
    }
  }
  if (!run.payloadArtifact) {
    errors.push('approval run has no rc-approval-payload artifact')
  } else {
    if (run.payloadArtifact.name !== APPROVAL_PAYLOAD_ARTIFACT_NAME) {
      errors.push('approval payload artifact name is not rc-approval-payload')
    }
    if (run.payloadArtifact.expired) {
      errors.push('approval payload artifact has expired')
    }
    if (run.payloadArtifact.digest !== String(source.artifactDigest ?? '')) {
      errors.push(
        'approval payload artifact digest does not match the approval document',
      )
    }
  }
  return errors
}

export function approvalDocumentDigest(document: RcApprovalDocument): string {
  return digestValue(document)
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNumericId(value: unknown): boolean {
  if (typeof value === 'number') return Number.isInteger(value) && value >= 0
  return typeof value === 'string' && /^\d+$/.test(value)
}

function parseTimestamp(value: unknown): number | undefined {
  if (typeof value !== 'string' || !ISO_TIMESTAMP.test(value)) return undefined
  const parsed = Date.parse(value)
  return Number.isFinite(parsed) ? parsed : undefined
}
