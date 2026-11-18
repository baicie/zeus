/**
 * The evidence that ties a post-publish check to the precheck that preceded it.
 *
 * ## The failure this prevents
 *
 * A post-publish check that only looks at the registry as it is *now* cannot
 * tell three situations apart:
 *
 * 1. the release published correctly;
 * 2. a package's `latest` was already broken and stayed broken;
 * 3. a package's `latest` moved during the release and the current state
 *    happens to look acceptable.
 *
 * (3) is the one that matters. Without a before-picture, "the tag is
 * compliant" says nothing about whether the release is what made it so.
 *
 * ## Why it is not just a file path
 *
 * The snapshot is written by the precheck step of the *same job* and read back
 * by the post-publish step of that job. It is therefore this run's own
 * evidence, not an artifact fetched from an older run. The bindings below are
 * what make that checkable rather than assumed:
 *
 * - `version` — the release being judged;
 * - `gitSha` — the commit checked out (the tag's commit);
 * - `runId` — the workflow run.
 *
 * Any of them disagreeing means the two halves are not describing one release,
 * and a comparison across different releases is worse than no comparison: it
 * would report "unchanged" for a package nobody looked at twice.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import type { LatestTagState } from './check-latest-tags'

export const LATEST_SNAPSHOT_SCHEMA = 'zeus.latest-snapshot/v1'

/** Where the precheck writes and the post-publish check reads. */
export const LATEST_SNAPSHOT_PATH = 'temp/release/latest-precheck-snapshot.json'

export interface SnapshotPackage {
  readonly name: string
  readonly status: LatestTagState['status']
  readonly version?: string
  readonly error?: string
}

export interface LatestSnapshot {
  readonly schema: typeof LATEST_SNAPSHOT_SCHEMA
  readonly phase: 'precheck'
  readonly version: string
  readonly gitSha: string
  readonly runId: string
  readonly registry: string
  readonly capturedAt: string
  readonly baselineDigest: string
  readonly packages: readonly SnapshotPackage[]
}

export type SnapshotProblem = string

export function buildSnapshot(input: {
  readonly version: string
  readonly gitSha: string
  readonly runId: string
  readonly registry: string
  readonly capturedAt: string
  readonly baselineDigest: string
  readonly records: readonly {
    readonly name: string
    readonly state: LatestTagState
  }[]
}): LatestSnapshot {
  return {
    schema: LATEST_SNAPSHOT_SCHEMA,
    phase: 'precheck',
    version: input.version,
    gitSha: input.gitSha,
    runId: input.runId,
    registry: input.registry,
    capturedAt: input.capturedAt,
    baselineDigest: input.baselineDigest,
    packages: input.records.map(record => ({
      name: record.name,
      status: record.state.status,
      ...('version' in record.state ? { version: record.state.version } : {}),
      ...('error' in record.state ? { error: record.state.error } : {}),
    })),
  }
}

export function writeSnapshot(
  snapshot: LatestSnapshot,
  file: string = LATEST_SNAPSHOT_PATH,
): void {
  const out = path.resolve(file)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, `${JSON.stringify(snapshot, null, 2)}\n`)
}

/**
 * A digest of the facts a comparison depends on.
 *
 * Excludes `capturedAt`, which differs between any two runs and carries no
 * evidence. Includes the bindings, so two snapshots with the same digest are
 * describing the same release and the same registry state.
 */
export function digestSnapshot(snapshot: LatestSnapshot): string {
  const canonical = [
    snapshot.schema,
    snapshot.phase,
    snapshot.version,
    snapshot.gitSha,
    snapshot.runId,
    snapshot.registry,
    snapshot.baselineDigest,
    ...snapshot.packages.map(
      pkg => `${pkg.name}=${pkg.status}:${pkg.version ?? ''}`,
    ),
  ].join('\n')
  return `sha256:${createHash('sha256').update(canonical).digest('hex')}`
}

/**
 * Reads and validates a precheck snapshot against the release being judged.
 *
 * Returns the problems rather than throwing: the caller has to report which
 * binding failed. Every problem blocks — a snapshot that cannot be trusted is
 * not a snapshot, and treating it as "no changes" would let the last
 * unverifiable run be the one that passes.
 */
