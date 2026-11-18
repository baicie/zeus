/**
 * RC dist-tag policy. A release candidate must not inherit a `latest` tag that
 * points at a prerelease. Stable releases keep `latest` on the newest stable
 * version; RC prechecks fail until the polluted tags are explicitly repaired.
 *
 * Registry reads have explicit states:
 *
 * - `LATEST_ABSENT` only for an explicit 404 / empty tag response;
 * - `LATEST_STABLE` / `LATEST_PRERELEASE` for a value;
 * - `REGISTRY_QUERY_FAILED` for timeouts, 5xx, DNS, auth and unparsable data.
 *
 * A query failure is never treated as "no latest tag"; it blocks the release.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { zeusFixedPackages } from '../release.config'
import { judgeHistorical, loadHistoricalBaseline } from './historical-latest'
import {
  LATEST_SNAPSHOT_PATH,
  buildSnapshot,
  compareSnapshots,
  digestSnapshot,
  loadSnapshot,
  writeSnapshot,
} from './latest-snapshot'
import {
  DEFAULT_ATTEMPTS,
  queryNpmJson,
  type NpmRunner,
  type QueryOptions,
} from './npm-registry'
import {
  normalizeVersion,
  resolveReleaseVersion,
  type ResolvedReleaseVersion,
} from './release-version'
import { findWorkspacePackages } from '../shared/utils'

export type LatestTagState =
  | { readonly status: 'LATEST_ABSENT' }
  | { readonly status: 'LATEST_STABLE'; readonly version: string }
  | { readonly status: 'LATEST_PRERELEASE'; readonly version: string }
  | { readonly status: 'REGISTRY_QUERY_FAILED'; readonly error: string }

export interface LatestTagRecord {
  readonly name: string
  readonly state: LatestTagState
}

/**
 * The post-publish verdict for one release.
 *
 * These are four different facts and a caller must not read one as another:
 *
 * - `PASS` — every package's `latest` is compliant.
 * - `ACCEPTED_DEVIATION` — the only non-compliant packages are ones the
 *   immutable pairing record listed as first publications, and their `latest`
 *   points at exactly this release. npm binds `latest` to a first publish
 *   regardless of `--tag`, so this is the expected end state of a first
 *   publication, not a failure. It is **not** compliance: the tag is wrong and
 *   `repair:latest-tags` is the follow-up.
 * - `REFUSED` — something is wrong that no record authorises.
 * - `UNKNOWN` — the registry could not be read, so nothing was established.
 *
 * Kept separate from `LatestTagEvaluation` because the release workflow needs
 * to distinguish "published correctly, `latest` needs repair" from "this
 * release is broken", and an exit code cannot say that.
 */
export type LatestVerdict =
  | 'PASS'
  | 'ACCEPTED_DEVIATION'
  | 'ACCEPTED_HISTORICAL'
  | 'ACCEPTED_HISTORICAL_AND_FIRST_PUBLISH'
  | 'REFUSED'
  | 'UNKNOWN'

/** One package's verdict, with the basis for it recorded. */
export interface LatestDecision {
  readonly name: string
  readonly state: LatestTagState
  /**
   * `compliant`, `accepted-historical` (an exact, committed, predating
   * deviation), `accepted` (a first publication this release created), or the
   * reason it was refused.
   */
  readonly outcome: 'compliant' | 'accepted' | 'accepted-historical' | 'refused'
  /** Whether the pairing record named this package as a first publication. */
  readonly firstPublish: boolean
  /** Why this package got this outcome, in a form an audit can read. */
  readonly basis: string
}

export interface LatestPolicyResult {
  readonly verdict: LatestVerdict
  readonly decisions: readonly LatestDecision[]
  /** Packages whose `latest` is wrong but approved as first publications. */
  readonly acceptedDeviation: readonly string[]
  /** Packages excused by the committed historical baseline. */
  readonly acceptedHistorical: readonly string[]
  /** Packages that make the release fail. */
  readonly refused: readonly string[]
  /** Packages the registry could not answer for. */
  readonly unknown: readonly string[]
}

/**
 * Which half of the release is being judged.
 *
 * The two phases answer different questions and must not share one rule:
 *
 * - `precheck` runs before anything is published. A first publication cannot
 *   have happened yet, so tolerating one there would excuse a deviation that
 *   does not exist — and, worse, would stop the check from noticing if it
 *   somehow did.
 * - `post-publish` runs after. First publications are expected, and the
 *   historical baseline must still hold.
 */
