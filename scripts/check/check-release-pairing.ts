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
  findConflictingAttestations,
  readAttestationDirectory,
  validatePairAttestation,
} from '../release/pair-attestation'
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
    coreRepository: { type: 'string', default: 'baicie/zeus' },
  },
})

const directory = path.join(root, 'release-pairing')
const problems = [...validatePairingDirectory(directory)]

/*
 * Attestations are structural here. Whether `coreCommit` really is the tag's
 * target, and whether `uiCommit` is reachable, needs the remote and is done
 * in the online half.
 */
const attestations = readAttestationDirectory(
  path.join(root, 'release-pairing/attestations'),
)
const attestedVersions = new Set<string>()
for (const stored of attestations) {
  const tag = stored.attestation.releaseTag
  const version = typeof tag === 'string' ? tag.replace(/^v/, '') : ''
  if (version.length === 0) continue
  attestedVersions.add(version)
  for (const problem of validatePairAttestation(
    stored.attestation,
    stored.file,
    {
      version,
    },
  )) {
    problems.push(problem)
  }
}
/*
 * One pair per version. A second attestation naming a different UI commit
 * would let one Core release claim two UI trees, and a reader has no way to
 * choose between them.
 */
for (const version of attestedVersions) {
  const conflicts = findConflictingAttestations(attestations, version)
  for (const conflict of conflicts) {
    const separator = conflict.indexOf(': ')
    problems.push({
      file: separator === -1 ? conflict : conflict.slice(0, separator),
      message: separator === -1 ? conflict : conflict.slice(separator + 2),
    })
  }
}

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
    /*
     * A bootstrap record names no commit by construction. There is nothing to
     * ask the remote about, and reporting a missing commit as a failure would
     * make the one legal unpaired release look broken.
     */
    if (record.uiCommit === null) {
      console.log(
        `  skip  ${record.file} is a bootstrap record: no UI commit to check`,
      )
      continue
    }
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

  /*
   * Attestations, against the remote.
   *
   * The two facts a file cannot establish about itself are asked of GitHub:
   * whether `uiCommit` exists, and whether `coreCommit` really is what the
   * release tag points at. A well-formed attestation naming a commit nobody
   * can check out is exactly the `f3b7dce3` failure this file exists for.
   */
  for (const stored of attestations) {
    const version = stored.attestation.releaseTag?.replace(/^v/, '') ?? ''
    if (version.length === 0) continue

    const ui = stored.attestation.uiCommit
    if (typeof ui === 'string' && /^[0-9a-f]{40}$/i.test(ui)) {
      const result = checkRemoteCommit(
        { repository: values.repository, commit: ui },
        gh,
      )
      if (result.verdict !== 'present') {
        problems.push({
          file: stored.file,
          message:
            result.verdict === 'absent'
              ? `uiCommit ${ui} does not exist on ${values.repository} (${result.detail})`
              : `uiCommit ${ui} could not be verified on ${values.repository}: ${result.detail}`,
        })
      }
    }

    const tagCommit = readTagCommit(values.coreRepository, `v${version}`, gh)
    if (tagCommit === undefined) {
      problems.push({
        file: stored.file,
        message: `release tag v${version} could not be resolved on ${values.coreRepository}; a pair that names an unresolvable release is not evidence`,
      })
    } else {
      for (const problem of validatePairAttestation(
        stored.attestation,
        stored.file,
        { version, releaseTagCommit: tagCommit },
      )) {
        /*
         * Only the coreCommit comparison is re-run here; structural findings
         * were already collected above and repeating them would double-report.
         */
        if (problem.message.startsWith('coreCommit ')) problems.push(problem)
      }
    }
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
 * The commit a tag resolves to, dereferencing an annotated tag.
 *
 * An annotated tag's ref names a tag object, not a commit, so reading
 * `object.sha` and comparing it against a commit would report every annotated
 * release as moved. The tag object is fetched and its `object.sha` used
 * instead. Measured: `v0.1.1-beta.19` resolves to tag object `105e0554…` whose
 * commit is `3041a708…`.
 */
function readTagCommit(
  repository: string,
  tag: string,
  gh: (args: readonly string[]) => string,
): string | undefined {
  try {
    const ref = JSON.parse(
      gh(['api', `repos/${repository}/git/ref/tags/${tag}`]),
    ) as { object?: { type?: string; sha?: string } }
    const object = ref.object
    if (!object || typeof object.sha !== 'string') return undefined
    if (object.type === 'commit') return object.sha
    const tagObject = JSON.parse(
      gh(['api', `repos/${repository}/git/tags/${object.sha}`]),
    ) as { object?: { type?: string; sha?: string } }
    return tagObject.object?.type === 'commit'
      ? tagObject.object.sha
      : undefined
  } catch {
    return undefined
  }
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
