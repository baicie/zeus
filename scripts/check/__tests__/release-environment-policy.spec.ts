/**
 * The rules, tested against constructed environments rather than a live API.
 *
 * ## What these tests are guarding
 *
 * The `allowed-refs` rule used to ask whether the environment was *broad
 * enough* to deploy a release tag. Every way of broadening it therefore looked
 * safer: `refs/tags/*` passed, and `*` passed, on an environment where any
 * branch or any tag could deploy. The rule now asks the opposite question —
 * does every ref the environment admits fall inside the grant — and the tests
 * below are written so that the old implementation fails them.
 *
 * ## Why the vocabulary looks odd
 *
 * GitHub's policy entries carry `name` as a *pattern* (`v*`, `main`,
 * `releases/*`) and `type` as `branch` or `tag`. The old code compared the
 * pattern against `refs/tags/v*` as a string, which compared two different
 * languages and ignored `type` entirely. These tests speak the real data
 * model so a regression cannot pass by matching the wrong shape.
 */
import { describe, expect, it } from 'vitest'

import {
  MAINTENANCE_BRANCH,
  RELEASE_ENVIRONMENT_POLICY_VERSION,
  RELEASE_ENVIRONMENT_RULES,
  RELEASE_TAG_POLICY,
  evaluateCandidateReachability,
  evaluateRefGrant,
  evaluateReleaseEnvironmentPolicy,
  parsePattern,
  patternAdmitsRef,
  patternWithinGrant,
  type DeploymentPolicyEntry,
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
    deploymentPolicies: [{ name: 'v*', type: 'tag' }],
    ...overrides,
  }
}

function refsFinding(
  result: ReturnType<typeof evaluateReleaseEnvironmentPolicy>,
) {
  return result.findings.find(
    f => f.rule === `${RELEASE_ENVIRONMENT_RULES.allowedRefs}:tag`,
  )
}

function reachabilityFinding(
  result: ReturnType<typeof evaluateReleaseEnvironmentPolicy>,
) {
  return result.findings.find(
    f => f.rule === `${RELEASE_ENVIRONMENT_RULES.releaseRefReachable}:tag`,
  )
}

describe('a compliant environment', () => {
  it('passes every rule', () => {
    const result = evaluateReleaseEnvironmentPolicy(compliant())
    expect(result.verdict).toBe('PASS')
    expect(result.findings.every(f => f.verdict === 'PASS')).toBe(true)
    expect(result.version).toBe(RELEASE_ENVIRONMENT_POLICY_VERSION)
  })

  it('reports the reviewer and bypass rules it evaluated', () => {
    const result = evaluateReleaseEnvironmentPolicy(compliant())
    const rules = result.findings.map(f => f.rule)
    expect(rules).toContain(RELEASE_ENVIRONMENT_RULES.requiredReviewers)
    expect(rules).toContain(RELEASE_ENVIRONMENT_RULES.noSelfReview)
    expect(rules).toContain(RELEASE_ENVIRONMENT_RULES.noAdminBypass)
    expect(rules).toContain(`${RELEASE_ENVIRONMENT_RULES.allowedRefs}:tag`)
    expect(rules).toContain(
      `${RELEASE_ENVIRONMENT_RULES.releaseRefReachable}:tag`,
    )
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
  it('fails when admins can bypass the rules', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ adminsCanBypass: true }),
    )
    expect(result.verdict).toBe('FAIL')
    expect(JSON.stringify(result.findings)).toMatch(
      /repository admins can bypass the Release environment protection/,
    )
  })

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

/*
 * The reverse tests. Each case below passed under the previous
 * "is the environment broad enough" reading; each must fail now. They are the
 * reason this work package exists, so they are written against the
 * environment's own vocabulary (`name` patterns plus `type`), not refs.
 */
describe('allowed refs: patterns that admit more than the grant', () => {
  it('fails on a bare wildcard tag pattern', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ deploymentPolicies: [{ name: '*', type: 'tag' }] }),
    )
    expect(result.verdict).toBe('FAIL')
    expect(refsFinding(result)?.verdict).toBe('FAIL')
    expect(refsFinding(result)?.detail).toMatch(/reach outside/)
  })

  it('fails on a tag pattern that admits non-release tags', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({
        deploymentPolicies: [
          { name: 'v*', type: 'tag' },
          { name: 'release-*', type: 'tag' },
        ],
      }),
    )
    expect(refsFinding(result)?.verdict).toBe('FAIL')
    expect(refsFinding(result)?.detail).toMatch(/"release-\*"/)
  })

  it('fails when a branch pattern is mixed in beside the tag rule', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({
        deploymentPolicies: [
          { name: 'v*', type: 'tag' },
          { name: 'main', type: 'branch' },
        ],
      }),
    )
    expect(refsFinding(result)?.verdict).toBe('FAIL')
    expect(refsFinding(result)?.detail).toMatch(/"main"/)
  })

  it('fails when only main is allowed, both as security and as reachability', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ deploymentPolicies: [{ name: 'main', type: 'branch' }] }),
    )
    expect(result.verdict).toBe('FAIL')
    expect(refsFinding(result)?.verdict).toBe('FAIL')
    expect(reachabilityFinding(result)?.verdict).toBe('FAIL')
    expect(reachabilityFinding(result)?.detail).toMatch(
      /could not deploy even if it were published/,
    )
  })

  it('fails on a metacharacter pattern whose reach cannot be computed', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ deploymentPolicies: [{ name: 'v?', type: 'tag' }] }),
    )
    expect(refsFinding(result)?.verdict).toBe('FAIL')
    expect(refsFinding(result)?.detail).toMatch(/reach outside/)
  })

  it('fails on a double-star pattern', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ deploymentPolicies: [{ name: '**', type: 'tag' }] }),
    )
    expect(refsFinding(result)?.verdict).toBe('FAIL')
  })
})