export type LatestPhase = 'precheck' | 'post-publish'

export interface LatestPolicyInput {
  readonly records: readonly LatestTagRecord[]
  /** The version this release published. */
  readonly version: string
  /** Package names the pairing record approved for a first publication. */
  readonly approvedFirstPublish: readonly string[]
  /**
   * Exact deviations from the committed baseline.
   *
   * Empty when no baseline is in force. A caller must pass the *judged*
   * matches, never the baseline entries themselves — see
   * `judgeHistorical`, which is what decides whether an entry still applies.
   */
  readonly acceptedHistorical?: readonly string[]
  /** Defaults to `post-publish`, the stricter of the two. */
  readonly phase?: LatestPhase
}

/**
 * Decides whether the `latest` state blocks the release.
 *
 * The rule that matters: an approved first publication is accepted **only
 * when its `latest` points at exactly this release's version**, and only in
 * the post-publish phase. A package on the approval list whose `latest` points
 * somewhere else is a refusal, because "approved for first publication" says
 * nothing about a tag that moved later.
 *
 * A historical deviation is accepted **only when the caller passes it as an
 * exact match** against the committed baseline. This function never widens
 * that set itself: it cannot read the baseline, so a package cannot become
 * historical by being named here.
 */
export function evaluateLatestPolicy(
  input: LatestPolicyInput,
): LatestPolicyResult {
  const decisions: LatestDecision[] = []
  const acceptedDeviation: string[] = []
  const acceptedHistorical: string[] = []
  const refused: string[] = []
  const unknown: string[] = []
  const approved = new Set(input.approvedFirstPublish)
  const historical = new Set(input.acceptedHistorical ?? [])
  const phase = input.phase ?? 'post-publish'

  for (const record of input.records) {
    const isApproved = approved.has(record.name)
    const isHistorical = historical.has(record.name)
    const decision = (outcome: LatestDecision['outcome'], basis: string) => {
      decisions.push({
        name: record.name,
        state: record.state,
        outcome,
        firstPublish: isApproved,
        basis,
      })
    }

    switch (record.state.status) {
      case 'LATEST_STABLE':
        decision('compliant', `latest is ${record.state.version}`)
        break

      case 'LATEST_ABSENT':
        decision(
          'compliant',
          'no latest tag, which is correct for a first publication',
        )
        break

      case 'REGISTRY_QUERY_FAILED':
        /*
         * Never a pass and never an absence. The state of this package's
         * `latest` was not established, and the release must say so.
         */
        unknown.push(record.name)
        decision('refused', `registry query failed: ${record.state.error}`)
        break

      case 'LATEST_PRERELEASE': {
        /*
         * Order matters. The historical exemption is checked against a set the
         * caller derived from the committed baseline by exact match, so a
         * package cannot drift into it. It is then checked against the release
         * version: a deviation this release created is never historical.
         */
        if (isHistorical && record.state.version !== input.version) {
          acceptedHistorical.push(record.name)
          decision(
            'accepted-historical',
            `latest points at ${record.state.version}, which is the exact deviation recorded in the committed historical baseline`,
          )
          break
        }

        const pointsAtThisRelease = record.state.version === input.version
        if (phase === 'precheck') {
          /*
           * In the precheck nothing has been published yet. Any prerelease
           * `latest` here is either historical, or a state that cannot be
           * explained by this release at all.
           */
          refused.push(record.name)
          decision(
            'refused',
            `precheck found latest at prerelease ${record.state.version} before this release published anything, and the committed baseline does not record this exact package and version`,
          )
        } else if (isApproved && pointsAtThisRelease) {
          acceptedDeviation.push(record.name)
          decision(
            'accepted',
            `first publication approved by the pairing record; npm bound latest to ${record.state.version} and repair:latest-tags must follow`,
          )
        } else if (isApproved) {
          refused.push(record.name)
          decision(
            'refused',
            `approved as a first publication, but latest points at ${record.state.version}, not at this release ${input.version}`,
          )
        } else {
          refused.push(record.name)
          decision(
            'refused',
            `latest points at prerelease ${record.state.version} and the pairing record did not approve this package`,
          )
        }
        break
      }
    }
  }

  const verdict: LatestVerdict =
    unknown.length > 0
      ? 'UNKNOWN'
      : refused.length > 0
        ? 'REFUSED'
        : acceptedDeviation.length > 0 && acceptedHistorical.length > 0
          ? 'ACCEPTED_HISTORICAL_AND_FIRST_PUBLISH'
          : acceptedDeviation.length > 0
            ? 'ACCEPTED_DEVIATION'
            : acceptedHistorical.length > 0
              ? 'ACCEPTED_HISTORICAL'
              : 'PASS'

  return {
    verdict,
    decisions,
    acceptedDeviation,
    acceptedHistorical,
    refused,
    unknown,
  }
}

