/**
 * What the `Release` environment must be configured to do, as rules.
 *
 * Policy lives here, separately from the GitHub API response, for two reasons:
 *
 * - the rules can be tested against constructed environments without any
 *   GitHub access, including states GitHub cannot currently produce;
 * - a rule that cannot be satisfied by the current GitHub feature set is
 *   marked `POLICY_LIMITATION` rather than silently dropped.
 *
 * Fail-closed throughout: an unknown value is a violation, not a pass.
 *
 * ## What the ref rule actually has to prove
 *
 * The invariant is **every ref the environment admits is a ref this policy
 * authorises**. Not "the environment covers the refs we need" — that direction
 * asks whether a deployment would be *possible*, and a world-readable
 * environment satisfies it.
 *
 * The previous implementation had that direction backwards. It asked whether
 * the environment's pattern was "at least as broad" as `refs/tags/v*`, so
 * `refs/tags/*` and `*` both passed: broadening the environment could only
 * ever look safer. Both admit `refs/heads/main` and any tag that is not a
 * release, which is exactly what the rule exists to prevent.
 *
 * ## The GitHub data model, verified rather than assumed
 *
 * `GET /repos/{owner}/{repo}/environments/{name}/deployment-branch-policies`
 * returns entries of `{ id, node_id, name, type }` where:
 *
 * - `name` is a **pattern**, not a ref — `v*`, `release/*`, `main`. It does not
 *   carry a `refs/heads/` or `refs/tags/` prefix, so comparing it to
 *   `refs/tags/v*` was comparing two different languages;
 * - `type` is `branch` or `tag`, and is the only thing that says which
 *   namespace the pattern lives in. The previous reader dropped it, so
 *   `{ type: 'branch', name: 'v*' }` and `{ type: 'tag', name: 'v*' }` were
 *   indistinguishable;
 * - rules combine additively: a deployment is admitted if **any** policy
 *   matches the run's `GITHUB_REF`.
 *
 * GitHub's docs state that wildcards do not match `/`, and that pattern
 * matching follows Ruby's `File.fnmatch`. They do not publish the full
 * semantics for every metacharacter, and an implementation we cannot pin down
 * is not one we may assume is narrow. So the pattern model here is
 * deliberately conservative: only a literal prefix followed by a single `*`
 * is understood, and any metacharacter outside that set makes the pattern
 * *unbounded* — counted as admitting everything, which fails the rule.
 *
 * Treating an unparsed pattern as unbounded is not pessimism for its own sake.
 * `File.fnmatch` also accepts `?`, `[abc]`, `{a,b}`, and `**`; a pattern
 * containing one of those could be narrower or wider than it looks, and the
 * safe reading of "I do not know what this admits" is "it admits the thing I
 * am trying to exclude".
 */

/** The policy this repository releases under. Bump when a rule changes. */
export const RELEASE_ENVIRONMENT_POLICY_VERSION = 'zeus.release-policy/v2'

/** The namespace a deployment policy pattern applies to. */
export type DeploymentRefType = 'branch' | 'tag'

/**
 * One deployment policy entry, as GitHub reports it.
 *
 * `name` is the pattern (`v*`), not a ref. `type` decides the namespace the
 * pattern is anchored in; an entry with no readable `type` is kept as
 * `unknown` so the evaluator can fail on it rather than guess.
 */
export interface DeploymentPolicyEntry {
  readonly name: string
  readonly type: DeploymentRefType | 'unknown'
}

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
  /**
   * Deployment policy entries from a custom branch policy.
   *
   * `undefined` means the list was not read. An empty array means it was read
   * and is empty — GitHub reports zero rules, which admits nothing but is a
   * state worth naming separately because it is almost always a mistake.
   */
  readonly deploymentPolicies?: readonly DeploymentPolicyEntry[]
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
  /** The candidate tag must actually be able to deploy. */
  releaseRefReachable: 'release-ref-reachable',
  /** A specific candidate ref must be admitted by the observed entries. */
  candidateRefReachable: 'candidate-ref-reachable',
} as const

/**
 * The refs a production release may be deployed from, as a grant.
 *
 * Tags only: a release deploys what was tagged, and `main` moves. Allowing
 * `main` would let a commit that was never tagged become the deployed
 * artifact.
 *
 * `pattern` is the environment-side pattern (`v*`), because that is the
 * language GitHub's policy entries are written in. `prefix` is the literal it
 * must start with; `refPrefix` is the namespace the policy lives in.
 */
