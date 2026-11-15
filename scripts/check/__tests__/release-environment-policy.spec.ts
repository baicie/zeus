/**
 * The rules, tested against constructed environments rather than a live API.
 *
 * The previous implementation checked two of the four facts it read. An
 * environment where an admin could bypass review, or where any branch could
 * deploy, reported the same `pass` as one where neither was true — because
 * those two fields were only quoted into the evidence string.
 *
 * These tests describe environments GitHub can and cannot currently produce.
 * The second kind matters: a rule the API cannot express must be reported as a
 * limitation, not dropped for lack of a way to express it.
 */
import { describe, expect, it } from 'vitest'

import {
  ALLOWED_RELEASE_REFS,
  RELEASE_ENVIRONMENT_POLICY_VERSION,
  RELEASE_ENVIRONMENT_RULES,
  evaluateReleaseEnvironmentPolicy,
  type ObservedEnvironment,
} from '../release-environment-policy'

/** An environment that satisfies every rule. */
function compliant(
  overrides: Partial<ObservedEnvironment> = {},
): ObservedEnvironment {
  return {
    hasRequiredReviewers: true,
    reviewers: ['minato'],
    preventsSelfReview: true,
    adminsCanBypass: false,
    branchPolicy: 'custom',
    allowedBranches: ['refs/tags/v*'],
    ...overrides,
  }
}

describe('a compliant environment', () => {
  it('passes every rule', () => {
    const result = evaluateReleaseEnvironmentPolicy(compliant())
    expect(result.verdict).toBe('PASS')
    expect(result.findings.every(f => f.verdict === 'PASS')).toBe(true)
    expect(result.version).toBe(RELEASE_ENVIRONMENT_POLICY_VERSION)
  })

  it('reports all four rules, not just the failing ones', () => {
    const result = evaluateReleaseEnvironmentPolicy(compliant())
    expect(result.findings.map(f => f.rule)).toEqual([
      RELEASE_ENVIRONMENT_RULES.requiredReviewers,
      RELEASE_ENVIRONMENT_RULES.noSelfReview,
      RELEASE_ENVIRONMENT_RULES.noAdminBypass,
      RELEASE_ENVIRONMENT_RULES.allowedRefs,
    ])
  })
})

describe('required reviewers', () => {
  it('fails when there are none', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ hasRequiredReviewers: false }),
    )
    expect(result.verdict).toBe('FAIL')
    expect(JSON.stringify(result.findings)).toMatch(/requires no reviewer/)
  })

  /*
   * A field the API did not return is not a satisfied rule. Resolving a
   * missing value toward the favourable answer is how a check reports a
   * protection it never saw.
   */
  it('fails when the field was not observed', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ hasRequiredReviewers: undefined }),
    )
    expect(result.verdict).toBe('FAIL')
    expect(JSON.stringify(result.findings)).toMatch(
      /an unobserved rule is not a satisfied one/,
    )
  })
})

describe('self-review', () => {
  it('fails when the requester can approve their own run', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ preventsSelfReview: false }),
    )
    expect(result.verdict).toBe('FAIL')
    expect(JSON.stringify(result.findings)).toMatch(
      /allows the requester to approve their own run/,
    )
  })

  it('fails when the field was not observed', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ preventsSelfReview: undefined }),
    )
    expect(result.verdict).toBe('FAIL')
    expect(JSON.stringify(result.findings)).toMatch(
      /a missing field is not permission/,
    )
  })
})

describe('admin bypass', () => {
  /* The gap this work package exists for. */
  it('fails when admins can bypass the rules', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ adminsCanBypass: true }),
    )
    expect(result.verdict).toBe('FAIL')
    expect(JSON.stringify(result.findings)).toMatch(
      /repository admins can bypass the Release environment protection/,
    )
  })

  /*
   * GitHub defaults `can_admins_bypass` to true. Treating a missing value as
   * "false" would assume the safe setting on no evidence.
   */
  it('fails when the field was not observed', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ adminsCanBypass: undefined }),
    )
    expect(result.verdict).toBe('FAIL')
    expect(JSON.stringify(result.findings)).toMatch(
      /GitHub defaults this to true, so silence must not be read as no/,
    )
  })
})

describe('allowed refs', () => {
  it('fails when no branch policy exists', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ branchPolicy: 'none', allowedBranches: undefined }),
    )
    expect(result.verdict).toBe('FAIL')
    expect(JSON.stringify(result.findings)).toMatch(
      /any branch or tag may deploy/,
    )
  })

  it('fails when the allowed refs do not cover releases', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ allowedBranches: ['refs/heads/main'] }),
    )
    expect(result.verdict).toBe('FAIL')
    expect(JSON.stringify(result.findings)).toMatch(
      /do not cover refs\/tags\/v\*/,
    )
  })

  /*
   * GitHub keeps the patterns on a second endpoint. When a custom policy
   * exists but its contents were not read, the restriction is real and its
   * scope is unknown — which is a limitation, not a pass and not a failure.
   */
  it('marks a custom policy with unread patterns as a limitation', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ allowedBranches: undefined }),
    )
    expect(result.verdict).toBe('POLICY_LIMITATION')
    expect(JSON.stringify(result.findings)).toMatch(
      /the restriction exists and its contents are unverified/,
    )
  })

  it('treats a broader environment pattern as covering the policy', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ allowedBranches: ['refs/tags/*'] }),
    )
    const refs = result.findings.find(
      f => f.rule === RELEASE_ENVIRONMENT_RULES.allowedRefs,
    )
    expect(refs?.verdict).toBe('PASS')
  })

  /* A narrower pattern must not be read as coverage it does not have. */
  it('does not treat a narrower pattern as covering releases', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ allowedBranches: ['refs/tags/v0.1.*'] }),
    )
    const refs = result.findings.find(
      f => f.rule === RELEASE_ENVIRONMENT_RULES.allowedRefs,
    )
    expect(refs?.verdict).toBe('FAIL')
  })
})

describe('verdict precedence', () => {
  it('reports FAIL when any rule fails, whatever else passed', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ adminsCanBypass: true, allowedBranches: undefined }),
    )
    expect(result.verdict).toBe('FAIL')
  })

  it('reports POLICY_LIMITATION over PASS', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ allowedBranches: undefined }),
    )
    expect(result.verdict).toBe('POLICY_LIMITATION')
  })
})

describe('the refs the policy requires', () => {
  it('requires tag refs, not main', () => {
    expect(ALLOWED_RELEASE_REFS).toEqual(['refs/tags/v*'])
  })
})