/** Whether a verdict lets the release continue to smoke and GitHub Release. */
export function verdictBlocksRelease(verdict: LatestVerdict): boolean {
  /*
   * The accepted verdicts continue deliberately: the packages were published
   * correctly and every deviation is recorded and either approved in advance
   * or a committed historical fact. The other two stop the release —
   * `REFUSED` because something unauthorised is wrong, `UNKNOWN` because
   * nothing was established. Making this an explicit function keeps the
   * workflow from encoding the list of non-blocking verdicts in shell.
   */
  return verdict === 'REFUSED' || verdict === 'UNKNOWN'
}

export interface LatestTagEvaluation {
  readonly errors: readonly string[]
  readonly failures: readonly string[]
  readonly absent: readonly string[]
  readonly stable: readonly string[]
  readonly prerelease: readonly string[]
}

export function classifyLatestTag(
  version: string | undefined | null,
): LatestTagState {
  if (version === undefined || version === null || version === '') {
    return { status: 'LATEST_ABSENT' }
  }
  if (typeof version !== 'string') {
    return {
      status: 'REGISTRY_QUERY_FAILED',
      error: 'dist-tag value is not a string',
    }
  }
  return version.includes('-')
    ? { status: 'LATEST_PRERELEASE', version }
    : { status: 'LATEST_STABLE', version }
}

export function evaluateLatestTags(
  records: readonly LatestTagRecord[],
): LatestTagEvaluation {
  const errors: string[] = []
  const failures: string[] = []
  const absent: string[] = []
  const stable: string[] = []
  const prerelease: string[] = []
  for (const record of records) {
    switch (record.state.status) {
      case 'LATEST_PRERELEASE':
        prerelease.push(record.name)
        errors.push(
          `${record.name}: latest points at prerelease ${record.state.version}; run pnpm repair:latest-tags`,
        )
        break
      case 'REGISTRY_QUERY_FAILED':
        failures.push(record.name)
        errors.push(
          `${record.name}: registry query failed: ${record.state.error}`,
        )
        break
      case 'LATEST_ABSENT':
        absent.push(record.name)
        break
      case 'LATEST_STABLE':
        stable.push(record.name)
        break
    }
  }
  return { errors, failures, absent, stable, prerelease }
}

export interface ReadLatestOptions {
  readonly runner?: NpmRunner
  readonly registry?: string
  readonly attempts?: number
  readonly retryDelayMs?: number
  readonly sleep?: QueryOptions['sleep']
}

export async function readLatestTag(
  name: string,
  options: ReadLatestOptions = {},
): Promise<LatestTagState> {
  const args = ['view', name, 'dist-tags.latest', '--json']
  if (options.registry) args.push('--registry', options.registry)
  const result = await queryNpmJson<unknown>(args, {
    ...(options.runner ? { runner: options.runner } : {}),
    attempts: options.attempts ?? DEFAULT_ATTEMPTS,
    ...(options.retryDelayMs !== undefined
      ? { retryDelayMs: options.retryDelayMs }
      : {}),
    ...(options.sleep ? { sleep: options.sleep } : {}),
  })
  if (result.status === 'not-found') {
    return { status: 'LATEST_ABSENT' }
  }
  if (result.status === 'failed') {
    return { status: 'REGISTRY_QUERY_FAILED', error: result.message }
  }
  const value = result.value
  if (value === null || value === undefined || value === '') {
    return { status: 'LATEST_ABSENT' }
  }
  return classifyLatestTag(String(value))
}

