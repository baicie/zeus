/**
 * Pairing records, validated before a tag exists rather than after.
 *
 * A release reads `meta/release/pairing/v<version>.json` and refuses to continue
 * without it. Finding that out at tag time means the tag has been pushed and
 * the release run fails on a missing file — recoverable, but noisy, and the
 * failure looks like a release problem rather than a missing commit.
 *
 * This runs in CI so a record is written and correct before anyone tags.
 */
import fs from 'node:fs'
import path from 'node:path'

export const RELEASE_PAIRING_SCHEMA = 'zeus.release-pairing/v1'

export interface ReleasePairing {
  readonly schema: typeof RELEASE_PAIRING_SCHEMA
  readonly coreVersion: string
  /**
   * The UI commit this Core release was verified against.
   *
   * `null` is only legal together with `bootstrap: true`, for the first
   * release that crosses a version line. See the README: the UI lockfile for a
   * new Core version cannot resolve until that version is published, and the
   * record has to be in the commit the tag points at, so the first tag in a new
   * version line cannot name a UI commit that exists.
   */
  readonly uiCommit: string | null
  readonly uiVersion: string
  readonly verifiedAt: string
  /**
   * Marks a release that publishes a new version line without a UI pair.
   *
   * This is a statement about what could not be verified, not a waiver of the
   * checks that still apply: the tag is still immutable, the published versions
   * still cannot be overwritten, and the evidence is still bound to the real
   * tag SHA. What it gives up is the claim that this Core was built against a
   * specific UI tree.
   */
  readonly bootstrap?: boolean
  /**
   * Packages whose first publication this release accepts.
   *
   * npm binds `latest` to a package's first publish regardless of `--tag`, so
   * a prerelease that is a first publication pollutes `latest`. Listing a
   * package here says the maintainer knows and accepts that; the release
   * refuses otherwise.
   */
  readonly firstPublish?: readonly string[]
}

export interface PairingProblem {
  readonly file: string
  readonly message: string
}

const SHA = /^[0-9a-f]{40}$/i
const SEMVER = /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Whether a value is a pairing record this module can reason about.
 *
 * Structural only. Whether the commit exists, and whether the UI tree at it
 * carries `uiVersion`, is checked by the release against the real checkout —
 * a file cannot prove that about a repository it does not have.
 */
export function validatePairingRecord(
  value: unknown,
  file: string,
): PairingProblem[] {
  const problems: PairingProblem[] = []
  const push = (message: string): void => {
    problems.push({ file, message })
  }
  if (!isRecord(value)) {
    push('not a JSON object')
    return problems
  }
  if (value.schema !== RELEASE_PAIRING_SCHEMA) {
    push(`schema must be ${RELEASE_PAIRING_SCHEMA}`)
  }
  if (
    typeof value.coreVersion !== 'string' ||
    !SEMVER.test(value.coreVersion)
  ) {
    push(
      'coreVersion must be a version this policy releases (X.Y.Z or -alpha/-beta/-rc.N)',
    )
  }
  /*
   * The file name is derived from the version, and the workflow looks it up by
   * that name. A record whose `coreVersion` disagrees with its own file name is
   * one that will be read for a release it does not describe.
   */
  const expectedName = `v${String(value.coreVersion)}.json`
  if (path.basename(file) !== expectedName) {
    push(`file name must be ${expectedName} so the release finds it by version`)
  }
  /*
   * `bootstrap` is a boolean that only widens what `uiCommit` may be. It is
   * checked first because every rule below reads differently depending on it.
   */
  if (value.bootstrap !== undefined && typeof value.bootstrap !== 'boolean') {
    push('bootstrap must be a boolean when present')
  }
  const bootstrap = value.bootstrap === true

  if (bootstrap) {
    /*
     * A bootstrap release publishes a new version line with no UI pair. It
     * must say so by carrying no UI commit: a record that has both a commit
     * and the bootstrap flag would be a pair that claims not to be verified,
     * which is the ambiguous state this field exists to remove.
     */
    if (value.uiCommit !== null) {
      push(
        'a bootstrap record must set uiCommit to null; a paired release must omit bootstrap',
      )
    }
  } else if (typeof value.uiCommit !== 'string' || !SHA.test(value.uiCommit)) {
    /*
     * A branch name is not a release identity: it moves. The whole point of
     * the record is a commit that cannot.
     */
    push('uiCommit must be a full 40-character SHA, not a branch or tag')
  }
  if (typeof value.uiVersion !== 'string' || !SEMVER.test(value.uiVersion)) {
    push('uiVersion must be a version this policy releases')
  } else if (value.uiVersion !== value.coreVersion) {
    push(
      `uiVersion ${String(value.uiVersion)} does not equal coreVersion ${String(value.coreVersion)}; the pair must be one version`,
    )
  }
  if (typeof value.verifiedAt !== 'string' || !ISO_UTC.test(value.verifiedAt)) {
    push('verifiedAt must be an ISO-8601 UTC timestamp')
  }
  if (value.firstPublish !== undefined) {
    if (
      !Array.isArray(value.firstPublish) ||
      value.firstPublish.some(entry => typeof entry !== 'string')
    ) {
      push('firstPublish must be an array of package names')
    }
  }
  return problems
}

