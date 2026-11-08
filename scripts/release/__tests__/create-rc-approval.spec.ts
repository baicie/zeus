import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  buildApprovalEnvelope,
  buildApprovalPayload,
} from '../create-rc-approval'
import {
  APPROVAL_WORKFLOW_PATH,
  validateRcApproval,
  type TrustedApprovalRun,
} from '../rc-approval'
import {
  APPROVER,
  CORE,
  UI,
  VERSION,
  crossPlatformEvidence,
  sha,
} from './rc-evidence-fixtures'

const roots: string[] = []

function temporary(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-approval-'))
  roots.push(root)
  return root
}

function crossPlatformFile(root: string): string {
  const file = path.join(root, 'cross-platform.json')
  fs.writeFileSync(file, JSON.stringify(crossPlatformEvidence()))
  return file
}

const permission = () => ({
  permission: 'admin',
  errors: [] as string[],
})
const run = () => ({
  errors: [] as string[],
  snapshot: {
    run: {
      path: '.github/workflows/ci.yml',
      head_sha: CORE,
      conclusion: 'success',
      event: 'push',
      workflow_id: 100,
    },
    jobs: [],
    artifacts: [],
  },
})
const uiManifest = () => ({
  content: JSON.stringify({ name: 'zeus-ui', version: '0.1.0-beta.35' }),
  errors: [] as string[],
})

afterEach(() => {
  for (const root of roots.splice(0))
    fs.rmSync(root, { recursive: true, force: true })
})

function payloadInput(root: string) {
  return {
    coreCommit: CORE,
    uiCommit: UI,
    version: VERSION,
    crossPlatformFile: crossPlatformFile(root),
    evidenceRunId: '200',
    repository: 'baicie/zeus',
    actor: APPROVER,
    actorId: 42,
    outFile: path.join(root, 'payload.json'),
    fetchPermission: permission,
    fetchRun: run,
    fetchUiManifest: uiManifest,
  }
}

describe('create RC approval payload', () => {
  it('builds a payload bound to the evidence and the approved UI version', () => {
    const root = temporary()
    const result = buildApprovalPayload(payloadInput(root))
    expect(result.errors).toEqual([])
    expect(result.payload?.schema).toBe('zeus.rc-approval-payload/v1')
    expect(result.payload?.uiVersion).toBe('0.1.0-beta.35')
    expect(result.payload?.uiCommit).toBe(UI)
    expect(result.payload?.version).toBe(VERSION)
    expect((result.payload?.evidence as { digest: string }).digest).toMatch(
      /^sha256:[0-9a-f]{64}$/,
    )
    expect(fs.existsSync(path.join(root, 'payload.json'))).toBe(true)
  })

  it('rejects an approver without admin or maintain permission', () => {
    const root = temporary()
    const result = buildApprovalPayload({
      ...payloadInput(root),
      fetchPermission: () => ({ permission: 'read', errors: [] }),
    })
    expect(result.errors).toContain(
      `approver ${APPROVER} has permission read; admin or maintain is required`,
    )
  })

  it('rejects a CI run bound to another commit', () => {
    const root = temporary()
    const result = buildApprovalPayload({
      ...payloadInput(root),
      fetchRun: () => ({
        errors: [],
        snapshot: {
          run: {
            path: '.github/workflows/ci.yml',
            head_sha: 'c'.repeat(40),
            conclusion: 'success',
            event: 'push',
          },
          jobs: [],
          artifacts: [],
        },
      }),
    })
    expect(result.errors).toContain(
      'evidence run head SHA does not match the Core commit',
    )
  })

  it('rejects a cross-platform document for another commit', () => {
    const root = temporary()
    const input = payloadInput(root)
    fs.writeFileSync(
      input.crossPlatformFile,
      JSON.stringify({ ...crossPlatformEvidence(), commit: 'c'.repeat(40) }),
    )
    const result = buildApprovalPayload(input)
    expect(
      result.errors.some(error =>
        error.includes('cross-platform commit does not match'),
      ),
    ).toBe(true)
  })

  it('rejects an unreadable UI manifest at the approved commit', () => {
    const root = temporary()
    const result = buildApprovalPayload({
      ...payloadInput(root),
      fetchUiManifest: () => ({
        errors: ['file package.json at the commit cannot be fetched'],
      }),
    })
    expect(result.errors).toContain(
      'file package.json at the commit cannot be fetched',
    )
    expect(result.errors).toContain(
      'UI version at the approved commit cannot be determined',
    )
  })
})

describe('create RC approval envelope', () => {
  it('records the payload digest and validates as a trusted approval', () => {
    const root = temporary()
    const payloadResult = buildApprovalPayload(payloadInput(root))
    const payload = payloadResult.payload!
    const payloadFile = path.join(root, 'payload.json')
    const envelopeFile = path.join(root, 'rc-approval.json')
    const artifactDigest = sha('payload-artifact')

    const envelope = buildApprovalEnvelope({
      payloadFile,
      payloadArtifactDigest: artifactDigest,
      runId: '300',
      runAttempt: '1',
      repository: 'baicie/zeus',
      outFile: envelopeFile,
    })
    expect(envelope.errors).toEqual([])
    expect(envelope.approval?.schema).toBe('zeus.rc-approval/v2')
    expect(envelope.approval?.uiVersion).toBe('0.1.0-beta.35')

    const document = JSON.parse(
      fs.readFileSync(envelopeFile, 'utf8'),
    ) as Record<string, unknown>
    const runMetadata: TrustedApprovalRun = {
      repository: 'baicie/zeus',
      runId: '300',
      runAttempt: '1',
      workflowId: '99',
      workflowPath: APPROVAL_WORKFLOW_PATH,
      workflowName: 'RC Approval',
      event: 'workflow_dispatch',
      status: 'completed',
      conclusion: 'success',
      headSha: CORE,
      actor: APPROVER,
      environment: 'Release',
      artifact: {
        id: '31',
        name: 'rc-approval',
        digest: sha('envelope'),
        expired: false,
      },
      payloadArtifact: {
        id: '30',
        name: 'rc-approval-payload',
        digest: artifactDigest,
        expired: false,
      },
    }
    const validation = validateRcApproval(document, {
      coreCommit: CORE,
      uiCommit: UI,
      version: VERSION,
      evidenceDigest: (payload.evidence as { digest: string }).digest,
      payloadDigest: String(document.payloadDigest),
      run: runMetadata,
      attestation: {
        verified: true,
        signerWorkflow: APPROVAL_WORKFLOW_PATH,
        sourceDigest: CORE,
        errors: [],
      },
      authorizedApprovers: [APPROVER],
    })
    expect(validation.errors).toEqual([])
    expect(validation.approved).toBe(true)
  })

  it('rejects an invalid payload artifact digest', () => {
    const root = temporary()
    buildApprovalPayload(payloadInput(root))
    const result = buildApprovalEnvelope({
      payloadFile: path.join(root, 'payload.json'),
      payloadArtifactDigest: 'not-a-digest',
      runId: '300',
      runAttempt: '1',
      repository: 'baicie/zeus',
      outFile: path.join(root, 'rc-approval.json'),
    })
    expect(result.errors).toContain(
      'payload artifact digest must be sha256:<64 hex>',
    )
  })
})