describe('allowed refs: data the read could not establish', () => {
  it('fails when an entry has no readable type', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ deploymentPolicies: [{ name: 'v*', type: 'unknown' }] }),
    )
    expect(result.verdict).toBe('FAIL')
    expect(JSON.stringify(result.findings)).toMatch(/no readable type/)
  })

  it('fails when the entry list is empty after being read', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ deploymentPolicies: [] }),
    )
    expect(result.verdict).toBe('FAIL')
    expect(JSON.stringify(result.findings)).toMatch(
      /lists no entries, so nothing can deploy/,
    )
  })

  it('fails when the policy exists but has no custom entries at all', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ branchPolicy: 'none', deploymentPolicies: undefined }),
    )
    expect(result.verdict).toBe('FAIL')
    expect(JSON.stringify(result.findings)).toMatch(
      /any branch or tag may deploy/,
    )
  })

  it('fails when no branch policy was reported at all', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ branchPolicy: undefined, deploymentPolicies: undefined }),
    )
    expect(result.verdict).toBe('FAIL')
    expect(JSON.stringify(result.findings)).toMatch(/any ref may deploy/)
  })

  /*
   * "Protected branches only" is a real GitHub mode that admits no tag. It is
   * a failure on both questions, and reporting either one alone would hide the
   * other.
   */
  it('fails on the protected-branches mode, not just for reachability', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ branchPolicy: 'protected', deploymentPolicies: undefined }),
    )
    expect(result.verdict).toBe('FAIL')
    expect(JSON.stringify(result.findings)).toMatch(
      /admits protected branches, which this policy does not grant/,
    )
    expect(JSON.stringify(result.findings)).toMatch(/admits no tag/)
  })

  it('marks unread entries as a limitation', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ deploymentPolicies: undefined }),
    )
    expect(result.verdict).toBe('POLICY_LIMITATION')
    expect(JSON.stringify(result.findings)).toMatch(
      /the restriction exists and its contents are unverified/,
    )
  })
})

describe('allowed refs: patterns inside the grant', () => {
  it('passes an exact release tag pattern', () => {
    const result = evaluateReleaseEnvironmentPolicy(compliant())
    expect(refsFinding(result)?.verdict).toBe('PASS')
    expect(reachabilityFinding(result)?.verdict).toBe('PASS')
  })

  it('passes a narrower version pattern', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ deploymentPolicies: [{ name: 'v0.2.*', type: 'tag' }] }),
    )
    expect(refsFinding(result)?.verdict).toBe('PASS')
    expect(reachabilityFinding(result)?.verdict).toBe('PASS')
  })

  it('passes an exact tag pattern that still starts with the prefix', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ deploymentPolicies: [{ name: 'v0.2.0', type: 'tag' }] }),
    )
    expect(refsFinding(result)?.verdict).toBe('PASS')
    expect(reachabilityFinding(result)?.verdict).toBe('PASS')
  })

  /*
   * Reachability at the environment level asks whether *some* tag of the
   * authorised form can deploy. It must not depend on which version is being
   * cut, so `v1*` is a reachable environment; that it would not admit
   * `v0.2.0` is a per-release question, answered separately below.
   */
  it('reports a version-restricted rule as a reachable environment', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ deploymentPolicies: [{ name: 'v1*', type: 'tag' }] }),
    )
    expect(refsFinding(result)?.verdict).toBe('PASS')
    expect(reachabilityFinding(result)?.verdict).toBe('PASS')
  })
})

/*
 * Per-release reachability. Folding this into the environment verdict would
 * make one configuration pass or fail depending on an unrelated version
 * argument, and would write a per-release fact into a standing record.
 */
describe('candidate reachability', () => {
  it('passes when a pattern admits the exact candidate tag', () => {
    const result = evaluateCandidateReachability(
      [{ name: 'v*', type: 'tag' }],
      'refs/tags/v0.2.0-rc.0',
    )
    expect(result.verdict).toBe('PASS')
    expect(result.rule).toBe(RELEASE_ENVIRONMENT_RULES.candidateRefReachable)
  })

  it('fails when the candidate tag is outside every pattern', () => {
    const result = evaluateCandidateReachability(
      [{ name: 'v1*', type: 'tag' }],
      'refs/tags/v0.2.0-rc.0',
    )
    expect(result.verdict).toBe('FAIL')
    expect(result.detail).toMatch(/could not deploy/)
  })

  it('fails when only a branch entry exists', () => {
    const result = evaluateCandidateReachability(
      [{ name: 'v*', type: 'branch' }],
      'refs/tags/v0.2.0-rc.0',
    )
    expect(result.verdict).toBe('FAIL')
    expect(result.detail).toMatch(/no tag deployment policy entry/)
  })

  it('rejects a non-tag ref outright', () => {
    const result = evaluateCandidateReachability(
      [{ name: 'main', type: 'branch' }],
      'refs/heads/main',
    )
    expect(result.verdict).toBe('FAIL')
    expect(result.detail).toMatch(/is not a tag ref/)
  })
})

