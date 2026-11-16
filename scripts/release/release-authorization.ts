/**
 * Whether a release tag may publish, decided from evidence rather than a
 * signature.
 *
 * ## The invariant
 *
 * One sentence, and every check below makes one clause of it true:
 *
 * > The published artifact is the one that passed CI, produced from a commit
 * > reachable from the default branch, under a tag that cannot move.
 *
 * ## Why not a human signature
 *
 * The previous policy graded "is a second person involved". For a project with
 * one maintainer that question has no good answer: reviewers configured means
 * every release blocks forever, reviewers absent means the policy fails, and
 * the only way through is an admin bypass — which is the thing the policy
 * exists to prevent.
 *
 * A git tag is itself an authorisation. Creating one takes write access, it is
 * attributable, and on a repository with a tag ruleset it is immutable. Making
 * the tag the trigger and proving everything else automatically is a stronger
 * gate than a checkbox, because it cannot be satisfied by someone clicking.
 *
 * ## What this cannot prove
 *
 * Nothing here can prove the tag ruleset exists — that is repository
 * configuration, and reading it needs Administration permission no
 * `GITHUB_TOKEN` scope grants. The ruleset is the one part that stays a
 * maintainer action; what this module does is make the consequence of its
 * absence visible: a moved tag produces a different run, and a re-run against
 * a moved tag publishes under a version npm already has.
 *
 * `tagImmutability` below records that as a policy limitation rather than
 * silently passing.
 */
import semver from 'semver'

/** Bump when a rule changes. v1 was the dual-approval policy. */
export const RELEASE_AUTHORIZATION_POLICY_VERSION = 'zeus.release-policy/v2'

/** The schema of the record a release writes about its own authorisation. */
export const RELEASE_AUTHORIZATION_SCHEMA = 'zeus.release-authorization/v1'

export type AuthorizationVerdict =
  | 'AUTHORIZED'
  | 'REFUSED'
  | 'POLICY_LIMITATION'

export interface AuthorizationFinding {
  /** Stable identifier, so a report can name the clause that failed. */
  readonly rule: string
  readonly verdict: AuthorizationVerdict
  readonly detail: string
}

/** The rules, each independently satisfiable and independently reportable. */
export const AUTHORIZATION_RULES = {
  /** The tag names a version, and the version parses. */
  tagFormat: 'tag-format',
  /** The workflow checked out the commit the tag points at. */
  checkoutMatchesTag: 'checkout-matches-tag',
  /** The tagged commit is reachable from the default branch. */
  reachableFromMain: 'reachable-from-main',
  /** Every required CI run for this commit passed. */
  ciEvidence: 'ci-evidence',
  /** The native platform matrix for this commit passed. */
  nativeEvidence: 'native-evidence',
  /** Core and UI declare the same version, at immutable commits. */
  coreUiPairing: 'core-ui-pairing',
  /** The manifests in the tree carry the version the tag names. */
  manifestVersion: 'manifest-version',
  /** The SBOM describes this tree. */
  sbom: 'sbom',
  /** Published tarballs carry no unpublishable dependency specifier. */
  tarballIntegrity: 'tarball-integrity',
  /** The registry does not already have this version. */
  registryState: 'registry-state',
  /** The dist-tag the tag implies is the one npm will get. */
  distTag: 'dist-tag',
  /** Tag protection is repository configuration this code cannot read. */
  tagImmutability: 'tag-immutability',
} as const

/** One CI run this release relies on, bound to the release commit. */
export interface SupportingRun {
  readonly workflowPath: string
  readonly runId: string
  readonly runAttempt: number
  readonly headSha: string
  readonly conclusion: string
  readonly event: string
}

/**
 * Everything the decision is made from.
 *
 * Every field is optional or explicitly absent when it was not observed. An
 * absent field is a failed clause, never a skipped one — the release either
 * proved the sentence or it did not.
 */
