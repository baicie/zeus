/**
 * Evidence that the `Release` environment was protected, produced by a job that
 * can actually read it and bound to the run that read it.
 *
 * ## Why this exists
 *
 * `GET /repos/{owner}/{repo}/environments/Release` needs Administration
 * permission, and `GITHUB_TOKEN` has no scope that grants it. Ordinary CI
 * therefore reports `not_run` — honest, but a release cannot be gated on a
 * question nobody answered.
 *
 * The obvious fix is a PAT with `administration: read` in normal CI, and it is
 * the wrong one: that PAT can read and, depending on scope, write repository
 * configuration, and putting it in every PR job makes it reachable from any
 * pull request.
 *
 * ## The bootstrap this implements
 *
 * 1. A maintainer configures the environment's protection (required reviewers,
 *    prevent self-review, no admin bypass, tag-only refs). This is manual and
 *    is the trust root; nothing here can substitute for it.
 * 2. A **dedicated** governance workflow — `workflow_dispatch` only, pinned to
 *    the `Release` environment, holding the Administration-scoped token as a
 *    repository secret — reads the live configuration and writes this record.
 * 3. The record is bound to the repository, environment, workflow identity,
 *    run id and attempt, the Core commit it was produced for, the policy
 *    version, and the moment it was observed.
 * 4. `release:precheck` verifies the record's *bindings* against the run it is
 *    about to authorise, and refuses anything it cannot tie to the current
 *    candidate.
 *
 * ## The circularity this avoids
 *
 * A job cannot certify its own protection by asserting it. The record is
 * produced by a different workflow, under a different token, for a specific
 * commit — and the consumer checks that binding rather than trusting the
 * assertion. A record whose run, commit or policy does not match is a stale
 * claim about a different tree.
 *
 * ## What this cannot do
 *
 * A record proves the environment was protected *at the time it was read*.
 * It is not proof that it still is. `maxAgeHours` bounds how long that claim is
 * usable, and a release older than the bound must re-read rather than reuse.
 */
import type { ObservedEnvironment } from '../check/release-environment-policy'

export const RELEASE_ENVIRONMENT_EVIDENCE_SCHEMA =
  'zeus.release-environment-evidence/v1'

export interface ReleaseEnvironmentEvidence {
  readonly schema: typeof RELEASE_ENVIRONMENT_EVIDENCE_SCHEMA
  /** `owner/name`, so a record cannot be replayed against another repository. */
  readonly repository: string
  /** The environment name that was read. */
  readonly environment: string
  /** The workflow path that produced the record, e.g. `.github/workflows/…`. */
  readonly workflowPath: string
  /** GitHub's run id, so the record can be traced to one execution. */
  readonly runId: string
  /** Retries of one run reuse the id; the attempt distinguishes them. */
  readonly runAttempt: number
  /** The Core commit this record was produced for. */
  readonly coreCommit: string
  /** When the configuration was observed, ISO-8601 UTC. */
  readonly observedAt: string
  /** The policy the observation was judged against. */
  readonly policyVersion: string
  /** What was observed, normalised away from the API shape. */
  readonly observed: ObservedEnvironment
  /** The verdict the producing job reached. */
  readonly verdict: 'PASS' | 'FAIL' | 'POLICY_LIMITATION'
}

export interface EvidenceVerificationContext {
  readonly repository: string
  readonly environment: string
  readonly coreCommit: string
  readonly workflowPath: string
  readonly policyVersion: string
  /** How old a record may be before it must be re-read. */
  readonly maxAgeHours: number
  /**
   * The governance run whose record this release will accept.
   *
   * The record carries `runId` and `runAttempt`, but nothing in the file can
   * prove the run happened: anyone able to write `temp/` during a release can
   * fabricate a record with the right repository, environment, commit and
   * policy version, and every other binding would match.
   *
   * The release knows which run it downloaded the artifact from — it names it
   * by `ZEUS_RELEASE_ENVIRONMENT_RUN_ID` — so that id is checked here. This
   * does not authenticate the record cryptographically; it does mean a
   * hand-written file has to guess a run id the release already committed to,
   * rather than picking any number.
   */
  readonly expectedRunId?: string
  /** Injectable clock, so ageing is testable. */
  readonly now?: () => number
}

export interface EvidenceProblem {
  readonly field: string
  readonly message: string
}