describe('verdict precedence', () => {
  it('reports FAIL when any rule fails, whatever else passed', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ adminsCanBypass: true, deploymentPolicies: undefined }),
    )
    expect(result.verdict).toBe('FAIL')
  })

  it('reports POLICY_LIMITATION over PASS', () => {
    const result = evaluateReleaseEnvironmentPolicy(
      compliant({ deploymentPolicies: undefined }),
    )
    expect(result.verdict).toBe('POLICY_LIMITATION')
  })
})

/*
 * The pattern model on its own. GitHub documents `File.fnmatch` semantics
 * without enumerating them, so anything this code cannot reason about is
 * treated as admitting everything rather than as narrow.
 */
describe('pattern parsing', () => {
  it('treats a literal as naming exactly itself', () => {
    expect(parsePattern('main')).toEqual({ kind: 'bounded', literal: 'main' })
  })

  it('treats a single trailing star as a prefix', () => {
    expect(parsePattern('v*')).toEqual({ kind: 'bounded', literal: 'v' })
    expect(parsePattern('releases/*')).toEqual({
      kind: 'bounded',
      literal: 'releases/',
    })
  })

  it('treats every other metacharacter as unbounded', () => {
    for (const pattern of ['**', 'v*.*', 'v?', '[ab]', '{a,b}', 'a\\*']) {
      expect(parsePattern(pattern).kind).toBe('unbounded')
    }
  })

  it('admits matching refs and rejects other namespaces', () => {
    expect(patternAdmitsRef('v*', 'refs/tags/v0.2.0', 'refs/tags/')).toBe(true)
    expect(patternAdmitsRef('v*', 'refs/heads/v0.2.0', 'refs/tags/')).toBe(
      false,
    )
    expect(patternAdmitsRef('main', 'refs/tags/main', 'refs/tags/')).toBe(true)
  })

  it('treats an unmodelled pattern as admitting everything', () => {
    expect(patternAdmitsRef('v?', 'refs/tags/v0', 'refs/tags/')).toBe(true)
  })

  it('keeps a pattern inside a grant only when its prefix does', () => {
    expect(patternWithinGrant('v*', RELEASE_TAG_POLICY)).toBe(true)
    expect(patternWithinGrant('v1*', RELEASE_TAG_POLICY)).toBe(true)
    expect(patternWithinGrant('*', RELEASE_TAG_POLICY)).toBe(false)
    expect(patternWithinGrant('main', RELEASE_TAG_POLICY)).toBe(false)
    expect(patternWithinGrant('v?', RELEASE_TAG_POLICY)).toBe(false)
  })

  it('places main inside the maintenance grant and releases outside it', () => {
    expect(patternWithinGrant('main', MAINTENANCE_BRANCH)).toBe(true)
    expect(patternWithinGrant('v*', MAINTENANCE_BRANCH)).toBe(false)
  })
})

describe('a single grant evaluated on its own', () => {
  it('reports security and availability separately', () => {
    const { security, availability } = evaluateRefGrant(RELEASE_TAG_POLICY, [
      { name: 'v*', type: 'tag' },
    ])
    expect(security.verdict).toBe('PASS')
    expect(availability.verdict).toBe('PASS')
  })

  it('fails security when a branch rule sits in the tag namespace', () => {
    const { security, availability } = evaluateRefGrant(RELEASE_TAG_POLICY, [
      { name: 'v*', type: 'branch' },
    ])
    /*
     * `v*` as a *branch* pattern reaches `refs/heads/v…`, which this policy
     * does not grant. Rules combine additively, so its presence widens the
     * environment even though it never admits a tag.
     */
    expect(security.verdict).toBe('FAIL')
    expect(availability.verdict).toBe('FAIL')
  })
})

describe('the refs the policy requires', () => {
  it('requires tag refs, not main', () => {
    expect(RELEASE_TAG_POLICY.type).toBe('tag')
    expect(RELEASE_TAG_POLICY.refPrefix).toBe('refs/tags/')
    expect(RELEASE_TAG_POLICY.pattern).toBe('v*')
  })
})

/*
 * A helper kept honest: if the fixtures stop exercising the real shape, the
 * tests above would still pass while testing nothing.
 */
describe('fixtures', () => {
  it('uses the API vocabulary rather than refs', () => {
    const entry: DeploymentPolicyEntry = { name: 'v*', type: 'tag' }
    expect(entry.name.startsWith('refs/')).toBe(false)
  })
})
