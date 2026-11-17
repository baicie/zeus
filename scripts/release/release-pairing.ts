/**
 * Pairing records, validated before a tag exists rather than after.
 *
 * A release reads `release-pairing/v<version>.json` and refuses to continue
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
  readonly uiCommit: string
  readonly uiVersion: string
  readonly verifiedAt: string
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
  if (typeof value.uiCommit !== 'string' || !SHA.test(value.uiCommit)) {
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
