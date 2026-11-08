/**
 * Builds the two halves of the RC approval artifact.
 *
 * `payload` is uploaded first as `rc-approval-payload`; GitHub returns the
 * artifact digest. `envelope` then records that digest together with the
 * approval run metadata, is attested by actions/attest-build-provenance and is
 * uploaded as `rc-approval`. The release workflow verifies both artifacts.
 *
 * Only a maintainer/admin can produce the payload, and only from a
 * `workflow_dispatch` run protected by the `Release` environment.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import {
  fetchActorPermission,
  fetchFileAtCommit,
  fetchRunSnapshot,
} from './github-trust'
import {
  APPROVAL_ARTIFACT_NAME,
  APPROVAL_PAYLOAD_ARTIFACT_NAME,
  APPROVAL_WORKFLOW_NAME,
  APPROVAL_WORKFLOW_PATH,
  APPROVER_PERMISSIONS,
  CROSS_PLATFORM_SCHEMA,
  MAX_APPROVAL_TTL_HOURS,
  RC_APPROVAL_PAYLOAD_SCHEMA,
  RC_APPROVAL_SCHEMA,
  RELEASE_ENVIRONMENT,
  RC_REPOSITORY,
  crossPlatformDigest,
  isRecord,
  validateCrossPlatformEvidence,
  type ApproverPermission,
} from './rc-approval'

const SHA256 = /^sha256:[0-9a-f]{64}$/i

export interface BuildApprovalPayloadInput {
  readonly coreCommit: string
  readonly uiCommit: string
  readonly version: string
  readonly uiRepo?: string
  readonly fetchUiManifest?: typeof fetchFileAtCommit
  readonly crossPlatformFile: string
  readonly evidenceRunId: string
  readonly repository: string
  readonly actor: string
  readonly actorId: number
  readonly ttlHours?: number
  readonly now?: number
  readonly outFile: string
  readonly fetchPermission?: typeof fetchActorPermission
  readonly fetchRun?: typeof fetchRunSnapshot
}

export interface BuildApprovalPayloadResult {
  readonly payload?: Record<string, unknown>
  readonly errors: readonly string[]
}

export function buildApprovalPayload(
  input: BuildApprovalPayloadInput,
): BuildApprovalPayloadResult {
  const errors: string[] = []
  if (!/^[0-9a-f]{40}$/i.test(input.coreCommit)) {
    errors.push('coreCommit must be a full 40-character SHA')
  }
  if (!/^[0-9a-f]{40}$/i.test(input.uiCommit)) {
    errors.push('uiCommit must be a full 40-character SHA')
  }
  if (input.version.length === 0) errors.push('version must not be empty')
  if (!Number.isInteger(input.actorId) || input.actorId <= 0) {
    errors.push('actorId must be a positive integer')
  }

  let crossPlatform: Record<string, unknown> = {}
  try {
    const value = JSON.parse(
      fs.readFileSync(input.crossPlatformFile, 'utf8'),
    ) as unknown
    if (!isRecord(value))
      errors.push('cross-platform evidence must be an object')
    else crossPlatform = value
  } catch (error) {
    errors.push(
      `cross-platform evidence cannot be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }

  const evidence = validateCrossPlatformEvidence(crossPlatform, {
    commit: input.coreCommit,
    ...(input.now !== undefined ? { now: input.now } : {}),
  })
  errors.push(...evidence.errors)

  const permission = (input.fetchPermission ?? fetchActorPermission)({
    repository: input.repository,
    login: input.actor,
  })
  errors.push(...permission.errors)
  if (
    !permission.permission ||
    !APPROVER_PERMISSIONS.includes(permission.permission as ApproverPermission)
  ) {
    errors.push(
      `approver ${input.actor} has permission ${permission.permission ?? 'unknown'}; admin or maintain is required`,
    )
  }

  const run = (input.fetchRun ?? fetchRunSnapshot)({
    repository: input.repository,
    runId: input.evidenceRunId,
  })
  errors.push(...run.errors)
  const runData = run.snapshot?.run
  if (runData) {
    if (String(runData.path ?? '') !== '.github/workflows/ci.yml') {
      errors.push('evidence run was not produced by the CI workflow')
    }
    if (String(runData.head_sha ?? '') !== input.coreCommit) {
      errors.push('evidence run head SHA does not match the Core commit')
    }
    if (String(runData.conclusion ?? '') !== 'success') {
      errors.push('evidence run conclusion is not success')
    }
    if (
      String(runData.event ?? '') !== 'push' &&
      String(runData.event ?? '') !== 'workflow_dispatch'
    ) {
      errors.push('evidence run event is not push or workflow_dispatch')
    }
  }

  const uiRepo = input.uiRepo ?? 'baicie/zeus-ui'
  const uiManifest = (input.fetchUiManifest ?? fetchFileAtCommit)({
    repository: uiRepo,
    path: 'package.json',
    commit: input.uiCommit,
  })
  errors.push(...uiManifest.errors)
  let uiVersion = ''
  if (uiManifest.content) {
    try {
      const manifest = JSON.parse(uiManifest.content) as { version?: unknown }
      if (typeof manifest.version === 'string') uiVersion = manifest.version
    } catch {
      errors.push('UI package.json at the approved commit is not valid JSON')
    }
  }
  if (uiVersion.length === 0) {
    errors.push('UI version at the approved commit cannot be determined')
  }

  if (errors.length > 0) return { errors }

  const now = input.now ?? Date.now()
  const ttlHours = Math.min(input.ttlHours ?? 48, MAX_APPROVAL_TTL_HOURS)
  const payload = {
    schema: RC_APPROVAL_PAYLOAD_SCHEMA,
    version: input.version,
    coreCommit: input.coreCommit,
    uiCommit: input.uiCommit,
    uiVersion,
    approver: {
      login: input.actor,
      id: input.actorId,
      permission: permission.permission,
    },
    approvedAt: new Date(now).toISOString(),
    expiresAt: new Date(now + ttlHours * 60 * 60 * 1000).toISOString(),
    evidence: {
      schema: CROSS_PLATFORM_SCHEMA,
      digest: evidence.digest ?? crossPlatformDigest(crossPlatform),
      runId: input.evidenceRunId,
      commit: input.coreCommit,
    },
  }
  fs.mkdirSync(path.dirname(path.resolve(input.outFile)), { recursive: true })
  fs.writeFileSync(
    path.resolve(input.outFile),
    `${JSON.stringify(payload, null, 2)}\n`,
  )
  return { payload, errors: [] }
}

export interface BuildApprovalEnvelopeInput {
  readonly payloadFile: string
  readonly payloadArtifactDigest: string
  readonly runId: string
  readonly runAttempt: string
  readonly repository: string
  readonly outFile: string
}

export interface BuildApprovalEnvelopeResult {
  readonly approval?: Record<string, unknown>
  readonly errors: readonly string[]
}

export function buildApprovalEnvelope(
  input: BuildApprovalEnvelopeInput,
): BuildApprovalEnvelopeResult {
  const errors: string[] = []
  let payload: Record<string, unknown> = {}
  try {
    const value = JSON.parse(
      fs.readFileSync(input.payloadFile, 'utf8'),
    ) as unknown
    if (!isRecord(value)) errors.push('approval payload must be an object')
    else payload = value
  } catch (error) {
    errors.push(
      `approval payload cannot be read: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
  }
  if (payload.schema !== RC_APPROVAL_PAYLOAD_SCHEMA) {
    errors.push(`approval payload schema must be ${RC_APPROVAL_PAYLOAD_SCHEMA}`)
  }
  if (!SHA256.test(input.payloadArtifactDigest)) {
    errors.push('payload artifact digest must be sha256:<64 hex>')
  }
  if (!/^\d+$/.test(input.runId)) errors.push('runId must be numeric')
  if (!/^\d+$/.test(input.runAttempt)) errors.push('runAttempt must be numeric')
  if (errors.length > 0) return { errors }

  const payloadDigest = `sha256:${createHash('sha256')
    .update(fs.readFileSync(input.payloadFile))
    .digest('hex')}`
  const evidence = isRecord(payload.evidence) ? payload.evidence : {}
  const approval = {
    schema: RC_APPROVAL_SCHEMA,
    decision: 'APPROVED',
    version: payload.version,
    coreCommit: payload.coreCommit,
    uiCommit: payload.uiCommit,
    uiVersion: payload.uiVersion,
    approver: payload.approver,
    approvedAt: payload.approvedAt,
    expiresAt: payload.expiresAt,
    evidenceDigest: evidence.digest,
    payloadDigest,
    source: {
      repository: input.repository,
      workflow: APPROVAL_WORKFLOW_NAME,
      workflowPath: APPROVAL_WORKFLOW_PATH,
      runId: input.runId,
      runAttempt: input.runAttempt,
      event: 'workflow_dispatch',
      environment: RELEASE_ENVIRONMENT,
      headSha: payload.coreCommit,
      conclusion: 'success',
      artifactName: APPROVAL_ARTIFACT_NAME,
      payloadArtifactName: APPROVAL_PAYLOAD_ARTIFACT_NAME,
      artifactDigest: input.payloadArtifactDigest,
      payloadDigest,
    },
  }
  fs.mkdirSync(path.dirname(path.resolve(input.outFile)), { recursive: true })
  fs.writeFileSync(
    path.resolve(input.outFile),
    `${JSON.stringify(approval, null, 2)}\n`,
  )
  return { approval, errors: [] }
}

function main(): void {
  const { values } = parseArgs({
    options: {
      mode: { type: 'string' },
      'core-commit': { type: 'string' },
      'ui-commit': { type: 'string' },
      version: { type: 'string' },
      'cross-platform': { type: 'string' },
      'evidence-run-id': { type: 'string' },
      'ui-repo': { type: 'string', default: 'baicie/zeus-ui' },
      repo: { type: 'string', default: RC_REPOSITORY },
      actor: { type: 'string' },
      'actor-id': { type: 'string' },
      'ttl-hours': { type: 'string' },
      payload: { type: 'string' },
      'payload-artifact-digest': { type: 'string' },
      'run-id': { type: 'string' },
      'run-attempt': { type: 'string', default: '1' },
      out: { type: 'string' },
    },
  })
  if (values.mode === 'payload') {
    for (const key of [
      'core-commit',
      'ui-commit',
      'version',
      'cross-platform',
      'evidence-run-id',
      'ui-repo',
      'actor',
      'actor-id',
      'out',
    ] as const) {
      if (!values[key]) throw new Error(`--${key} is required`)
    }
    const result = buildApprovalPayload({
      coreCommit: values['core-commit']!,
      uiCommit: values['ui-commit']!,
      version: values.version!,
      crossPlatformFile: path.resolve(values['cross-platform']!),
      evidenceRunId: values['evidence-run-id']!,
      ...(values['ui-repo'] ? { uiRepo: values['ui-repo'] } : {}),
      repository: values.repo!,
      actor: values.actor!,
      actorId: Number(values['actor-id']),
      ...(values['ttl-hours'] ? { ttlHours: Number(values['ttl-hours']) } : {}),
      outFile: path.resolve(values.out!),
    })
    fail(result.errors)
    return
  }
  if (values.mode === 'envelope') {
    for (const key of [
      'payload',
      'payload-artifact-digest',
      'run-id',
      'out',
    ] as const) {
      if (!values[key]) throw new Error(`--${key} is required`)
    }
    const result = buildApprovalEnvelope({
      payloadFile: path.resolve(values.payload!),
      payloadArtifactDigest: values['payload-artifact-digest']!,
      runId: values['run-id']!,
      runAttempt: values['run-attempt']!,
      repository: values.repo!,
      outFile: path.resolve(values.out!),
    })
    fail(result.errors)
    return
  }
  throw new Error('--mode must be payload or envelope')
}

function fail(errors: readonly string[]): void {
  if (errors.length === 0) {
    console.log('RC_APPROVAL_WRITTEN')
    return
  }
  for (const error of errors) console.error(`BLOCKER ${error}`)
  process.exitCode = 1
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