/**
 * Whether a commit exists on the remote that a release will checkout.
 *
 * A record naming a commit that only ever existed in someone's working copy
 * validates perfectly — forty hex characters, correct version, correct
 * pairing — and then fails at release time when the checkout cannot resolve
 * it. Measured here: the record for `0.2.0-rc.0` named `f3b7dce3`, a commit
 * made in a throwaway clone; by the time the release would have run, the
 * GitHub API answered 422 and the object was gone locally.
 *
 * So this asks the remote, not the format. The caller supplies the query so
 * CI can use `gh` and tests can answer directly.
 */
export interface RemoteCommitCheck {
  readonly repository: string
  readonly commit: string
}

export type RemoteCommitVerdict = 'present' | 'absent' | 'unknown'

export interface RemoteCommitResult {
  readonly verdict: RemoteCommitVerdict
  readonly detail: string
}

/**
 * Checks a commit against the GitHub API.
 *
 * `unknown` — a network failure, a rate limit, a missing token — is not
 * `present`. A release that treats an unanswered question as an answer is the
 * failure this whole module exists to prevent.
 */
export function checkRemoteCommit(
  input: RemoteCommitCheck,
  query: (args: readonly string[]) => string,
): RemoteCommitResult {
  if (!SHA.test(input.commit)) {
    return { verdict: 'absent', detail: `${input.commit} is not a full SHA` }
  }
  let raw: string
  try {
    raw = query(['api', `repos/${input.repository}/commits/${input.commit}`])
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    /*
     * `gh` exits non-zero for both 404 and 422, and the message is the only
     * place the distinction appears. Absent is a real answer; anything else is
     * not.
     */
    if (/No commit found|404|422/.test(message)) {
      return {
        verdict: 'absent',
        detail: `${input.repository} has no commit ${input.commit}`,
      }
    }
    return { verdict: 'unknown', detail: message.slice(0, 160) }
  }
  try {
    const parsed: unknown = JSON.parse(raw)
    if (
      typeof parsed === 'object' &&
      parsed !== null &&
      typeof (parsed as { sha?: unknown }).sha === 'string'
    ) {
      const sha = (parsed as { sha: string }).sha
      return sha.toLowerCase() === input.commit.toLowerCase()
        ? { verdict: 'present', detail: `${input.repository}@${input.commit}` }
        : {
            verdict: 'absent',
            detail: `the API returned ${sha} for a query about ${input.commit}`,
          }
    }
    return { verdict: 'unknown', detail: 'the response had no sha' }
  } catch {
    return { verdict: 'unknown', detail: 'the response was not JSON' }
  }
}