export interface LatestTagReport {
  readonly schema: 'zeus.latest-tags/v2'
  readonly version: string
  readonly rc: boolean
  readonly packages: readonly LatestTagRecord[]
  readonly evaluation: LatestTagEvaluation
  readonly passed: boolean
  readonly warnings: readonly string[]
  readonly versionSources: Readonly<Record<string, string | undefined>>
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      force: { type: 'boolean', default: false },
      version: { type: 'string' },
      ref: { type: 'string' },
      registry: { type: 'string' },
      attempts: { type: 'string' },
      out: { type: 'string', default: 'temp/release/latest-tags.json' },
      /*
       * The immutable pairing record for this version. Its `firstPublish` is
       * the only source of approval for a prerelease `latest`; there is
       * deliberately no flag that names packages directly, because a flag can
       * be typed at 3am and a committed record was reviewed.
       */
      'pairing-record': { type: 'string' },
      'policy-out': {
        type: 'string',
        default: 'temp/release/latest-policy.json',
      },
      /*
       * Which half of the release this is. Defaults to `precheck`, the
       * stricter of the two: it refuses a prerelease `latest` it cannot
       * explain, and it does not treat a first publication as expected.
       * The post-publish step opts in explicitly.
       */
      phase: { type: 'string', default: 'precheck' },
      /*
       * The commit this run is building. Only used to bind and verify the
       * snapshot; it never selects the baseline, which is read from the tree.
       */
      sha: { type: 'string' },
      'run-id': { type: 'string' },
      snapshot: { type: 'string', default: LATEST_SNAPSHOT_PATH },
      'snapshot-out': { type: 'string', default: LATEST_SNAPSHOT_PATH },
      /*
       * There is deliberately no `--baseline` flag. The baseline path is a
       * constant, so a run cannot be pointed at a different file, and the
       * release reads the copy committed at the tag it builds.
       */
    },
  })

  const phase = values.phase === 'post-publish' ? 'post-publish' : 'precheck'
  if (values.phase !== undefined && values.phase !== phase) {
    console.error(
      `BLOCKER --phase must be precheck or post-publish, got ${values.phase}`,
    )
    process.exitCode = 1
    return
  }
  /*
   * The snapshot bindings default to the run that is executing.
   *
   * They are read from the environment rather than being required flags
   * because the precheck runs from a static command list that has no place to
   * interpolate them — and a binding that is easy to omit is a binding that
   * will be omitted, leaving a snapshot nothing can be verified against.
   * An explicit flag still wins, so a drill can point at a known run.
   */
  const gitSha = values.sha ?? process.env.GITHUB_SHA ?? ''
  const runId = values['run-id'] ?? process.env.GITHUB_RUN_ID ?? ''
  if (phase === 'post-publish' && (!gitSha || !runId)) {
    console.error(
      'BLOCKER --phase post-publish needs the commit and run id (--sha/--run-id or GITHUB_SHA/GITHUB_RUN_ID) to verify the precheck snapshot belongs to this release',
    )
    process.exitCode = 1
    return
  }

  const resolved = resolveVersion(values.version, values.ref)
  for (const warning of resolved.warnings) console.warn(`WARNING ${warning}`)
  if (resolved.errors.length > 0) {
    for (const error of resolved.errors) console.error(`BLOCKER ${error}`)
    process.exitCode = 1
    return
  }
  const version = resolved.version!
  if (process.env.ZEUS_RELEASE_CHANNEL === 'rc' && !resolved.rc) {
    console.error(
      `BLOCKER RC release channel requires an RC version, got ${version}`,
    )
    process.exitCode = 1
    return
  }
  if (!resolved.rc && values.force !== true) {
    console.log(`latest-tag policy skipped for non-RC version ${version}`)
    return
  }

  const records: LatestTagRecord[] = []
  for (const name of zeusFixedPackages) {
    records.push({
      name,
      state: await readLatestTag(name, {
        ...(values.registry ? { registry: values.registry } : {}),
        ...(values.attempts ? { attempts: Number(values.attempts) } : {}),
      }),
    })
  }
  const evaluation = evaluateLatestTags(records)
  /*
   * What the immutable pairing record approved in advance.
   *
   * Read from the same file the release authorised against, so the set of
   * packages whose first publication is tolerated cannot be widened by a flag
   * at check time. A missing or unreadable record yields `[]`, which refuses
   * every prerelease `latest` — the permissive direction would be to treat an
   * unreadable record as "nothing to worry about".
   */
  const approvedFirstPublish = readApprovedFirstPublish(
    values['pairing-record'],
  )

  /*
   * The committed historical baseline, and what it actually covers today.
   *
   * A baseline that cannot be read yields no exemptions, which refuses every
   * unexplained prerelease `latest`. That direction is deliberate: the
   * alternative lets a deleted or corrupted file widen the release instead of
   * blocking it.
   */
  const loaded = loadHistoricalBaseline(process.cwd())
  for (const problem of loaded.problems) {
    console.error(`BLOCKER historical baseline: ${problem}`)
  }
  const baseline = loaded.baseline
  const judged =
    baseline === undefined
      ? { accepted: [], drifted: [], unresolved: [] }
      : judgeHistorical({ baseline, records, releaseVersion: version })

  for (const drift of judged.drifted) {
    console.error(
      `BLOCKER ${drift.name}: historical baseline records latest ${drift.expected}, but the registry now answers ${drift.observed}; the exemption does not cover a re-pointed tag`,
    )
  }
  for (const name of judged.unresolved) {
    console.error(
      `BLOCKER ${name}: historical baseline entry could not be confirmed because the registry did not answer`,
    )
  }

  const policy = evaluateLatestPolicy({
    records,
    version,
    approvedFirstPublish,
    acceptedHistorical: judged.accepted.map(match => match.name),
    phase,
  })

  /*
   * The precheck writes the before-picture the post-publish check compares
   * against. Written by this job, for this run — never fetched from an older
   * run, because a snapshot describing a different release would make every
   * comparison meaningless while still looking authoritative.
   */
  const baselineDigest = baseline?.digest ?? 'none'
  let snapshotDigest = 'none'
  let snapshotTransitionCount = 0
  if (phase === 'precheck') {
    const snapshot = buildSnapshot({
      version,
      gitSha,
      runId,
      registry: values.registry ?? 'https://registry.npmjs.org',
      capturedAt: new Date().toISOString(),
      baselineDigest,
      records,
    })
    writeSnapshot(snapshot, values['snapshot-out']!)
    snapshotDigest = digestSnapshot(snapshot)
  } else {
    /*
     * Post-publish: prove the comparison is against this release's own
     * precheck, then refuse any transition the policy does not allow.
     */
    const loadedSnapshot = loadSnapshot(
      {
        version,
        gitSha,
        runId,
        packageCount: records.length,
      },
      values.snapshot!,
    )
    for (const problem of loadedSnapshot.problems) {
      console.error(`BLOCKER snapshot: ${problem}`)
    }
    if (loadedSnapshot.snapshot === undefined) {
      process.exitCode = 1
      return
    }
    snapshotDigest = digestSnapshot(loadedSnapshot.snapshot)
    if (loadedSnapshot.snapshot.baselineDigest !== baselineDigest) {
      console.error(
        `BLOCKER snapshot: the precheck ran with baseline ${loadedSnapshot.snapshot.baselineDigest}, but this run read ${baselineDigest}; the two halves judged different policies`,
      )
      process.exitCode = 1
      return
    }
    const comparison = compareSnapshots({
      before: loadedSnapshot.snapshot,
      after: records,
      version,
      approvedFirstPublish,
    })
    for (const transition of comparison.unexpected) {
      console.error(
        `BLOCKER transition ${transition.name}: ${transition.change}; nothing in the pairing record or the historical baseline authorises this change`,
      )
    }
    /*
     * A transition nobody authorised fails the release on its own, even when
     * every current tag happens to be acceptable. "It looks fine now" is not
     * the question the post-publish phase asks — "did this release cause
     * this, and was it allowed to" is, and a snapshot difference is the only
     * thing that can answer it.
     */
    if (comparison.unexpected.length > 0) process.exitCode = 1
    snapshotTransitionCount = comparison.unexpected.length
  }

  const report: LatestTagReport = {
    schema: 'zeus.latest-tags/v2',
    version,
    rc: resolved.rc,
    packages: records,
    evaluation,
    passed: evaluation.errors.length === 0,
    warnings: resolved.warnings,
    versionSources: resolved.sources,
  }
  const output = path.resolve(values.out!)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)

  const policyOutput = path.resolve(values['policy-out']!)
  fs.mkdirSync(path.dirname(policyOutput), { recursive: true })
  fs.writeFileSync(
    policyOutput,
    `${JSON.stringify(
      {
        schema: 'zeus.latest-policy/v2',
        version,
        phase,
        gitSha: gitSha || null,
        runId: runId || null,
        registry: values.registry ?? 'https://registry.npmjs.org',
        packageCount: records.length,
        verdict: policy.verdict,
        policyVersion: baseline?.policyVersion ?? null,
        baselineDigest,
        snapshotDigest,
        snapshotTransitionCount,
        approvedFirstPublish,
        acceptedHistorical: policy.acceptedHistorical,
        acceptedDeviation: policy.acceptedDeviation,
        refused: policy.refused,
        unknown: policy.unknown,
        compliant: policy.decisions.filter(d => d.outcome === 'compliant')
          .length,
        blocksRelease: verdictBlocksRelease(policy.verdict),
        findings: policy.decisions
          .filter(decision => decision.outcome !== 'compliant')
          .map(
            decision =>
              `${decision.outcome.toUpperCase()} ${decision.name}: ${decision.basis}`,
          ),
        decisions: policy.decisions,
      },
      null,
      2,
    )}\n`,
  )

  for (const record of records) {
    const suffix =
      record.state.status === 'LATEST_STABLE' ||
      record.state.status === 'LATEST_PRERELEASE'
        ? ` ${record.state.version}`
        : record.state.status === 'REGISTRY_QUERY_FAILED'
          ? ` ${record.state.error}`
          : ''
    console.log(`${record.name}: ${record.state.status}${suffix}`)
  }
  /*
   * Two lines, two questions, and they must not be read as contradicting.
   *
   * The first is the raw census: how many packages have a non-compliant
   * `latest`, regardless of whether anything excuses it. The second is the
   * verdict that actually decides the exit code. Printing only the census as
   * PASS/FAIL made a release with an accepted historical deviation read
   * `FAIL` on one line and `ACCEPTED_HISTORICAL` on the next, which is how a
   * reader concludes the gate is broken when it is working.
   */
  for (const error of evaluation.errors) console.error(`NOTE ${error}`)
  console.log(
    `latest-tag census: ${records.length} packages (${evaluation.stable.length} stable, ${evaluation.prerelease.length} prerelease, ${evaluation.absent.length} absent, ${evaluation.failures.length} failed)`,
  )

  /*
   * The verdict is what decides the exit code, not the raw error count.
   *
   * An accepted deviation has errors — that is the whole point — but the
   * packages were published correctly and the deviation is recorded, so
   * stopping the release there would block the smoke and the GitHub Release
   * for a state the maintainer approved in advance.
   */
  console.log(
    `latest policy (${phase}): ${policy.verdict} (${policy.acceptedHistorical.length} historical, ${policy.acceptedDeviation.length} first-publish, ${policy.refused.length} refused, ${policy.unknown.length} unknown)`,
  )
  for (const decision of policy.decisions) {
    if (decision.outcome === 'compliant') continue
    /*
     * `toUpperCase` was called without parentheses here, so every finding
     * printed `function toUpperCase() { [native code] }` instead of the
     * outcome. It cost nothing in the verdict and everything in the one place
     * an operator reads to find out what went wrong.
     */
    console.log(
      `  ${decision.outcome.toUpperCase()} ${decision.name}: ${decision.basis}`,
    )
  }
  if (verdictBlocksRelease(policy.verdict)) process.exitCode = 1
}

