/**
 * A record proves what a run observed, for a commit, under a policy, once.
 *
 * The failure this guards against is a green record from somewhere else being
 * reused: a PASS produced for another commit, another repository, an older
 * policy, or three weeks ago. Checking the word PASS alone accepts all four.
 */
import { describe, expect, it } from 'vitest'

import { createReleaseEnvironmentEvidence } from '../create-release-environment-evidence'
import {
  RELEASE_ENVIRONMENT_EVIDENCE_SCHEMA,
  isReleaseEnvironmentEvidence,
  verifyReleaseEnvironmentEvidence,
  type EvidenceVerificationContext,
  type ReleaseEnvironmentEvidence,
} from '../release-environment-evidence'

const CORE = 'a'.repeat(40)
const NOW = Date.parse('2026-11-15T12:00:00.000Z')

const context: EvidenceVerificationContext = {
  repository: 'baicie/zeus',
  environment: 'Release',
  coreCommit: CORE,
  workflowPath: '.github/workflows/release-governance.yml',
  policyVersion: 'zeus.release-policy/v1',
  maxAgeHours: 24,
  now: () => NOW,
}

function record(
  overrides: Partial<ReleaseEnvironmentEvidence> = {},
): ReleaseEnvironmentEvidence {
  return {
    schema: RELEASE_ENVIRONMENT_EVIDENCE_SCHEMA,
    repository: 'baicie/zeus',
    environment: 'Release',
    workflowPath: '.github/workflows/release-governance.yml',
    runId: '43700000000',
    runAttempt: 1,
    coreCommit: CORE,
    observedAt: '2026-11-15T11:00:00.000Z',
    policyVersion: 'zeus.release-policy/v1',
    observed: {
      hasRequiredReviewers: true,
      reviewers: ['minato'],
      preventsSelfReview: true,
      adminsCanBypass: false,
      branchPolicy: 'custom',
      deploymentPolicies: [{ name: 'v*', type: 'tag' }],
    },
    verdict: 'PASS',
    ...overrides,
  }
}

describe('a record bound to this release', () => {
  it('verifies', () => {
    const result = verifyReleaseEnvironmentEvidence(record(), context)
    expect(result.ok).toBe(true)
    expect(result.problems).toEqual([])
    expect(result.ageMinutes).toBe(60)
  })
})

describe('bindings', () => {
  /* The defect: a green record about another commit is not about this one. */
  it('rejects a record produced for a different commit', () => {
    const result = verifyReleaseEnvironmentEvidence(
      record({ coreCommit: 'b'.repeat(40) }),
      context,
    )
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result.problems)).toMatch(
      /record was produced for b{40}, the candidate is a{40}/,
    )
  })

  it('rejects a record from another repository', () => {
    const result = verifyReleaseEnvironmentEvidence(
      record({ repository: 'attacker/zeus' }),
      context,
    )
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result.problems)).toMatch(
      /record is for attacker\/zeus/,
    )
  })

  it('rejects a record for another environment', () => {
    const result = verifyReleaseEnvironmentEvidence(
      record({ environment: 'Canary' }),
      context,
    )
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result.problems)).toMatch(/environment Canary/)
  })

  /*
   * Only the governance workflow holds a token that can read environments. A
   * record claiming to come from a PR workflow is not evidence this repository
   * can produce, so it did not come from here.
   */
  it('rejects a record from a workflow that cannot read environments', () => {
    const result = verifyReleaseEnvironmentEvidence(
      record({ workflowPath: '.github/workflows/ci.yml' }),
      context,
    )
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result.problems)).toMatch(
      /produced by .github\/workflows\/ci.yml/,
    )
  })

  it('rejects a record judged under an older policy', () => {
    const result = verifyReleaseEnvironmentEvidence(
      record({ policyVersion: 'zeus.release-policy/v0' }),
      context,
    )
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result.problems)).toMatch(
      /judged under zeus.release-policy\/v0/,
    )
  })
})

