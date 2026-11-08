import { createHash } from 'node:crypto'

import {
  APPROVAL_WORKFLOW_NAME,
  APPROVAL_WORKFLOW_PATH,
  CROSS_PLATFORM_SCHEMA,
  RC_APPROVAL_SCHEMA,
  crossPlatformDigest,
} from '../rc-approval'

export const CORE = 'a'.repeat(40)
export const UI = 'b'.repeat(40)
export const VERSION = '0.2.0-rc.0'
export const APPROVER = 'release-owner'

export const sha = (value: string) =>
  `sha256:${createHash('sha256').update(value).digest('hex')}`

function iso(offsetMs: number): string {
  return new Date(Date.now() + offsetMs).toISOString()
}

export function crossPlatformEvidence(): Record<string, unknown> {
  const base = {
    schema: CROSS_PLATFORM_SCHEMA,
    commit: CORE,
    workflow: 'CI',
    workflowPath: '.github/workflows/ci.yml',
    workflowId: '100',
    runId: '200',
    runAttempt: '1',
    event: 'push',
    platforms: {
      linux: {
        status: 'PASS',
        jobs: [
          {
            name: 'lint-and-check',
            id: '1',
            conclusion: 'success',
            tested: ['typecheck', 'lint', 'format', 'secret-scan'],
          },
          {
            name: 'packed-consumers',
            id: '2',
            conclusion: 'success',
            tested: ['unit', 'build', 'browser-e2e', 'packed-consumers'],
          },
          {
            name: 'create-zeus-candidates (ubuntu-latest, x86_64-unknown-linux-gnu)',
            id: '3',
            conclusion: 'success',
            tested: ['create-zeus', 'native-build', 'build', 'typecheck'],
          },
        ],
        artifacts: [
          {
            name: 'create-zeus-candidate-ubuntu-latest',
            id: '11',
            digest: sha('linux-artifact'),
          },
        ],
        tested: [
          'typecheck',
          'lint',
          'format',
          'secret-scan',
          'unit',
          'build',
          'browser-e2e',
          'packed-consumers',
          'create-zeus',
          'native-build',
        ],
        sourceSha: CORE,
        headSha: CORE,
        completedAt: iso(-60 * 60 * 1000),
      },
      win32: {
        status: 'PASS',
        jobs: [
          {
            name: 'create-zeus-candidates (windows-latest, x86_64-pc-windows-msvc)',
            id: '4',
            conclusion: 'success',
            tested: ['create-zeus', 'native-build', 'build', 'typecheck'],
          },
        ],
        artifacts: [
          {
            name: 'create-zeus-candidate-windows-latest',
            id: '12',
            digest: sha('windows-artifact'),
          },
        ],
        tested: ['create-zeus', 'native-build', 'build', 'typecheck'],
        sourceSha: CORE,
        headSha: CORE,
        completedAt: iso(-60 * 60 * 1000),
      },
    },
  }
  return { ...base, digest: crossPlatformDigest(base) }
}

export function trustedRun(): Record<string, unknown> {
  return {
    run: {
      repository: 'baicie/zeus',
      runId: '300',
      runAttempt: '1',
      workflowId: '99',
      workflowPath: APPROVAL_WORKFLOW_PATH,
      workflowName: APPROVAL_WORKFLOW_NAME,
      event: 'workflow_dispatch',
      status: 'completed',
      conclusion: 'success',
      headSha: CORE,
      actor: APPROVER,
      environment: 'Release',
      artifact: {
        id: '31',
        name: 'rc-approval',
        digest: sha('envelope-artifact'),
        expired: false,
      },
      payloadArtifact: {
        id: '30',
        name: 'rc-approval-payload',
        digest: sha('payload-artifact'),
        expired: false,
      },
    },
    attestation: {
      verified: true,
      signerWorkflow: APPROVAL_WORKFLOW_PATH,
      sourceDigest: CORE,
      errors: [],
    },
    payloadDigest: sha('payload-bytes'),
  }
}

export function approvalDocument(
  crossPlatform: Record<string, unknown> = crossPlatformEvidence(),
): Record<string, unknown> {
  const payloadDigest = sha('payload-bytes')
  return {
    schema: RC_APPROVAL_SCHEMA,
    decision: 'APPROVED',
    version: VERSION,
    coreCommit: CORE,
    uiCommit: UI,
    approver: { login: APPROVER, id: 42, permission: 'admin' },
    approvedAt: iso(-60 * 60 * 1000),
    expiresAt: iso(24 * 60 * 60 * 1000),
    evidenceDigest: crossPlatform.digest,
    payloadDigest,
    source: {
      repository: 'baicie/zeus',
      workflow: APPROVAL_WORKFLOW_NAME,
      workflowPath: APPROVAL_WORKFLOW_PATH,
      runId: '300',
      runAttempt: '1',
      event: 'workflow_dispatch',
      environment: 'Release',
      headSha: CORE,
      conclusion: 'success',
      artifactName: 'rc-approval',
      payloadArtifactName: 'rc-approval-payload',
      artifactDigest: sha('payload-artifact'),
      payloadDigest,
    },
  }
}

export function rcEvidence(): Record<string, unknown> {
  const crossPlatform = crossPlatformEvidence()
  const trust = trustedRun()
  return {
    schema: 'zeus.rc-evidence/v4',
    commit: CORE,
    uiCommit: UI,
    version: VERSION,
    products: ['webc-studio', 'native-lab', 'admin', 'ai-workbench'].map(
      product => ({
        product,
        url: `https://${product}.example.test`,
        commit: product === 'ai-workbench' ? UI : CORE,
        artifactDigest: sha(`${product}-artifact`),
        imageDigest: sha(`${product}-image`),
      }),
    ),
    deployment: {
      decision: 'ONLINE_ACCEPTED',
      transactionStatus: 'PASS',
      coreCommit: CORE,
      uiCommit: UI,
      acceptanceSha256: sha('acceptance'),
      transactionSha256: sha('transaction'),
      provenanceSha256: sha('provenance'),
      products: ['webc-studio', 'native-lab', 'admin', 'ai-workbench'].map(
        product => ({
          product,
          status: 'ONLINE_PASS',
          artifactDigest: sha(`${product}-artifact`),
          imageDigest: sha(`${product}-image`),
        }),
      ),
    },
    crossPlatform,
    releaseApproval: approvalDocument(crossPlatform),
    approvalRun: trust.run,
    approvalAttestation: trust.attestation,
    approvalPolicy: { authorizedApprovers: [APPROVER] },
  }
}