export interface AuthorizationInput {
  /** The tag as GitHub reported it, e.g. `v0.2.0-rc.0`. */
  readonly tagRefName?: string
  /** `GITHUB_SHA` — the commit the tag pointed at when the run started. */
  readonly workflowSha?: string
  /** `git rev-parse HEAD` after checkout. */
  readonly checkoutSha?: string
  /** The version parsed from the tag, e.g. `0.2.0-rc.0`. */
  readonly version: string
  /** Whether the tag target is an ancestor of `origin/main`. */
  readonly isMainAncestor?: boolean
  /** Core package versions read from the tree under test. */
  readonly coreVersions?: Readonly<Record<string, string>>
  /** UI package versions read from the paired checkout. */
  readonly uiVersions?: Readonly<Record<string, string>>
  /** The UI commit the pairing record names. */
  readonly uiCommit?: string
  /** Required CI runs, already narrowed to this commit by the caller. */
  readonly supportingRuns?: readonly SupportingRun[]
  /** The workflows that must have run, at minimum. */
  readonly requiredWorkflows?: readonly string[]
  /** Whether an SBOM for this tree was produced and validated. */
  readonly sbomOk?: boolean
  /** Whether packed tarballs passed the integrity checks. */
  readonly tarballOk?: boolean
  /** Registry versions already present for this version, if checked. */
  readonly registryCollisions?: readonly string[]
  /** Whether the registry could be queried at all. */
  readonly registryReachable?: boolean
  /** First-publish packages that would bind `latest` if published without one. */
  readonly firstPublishPackages?: readonly string[]
  /** The dist-tag the workflow computed from the tag. */
  readonly distTag?: string
}

export interface AuthorizationResult {
  readonly version: string
  readonly policyVersion: string
  readonly verdict: AuthorizationVerdict
  readonly findings: readonly AuthorizationFinding[]
}

/**
 * The short tag name from whatever GitHub supplied.
 *
 * `GITHUB_REF` is `refs/tags/v0.2.0-rc.0` while `GITHUB_REF_NAME` is
 * `v0.2.0-rc.0`; both appear at different call sites and comparing one against
 * the other's expectation fails for a reason that has nothing to do with the
 * tag being wrong. Normalising here means the rule tests the tag, not the
 * spelling of the variable it came from.
 */
