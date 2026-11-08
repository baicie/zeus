import { describe, expect, it } from 'vitest'

import {
  APPROVER,
  CORE,
  UI,
  VERSION,
  approvalDocument,
  crossPlatformEvidence,
  rcEvidence,
  sha,
} from '../../release/__tests__/rc-evidence-fixtures'
import {
  evaluateRcEvidence,
  evaluateRcReadiness,
  evaluateReportEvidence,
  RC_EVIDENCE_SCHEMA,
  REQUIRED_ONLINE_PRODUCTS,
  type RcReadinessInput,
} from '../rc-readiness'

const pass = (evidence: string) => ({ status: 'pass' as const, evidence })

const pair = { coreCommit: CORE, uiCommit: UI }

const ready: RcReadinessInput = {
  commit: CORE,
  branch: 'codex/zeus-0.2.0-progress',
  dirty: false,
  frameworkVersion: VERSION,
  sbomComponents: 59,
  trackedFiles: 1400,
  secretFindings: 0,
  packedConsumers: pass('packed consumer report passed for current HEAD'),
  createZeus: pass('create-zeus report passed for current HEAD'),
  onlineProducts: pass(
    'four HTTPS product URLs and the deployment acceptance are bound to the current HEAD',
  ),
  crossPlatform: pass(
    'Linux and Windows evidence is bound to the current HEAD',
  ),
  releaseApproval: pass('release approval is bound to the current HEAD'),
}

describe('evaluateRcReadiness', () => {
  it('passes only when every required evidence is present', () => {
    const report = evaluateRcReadiness(ready)

    expect(report.decision).toBe('READY_FOR_RELEASE_REVIEW')
    expect(report.readyForReview).toBe(true)
    expect(report.blockers).toEqual([])
    expect(report.checks).toHaveLength(8)
  })

  it('reports a dirty worktree and missing online evidence', () => {
    const report = evaluateRcReadiness({
      ...ready,
      dirty: true,
      onlineProducts: {
        status: 'not_run',
        evidence: 'evidence file missing: temp/release/rc-evidence.json',
      },
    })

    expect(report.decision).toBe('NOT_READY')
    expect(report.blockers).toEqual([
      'clean-worktree: working tree has uncommitted changes',
      'online-products: evidence file missing: temp/release/rc-evidence.json',
    ])
  })

  it('reports stale evidence and secrets independently', () => {
    const report = evaluateRcReadiness({
      ...ready,
      secretFindings: 2,
      sbomComponents: 0,
      packedConsumers: {
        status: 'fail',
        evidence:
          'packed consumer report is bound to old-commit, expected abc123',
      },
    })

    expect(report.blockers).toEqual([
      'sbom: 0 SBOM components',
      'secret-scan: 2 findings across 1400 tracked files',
      'packed-consumers: packed consumer report is bound to old-commit, expected abc123',
    ])
  })
})