export const RELEASE_TAG_POLICY = {
  type: 'tag' as const,
  refPrefix: 'refs/tags/',
  pattern: 'v*',
  literalPrefix: 'v',
} as const

/**
 * The `main` ref itself, for the workflows that legitimately deploy from it.
 *
 * Kept separate from `RELEASE_TAG_POLICY` because it is a different grant:
 * a maintenance workflow acting on already-published state does not need to
 * be able to deploy a release.
 */
export const MAINTENANCE_BRANCH = {
  type: 'branch' as const,
  refPrefix: 'refs/heads/',
  pattern: 'main',
  literalPrefix: 'main',
} as const

/** A grant: one ref namespace plus the patterns that may reach it. */
export interface RefGrant {
  readonly type: DeploymentRefType
  readonly refPrefix: string
  readonly pattern: string
  readonly literalPrefix: string
}

function finding(
  rule: string,
  verdict: PolicyVerdict,
  detail: string,
): PolicyFinding {
  return { rule, verdict, detail }
}

/**
 * What a deployment pattern can admit, as a range of concrete names.
 *
 * `bounded` patterns are a literal prefix followed by at most one trailing
 * `*`; every name they match starts with `literal`. `unbounded` patterns
 * contain a metacharacter we do not model, so they are treated as admitting
 * every name in their namespace.
 */
export type PatternRange =
  | { readonly kind: 'bounded'; readonly literal: string }
  | { readonly kind: 'unbounded'; readonly pattern: string }

/**
 * Parses a GitHub deployment pattern into the range of names it admits.
 *
 * Only `<literal>` and `<literal>*` are understood; a `*` anywhere but the end
 * is unbounded, and so is any `?`, `[`, `]`, `{`, `}` or `\`. GitHub documents
 * `File.fnmatch` semantics without enumerating them, and a pattern whose reach
 * cannot be computed cannot be proven narrow.
 */
export function parsePattern(pattern: string): PatternRange {
  const firstMeta = pattern.search(/[?[\]{}\\*]/)
  if (firstMeta === -1) {
    // No wildcard at all: the pattern names exactly one ref.
    return { kind: 'bounded', literal: pattern }
  }
  const isSingleTrailingStar =
    pattern[firstMeta] === '*' && firstMeta === pattern.length - 1
  if (!isSingleTrailingStar) {
    return { kind: 'unbounded', pattern }
  }
  return { kind: 'bounded', literal: pattern.slice(0, -1) }
}

/**
 * Whether a deployment pattern admits a ref, given the policy namespace.
 *
 * Returns `true` for every ref when the pattern could not be bounded. That is
 * the fail-closed direction for the security question: an unmodelled pattern
 * is assumed to admit the ref we are trying to exclude, so the rule fails.
 */
export function patternAdmitsRef(
  pattern: string,
  ref: string,
  refPrefix: string,
): boolean {
  if (!ref.startsWith(refPrefix)) return false
  const name = ref.slice(refPrefix.length)
  const range = parsePattern(pattern)
  if (range.kind === 'unbounded') return true
  return name === range.literal || name.startsWith(range.literal)
}

/**
 * Whether a pattern stays inside a grant's authorised name space.
 *
 * This is the direction the invariant needs: the environment's pattern must
 * not reach beyond the grant, not the other way round. `v*` is inside `v`;
 * `*` is outside it; `v1*` is inside it; `*` is outside anything but itself.
 */
export function patternWithinGrant(pattern: string, grant: RefGrant): boolean {
  const range = parsePattern(pattern)
  if (range.kind === 'unbounded') return false
  return range.literal.startsWith(grant.literalPrefix)
}

/**
 * Whether an entry from the API belongs to a grant's namespace.
 *
 * `unknown` type means the field was missing or unreadable. It is not treated
 * as matching: a rule whose namespace is unknown could be covering a branch
 * while being counted against a tag.
 */
function entryMatchesGrantType(
  entry: DeploymentPolicyEntry,
  grant: RefGrant,
): boolean {
  return entry.type === grant.type
}

