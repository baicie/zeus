/**
 * What the `Release` environment must be configured to do, as rules.
 *
 * The previous version folded policy into the shape of the GitHub API. It read
 * `protection_rules`, and for the two facts it happened to check it built the
 * verdict inline; `adminsCanBypass` and `branchPolicy` were read but only
 * mentioned in the pass message. Measured on this repository, that meant an
 * environment where an admin can deploy without review reported the same
 * `pass` as one where nobody can.
 *
 * Policy lives here, separately from the API response, for two reasons:
 *
 * - the rules can be tested against constructed environments without any
 *   GitHub access, including states GitHub cannot currently produce;
 * - a rule that cannot be satisfied by the current GitHub feature set is
 *   marked `POLICY_LIMITATION` rather than silently dropped.
 *
 * Fail-closed throughout: an unknown value is a violation, not a pass.
 */

/** The policy this repository releases under. Bump when a rule changes. */
export const RELEASE_ENVIRONMENT_POLICY_VERSION = 'zeus.release-policy/v1'

/**
 * What the environment read returned, normalised away from the API shape.
 *
 * Every field is `undefined` when it was not observed — including "the API
 * omitted it", which is not the same as "it is false" and must not be resolved
 * as favourable.
 */
export interface ObservedEnvironment {
  readonly hasRequiredReviewers?: boolean
  readonly reviewers?: readonly string[]
  readonly preventsSelfReview?: boolean
  readonly adminsCanBypass?: boolean
  readonly branchPolicy?: 'protected' | 'custom' | 'none'
  /** Branch patterns from a custom branch policy, when GitHub reported them. */
  readonly allowedBranches?: readonly string[]
  /** A separate rule restricting which refs may deploy. */
  readonly hasDeploymentBranchPolicy?: boolean
}

export type PolicyVerdict = 'PASS' | 'FAIL' | 'POLICY_LIMITATION'

export interface PolicyFinding {
  readonly rule: string
  readonly verdict: PolicyVerdict
  readonly detail: string
}

export interface PolicyResult {
  readonly version: string
  readonly verdict: PolicyVerdict
  readonly findings: readonly PolicyFinding[]
}

/** The rules, each independently satisfiable and independently reportable. */
export const RELEASE_ENVIRONMENT_RULES = {
  /** A second person must be required. */
  requiredReviewers: 'required-reviewers',
  /** The person who triggered the run must not be able to approve it. */
  noSelfReview: 'no-self-review',
  /** A release must not be deployable by an admin skipping the rules. */
  noAdminBypass: 'no-admin-bypass',
  /** Only refs the policy allows may deploy. */
  allowedRefs: 'allowed-refs',
} as const

/**
 * Refs a production release may be deployed from.
 *
 * Tags only: a release deploys what was tagged, and `main` moves. Allowing
 * `main` would let a commit that was never tagged become the deployed artifact.
 */
export const ALLOWED_RELEASE_REFS = ['refs/tags/v*'] as const

function finding(
  rule: string,
  verdict: PolicyVerdict,
  detail: string,
): PolicyFinding {
  return { rule, verdict, detail }
}

/**
 * Applies the policy to an observed environment.
 *
 * Ordering matters for the report but not the verdict: every rule runs, so a
 * maintainer sees all four answers at once instead of fixing them one PR at a
 * time.
 */