/**
 * What the UI tree at a commit actually says its version is.
 *
 * `uiVersion` in the record is a claim; this is the check. A record can name a
 * commit that exists and still be wrong about it — measured here: after the UI
 * version bump was split out, the record named a commit whose tree was still
 * at `0.1.0-beta.35` while claiming `0.2.0-rc.0`.
 *
 * Existence and content are different questions, and the second is the one a
 * release depends on.
 */
export interface UiVersionMismatch {
  readonly file: string
  readonly expected: string
  readonly actual: string
}

/**
 * Compares each record's `uiVersion` with the UI manifest at `uiCommit`.
 *
 * `undefined` from the reader means the file could not be fetched, which is
 * reported rather than treated as agreement.
 */
export function checkUiVersions(
  records: readonly (ReleasePairing & { readonly file: string })[],
  readUiManifest: (commit: string) => string | undefined,
): {
  readonly mismatches: readonly UiVersionMismatch[]
  readonly problems: readonly PairingProblem[]
} {
  const mismatches: UiVersionMismatch[] = []
  const problems: PairingProblem[] = []
  for (const record of records) {
    /* A bootstrap record has no commit to read; nothing to verify here. */
    if (record.uiCommit === null) continue
    const raw = readUiManifest(record.uiCommit)
    if (raw === undefined) {
      problems.push({
        file: record.file,
        message: `cannot read the UI manifest at ${record.uiCommit}; the recorded uiVersion ${record.uiVersion} is unverified`,
      })
      continue
    }
    let version: unknown
    try {
      version = (JSON.parse(raw) as { version?: unknown }).version
    } catch {
      problems.push({
        file: record.file,
        message: `the UI manifest at ${record.uiCommit} is not valid JSON`,
      })
      continue
    }
    if (typeof version !== 'string') {
      problems.push({
        file: record.file,
        message: `the UI manifest at ${record.uiCommit} has no version`,
      })
      continue
    }
    if (version !== record.uiVersion) {
      mismatches.push({
        file: record.file,
        expected: record.uiVersion,
        actual: version,
      })
    }
  }
  return { mismatches, problems }
}

/**
 * Validates every record in a directory.
 *
 * The README is skipped, and anything else that is not a `.json` file is a
 * problem rather than ignored — a stray file in a directory the release reads
 * from is how the wrong record gets found.
 */
export function validatePairingDirectory(directory: string): PairingProblem[] {
  if (!fs.existsSync(directory)) {
    return [{ file: directory, message: 'pairing directory does not exist' }]
  }
  const problems: PairingProblem[] = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory()) continue
    if (entry.name === 'README.md') continue
    const absolute = path.join(directory, entry.name)
    if (!entry.name.endsWith('.json')) {
      problems.push({
        file: absolute,
        message: 'only .json pairing records belong here',
      })
      continue
    }
    let parsed: unknown
    try {
      parsed = JSON.parse(fs.readFileSync(absolute, 'utf8'))
    } catch {
      problems.push({ file: absolute, message: 'not valid JSON' })
      continue
    }
    problems.push(...validatePairingRecord(parsed, absolute))
  }
  return problems
}

/**
 * Every parsed record in a directory, with the file it came from.
 *
 * `validatePairingDirectory` reports problems; the online check needs the
 * records themselves, and re-reading the directory there would be a second
 * parser that could disagree with the first.
 */
export function readPairingDirectory(
  directory: string,
): Array<ReleasePairing & { readonly file: string }> {
  const records: Array<ReleasePairing & { readonly file: string }> = []
  if (!fs.existsSync(directory)) return records
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() || !entry.name.endsWith('.json')) continue
    const absolute = path.join(directory, entry.name)
    try {
      const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8')) as unknown
      if (
        typeof parsed === 'object' &&
        parsed !== null &&
        typeof (parsed as { uiCommit?: unknown }).uiCommit === 'string'
      ) {
        records.push({
          ...(parsed as ReleasePairing),
          file: absolute,
        })
      }
    } catch {
      /* Structural problems are reported by validatePairingDirectory. */
    }
  }
  return records
}