export interface EvidenceVerification {
  readonly ok: boolean
  readonly problems: readonly EvidenceProblem[]
  /** Minutes since the record was observed, when it parsed as a date. */
  readonly ageMinutes?: number
}

const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether a value is a release-environment record this module can reason about.
 *
 * Structural only — it says nothing about whether the record is *true* or
 * still valid. Those are `verifyReleaseEnvironmentEvidence`'s job, and keeping
 * them apart means a malformed file fails differently from a stale one.
 */
export function isReleaseEnvironmentEvidence(
  value: unknown,
): value is ReleaseEnvironmentEvidence {
  if (!isRecord(value)) return false
  if (value.schema !== RELEASE_ENVIRONMENT_EVIDENCE_SCHEMA) return false
  for (const key of [
    'repository',
    'environment',
    'workflowPath',
    'runId',
    'coreCommit',
    'observedAt',
    'policyVersion',
    'verdict',
  ] as const) {
    if (typeof value[key] !== 'string') return false
  }
  if (typeof value.runAttempt !== 'number') return false
  if (!isRecord(value.observed)) return false
  if (!ISO_UTC.test(value.observedAt as string)) return false
  return true
}

/**
 * Checks that a record is about *this* release, under *this* policy, recently.
 *
 * Every binding is checked rather than the verdict alone. A record that says
 * PASS about a different commit, repository, environment, workflow or policy is
 * an answer to a different question, and accepting it because the word PASS
 * appears in it is how an unrelated run's green gets reused.
 */
export function verifyReleaseEnvironmentEvidence(
  value: unknown,
  context: EvidenceVerificationContext,
): EvidenceVerification {
  if (!isReleaseEnvironmentEvidence(value)) {
    return {
      ok: false,
      problems: [
        {
          field: 'record',
          message: `not a ${RELEASE_ENVIRONMENT_EVIDENCE_SCHEMA} record`,
        },
      ],
    }
  }
  const problems: EvidenceProblem[] = []

  if (value.repository !== context.repository) {
    problems.push({
      field: 'repository',
      message: `record is for ${value.repository}, this release is ${context.repository}`,
    })
  }
  if (value.environment !== context.environment) {
    problems.push({
      field: 'environment',
      message: `record is for environment ${value.environment}, expected ${context.environment}`,
    })
  }
  if (value.coreCommit !== context.coreCommit) {
    problems.push({
      field: 'coreCommit',
      message: `record was produced for ${value.coreCommit}, the candidate is ${context.coreCommit}`,
    })
  }
  if (value.workflowPath !== context.workflowPath) {
    problems.push({
      field: 'workflowPath',
      message: `record was produced by ${value.workflowPath}, expected ${context.workflowPath}`,
    })
  }
  if (
    context.expectedRunId !== undefined &&
    value.runId !== context.expectedRunId
  ) {
    problems.push({
      field: 'runId',
      message: `record was produced by run ${value.runId}, but this release consumes the artifact from run ${context.expectedRunId}`,
    })
  }
  if (value.policyVersion !== context.policyVersion) {
    problems.push({
      field: 'policyVersion',
      message: `record was judged under ${value.policyVersion}, current policy is ${context.policyVersion}`,
    })
  }

  const observedAt = Date.parse(value.observedAt)
  const now = context.now ? context.now() : Date.now()
  const ageMinutes = Math.floor((now - observedAt) / 60_000)
  /*
   * A record from the future is not fresh; it means the clock or the producer
   * is wrong, and either way the age cannot be trusted.
   */
  if (ageMinutes < 0) {
    problems.push({
      field: 'observedAt',
      message: `record claims to have been observed ${-ageMinutes} minutes in the future`,
    })
  } else if (ageMinutes > context.maxAgeHours * 60) {
    problems.push({
      field: 'observedAt',
      message: `record is ${ageMinutes} minutes old, older than the ${context.maxAgeHours}h bound; the environment must be read again`,
    })
  }

  /*
   * The verdict is checked last so a record that is stale *and* failing
   * reports both. Reporting only "not PASS" would hide that it was also about
   * the wrong commit.
   */
  if (value.verdict !== 'PASS') {
    problems.push({
      field: 'verdict',
      message: `the producing run concluded ${value.verdict}, so the environment was not proven protected`,
    })
  }

  return {
    ok: problems.length === 0,
    problems,
    ...(Number.isFinite(ageMinutes) ? { ageMinutes } : {}),
  }
}