describe('evaluateRcEvidence', () => {
  it('accepts four HTTPS products, bound cross-platform evidence and a structured approval', () => {
    const statuses = evaluateRcEvidence(rcEvidence(), CORE, pair, VERSION)

    expect(statuses).toEqual({
      onlineProducts: {
        status: 'pass',
        evidence:
          'four HTTPS product URLs and the deployment acceptance are bound to the current HEAD',
      },
      crossPlatform: {
        status: 'pass',
        evidence: 'Linux and Windows evidence is bound to the current HEAD',
      },
      releaseApproval: {
        status: 'pass',
        evidence:
          'release approval is bound to the current HEAD, the evidence digest and a verified artifact attestation',
      },
    })
  })

  it('rejects a deployment that is not accepted or whose digests drift', () => {
    const document = rcEvidence()
    const notAccepted = evaluateRcEvidence(
      {
        ...document,
        deployment: {
          ...(document.deployment as Record<string, unknown>),
          decision: 'NOT_ACCEPTED',
        },
      },
      CORE,
      pair,
    )
    expect(notAccepted.onlineProducts.status).toBe('fail')
    expect(notAccepted.onlineProducts.evidence).toContain(
      'deployment.decision must be ONLINE_ACCEPTED',
    )

    const deployment = document.deployment as Record<string, unknown>
    const drifted = evaluateRcEvidence(
      {
        ...document,
        deployment: {
          ...deployment,
          products: (deployment.products as Array<Record<string, unknown>>).map(
            (entry, index) =>
              index === 0 ? { ...entry, imageDigest: sha('z') } : entry,
          ),
        },
      },
      CORE,
      pair,
    )
    expect(drifted.onlineProducts.evidence).toContain(
      'deployment product webc-studio imageDigest mismatch',
    )
  })

  it('rejects HTTP URLs, missing products and stale commits', () => {
    const document = rcEvidence()
    const products = document.products as Array<Record<string, unknown>>
    const statuses = evaluateRcEvidence(
      {
        ...document,
        products: [
          { ...products[0], url: 'http://webc-studio.example.test' },
          ...products.slice(2),
        ],
        crossPlatform: {
          ...(document.crossPlatform as Record<string, unknown>),
          commit: 'old-commit',
        },
      },
      CORE,
      pair,
    )

    expect(statuses.onlineProducts.status).toBe('fail')
    expect(statuses.onlineProducts.evidence).toContain(
      'products[0].url must be an HTTPS URL',
    )
    expect(statuses.onlineProducts.evidence).toContain(
      'products is missing native-lab',
    )
    expect(statuses.crossPlatform.status).toBe('fail')
    expect(statuses.crossPlatform.evidence).toContain(
      'cross-platform commit does not match the Core commit',
    )
  })

  it('binds the AI Workbench to the UI commit and core products to Core', () => {
    const document = rcEvidence()
    const products = document.products as Array<Record<string, unknown>>
    const statuses = evaluateRcEvidence(
      {
        ...document,
        products: products.map(product =>
          product.product === 'ai-workbench'
            ? { ...product, commit: CORE }
            : product,
        ),
      },
      CORE,
      pair,
    )

    expect(statuses.onlineProducts.status).toBe('fail')
    expect(statuses.onlineProducts.evidence).toContain(
      'products[3].commit does not match the UI commit',
    )
  })

  it('requires a CI release pair to bind the UI commit', () => {
    const statuses = evaluateRcEvidence(rcEvidence(), CORE)

    expect(statuses.onlineProducts.status).toBe('fail')
    expect(statuses.onlineProducts.evidence).toContain(
      'release pair provenance missing (temp/release/pair.json)',
    )
  })

  it('rejects a schema or top-level commit mismatch for every evidence group', () => {
    const statuses = evaluateRcEvidence(
      { ...rcEvidence(), schema: 'zeus.rc-evidence/old' },
      'different-commit',
      pair,
    )

    expect(statuses.onlineProducts.status).toBe('fail')
    expect(statuses.onlineProducts.evidence).toContain(
      `schema must be ${RC_EVIDENCE_SCHEMA}`,
    )
    expect(statuses.onlineProducts.evidence).toContain(
      'top-level commit does not match current HEAD',
    )
    expect(statuses.crossPlatform.status).toBe('fail')
    expect(statuses.releaseApproval.status).toBe('fail')
  })

  it('rejects an approval version that does not match the release version', () => {
    const statuses = evaluateRcEvidence(rcEvidence(), CORE, pair, '0.2.0')

    expect(statuses.releaseApproval.status).toBe('fail')
    expect(statuses.releaseApproval.evidence).toContain(
      `evidence version ${VERSION} does not match 0.2.0`,
    )
  })

  it('rejects NOT_RUN and forged approver strings', () => {
    const document = rcEvidence()
    const approval = document.releaseApproval as Record<string, unknown>
    for (const approver of ['NOT_RUN', 'PENDING', 'release-owner', '']) {
      const statuses = evaluateRcEvidence(
        {
          ...document,
          releaseApproval: { ...approval, approver },
        },
        CORE,
        pair,
      )
      expect(statuses.releaseApproval.status).toBe('fail')
      expect(statuses.releaseApproval.evidence).toContain(
        'release approval approver must be an object',
      )
    }
  })

  it('rejects an approver that is not on the authorised list', () => {
    const document = rcEvidence()
    const approval = document.releaseApproval as Record<string, unknown>
    const statuses = evaluateRcEvidence(
      {
        ...document,
        releaseApproval: {
          ...approval,
          approver: { login: 'attacker', id: 7, permission: 'admin' },
        },
      },
      CORE,
      pair,
    )

    expect(statuses.releaseApproval.status).toBe('fail')
    expect(statuses.releaseApproval.evidence).toContain(
      'release approval approver attacker is not authorised',
    )
    expect(statuses.releaseApproval.evidence).toContain(
      'approval run actor does not match the approver identity',
    )
  })

  it('rejects an approval bound to a different Core or UI commit', () => {
    const document = rcEvidence()
    const approval = document.releaseApproval as Record<string, unknown>
    for (const [field, value, message] of [
      [
        'coreCommit',
        'c'.repeat(40),
        'release approval coreCommit does not match the Core commit',
      ],
      [
        'uiCommit',
        'c'.repeat(40),
        'release approval uiCommit does not match the UI commit',
      ],
    ] as const) {
      const statuses = evaluateRcEvidence(
        {
          ...document,
          releaseApproval: { ...approval, [field]: value },
        },
        CORE,
        pair,
      )
      expect(statuses.releaseApproval.status).toBe('fail')
      expect(statuses.releaseApproval.evidence).toContain(message)
    }
  })

  it('rejects an approval run from another workflow, run id or environment', () => {
    const document = rcEvidence()
    const run = document.approvalRun as Record<string, unknown>
    const cases: Array<[Record<string, unknown>, string]> = [
      [
        { ...run, workflowPath: '.github/workflows/release.yml' },
        'approval run was not produced by the RC Approval workflow',
      ],
      [
        { ...run, runId: '999' },
        'approval run id does not match the downloaded artifact run',
      ],
      [
        { ...run, environment: 'staging' },
        'approval run is not protected by the Release environment',
      ],
      [
        { ...run, conclusion: 'failure' },
        'approval run conclusion is not success',
      ],
      [
        { ...run, headSha: 'd'.repeat(40) },
        'approval run headSha does not match the Core commit',
      ],
    ]
    for (const [approvalRun, message] of cases) {
      const statuses = evaluateRcEvidence(
        { ...document, approvalRun },
        CORE,
        pair,
      )
      expect(statuses.releaseApproval.status).toBe('fail')
      expect(statuses.releaseApproval.evidence).toContain(message)
    }
  })

  it('rejects a modified artifact digest and a missing attestation', () => {
    const document = rcEvidence()
    const run = document.approvalRun as Record<string, unknown>
    const payloadArtifact = run.payloadArtifact as Record<string, unknown>
    const tampered = evaluateRcEvidence(
      {
        ...document,
        approvalRun: {
          ...run,
          payloadArtifact: { ...payloadArtifact, digest: sha('tampered') },
        },
      },
      CORE,
      pair,
    )
    expect(tampered.releaseApproval.status).toBe('fail')
    expect(tampered.releaseApproval.evidence).toContain(
      'approval payload artifact digest does not match the approval document',
    )

    const unverified = evaluateRcEvidence(
      {
        ...document,
        approvalAttestation: {
          verified: false,
          errors: ['signature mismatch'],
        },
      },
      CORE,
      pair,
    )
    expect(unverified.releaseApproval.status).toBe('fail')
    expect(unverified.releaseApproval.evidence).toContain(
      'release approval artifact attestation did not verify',
    )
  })

  it('rejects an approval whose evidence digest differs from the evidence', () => {
    const document = rcEvidence()
    const approval = document.releaseApproval as Record<string, unknown>
    const statuses = evaluateRcEvidence(
      {
        ...document,
        releaseApproval: { ...approval, evidenceDigest: sha('other-evidence') },
      },
      CORE,
      pair,
    )

    expect(statuses.releaseApproval.status).toBe('fail')
    expect(statuses.releaseApproval.evidence).toContain(
      'release approval evidenceDigest does not match the evidence',
    )
  })

  it('rejects a local Stage 2 report masquerading as online evidence', () => {
    const document = rcEvidence()
    const deployment = document.deployment as Record<string, unknown>
    const statuses = evaluateRcEvidence(
      {
        ...document,
        deployment: { ...deployment, decision: 'LOCAL_ACCEPTED' },
      },
      CORE,
      pair,
    )

    expect(statuses.onlineProducts.status).toBe('fail')
    expect(statuses.onlineProducts.evidence).toContain(
      'deployment.decision must be ONLINE_ACCEPTED',
    )
  })

  it('rejects Linux PASS with Windows NOT_RUN', () => {
    const document = rcEvidence()
    const crossPlatform = document.crossPlatform as Record<string, unknown>
    const platforms = crossPlatform.platforms as Record<string, unknown>
    const statuses = evaluateRcEvidence(
      {
        ...document,
        crossPlatform: {
          ...crossPlatform,
          platforms: {
            ...platforms,
            win32: {
              ...(platforms.win32 as Record<string, unknown>),
              status: 'NOT_RUN',
            },
          },
        },
      },
      CORE,
      pair,
    )

    expect(statuses.crossPlatform.status).toBe('fail')
    expect(statuses.crossPlatform.evidence).toContain(
      'cross-platform win32 status must be PASS',
    )
  })

  it('rejects empty or foreign cross-platform evidence', () => {
    const document = rcEvidence()
    for (const crossPlatform of [
      { platforms: ['linux', 'win32'], report: 'NOT_RUN', commit: CORE },
      {
        ...crossPlatformEvidence(),
        workflowPath: '.github/workflows/release.yml',
      },
    ]) {
      const statuses = evaluateRcEvidence(
        { ...document, crossPlatform },
        CORE,
        pair,
      )
      expect(statuses.crossPlatform.status).toBe('fail')
    }
  })

  it('exposes the authorised approvers through the assembled policy', () => {
    const document = rcEvidence() as Record<string, unknown>
    expect(document.approvalPolicy).toEqual({
      authorizedApprovers: [APPROVER],
    })
    const approval = approvalDocument()
    expect(approval.version).toBe(VERSION)
    expect((document.products as unknown[]).length).toBe(
      REQUIRED_ONLINE_PRODUCTS.length,
    )
  })
})

describe('evaluateReportEvidence', () => {
  it('requires a report sourceCommit bound to the current HEAD', () => {
    expect(
      evaluateReportEvidence(
        { passed: true, sourceCommit: 'old-commit' },
        'create-zeus',
        CORE,
      ),
    ).toEqual({
      status: 'fail',
      evidence: `create-zeus report is bound to old-commit, expected ${CORE}`,
    })

    expect(
      evaluateReportEvidence({ passed: true }, 'create-zeus', CORE),
    ).toEqual({
      status: 'fail',
      evidence: 'create-zeus report is missing sourceCommit',
    })
  })
})