/**
 * The package names a pairing record approved for a first publication.
 *
 * `[]` for a missing, unreadable or malformed record. That direction is
 * deliberate: returning the list from a file nobody could parse would authorise
 * exactly the packages an attacker would want authorised.
 */
export function readApprovedFirstPublish(file: string | undefined): string[] {
  if (file === undefined || !fs.existsSync(file)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      firstPublish?: unknown
    }
    if (!Array.isArray(parsed.firstPublish)) return []
    return parsed.firstPublish.filter(
      (entry): entry is string => typeof entry === 'string',
    )
  } catch {
    return []
  }
}

function resolveVersion(
  explicit: string | undefined,
  ref: string | undefined,
): ResolvedReleaseVersion {
  const zeus = findWorkspacePackages().find(pkg => pkg.name === '@zeus-js/zeus')
  const root = readPackageVersion('package.json')
  return resolveReleaseVersion({
    explicit,
    tag: ref ?? process.env.GITHUB_REF_NAME,
    env: process.env.ZEUS_RELEASE_VERSION,
    zeusPackage:
      typeof zeus?.packageJson.version === 'string'
        ? zeus.packageJson.version
        : undefined,
    rootPackage: root,
  })
}

function readPackageVersion(file: string): string | undefined {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      version?: unknown
    }
    return typeof value.version === 'string'
      ? normalizeVersion(value.version)
      : undefined
  } catch {
    return undefined
  }
}

if (process.argv[1]?.endsWith('check-latest-tags.ts')) {
  void main()
}
