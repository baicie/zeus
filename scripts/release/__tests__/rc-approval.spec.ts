import { describe, expect, it } from 'vitest'

import {
  APPROVAL_WORKFLOW_PATH,
  crossPlatformDigest,
  digestValue,
  validateCrossPlatformEvidence,
  validateRcApproval,
} from '../rc-approval'
import {
  APPROVER,
  CORE,
  UI,
  VERSION,
  approvalDocument,
  crossPlatformEvidence,
  sha,
  trustedRun,
} from './rc-evidence-fixtures'

const fixtureCrossPlatform = crossPlatformEvidence()

function context(
  overrides: Partial<Parameters<typeof validateRcApproval>[1]> = {},
) {
  const trust = trustedRun()
  return {
    coreCommit: CORE,
    uiCommit: UI,
    version: VERSION,
    evidenceDigest: fixtureCrossPlatform.digest as string,
    payloadDigest: trust.payloadDigest as string,
    run: trust.run as never,
    attestation: trust.attestation as never,
    authorizedApprovers: [APPROVER],
    ...overrides,
  }
}

describe('validateRcApproval', () => {
  it('accepts a fully bound approval', () => {
    const result = validateRcApproval(
      approvalDocument(fixtureCrossPlatform),
      context(),
    )
    expect(result.errors).toEqual([])
    expect(result.approved).toBe(true)
  })

  it('rejects a NOT_RUN approver string', () => {
    const approval = approvalDocument()
    const result = validateRcApproval(
      { ...approval, approver: 'NOT_RUN', decision: 'NOT_RUN' },
      context(),
    )
    expect(result.approved).toBe(false)
    expect(result.errors).toContain(
      'release approval decision must be APPROVED',
    )
    expect(result.errors).toContain(
      'release approval approver must be an object',
    )
  })

  it('rejects an empty authorised approver list', () => {
    const result = validateRcApproval(
      approvalDocument(),
      context({ authorizedApprovers: [] }),
    )
    expect(result.errors).toContain(
      'release approval authorised approver list is empty',
    )
    expect(result.errors).toContain(
      `release approval approver ${APPROVER} is not authorised`,
    )
  })

  it('rejects an approver without admin or maintain permission', () => {
    const approval = approvalDocument()
    const result = validateRcApproval(
      {
        ...approval,
        approver: { login: APPROVER, id: 42, permission: 'read' },
      },
      context(),
    )
    expect(result.errors).toContain(
      'release approval approver.permission must be one of admin, maintain',
    )
  })

  it('rejects a missing or mismatched evidence digest', () => {
    const result = validateRcApproval(
      approvalDocument(),
      context({ evidenceDigest: sha('other') }),
    )
    expect(result.errors).toContain(
      'release approval evidenceDigest does not match the evidence',
    )
  })

  it('rejects a mismatched payload digest', () => {
    const result = validateRcApproval(
      approvalDocument(),
      context({ payloadDigest: sha('other') }),
    )
    expect(result.errors).toContain(
      'release approval payloadDigest does not match the payload file',
    )
  })

  it('rejects an expired approval and an excessive TTL', () => {
    const approval = approvalDocument()
    const expired = validateRcApproval(
      {
        ...approval,
        approvedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        expiresAt: new Date(Date.now() - 60 * 1000).toISOString(),
      },
      context(),
    )
    expect(expired.errors).toContain('release approval has expired')

    const longTtl = validateRcApproval(
      {
        ...approval,
        expiresAt: new Date(Date.now() + 200 * 60 * 60 * 1000).toISOString(),
      },
      context(),
    )
    expect(longTtl.errors).toContain(
      'release approval expiry is longer than the maximum TTL',
    )
  })

  it('rejects a run produced by another workflow or actor', () => {
    const trust = trustedRun()
    const run = trust.run as Record<string, unknown>
    const result = validateRcApproval(
      approvalDocument(),
      context({
        run: {
          ...run,
          workflowPath: '.github/workflows/release.yml',
          actor: 'someone-else',
        } as never,
      }),
    )
    expect(result.errors).toContain(
      'approval run was not produced by the RC Approval workflow',
    )
    expect(result.errors).toContain(
      'approval run actor does not match the approver identity',
    )
  })

  it('rejects a missing attestation and a wrong signer workflow', () => {
    const missing = validateRcApproval(
      approvalDocument(),
      context({ attestation: undefined }),
    )
    expect(missing.errors).toContain(
      'release approval artifact attestation is missing',
    )

    const wrongSigner = validateRcApproval(
      approvalDocument(),
      context({
        attestation: {
          verified: true,
          signerWorkflow: '.github/workflows/release.yml',
          sourceDigest: CORE,
          errors: [],
        },
      }),
    )
    expect(wrongSigner.errors).toContain(
      'release approval attestation signer workflow is not RC Approval',
    )
  })

  it('rejects a source that is not the protected Release environment', () => {
    const approval = approvalDocument()
    const result = validateRcApproval(
      {
        ...approval,
        source: {
          ...(approval.source as Record<string, unknown>),
          environment: 'staging',
          workflow: 'Release',
          event: 'push',
        },
      },
      context(),
    )
    expect(result.errors).toContain(
      'release approval source.environment must be Release',
    )
    expect(result.errors).toContain(
      'release approval source.workflow must be RC Approval',
    )
    expect(result.errors).toContain(
      'release approval source.event must be workflow_dispatch',
    )
  })
})