export function normalizeTagRef(value: string): string {
  return value.replace(/^refs\/tags\//, '')
}

function finding(
  rule: string,
  verdict: AuthorizationVerdict,
  detail: string,
): AuthorizationFinding {
  return { rule, verdict, detail }
}

/**
 * The dist-tag a version must publish under.
 *
 * Derived from the version, never chosen. A stable version goes to `latest`;
 * `-rc.` to `rc`, `-beta.` to `beta`, `-alpha.` to `alpha`. Anything else is
 * refused rather than mapped — an unknown channel landing on `latest` is how a
 * prerelease becomes everyone's default.
 */
export function distTagForVersion(version: string): string | undefined {
  const parsed = semver.parse(version)
  if (!parsed) return undefined
  if (parsed.prerelease.length === 0) return 'latest'
  const channel = String(parsed.prerelease[0])
  if (channel === 'rc') return 'rc'
  if (channel === 'beta') return 'beta'
  if (channel === 'alpha') return 'alpha'
  return undefined
}

/**
 * Decides whether the release may publish.
 *
 * Ordering is for the report; every rule runs so a maintainer sees all the
 * answers at once instead of fixing them one release at a time.
 */
export function evaluateReleaseAuthorization(
  input: AuthorizationInput,
): AuthorizationResult {
  const findings: AuthorizationFinding[] = []
  const version = input.version

  // 1. The tag names a version, and the version parses.
  const parsed = semver.parse(version)
  const expectedTag = `v${version}`
  if (!parsed) {
    findings.push(
      finding(
        AUTHORIZATION_RULES.tagFormat,
        'REFUSED',
        `${version} is not a semantic version`,
      ),
    )
  } else if (input.tagRefName === undefined) {
    findings.push(
      finding(
        AUTHORIZATION_RULES.tagFormat,
        'REFUSED',
        'the run has no tag ref, so this is not a tag-triggered release',
      ),
    )
  } else if (normalizeTagRef(input.tagRefName) !== expectedTag) {
    findings.push(
      finding(
        AUTHORIZATION_RULES.tagFormat,
        'REFUSED',
        `tag ${input.tagRefName} does not match the version it names (expected ${expectedTag})`,
      ),
    )
  } else {
    findings.push(
      finding(
        AUTHORIZATION_RULES.tagFormat,
        'AUTHORIZED',
        `${input.tagRefName} names ${version}`,
      ),
    )
  }

  // 2. The workflow checked out the commit the tag points at.
  if (!input.workflowSha) {
    findings.push(
      finding(
        AUTHORIZATION_RULES.checkoutMatchesTag,
        'REFUSED',
        'GITHUB_SHA is missing, so the tag target cannot be established',
      ),
    )
  } else if (!input.checkoutSha) {
    findings.push(
      finding(
        AUTHORIZATION_RULES.checkoutMatchesTag,
        'REFUSED',
        'the checked-out commit could not be read',
      ),
    )
  } else if (
    input.checkoutSha.toLowerCase() !== input.workflowSha.toLowerCase()
  ) {
    findings.push(
      finding(
        AUTHORIZATION_RULES.checkoutMatchesTag,
        'REFUSED',
        `the checkout is on ${input.checkoutSha}, but the tag points at ${input.workflowSha}`,
      ),
    )
  } else {
    findings.push(
      finding(
        AUTHORIZATION_RULES.checkoutMatchesTag,
        'AUTHORIZED',
        `the checkout is the tag target ${input.workflowSha}`,
      ),
    )
  }

  // 3. The tagged commit is reachable from the default branch.
  /*
   * A tag on an unmerged commit publishes code that never passed review on the
   * default branch. `isMainAncestor` is computed by the caller against a full
   * fetch; `undefined` means it was not computed, which is a refusal rather
   * than a pass.
   */
  if (input.isMainAncestor === true) {
    findings.push(
      finding(
        AUTHORIZATION_RULES.reachableFromMain,
        'AUTHORIZED',
        'the tag target is an ancestor of origin/main',
      ),
    )
  } else if (input.isMainAncestor === false) {
    findings.push(
      finding(
        AUTHORIZATION_RULES.reachableFromMain,
        'REFUSED',
        'the tag target is not reachable from origin/main',
      ),
    )
  } else {
    findings.push(
      finding(
        AUTHORIZATION_RULES.reachableFromMain,
        'REFUSED',
        'reachability from origin/main was not established',
      ),
    )
  }

  // 4. Every required CI run for this commit passed.
  findings.push(
    evaluateSupportingRuns(
      input.supportingRuns,
      input.requiredWorkflows ?? [],
      input.workflowSha,
    ),
  )

  // 5. The native platform matrix for this commit passed.
  /*
   * Native prebuild is a reusable workflow invoked by `release.yml` itself, so
   * its `needs:` edge already blocks on failure. What is checked here is that
   * the run is *recorded* — a release whose native evidence cannot be named is
   * one nobody can audit later.
   */
  const native = (input.supportingRuns ?? []).filter(run =>
    run.workflowPath.includes('compiler-native'),
  )
  if (native.length === 0) {
    findings.push(
      finding(
        AUTHORIZATION_RULES.nativeEvidence,
        'REFUSED',
        'no native platform matrix run is recorded for this commit',
      ),
    )
  } else {
    const bad = native.filter(run => run.conclusion !== 'success')
    findings.push(
      bad.length === 0
        ? finding(
            AUTHORIZATION_RULES.nativeEvidence,
            'AUTHORIZED',
            `${native.length} native matrix run(s) succeeded`,
          )
        : finding(
            AUTHORIZATION_RULES.nativeEvidence,
            'REFUSED',
            `native matrix run(s) did not succeed: ${bad.map(run => run.runId).join(', ')}`,
          ),
    )
  }

  // 6. Core and UI declare the same version, at immutable commits.
  const coreVersions = input.coreVersions ?? {}
  const coreDistinct = [...new Set(Object.values(coreVersions))]
  if (Object.keys(coreVersions).length === 0) {
    findings.push(
      finding(
        AUTHORIZATION_RULES.coreUiPairing,
        'REFUSED',
        'no Core package versions were read from the tree',
      ),
    )
  } else if (coreDistinct.length !== 1) {
    findings.push(
      finding(
        AUTHORIZATION_RULES.coreUiPairing,
        'REFUSED',
        `Core packages disagree on version: ${coreDistinct.join(', ')}`,
      ),
    )
  } else if (coreDistinct[0] !== version) {
    findings.push(
      finding(
        AUTHORIZATION_RULES.coreUiPairing,
        'REFUSED',
        `Core manifests are at ${coreDistinct[0]}, but the tag names ${version}`,
      ),
    )
  } else if (!/^[0-9a-f]{40}$/i.test(input.uiCommit ?? '')) {
    findings.push(
      finding(
        AUTHORIZATION_RULES.coreUiPairing,
        'REFUSED',
        'the paired UI commit is missing or is not a full SHA',
      ),
    )
  } else {
    const uiDistinct = [...new Set(Object.values(input.uiVersions ?? {}))]
    if (uiDistinct.length > 1) {
      findings.push(
        finding(
          AUTHORIZATION_RULES.coreUiPairing,
          'REFUSED',
          `UI packages disagree on version: ${uiDistinct.join(', ')}`,
        ),
      )
    } else if (uiDistinct.length === 1 && uiDistinct[0] !== version) {
      /*
       * The pairing is not "Core and UI each agree with themselves" — it is
       * "they are the same version". Checking only the Core side let a UI
       * checkout at an older version pass, which is the exact drift the
       * pairing rule exists to catch.
       */
      findings.push(
        finding(
          AUTHORIZATION_RULES.coreUiPairing,
          'REFUSED',
          `UI packages are at ${uiDistinct[0]}, but Core is cutting ${version}`,
        ),
      )
    } else {
      findings.push(
        finding(
          AUTHORIZATION_RULES.coreUiPairing,
          'AUTHORIZED',
          `Core and UI are both at ${version}, UI at ${input.uiCommit}`,
        ),
      )
    }
  }

  // 7. The manifests in the tree carry the version the tag names.
  findings.push(
    coreDistinct.length === 1 && coreDistinct[0] === version
      ? finding(
          AUTHORIZATION_RULES.manifestVersion,
          'AUTHORIZED',
          `every Core manifest is at ${version}`,
        )
      : finding(
          AUTHORIZATION_RULES.manifestVersion,
          'REFUSED',
          'the tree does not carry the version the tag names',
        ),
  )

  // 8. The SBOM describes this tree.
  findings.push(
    input.sbomOk === true
      ? finding(
          AUTHORIZATION_RULES.sbom,
          'AUTHORIZED',
          'an SBOM for this tree was produced and validated',
        )
      : finding(
          AUTHORIZATION_RULES.sbom,
          'REFUSED',
          input.sbomOk === false
            ? 'the SBOM does not validate against the schema or this tree'
            : 'no SBOM was produced for this tree',
        ),
  )

  // 9. Published tarballs carry no unpublishable dependency specifier.
  findings.push(
    input.tarballOk === true
      ? finding(
          AUTHORIZATION_RULES.tarballIntegrity,
          'AUTHORIZED',
          'packed tarballs carry no workspace:, catalog: or file: specifier',
        )
      : finding(
          AUTHORIZATION_RULES.tarballIntegrity,
          'REFUSED',
          input.tarballOk === false
            ? 'a packed tarball still contains a workspace:, catalog: or file: specifier'
            : 'tarball integrity was not checked',
        ),
  )

  // 10. The registry does not already have this version.
  if (input.registryReachable !== true) {
    findings.push(
      finding(
        AUTHORIZATION_RULES.registryState,
        'REFUSED',
        'the registry could not be queried, so an existing version cannot be ruled out',
      ),
    )
  } else if ((input.registryCollisions ?? []).length > 0) {
    findings.push(
      finding(
        AUTHORIZATION_RULES.registryState,
        'REFUSED',
        `the registry already has ${version} for ${(input.registryCollisions ?? []).slice(0, 5).join(', ')}${(input.registryCollisions ?? []).length > 5 ? '…' : ''}; npm will refuse to publish over it`,
      ),
    )
  } else {
    findings.push(
      finding(
        AUTHORIZATION_RULES.registryState,
        'AUTHORIZED',
        `no package already has ${version}`,
      ),
    )
  }

  // 11. The dist-tag the tag implies is the one npm will get.
  const expectedDistTag = parsed ? distTagForVersion(version) : undefined
  if (!parsed) {
    findings.push(
      finding(
        AUTHORIZATION_RULES.distTag,
        'REFUSED',
        'the version does not parse, so no dist-tag can be derived',
      ),
    )
  } else if (expectedDistTag === undefined) {
    findings.push(
      finding(
        AUTHORIZATION_RULES.distTag,
        'REFUSED',
        `${version} has a prerelease channel this policy does not map to a dist-tag`,
      ),
    )
  } else if (input.distTag !== expectedDistTag) {
    findings.push(
      finding(
        AUTHORIZATION_RULES.distTag,
        'REFUSED',
        `the workflow would publish with dist-tag ${input.distTag ?? '(none)'}, but ${version} must publish under ${expectedDistTag}`,
      ),
    )
  } else if (
    expectedDistTag !== 'latest' &&
    (input.firstPublishPackages ?? []).length > 0
  ) {
    /*
     * npm binds `latest` to a package's first publish regardless of `--tag`.
     * A prerelease that is a package's first publication therefore pollutes
     * `latest` no matter what the workflow passes, and the repair is a
     * separate protected operation. Refusing here is the difference between a
     * planned repair and a surprise.
     */
    findings.push(
      finding(
        AUTHORIZATION_RULES.distTag,
        'REFUSED',
        `${(input.firstPublishPackages ?? []).length} package(s) have never been published; their first publish would bind latest to ${version} even under --tag ${expectedDistTag}`,
      ),
    )
  } else {
    findings.push(
      finding(
        AUTHORIZATION_RULES.distTag,
        'AUTHORIZED',
        `${version} publishes under ${expectedDistTag}`,
      ),
    )
  }

  /*
   * 12. Tag protection.
   *
   * This rule never passes and never fails the release. It is recorded because
   * the rest of the policy assumes the tag cannot move, and the one thing that
   * makes that true is repository configuration this process cannot read.
   * Reporting it as a limitation is the honest answer; reporting it as PASS
   * would be claiming a check that did not run.
   */
  findings.push(
    finding(
      AUTHORIZATION_RULES.tagImmutability,
      'POLICY_LIMITATION',
      'tag immutability is enforced by a repository ruleset, which no workflow token can read; the maintainer must ensure v* tags block deletion and non-fast-forward updates',
    ),
  )

  const verdict: AuthorizationVerdict = findings.some(
    entry => entry.verdict === 'REFUSED',
  )
    ? 'REFUSED'
    : findings.some(entry => entry.verdict === 'POLICY_LIMITATION')
      ? 'POLICY_LIMITATION'
      : 'AUTHORIZED'

  return {
    version,
    policyVersion: RELEASE_AUTHORIZATION_POLICY_VERSION,
    verdict,
    findings,
  }
}

/**
 * Whether every required workflow ran, for this commit, and passed.
 *
 * A run of the right workflow on the wrong commit is not evidence: CI that
 * passed on `main` says nothing about a tag pointing somewhere else. Each run
 * is checked against `headSha` for that reason, and the most recent attempt
 * counts — an earlier attempt that failed and a retry that passed is a pass.
 */
function evaluateSupportingRuns(
  runs: readonly SupportingRun[] | undefined,
  required: readonly string[],
  workflowSha: string | undefined,
): AuthorizationFinding {
  const rule = AUTHORIZATION_RULES.ciEvidence
  if (!runs || runs.length === 0) {
    return finding(
      rule,
      'REFUSED',
      'no CI run is recorded as evidence for this release',
    )
  }
  if (required.length === 0) {
    return finding(
      rule,
      'REFUSED',
      'the release does not declare which CI workflows it requires',
    )
  }
  if (!workflowSha) {
    return finding(
      rule,
      'REFUSED',
      'the release commit is unknown, so no run can be bound to it',
    )
  }

  const problems: string[] = []
  for (const workflowPath of required) {
    const candidates = runs.filter(run => run.workflowPath === workflowPath)
    if (candidates.length === 0) {
      problems.push(`${workflowPath}: no run recorded`)
      continue
    }
    const forThisCommit = candidates.filter(
      run => run.headSha.toLowerCase() === workflowSha.toLowerCase(),
    )
    if (forThisCommit.length === 0) {
      problems.push(
        `${workflowPath}: every recorded run is for a different commit`,
      )
      continue
    }
    /*
     * The newest attempt decides. A failed attempt followed by a passing retry
     * is a passing run; a passing attempt followed by a failed re-run is not,
     * because the later one is what the artifact under test corresponds to.
     */
    const newest = forThisCommit.reduce((best, run) =>
      run.runAttempt > best.runAttempt ? run : best,
    )
    if (newest.conclusion !== 'success') {
      problems.push(
        `${workflowPath}: run ${newest.runId} attempt ${newest.runAttempt} concluded ${newest.conclusion}`,
      )
    }
  }

  return problems.length === 0
    ? finding(
        rule,
        'AUTHORIZED',
        `every required workflow ran on ${workflowSha} and passed: ${required.join(', ')}`,
      )
    : finding(rule, 'REFUSED', problems.join('; '))
}
