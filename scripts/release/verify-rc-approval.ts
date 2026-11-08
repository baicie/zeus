/**
 * Verifies that an RC approval artifact is authentic before it is allowed to
 * influence the assembled RC evidence.
 *
 * Trust is anchored in GitHub, not in the artifact's own JSON:
 *
 * 1. the approval run is re-fetched from the GitHub API and must be a completed,
 *    successful `workflow_dispatch` of `.github/workflows/rc-approval.yml` at
 *    the Core commit, protected by the `Release` environment;
 * 2. the actor of that run must be the approver named in the document;
 * 3. the `rc-approval` artifact digest returned by the API must equal the
 *    digest recorded in the document;
 * 4. `gh attestation verify` must validate the Sigstore attestation emitted by
 *    the approval workflow for the exact source digest;
 * 5. the document itself must satisfy the structured approval contract and be
 *    bound to the cross-platform evidence digest and the release version.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

import { fetchApprovalRun, verifyAttestation } from './github-trust'
import {
  APPROVAL_WORKFLOW_PATH,
  crossPlatformDigest,
  isRecord,
  validateCrossPlatformEvidence,
  validateRcApproval,
  type AttestationVerification,
  type TrustedApprovalRun,
} from './rc-approval'

export interface VerifyRcApprovalInput {
  readonly approvalFile: string
  readonly payloadFile: string
  readonly crossPlatformFile: string
  readonly coreCommit: string
  readonly uiCommit: string
  readonly version: string
  readonly repository: string
  readonly runId: string
  readonly authorizedApprovers: readonly string[]
  readonly outFile?: string
  readonly now?: number
}

export interface VerifyRcApprovalResult {
  readonly approved: boolean
  readonly errors: readonly string[]
  readonly trust?: {
    readonly run: TrustedApprovalRun
    readonly attestation: AttestationVerification
    readonly payloadDigest: string
  }
}

export function verifyRcApproval(
  input: VerifyRcApprovalInput,
): VerifyRcApprovalResult {
  const errors: string[] = []
  const approval = readJson(input.approvalFile, 'release approval', errors)
  const crossPlatform = readJson(
    input.crossPlatformFile,
    'cross-platform evidence',
    errors,
  )
  if (errors.length > 0) return { approved: false, errors }

  const payloadDigest = sha256File(input.payloadFile)
  const crossPlatformResult = validateCrossPlatformEvidence(crossPlatform, {
    commit: input.coreCommit,
    ...(input.now !== undefined ? { now: input.now } : {}),
  })
  errors.push(...crossPlatformResult.errors)

  const runResult = fetchApprovalRun({
    repository: input.repository,
    runId: input.runId,
  })
  errors.push(...runResult.errors)

  const attestation = verifyAttestation({
    repository: input.repository,
    artifactPath: input.approvalFile,
    signerWorkflow: APPROVAL_WORKFLOW_PATH,
    sourceDigest: input.coreCommit,
  })
  errors.push(...attestation.errors)

  const approvalResult = validateRcApproval(approval, {
    coreCommit: input.coreCommit,
    uiCommit: input.uiCommit,
    version: input.version,
    evidenceDigest:
      crossPlatformResult.digest ?? crossPlatformDigest(crossPlatform),
    payloadDigest,
    run: runResult.metadata,
    attestation,
    authorizedApprovers: input.authorizedApprovers,
    ...(input.now !== undefined ? { now: input.now } : {}),
  })
  errors.push(...approvalResult.errors)

  if (errors.length > 0 || !runResult.metadata) {
    return { approved: false, errors }
  }

  return {
    approved: true,
    errors: [],
    trust: { run: runResult.metadata, attestation, payloadDigest },
  }
}

function sha256File(file: string): string {
  return `sha256:${createHash('sha256').update(fs.readFileSync(file)).digest('hex')}`
}

function readJson(
  file: string,
  label: string,
  errors: string[],
): Record<string, unknown> {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    if (!isRecord(value)) {
      errors.push(`${label} must be a JSON object`)
      return {}
    }
    return value
  } catch (error) {
    errors.push(
      `${label} cannot be read: ${error instanceof Error ? error.message : String(error)}`,
    )
    return {}
  }
}

function main(): void {
  const { values } = parseArgs({
    options: {
      approval: { type: 'string' },
      payload: { type: 'string' },
      'cross-platform': { type: 'string' },
      'core-commit': { type: 'string' },
      'ui-commit': { type: 'string' },
      version: { type: 'string' },
      repo: { type: 'string', default: 'baicie/zeus' },
      'run-id': { type: 'string' },
      approvers: { type: 'string' },
      out: { type: 'string', default: 'temp/release/approval-trust.json' },
    },
  })
  for (const key of [
    'approval',
    'payload',
    'cross-platform',
    'core-commit',
    'ui-commit',
    'version',
    'run-id',
    'approvers',
  ] as const) {
    if (!values[key]) throw new Error(`--${key} is required`)
  }
  const approvers = values
    .approvers!.split(',')
    .map(entry => entry.trim())
    .filter(Boolean)
  const result = verifyRcApproval({
    approvalFile: path.resolve(values.approval!),
    payloadFile: path.resolve(values.payload!),
    crossPlatformFile: path.resolve(values['cross-platform']!),
    coreCommit: values['core-commit']!,
    uiCommit: values['ui-commit']!,
    version: values.version!,
    repository: values.repo!,
    runId: values['run-id']!,
    authorizedApprovers: approvers,
  })
  if (!result.approved || !result.trust) {
    for (const error of result.errors) console.error(`BLOCKER ${error}`)
    process.exitCode = 1
    return
  }
  const output = path.resolve(values.out!)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(result.trust, null, 2)}\n`, {
    mode: 0o644,
  })
  console.log(`RC_APPROVAL_VERIFIED: ${output}`)
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main()
}