describe('freshness', () => {
  it('rejects a record older than the bound', () => {
    const result = verifyReleaseEnvironmentEvidence(
      record({ observedAt: '2026-11-13T11:00:00.000Z' }),
      context,
    )
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result.problems)).toMatch(
      /older than the 24h bound; the environment must be read again/,
    )
  })

  /* A future timestamp means the clock or the producer is wrong. */
  it('rejects a record dated in the future', () => {
    const result = verifyReleaseEnvironmentEvidence(
      record({ observedAt: '2026-11-15T13:00:00.000Z' }),
      context,
    )
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result.problems)).toMatch(/60 minutes in the future/)
  })

  it('reports both a stale record and its wrong commit', () => {
    const result = verifyReleaseEnvironmentEvidence(
      record({
        coreCommit: 'b'.repeat(40),
        observedAt: '2026-11-10T11:00:00.000Z',
      }),
      context,
    )
    const fields = result.problems.map(problem => problem.field)
    expect(fields).toContain('coreCommit')
    expect(fields).toContain('observedAt')
  })
})

describe('verdicts', () => {
  it('rejects a record whose producing run concluded FAIL', () => {
    const result = verifyReleaseEnvironmentEvidence(
      record({ verdict: 'FAIL' }),
      context,
    )
    expect(result.ok).toBe(false)
    expect(JSON.stringify(result.problems)).toMatch(/concluded FAIL/)
  })

  it('rejects a POLICY_LIMITATION record', () => {
    const result = verifyReleaseEnvironmentEvidence(
      record({ verdict: 'POLICY_LIMITATION' }),
      context,
    )
    expect(result.ok).toBe(false)
  })
})

describe('structure', () => {
  it('rejects a non-record', () => {
    expect(verifyReleaseEnvironmentEvidence(null, context).ok).toBe(false)
    expect(verifyReleaseEnvironmentEvidence({}, context).ok).toBe(false)
    expect(isReleaseEnvironmentEvidence({ schema: 'other' })).toBe(false)
  })

  it('rejects a record with a non-UTC timestamp', () => {
    expect(
      isReleaseEnvironmentEvidence(
        record({ observedAt: '2026-11-15 11:00:00' }),
      ),
    ).toBe(false)
  })
})

/**
 * The producer, not just the verifier.
 *
 * A producer that writes a record for an unreadable environment would put a
 * file on disk carrying a verdict while saying nothing about the environment —
 * and a consumer checking only the verdict would take it.
 */
describe('createReleaseEnvironmentEvidence', () => {
  const base = {
    repository: 'baicie/zeus',
    environment: 'Release',
    runId: '43700000000',
    runAttempt: 1,
    coreCommit: CORE,
    now: () => NOW,
  }

  it('writes a record when the environment was read', () => {
    const result = createReleaseEnvironmentEvidence({
      ...base,
      probe: {
        state: 'read',
        hasRequiredReviewers: true,
        reviewers: ['minato'],
        preventsSelfReview: true,
        adminsCanBypass: false,
        branchPolicy: 'custom',
        deploymentPolicies: [{ name: 'v*', type: 'tag' }],
      },
    })
    expect(result.errors).toEqual([])
    expect(result.evidence?.verdict).toBe('PASS')
    expect(result.evidence?.coreCommit).toBe(CORE)
    expect(result.evidence?.observedAt).toBe('2026-11-15T12:00:00.000Z')
    expect(result.evidence?.workflowPath).toBe(
      '.github/workflows/release-governance.yml',
    )
  })

  /* Measured on this repository today: no reviewers, no branch policy. */
  it('records a FAIL rather than withholding it', () => {
    const result = createReleaseEnvironmentEvidence({
      ...base,
      probe: {
        state: 'read',
        hasRequiredReviewers: false,
        reviewers: [],
        preventsSelfReview: false,
        adminsCanBypass: true,
        branchPolicy: 'none',
      },
    })
    expect(result.evidence?.verdict).toBe('FAIL')
    expect(result.errors.join('\n')).toMatch(/does not satisfy/)
  })

  for (const state of [
    'unauthorized',
    'network_error',
    'tool_missing',
    'not_configured',
  ] as const) {
    it(`refuses to write a record when the probe returned ${state}`, () => {
      const result = createReleaseEnvironmentEvidence({
        ...base,
        probe: { state, detail: `probe said ${state}` },
      })
      expect(result.evidence).toBeUndefined()
      expect(result.errors.join('\n')).toMatch(new RegExp(`returned ${state}`))
    })
  }
})