describe('validateCrossPlatformEvidence', () => {
  it('accepts a digest-bound document', () => {
    const result = validateCrossPlatformEvidence(crossPlatformEvidence(), {
      commit: CORE,
    })
    expect(result.errors).toEqual([])
  })

  it('rejects a tampered digest', () => {
    const document = crossPlatformEvidence()
    const result = validateCrossPlatformEvidence(
      { ...document, digest: sha('tampered') },
      { commit: CORE },
    )
    expect(result.errors).toContain(
      'cross-platform digest does not match the document contents',
    )
  })

  it('rejects a NOT_RUN platform and a missing required test', () => {
    const document = crossPlatformEvidence()
    const platforms = document.platforms as Record<string, unknown>
    const win32 = platforms.win32 as Record<string, unknown>
    const next = {
      ...document,
      platforms: {
        ...platforms,
        win32: {
          ...win32,
          status: 'NOT_RUN',
          tested: ['build'],
          jobs: (win32.jobs as Array<Record<string, unknown>>).map(job => ({
            ...job,
            tested: ['build'],
          })),
        },
      },
    }
    const result = validateCrossPlatformEvidence(
      { ...next, digest: crossPlatformDigest({ ...next, digest: undefined }) },
      { commit: CORE },
    )
    expect(result.errors).toContain('cross-platform win32 status must be PASS')
    expect(result.errors).toContain(
      'cross-platform win32 is missing the typecheck test',
    )
  })

  it('rejects a document bound to another commit', () => {
    const result = validateCrossPlatformEvidence(crossPlatformEvidence(), {
      commit: 'c'.repeat(40),
    })
    expect(result.errors).toContain(
      'cross-platform commit does not match the Core commit',
    )
  })

  it('rejects a stale document', () => {
    const document = crossPlatformEvidence()
    const platforms = document.platforms as Record<string, unknown>
    const linux = platforms.linux as Record<string, unknown>
    const next = {
      ...document,
      platforms: {
        ...platforms,
        linux: {
          ...linux,
          completedAt: new Date(
            Date.now() - 30 * 24 * 60 * 60 * 1000,
          ).toISOString(),
        },
      },
    }
    const result = validateCrossPlatformEvidence(
      { ...next, digest: crossPlatformDigest({ ...next, digest: undefined }) },
      { commit: CORE },
    )
    expect(result.errors).toContain('cross-platform linux evidence is stale')
  })
})

describe('digest helpers', () => {
  it('is independent of object key order', () => {
    expect(digestValue({ a: 1, b: { c: 2, d: 3 } })).toBe(
      digestValue({ b: { d: 3, c: 2 }, a: 1 }),
    )
  })

  it('excludes the digest field itself', () => {
    const document = crossPlatformEvidence()
    expect(crossPlatformDigest(document)).toBe(document.digest)
    expect(
      crossPlatformDigest({ ...document, digest: 'sha256:whatever' }),
    ).toBe(document.digest)
  })

  it('exports the approval workflow path used as the attestation signer', () => {
    expect(APPROVAL_WORKFLOW_PATH).toBe('.github/workflows/rc-approval.yml')
  })
})