/**
 * Evaluates one grant against the observed entries.
 *
 * Two questions, kept apart:
 *
 * - **Security**: does every entry in this namespace stay within the grant? An
 *   entry that reaches wider than the grant fails the rule, because a
 *   deployment from that entry could be a commit this policy never authorised.
 * - **Availability**: is there an entry that actually admits a candidate ref?
 *   A grant with no matching entry cannot deploy a release at all, which is a
 *   different failure from being too permissive and must not be reported as
 *   one.
 *
 * A single entry can satisfy both, and normally does.
 */
export function evaluateRefGrant(
  grant: RefGrant,
  entries: readonly DeploymentPolicyEntry[],
): { readonly security: PolicyFinding; readonly availability: PolicyFinding } {
  const securityRule = `${RELEASE_ENVIRONMENT_RULES.allowedRefs}:${grant.type}`
  const availabilityRule = `${RELEASE_ENVIRONMENT_RULES.releaseRefReachable}:${grant.type}`

  const inNamespace = entries.filter(entry =>
    entryMatchesGrantType(entry, grant),
  )

  const unknownType = entries.filter(entry => entry.type === 'unknown')
  if (unknownType.length > 0) {
    return {
      security: finding(
        securityRule,
        'FAIL',
        `${unknownType.length} deployment policy entr${unknownType.length === 1 ? 'y has' : 'ies have'} no readable type, so the namespace ${unknownType.map(entry => `"${entry.name}"`).join(', ')} applies to is unknown`,
      ),
      availability: finding(
        availabilityRule,
        'FAIL',
        'deployment policy types could not be read, so no entry can be shown to admit a release tag',
      ),
    }
  }

  if (entries.length === 0) {
    return {
      security: finding(
        securityRule,
        'FAIL',
        'the deployment branch policy exists but lists no entries, so nothing can deploy; this is almost always a misconfiguration rather than a restriction',
      ),
      availability: finding(
        availabilityRule,
        'FAIL',
        'no deployment policy entry exists to admit a release tag',
      ),
    }
  }

  /*
   * Security is judged over **every** entry, not just the ones in this grant's
   * namespace.
   *
   * Rules combine additively: a deployment is admitted if any entry matches.
   * So an entry that reaches a branch the policy does not grant widens the
   * environment just as effectively as an overbroad tag pattern — and if the
   * security question were scoped to `type === 'tag'`, a beside-the-point
   * `main` branch rule would be invisible. That is exactly the mixed-rule case
   * this rule exists for.
   */
  const outsideGrant = entries.filter(entry => {
    if (entry.type !== grant.type) return true
    return !patternWithinGrant(entry.name, grant)
  })
  const security: PolicyFinding =
    outsideGrant.length > 0
      ? finding(
          securityRule,
          'FAIL',
          `${outsideGrant.length} deployment pattern(s) reach outside ${grant.refPrefix}${grant.literalPrefix}*: ${outsideGrant
            .map(entry => `"${entry.name}" (${entry.type})`)
            .join(', ')}, so a ref this policy does not authorise could deploy`,
        )
      : finding(
          securityRule,
          'PASS',
          `every deployment pattern stays within ${grant.refPrefix}${grant.literalPrefix}* (${entries.map(entry => `"${entry.name}" (${entry.type})`).join(', ')})`,
        )

  /*
   * Availability is an environment property: can *some* tag of the authorised
   * form deploy at all? It is answered from the grant alone, not from a
   * candidate version, because the environment does not know which release is
   * being cut.
   *
   * Whether a *specific* candidate tag can deploy is a different question,
   * answered by `evaluateCandidateReachability` where the version is known. A
   * rule of `v1*` is a reachable environment for `v1.x` and an unreachable one
   * for `v0.3.0`; folding that into the environment verdict would make the
   * same configuration pass or fail depending on an unrelated argument.
   */
  const reachable = inNamespace.filter(entry => {
    const range = parsePattern(entry.name)
    if (range.kind === 'unbounded') return true
    return range.literal.startsWith(grant.literalPrefix)
  })
  const availability: PolicyFinding =
    reachable.length > 0
      ? finding(
          availabilityRule,
          'PASS',
          `${reachable.map(entry => `"${entry.name}"`).join(', ')} admits refs under ${grant.refPrefix}${grant.literalPrefix}…`,
        )
      : finding(
          availabilityRule,
          'FAIL',
          `no ${grant.type} pattern admits any ref under ${grant.refPrefix}${grant.literalPrefix}…, so a release tag could not deploy even if it were published`,
        )

  return { security, availability }
}