export function loadSnapshot(
  expected: {
    readonly version: string
    readonly gitSha: string
    readonly runId: string
    readonly packageCount: number
  },
  file: string = LATEST_SNAPSHOT_PATH,
): { snapshot?: LatestSnapshot; problems: readonly SnapshotProblem[] } {
  const out = path.resolve(file)
  const problems: SnapshotProblem[] = []

  let raw: string
  try {
    raw = fs.readFileSync(out, 'utf8')
  } catch {
    problems.push(
      `precheck snapshot is missing at ${file}; the post-publish check has nothing to compare against`,
    )
    return { problems }
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch (error) {
    problems.push(
      `precheck snapshot at ${file} is not valid JSON: ${
        error instanceof Error ? error.message : String(error)
      }`,
    )
    return { problems }
  }

  const value = parsed as Partial<LatestSnapshot>
  if (value.schema !== LATEST_SNAPSHOT_SCHEMA) {
    problems.push(
      `precheck snapshot schema is ${String(value.schema)}, expected ${LATEST_SNAPSHOT_SCHEMA}`,
    )
  }
  if (value.phase !== 'precheck') {
    problems.push(
      `precheck snapshot declares phase ${String(value.phase)}; only a precheck snapshot can be compared against`,
    )
  }
  /*
   * The three bindings. Compared literally, because "close enough" for a run
   * id or a commit is not a thing.
   */
  if (value.version !== expected.version) {
    problems.push(
      `precheck snapshot is for version ${String(value.version)}, but this release is ${expected.version}`,
    )
  }
  if (value.gitSha !== expected.gitSha) {
    problems.push(
      `precheck snapshot was taken at commit ${String(value.gitSha)}, but this run is at ${expected.gitSha}`,
    )
  }
  if (String(value.runId ?? '') !== expected.runId) {
    problems.push(
      `precheck snapshot came from run ${String(value.runId)}, but this run is ${expected.runId}`,
    )
  }
  if (!Array.isArray(value.packages)) {
    problems.push('precheck snapshot has no packages array')
    return { problems }
  }
  if (value.packages.length !== expected.packageCount) {
    problems.push(
      `precheck snapshot covers ${value.packages.length} packages, but the release publishes ${expected.packageCount}; a partial snapshot cannot prove nothing else moved`,
    )
  }

  if (problems.length > 0) return { problems }
  return { snapshot: value as LatestSnapshot, problems }
}

export interface SnapshotTransition {
  readonly name: string
  readonly before: SnapshotPackage
  readonly after: SnapshotPackage
  /** What changed, in a form a report can print. */
  readonly change: string
}

export interface SnapshotComparison {
  /** Packages whose state did not change at all. */
  readonly unchanged: readonly string[]
  /** Packages that went from absent to this release's prerelease. */
  readonly publishedAsFirstRelease: readonly SnapshotTransition[]
  /** Packages whose state changed in a way the policy allows. */
  readonly allowed: readonly SnapshotTransition[]
  /**
   * Packages that changed in a way nothing authorises: a stable `latest`
   * moved, a prerelease `latest` moved to a different prerelease, or a tag
   * disappeared.
   */
  readonly unexpected: readonly SnapshotTransition[]
}

/**
 * Compares two snapshots.
 *
 * The allowed transitions are deliberately few. During a release the only
 * thing that may legitimately change is a package gaining a `latest` it did
 * not have, or a first publication binding `latest` to the release version.
 * Everything else — a stable tag moving, one prerelease replacing another, a
 * tag vanishing — is a change nobody approved, and the answer to "did this
 * release do that?" must be established rather than assumed.
 */
export function compareSnapshots(input: {
  readonly before: LatestSnapshot
  readonly after: readonly {
    readonly name: string
    readonly state: LatestTagState
  }[]
  readonly version: string
  readonly approvedFirstPublish: readonly string[]
}): SnapshotComparison {
  const beforeByName = new Map(input.before.packages.map(p => [p.name, p]))
  const unchanged: string[] = []
  const publishedAsFirstRelease: SnapshotTransition[] = []
  const allowed: SnapshotTransition[] = []
  const unexpected: SnapshotTransition[] = []
  const approved = new Set(input.approvedFirstPublish)

  for (const record of input.after) {
    const before = beforeByName.get(record.name)
    if (before === undefined) {
      /*
       * A package the precheck never saw. The snapshot is supposed to cover
       * the whole publish set, so this is a gap in the evidence rather than a
       * change to judge.
       */
      unexpected.push({
        name: record.name,
        before: { name: record.name, status: 'LATEST_ABSENT' },
        after: toSnapshotPackage(record),
        change: 'package was absent from the precheck snapshot',
      })
      continue
    }

    const after = toSnapshotPackage(record)
    if (before.status === after.status && before.version === after.version) {
      unchanged.push(record.name)
      continue
    }

    const transition: SnapshotTransition = {
      name: record.name,
      before,
      after,
      change: `${describe(before)} -> ${describe(after)}`,
    }

    const becameReleaseVersion =
      after.status === 'LATEST_PRERELEASE' && after.version === input.version
    const wasAbsent = before.status === 'LATEST_ABSENT'

    if (becameReleaseVersion && wasAbsent && approved.has(record.name)) {
      publishedAsFirstRelease.push(transition)
      continue
    }
    if (becameReleaseVersion && wasAbsent) {
      /*
       * Absent -> this release, but nobody approved a first publication. That
       * means a package the pairing record did not name was published, which
       * is exactly the case the approval list exists to prevent.
       */
      unexpected.push({
        ...transition,
        change: `${transition.change}; the pairing record did not approve a first publication for this package`,
      })
      continue
    }
    if (
      becameReleaseVersion &&
      before.status === 'LATEST_PRERELEASE' &&
      before.version !== input.version
    ) {
      /*
       * A prerelease `latest` moved to this release. For a historical canary
       * that is the repaired state the baseline's exit strategy describes, and
       * it is an improvement rather than a violation.
       */
      allowed.push(transition)
      continue
    }

    unexpected.push(transition)
  }

  return { unchanged, publishedAsFirstRelease, allowed, unexpected }
}

function toSnapshotPackage(record: {
  readonly name: string
  readonly state: LatestTagState
}): SnapshotPackage {
  return {
    name: record.name,
    status: record.state.status,
    ...('version' in record.state ? { version: record.state.version } : {}),
    ...('error' in record.state ? { error: record.state.error } : {}),
  }
}

function describe(pkg: SnapshotPackage): string {
  if (pkg.status === 'LATEST_ABSENT') return 'absent'
  if (pkg.status === 'REGISTRY_QUERY_FAILED') return 'query-failed'
  return `${pkg.status === 'LATEST_STABLE' ? 'stable' : 'prerelease'} ${pkg.version ?? '?'}`
}
