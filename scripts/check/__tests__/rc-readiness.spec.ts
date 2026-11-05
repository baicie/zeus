import { describe, expect, it } from 'vitest'

import {
  evaluateRcEvidence,
  evaluateRcReadiness,
  evaluateReportEvidence,
  REQUIRED_ONLINE_PRODUCTS,
  type RcReadinessInput,
} from '../rc-readiness'

const pass = (evidence: string) => ({ status: 'pass' as const, evidence })

const validEvidence = {
  schema: 'zeus.rc-evidence/v2',
  commit: 'abc123',
  uiCommit: 'ui456',
  products: REQUIRED_ONLINE_PRODUCTS.map(product => ({
    product,
    url: `https://${product}.example.test`,
    commit: product === 'ai-workbench' ? 'ui456' : 'abc123',
  })),
  crossPlatform: {
    platforms: ['linux', 'win32'],
    report: 'ci://zeus/rc/123',
    commit: 'abc123',
  },
  releaseApproval: {
    approver: 'release-owner',
    commit: 'abc123',
  },
}

const ready: RcReadinessInput = {
  commit: 'abc123',
  branch: 'codex/zeus-0.2.0-progress',
  dirty: false,
  frameworkVersion: '0.2.0',
  sbomComponents: 59,
  trackedFiles: 1400,
  secretFindings: 0,
  packedConsumers: pass('packed consumer report passed for current HEAD'),
  createZeus: pass('create-zeus report passed for current HEAD'),
  onlineProducts: pass('four HTTPS product URLs are bound to the current HEAD'),
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
  it('accepts four HTTPS products, cross-platform evidence and approval', () => {
    const statuses = evaluateRcEvidence(validEvidence, 'abc123')

    expect(statuses).toEqual({
      onlineProducts: {
        status: 'pass',
        evidence: 'four HTTPS product URLs are bound to the current HEAD',
      },
      crossPlatform: {
        status: 'pass',
        evidence: 'Linux and Windows evidence is bound to the current HEAD',
      },
      releaseApproval: {
        status: 'pass',
        evidence: 'release approval is bound to the current HEAD',
      },
    })
  })

  it('rejects HTTP URLs, missing products and stale commits', () => {
    const statuses = evaluateRcEvidence(
      {
        ...validEvidence,
        products: [
          {
            ...validEvidence.products[0],
            url: 'http://webc-studio.example.test',
          },
          ...validEvidence.products.slice(2),
        ],
        crossPlatform: {
          ...validEvidence.crossPlatform,
          commit: 'old-commit',
        },
      },
      'abc123',
    )

    expect(statuses.onlineProducts.status).toBe('fail')
    expect(statuses.onlineProducts.evidence).toContain(
      'products[0].url must be an HTTPS URL',
    )
    expect(statuses.onlineProducts.evidence).toContain(
      'products is missing native-lab',
    )
    expect(statuses.crossPlatform).toEqual({
      status: 'fail',
      evidence: 'crossPlatform.commit does not match current HEAD',
    })
  })

  it('binds the AI Workbench to the UI commit and core products to Core', () => {
    const statuses = evaluateRcEvidence(
      {
        ...validEvidence,
        products: validEvidence.products.map(product =>
          product.product === 'ai-workbench'
            ? { ...product, commit: 'abc123' }
            : product,
        ),
      },
      'abc123',
    )

    expect(statuses.onlineProducts.status).toBe('fail')
    expect(statuses.onlineProducts.evidence).toContain(
      'products[3].commit does not match the UI commit',
    )

    const staleUi = evaluateRcEvidence(
      { ...validEvidence, uiCommit: 'old-ui' },
      'abc123',
    )
    expect(staleUi.onlineProducts.evidence).toContain(
      'products[3].commit does not match the UI commit',
    )
  })

  it('rejects a schema or top-level commit mismatch for every evidence group', () => {
    const statuses = evaluateRcEvidence(
      { ...validEvidence, schema: 'zeus.rc-evidence/old' },
      'different-commit',
    )

    expect(statuses.onlineProducts.status).toBe('fail')
    expect(statuses.onlineProducts.evidence).toContain(
      'schema must be zeus.rc-evidence/v2',
    )
    expect(statuses.onlineProducts.evidence).toContain(
      'top-level commit does not match current HEAD',
    )
    expect(statuses.crossPlatform.status).toBe('fail')
    expect(statuses.releaseApproval.status).toBe('fail')
  })
})

describe('evaluateReportEvidence', () => {
  it('requires a report sourceCommit bound to the current HEAD', () => {
    expect(
      evaluateReportEvidence(
        { passed: true, sourceCommit: 'old-commit' },
        'create-zeus',
        'abc123',
      ),
    ).toEqual({
      status: 'fail',
      evidence: 'create-zeus report is bound to old-commit, expected abc123',
    })

    expect(
      evaluateReportEvidence({ passed: true }, 'create-zeus', 'abc123'),
    ).toEqual({
      status: 'fail',
      evidence: 'create-zeus report is missing sourceCommit',
    })
  })
})
