/**
 * Pairing records, checked in two modes.
 *
 * ## Static (default, runs in every PR)
 *
 * Structure only: schema, versions, file name, SHA format, firstPublish names.
 * No network, so it never fails because GitHub is slow, and a PR that adds a
 * record is validated before it merges.
 *
 * ## Online (`--online`, runs in the release precheck)
 *
 * Adds the question static checking cannot answer: does the UI commit this
 * record names actually exist on the remote a release will check out?
 *
 * The distinction exists because of a real failure. `release-pairing/
 * v0.2.0-rc.0.json` named `f3b7dce3`, a commit created in a throwaway clone.
 * It passed every static check — forty hex characters, matching versions,
 * valid schema — and the GitHub API answered 422 for it. A record can be
 * perfectly well-formed and describe a commit that does not exist.
 */
import { execFileSync } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import {
  checkRemoteCommit,
  checkUiVersions,
  readPairingDirectory,
  validatePairingDirectory,
} from '../release/release-pairing'

const root = path.resolve(import.meta.dirname, '../..')
const { values } = parseArgs({
  options: {
    online: { type: 'boolean', default: false },
    repository: { type: 'string', default: 'baicie/zeus-ui' },
  },
})

const directory = path.join(root, 'release-pairing')
const problems = [...validatePairingDirectory(directory)]

if (values.online) {
  /*
   * Only reached from the release precheck, where a token exists. A PR run
   * without credentials would report every record as unknown, which is noise
   * rather than a finding.
   */
  const gh = (args: readonly string[]): string =>
    execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    }) as string

  for (const record of readPairingDirectory(directory)) {
    const result = checkRemoteCommit(
      { repository: values.repository, commit: record.uiCommit },
      gh,
    )
    if (result.verdict === 'present') {
      console.log(`  ok    ${record.uiCommit} is on ${values.repository}`)
      continue
    }
    problems.push({
      file: record.file,
      message:
        result.verdict === 'absent'
          ? `uiCommit ${record.uiCommit} does not exist on ${values.repository}; a release would fail to check it out (${result.detail})`
          : `uiCommit ${record.uiCommit} could not be verified on ${values.repository}: ${result.detail}`,
    })
  }

  /*
   * Existence is not content. A commit can be reachable and still carry a
   * different version than the record claims — which is what happened when
   * the UI version bump was split out of the protocol PR.
   */
  const records = readPairingDirectory(directory)
  const versionCheck = checkUiVersions(records, commit =>
    readFileAtCommit(values.repository, commit, 'package.json', gh),
  )
  problems.push(...versionCheck.problems)
  for (const mismatch of versionCheck.mismatches) {
    problems.push({
      file: mismatch.file,
      message: `record says the UI is at ${mismatch.expected}, but the tree at that commit is ${mismatch.actual}`,
    })
  }
}

if (problems.length === 0) {
  console.log(
    values.online
      ? 'release pairing records passed (structure and remote reachability)'
      : 'release pairing records passed',
  )
} else {
  for (const problem of problems) {
    console.error(`${problem.file}: ${problem.message}`)
  }
  console.error(`\n${problems.length} pairing problem(s).`)
  process.exitCode = 1
}

/**
 * A file at a commit on a repository, or `undefined`.
 *
 * Uses the raw media type so the response is the file, not a base64 envelope.
 */
function readFileAtCommit(
  repository: string,
  commit: string,
  file: string,
  gh: (args: readonly string[]) => string,
): string | undefined {
  try {
    return gh([
      'api',
      `repos/${repository}/contents/${file}?ref=${commit}`,
      '-H',
      'Accept: application/vnd.github.raw',
    ])
  } catch {
    return undefined
  }
}