/**
 * Whether a concrete candidate ref can deploy under the observed entries.
 *
 * Separate from the environment policy on purpose. The environment is a
 * standing configuration; a candidate ref is a per-release fact. A policy of
 * `v1*` is correctly configured for a `v1.x` release and blocks a `v0.3.0`
 * one, and the second answer must not be written into a record that outlives
 * that release.
 */
export function evaluateCandidateReachability(
  entries: readonly DeploymentPolicyEntry[],
  candidateRef: string,
): PolicyFinding {
  const rule = RELEASE_ENVIRONMENT_RULES.candidateRefReachable
  const grant = RELEASE_TAG_POLICY
  if (!candidateRef.startsWith(grant.refPrefix)) {
    return finding(
      rule,
      'FAIL',
      `${candidateRef} is not a tag ref, so it is not a release candidate`,
    )
  }
  const tagEntries = entries.filter(entry => entry.type === 'tag')
  if (tagEntries.length === 0) {
    return finding(
      rule,
      'FAIL',
      `no tag deployment policy entry exists, so ${candidateRef} cannot deploy`,
    )
  }
  const admitting = tagEntries.filter(entry =>
    patternAdmitsRef(entry.name, candidateRef, grant.refPrefix),
  )
  if (admitting.length === 0) {
    return finding(
      rule,
      'FAIL',
      `none of the tag patterns ${tagEntries.map(entry => `"${entry.name}"`).join(', ')} admits ${candidateRef}, so this release could not deploy`,
    )
  }
  return finding(
    rule,
    'PASS',
    `${admitting.map(entry => `"${entry.name}"`).join(', ')} admits ${candidateRef}`,
  )
}

/**
 * Applies the policy to an observed environment.
 *
 * Ordering matters for the report but not the verdict: every rule runs, so a
 * maintainer sees all of them at once instead of fixing them one PR at a time.
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
   * GitHub reports the mode and, on a second endpoint, the entries. A policy
   * that exists without inspectable entries is `POLICY_LIMITATION`: the rule
   * cannot be verified with the evidence at hand, and the caller must decide
   * whether to block.
   */
  if (observed.branchPolicy === undefined) {
    findings.push(
      finding(
        RELEASE_ENVIRONMENT_RULES.allowedRefs,
        'FAIL',
        'the environment read did not report a deployment branch policy; any ref may deploy',
      ),
    )
    findings.push(
      finding(
        RELEASE_ENVIRONMENT_RULES.releaseRefReachable,
        'FAIL',
        'with no deployment branch policy the reachability of a release tag cannot be established',
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
    findings.push(
      finding(
        RELEASE_ENVIRONMENT_RULES.releaseRefReachable,
        'FAIL',
        'with no deployment branch policy the reachability of a release tag cannot be established',
      ),
    )
  } else if (observed.branchPolicy === 'protected') {
    /*
     * "Protected branches only" admits every protected branch and no tag. A
     * release deploys a tag, so this mode cannot deploy a release at all — and
     * it also admits every protected branch, which the policy does not grant.
     */
    findings.push(
      finding(
        RELEASE_ENVIRONMENT_RULES.allowedRefs,
        'FAIL',
        'the Release environment admits protected branches, which this policy does not grant; a release deploys a tag',
      ),
    )
    findings.push(
      finding(
        RELEASE_ENVIRONMENT_RULES.releaseRefReachable,
        'FAIL',
        'a protected-branches policy admits no tag, so a release tag could not deploy',
      ),
    )
  } else if (observed.deploymentPolicies === undefined) {
    findings.push(
      finding(
        RELEASE_ENVIRONMENT_RULES.allowedRefs,
        'POLICY_LIMITATION',
        'the Release environment restricts deployment to a custom set of refs, but the entries were not read; the restriction exists and its contents are unverified',
      ),
    )
    findings.push(
      finding(
        RELEASE_ENVIRONMENT_RULES.releaseRefReachable,
        'POLICY_LIMITATION',
        'the deployment entries were not read, so nothing can be shown to admit a release tag',
      ),
    )
  } else {
    const tag = evaluateRefGrant(
      RELEASE_TAG_POLICY,
      observed.deploymentPolicies,
    )
    findings.push(tag.security, tag.availability)
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