export function evaluateReleaseEnvironmentPolicy(
  observed: ObservedEnvironment,
): PolicyResult {
  const findings: PolicyFinding[] = []

  // 1. A second person must be required.
  if (observed.hasRequiredReviewers === undefined) {
    findings.push(
      finding(
        RELEASE_ENVIRONMENT_RULES.requiredReviewers,
        'FAIL',
        'the environment read did not report whether reviewers are required; an unobserved rule is not a satisfied one',
      ),
    )
  } else if (!observed.hasRequiredReviewers) {
    findings.push(
      finding(
        RELEASE_ENVIRONMENT_RULES.requiredReviewers,
        'FAIL',
        'the Release environment requires no reviewer, so an approval artifact can be produced by one person',
      ),
    )
  } else {
    const who =
      (observed.reviewers ?? []).join(', ') || '(reviewers not listed)'
    findings.push(
      finding(
        RELEASE_ENVIRONMENT_RULES.requiredReviewers,
        'PASS',
        `the Release environment requires approval from ${who}`,
      ),
    )
  }

  // 2. The requester must not be able to approve their own run.
  if (observed.preventsSelfReview === undefined) {
    findings.push(
      finding(
        RELEASE_ENVIRONMENT_RULES.noSelfReview,
        'FAIL',
        'the environment read did not report whether self-review is prevented; a missing field is not permission',
      ),
    )
  } else if (!observed.preventsSelfReview) {
    findings.push(
      finding(
        RELEASE_ENVIRONMENT_RULES.noSelfReview,
        'FAIL',
        'the Release environment allows the requester to approve their own run, so the second person can be the first',
      ),
    )
  } else {
    findings.push(
      finding(
        RELEASE_ENVIRONMENT_RULES.noSelfReview,
        'PASS',
        'the Release environment prevents self-review',
      ),
    )
  }

  // 3. Admins must not be able to deploy around the rules.
  if (observed.adminsCanBypass === undefined) {
    findings.push(
      finding(
        RELEASE_ENVIRONMENT_RULES.noAdminBypass,
        'FAIL',
        'the environment read did not report whether admins can bypass; GitHub defaults this to true, so silence must not be read as no',
      ),
    )
  } else if (observed.adminsCanBypass) {
    findings.push(
      finding(
        RELEASE_ENVIRONMENT_RULES.noAdminBypass,
        'FAIL',
        'repository admins can bypass the Release environment protection, so the approval gate binds only those who did not need it',
      ),
    )
  } else {
    findings.push(
      finding(
        RELEASE_ENVIRONMENT_RULES.noAdminBypass,
        'PASS',
        'repository admins cannot bypass the Release environment protection',
      ),
    )
  }

  // 4. Only refs the policy allows may deploy.
  /*
   * GitHub reports the *existence* of a branch policy and its mode, but the
   * list of custom patterns is a separate endpoint. This function is given the
   * observed environment, not a GitHub client, so when the patterns were not
   * supplied it can only say the restriction exists — not that it matches.
   *
   * Saying `PASS` on that basis would be claiming a check that did not run, so
   * a policy that exists without inspectable patterns is
   * `POLICY_LIMITATION`: the rule cannot be verified with the evidence at hand,
   * and the caller must decide whether to block.
   */
  if (observed.branchPolicy === undefined) {
    findings.push(
      finding(
        RELEASE_ENVIRONMENT_RULES.allowedRefs,
        'FAIL',
        'the environment read did not report a deployment branch policy; any ref may deploy',
      ),
    )
  } else if (observed.branchPolicy === 'none') {
    findings.push(
      finding(
        RELEASE_ENVIRONMENT_RULES.allowedRefs,
        'FAIL',
        'the Release environment has no deployment branch policy, so any branch or tag may deploy',
      ),
    )
  } else if (
    !observed.allowedBranches ||
    observed.allowedBranches.length === 0
  ) {
    findings.push(
      finding(
        RELEASE_ENVIRONMENT_RULES.allowedRefs,
        'POLICY_LIMITATION',
        `the Release environment restricts deployment to ${observed.branchPolicy === 'protected' ? 'protected branches' : 'a custom set of refs'}, but the allowed patterns were not read; the restriction exists and its contents are unverified`,
      ),
    )
  } else {
    const unmatched = ALLOWED_RELEASE_REFS.filter(
      pattern =>
        !observed.allowedBranches?.some(allowed =>
          refMatchesPattern(allowed, pattern),
        ),
    )
    if (unmatched.length > 0) {
      findings.push(
        finding(
          RELEASE_ENVIRONMENT_RULES.allowedRefs,
          'FAIL',
          `the Release environment's allowed refs (${observed.allowedBranches.join(', ')}) do not cover ${unmatched.join(', ')}`,
        ),
      )
    } else {
      findings.push(
        finding(
          RELEASE_ENVIRONMENT_RULES.allowedRefs,
          'PASS',
          `the Release environment allows deployment from ${observed.allowedBranches.join(', ')}`,
        ),
      )
    }
  }

  /*
   * The strictest finding wins. `POLICY_LIMITATION` outranks `PASS` because an
   * unverifiable rule is not a satisfied one, and `FAIL` outranks both.
   */
  const verdict: PolicyVerdict = findings.some(f => f.verdict === 'FAIL')
    ? 'FAIL'
    : findings.some(f => f.verdict === 'POLICY_LIMITATION')
      ? 'POLICY_LIMITATION'
      : 'PASS'

  return { version: RELEASE_ENVIRONMENT_POLICY_VERSION, verdict, findings }
}

/**
 * Whether an environment's custom ref pattern admits a policy pattern.
 *
 * GitHub's custom branch policies are glob-ish (`refs/tags/v*`). The question
 * here is whether every ref the policy needs *could* be deployed, so a policy
 * pattern is covered only when the environment's pattern is at least as broad.
 * Exact-equality is the conservative reading: an environment allowing exactly
 * `refs/tags/v*` covers the policy's `refs/tags/v*`.
 */
function refMatchesPattern(
  environmentPattern: string,
  policyPattern: string,
): boolean {
  if (environmentPattern === policyPattern) return true
  /*
   * A broader environment pattern (`refs/tags/*`, `*`) covers a narrower policy
   * pattern. A narrower one does not — that direction would let an environment
   * claim coverage it does not have.
   */
  const star = environmentPattern.indexOf('*')
  if (star === -1) return false
  const prefix = environmentPattern.slice(0, star)
  return policyPattern.startsWith(prefix)
}
