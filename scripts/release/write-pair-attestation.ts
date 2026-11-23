/**
 * Records the pair for a release that published unpaired.
 *
 * ## When this runs
 *
 * After the UI candidate exists and the Core packages are on the registry.
 * It writes `meta/release/pairing/attestations/v<version>.json` and prints the
 * commit it expects to be tagged.
 *
 * ## What it will not do
 *
 * It does not create the tag. Tag creation is a separate, explicit step
 * (`--tag` is a different command), because a script that both generates the
 * evidence and publishes it cannot be reviewed in between — and the whole
 * point of the attestation is that a human read it before it became immutable.
 *
 * It refuses to write anything it cannot substantiate:
 *
 * - the release tag must exist and resolve to a commit;
 * - that commit's own record must be a bootstrap record for this version;
 * - the UI commit must be a full SHA, and if `--verify-ui-remote` is passed, it
 *   must exist on the UI repository;
 * - an attestation for this version must not already exist with a different
 *   UI commit, because a version pairs once.
 *
 * ## Usage
 *
 * ```text
 * tsx scripts/release/write-pair-attestation.ts \
 *   --version 0.2.0-rc.0 \
 *   --ui-commit <sha> \
 *   [--verify-ui-remote] \
 *   [--out meta/release/pairing/attestations/v0.2.0-rc.0.json]
 * ```
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import {
  PAIR_ATTESTATION_DIRECTORY,
  PAIR_ATTESTATION_SCHEMA,
  TAGGED_RECORD_PATHS,
  attestationFile,
  findConflictingAttestations,
  readAttestationDirectory,
  validatePairAttestation,
  type PairAttestation,
} from './pair-attestation'

const FULL_SHA = /^[0-9a-f]{40}$/i

export interface WriteAttestationInput {
  readonly root: string
  readonly version: string
  readonly uiCommit: string
  /** The commit `v<version>` resolves to, already read from the remote. */
  readonly coreCommit: string
  /** Whether the release tag published unpaired. */
  readonly bootstrap: boolean
  readonly now?: Date
}

export interface WriteAttestationResult {
  readonly file: string
  readonly attestation: PairAttestation
  readonly problems: readonly string[]
}

/**
 * Builds and validates the attestation, writing it only when it is consistent.
 *
 * Validation runs against the same inputs the writer used, so a bug that
 * produced an inconsistent object fails here rather than at the UI's release
 * check weeks later.
 */
export function writePairAttestation(
  input: WriteAttestationInput,
): WriteAttestationResult {
  const file = path.join(input.root, attestationFile(input.version))
  const attestation: PairAttestation = {
    schema: PAIR_ATTESTATION_SCHEMA,
    releaseTag: `v${input.version}`,
    coreCommit: input.coreCommit,
    coreVersion: input.version,
    uiCommit: input.uiCommit,
    uiVersion: input.version,
    bootstrap: input.bootstrap,
    verifiedAt: (input.now ?? new Date()).toISOString(),
  }

  const problems = validatePairAttestation(attestation, file, {
    version: input.version,
    releaseTagCommit: input.coreCommit,
    uiCommit: input.uiCommit,
  }).map(problem => problem.message)

  /*
   * A second attestation for the same version naming a different UI commit
   * would let one Core release claim two UI trees. Checked against what is
   * already on disk, not only against the one being written.
   */
  const existing = readAttestationDirectory(path.dirname(file))
  const conflicts = findConflictingAttestations(
    [...existing, { file, attestation }],
    input.version,
  )
  problems.push(
    ...conflicts.filter(conflict => !conflict.startsWith(`${file}: duplicate`)),
  )

  if (problems.length > 0) {
    return { file, attestation, problems }
  }

  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, `${JSON.stringify(attestation, null, 2)}\n`)
  return { file, attestation, problems: [] }
}

/** The commit `v<version>` resolves to on the remote, dereferencing annotated tags. */
export function readReleaseTagCommit(
  version: string,
  repository = 'baicie/zeus',
): string | undefined {
  const gh = (args: string[]): string =>
    execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    }) as string
  try {
    const ref = JSON.parse(
      gh(['api', `repos/${repository}/git/ref/tags/v${version}`]),
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

/** Runs `gh api <args>` and returns stdout, or throws. */
export type GhRunner = (args: readonly string[]) => string

/**
 * `path` itself, or `path.posix` / `path.win32`.
 *
 * The node typings export `posix` and `win32` as the module's own type, so
 * this is how a test asks for one of them without duplicating the shape.
 */
export type PathDialect = typeof path

/**
 * The rejection a `gh` call carries, reduced to what a caller can act on.
 *
 * `gh` exits non-zero for every API failure — a 404, a 403 from a missing
 * token scope, and a 500 from GitHub all arrive as `status: 1` with the real
 * code only in the body (`{"status":"404"}` on stdout) or in the message
 * (`(HTTP 404)` on stderr). So the classification cannot read the exit code;
 * it reads both streams, and `unknown` is its own outcome rather than being
 * folded into either side.
 */
export type GhFailureKind =
  | 'not-found'
  | 'forbidden'
  | 'rate-limited'
  | 'server-error'
  | 'auth-failed'
  | 'timeout'
  | 'network'
  | 'unknown'

const HTTP_FAILURE_PATTERNS: ReadonlyArray<{
  readonly kind: GhFailureKind
  readonly pattern: RegExp
}> = [
  /*
   * Two shapes come back and both have to match: the body `gh` prints,
   * `{"status":"404"}`, and its stderr line, `gh: Not Found (HTTP 404)`.
   */
  { kind: 'not-found', pattern: /(?:\bHTTP\s*|\bstatus"?\s*:\s*"?)\s*404\b/ },
  { kind: 'forbidden', pattern: /(?:\bHTTP\s*|\bstatus"?\s*:\s*"?)\s*403\b/ },
  {
    kind: 'rate-limited',
    pattern: /(?:\bHTTP\s*|\bstatus"?\s*:\s*"?)\s*429\b/,
  },
  {
    kind: 'server-error',
    pattern: /(?:\bHTTP\s*|\bstatus"?\s*:\s*"?)\s*5\d\d\b/,
  },
  {
    kind: 'auth-failed',
    pattern:
      /(?:\bHTTP\s*401\b|Bad credentials|Requires authentication|gh auth login|authentication failed)/i,
  },
  {
    kind: 'timeout',
    pattern: /(?:ETIMEDOUT|ESOCKETTIMEDOUT|timed out|timeout)/i,
  },
  {
    kind: 'network',
    pattern:
      /(?:ENOTFOUND|ECONNREFUSED|ECONNRESET|EAI_AGAIN|EHOSTUNREACH|network is unreachable|no such host|Could not resolve|dial tcp|TLS handshake|socket hang up)/i,
  },
]

/**
 * Classifies a thrown `gh` call by the text it left behind.
 *
 * Deliberately ordered: a body that says `"status":"403"` must not be read as
 * a generic server problem, and an auth failure whose message happens to
 * contain "Not Found" (GitHub answers 404 for a private repo the token cannot
 * see) is still an auth failure when the text says so.
 */
export function classifyGhFailure(error: unknown): GhFailureKind {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as {
      code?: unknown
      killed?: unknown
      signal?: unknown
      stdout?: unknown
      stderr?: unknown
      message?: unknown
    }
    /*
     * `execFileSync` reports a timeout by killing the child, so the signal is
     * checked before any text: a killed process may have written nothing.
     */
    if (
      candidate.killed === true ||
      candidate.signal === 'SIGTERM' ||
      candidate.code === 'ETIMEDOUT'
    ) {
      return 'timeout'
    }
    const text = [
      typeof candidate.stdout === 'string' ? candidate.stdout : '',
      typeof candidate.stderr === 'string' ? candidate.stderr : '',
      typeof candidate.message === 'string' ? candidate.message : '',
    ].join('\n')
    for (const { kind, pattern } of HTTP_FAILURE_PATTERNS) {
      if (pattern.test(text)) return kind
    }
  }
  if (typeof error === 'string') {
    for (const { kind, pattern } of HTTP_FAILURE_PATTERNS) {
      if (pattern.test(error)) return kind
    }
  }
  return 'unknown'
}

/**
 * Whether a failed lookup means "this path is not in the tree".
 *
 * Only a 404 does. Everything else — forbidden, rate limited, server error,
 * expired credentials, a timeout, an unrecognised failure — is a statement
 * about the *question*, not about the path, and must not be answered by
 * reading a different path. Falling through on those would let a permissions
 * problem or a GitHub outage silently change which record the release pairs
 * against.
 */
export function isAbsentAtPath(kind: GhFailureKind): boolean {
  return kind === 'not-found'
}

/**
 * Splits a repository-relative path into its segments, whichever separator it
 * was written with.
 *
 * `--out` comes from a person typing a command, so it may use either
 * separator; `PAIR_ATTESTATION_DIRECTORY` uses `/` because it is a repository
 * path. Comparing them as strings is what makes this POSIX-only: on Windows
 * `path.resolve` returns `C:\repo\meta\release\pairing\attestations\v9.json`,
 * which does not end with `meta/release/pairing/attestations/v9.json` and the
 * check rejected every valid path. Segments are compared instead, so the
 * check is about the directory a file is in rather than about the characters.
 */
export function relativeSegments(value: string): string[] {
  return value.split(/[\\/]+/).filter(segment => segment.length > 0)
}

/**
 * The repository root an explicit `--out` attestation path sits under.
 *
 * `--out` names the attestation file; the writer needs the root so it can
 * rebuild the path from `PAIR_ATTESTATION_DIRECTORY`. Deriving the root by
 * stripping a fixed number of levels is what broke here: the directory was
 * `release-pairing/attestations` (two levels) and became
 * `meta/release/pairing/attestations` (three), so the old count wrote the
 * attestation into `meta/release/` — a directory the release check then
 * reported as a stray file rather than as the pair.
 *
 * The file is accepted only when its trailing segments are exactly
 * `PAIR_ATTESTATION_DIRECTORY` + the file name, and the root is then the
 * resolved path with those segments removed — so the result keeps whatever
 * root and separator `path.resolve` produced (`/repo` on POSIX,
 * `C:\repo` on Windows) instead of having one spliced in with `/`.
 */
export function rootOfAttestationFile(out: string): string {
  return rootOfAttestationFileWith(path, out)
}

/**
 * The same rule against a chosen `path` implementation.
 *
 * Exists so the Windows branch can be tested on a POSIX machine. The check
 * that broke was string comparison, which behaves differently per platform,
 * so testing only the platform the tests happen to run on would leave the
 * failing case unexercised — `process.platform` is not something a test can
 * change, but `path.win32` is.
 */
export function rootOfAttestationFileWith(
  implementation: PathDialect,
  out: string,
): string {
  const resolved = implementation.resolve(out)
  /*
   * Walk up from the file, reading each directory name off with `basename`,
   * until the names collected match `PAIR_ATTESTATION_DIRECTORY` and the next
   * name up is the root.
   *
   * Nothing compares separators by hand. The first version did — it tested
   * `resolved.endsWith('/' + PAIR_ATTESTATION_DIRECTORY + '/' + name)` — so on
   * Windows every valid `--out` was rejected, because `path.resolve` returns
   * backslashes while the repository path is written with `/`. Reading names
   * with `basename` asks the question that matters ("is this file in that
   * directory?") and leaves the root, drive letter and separator style to the
   * platform, so the returned root is spelled the way the platform spells it.
   */
  const expectedNames = relativeSegments(PAIR_ATTESTATION_DIRECTORY)
  let cursor = implementation.dirname(resolved)
  const actualNames: string[] = []
  for (let index = 0; index < expectedNames.length; index += 1) {
    actualNames.unshift(implementation.basename(cursor))
    const parent = implementation.dirname(cursor)
    // `dirname('/')` is `/`, so walking past the filesystem root would loop.
    if (parent === cursor) {
      throw new Error(notInsideMessage(out))
    }
    cursor = parent
  }
  if (actualNames.some((name, index) => name !== expectedNames[index])) {
    throw new Error(notInsideMessage(out))
  }
  return cursor
}

function notInsideMessage(out: string): string {
  return `--out ${out} is not inside ${PAIR_ATTESTATION_DIRECTORY}; the attestation has to live where check:release-pairing reads it`
}

/**
 * Reads the bootstrap record inside the release tag's tree.
 *
 * `run` is injected so the two-path lookup and its failure cases can be
 * tested without the network. The rule it must keep: only "the API answered
 * 404 for this path" moves on to the next candidate path. A body that came
 * back and did not parse is an error about *this* record, not evidence that
 * the record is somewhere else — falling through on it would report an older
 * path's contents as though they were the tagged tree's.
 */
export function readTaggedRecord(
  version: string,
  repository = 'baicie/zeus',
  run?: GhRunner,
): { bootstrap: boolean; uiCommit: string | null } | undefined {
  const gh: GhRunner =
    run ??
    ((args: readonly string[]) =>
      execFileSync('gh', args as string[], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
      }) as string)

  for (const directory of TAGGED_RECORD_PATHS) {
    const path = `${directory}/v${version}.json`
    let raw: string
    try {
      raw = gh([
        'api',
        `repos/${repository}/contents/${path}?ref=v${version}`,
        '-H',
        'Accept: application/vnd.github.raw',
      ])
    } catch (error) {
      const kind = classifyGhFailure(error)
      if (isAbsentAtPath(kind)) {
        // The tag's tree genuinely has nothing at this path. Try the next
        // candidate; if none has it, the caller reports "nothing to pair",
        // which is a refusal, not a default.
        continue
      }
      /*
       * Everything else is a failure to read, not evidence of absence. A 403
       * from a token that lost its scope, a 429, a 500, an expired credential
       * or a timeout all mean the question could not be answered — and
       * answering it from the other layout would pair this version against
       * whichever record happened to be readable.
       */
      throw new Error(
        `could not read ${path} at v${version} (${kind}): ${describeGhFailure(error)}; refusing to fall back to another layout`,
      )
    }

    let parsed: unknown
    try {
      parsed = JSON.parse(raw)
    } catch {
      throw new Error(
        `${path} exists at v${version} but is not valid JSON; refusing to look for another record`,
      )
    }
    if (typeof parsed !== 'object' || parsed === null) {
      throw new Error(
        `${path} at v${version} is not a JSON object; refusing to look for another record`,
      )
    }
    const record = parsed as { bootstrap?: unknown; uiCommit?: unknown }
    return {
      bootstrap: record.bootstrap === true,
      uiCommit: typeof record.uiCommit === 'string' ? record.uiCommit : null,
    }
  }
  return undefined
}

/** A short, single-line description of a failed `gh` call, for the message. */
function describeGhFailure(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    const candidate = error as { stderr?: unknown; message?: unknown }
    const stderr =
      typeof candidate.stderr === 'string' ? candidate.stderr.trim() : ''
    if (stderr) return stderr.split(/\r?\n/)[0]!.slice(0, 200)
    if (typeof candidate.message === 'string') {
      return candidate.message.split(/\r?\n/)[0]!.slice(0, 200)
    }
  }
  return typeof error === 'string' ? error.slice(0, 200) : 'no detail'
}

function main(): void {
  const { values } = parseArgs({
    options: {
      version: { type: 'string' },
      'ui-commit': { type: 'string' },
      'core-commit': { type: 'string' },
      'verify-ui-remote': { type: 'boolean', default: false },
      'ui-repository': { type: 'string', default: 'baicie/zeus-ui' },
      repository: { type: 'string', default: 'baicie/zeus' },
      out: { type: 'string' },
      root: { type: 'string', default: process.cwd() },
    },
  })

  const version = values.version
  const uiCommit = values['ui-commit']
  if (!version || !uiCommit) {
    console.error(
      'usage: write-pair-attestation --version <v> --ui-commit <sha> [--core-commit <sha>] [--verify-ui-remote]',
    )
    process.exitCode = 2
    return
  }
  if (!FULL_SHA.test(uiCommit)) {
    console.error(
      `  --ui-commit must be a full 40-character SHA, got ${uiCommit}`,
    )
    process.exitCode = 2
    return
  }

  /*
   * The Core commit is read from the tag, not typed. A pair that names a
   * commit other than the tag's own target describes a tree this version never
   * published, which is the one thing the attestation exists to prevent.
   */
  const coreCommit =
    values['core-commit'] ?? readReleaseTagCommit(version, values.repository)
  if (coreCommit === undefined) {
    console.error(
      `  release tag v${version} could not be resolved on ${values.repository}; a pair must name the commit that was published`,
    )
    process.exitCode = 1
    return
  }

  const tagged = readTaggedRecord(version, values.repository)
  if (tagged === undefined) {
    console.error(
      `  the tree at v${version} has no ${TAGGED_RECORD_PATHS[0]}/v${version}.json; there is nothing to pair`,
    )
    process.exitCode = 1
    return
  }
  if (!tagged.bootstrap) {
    console.error(
      `  v${version} was not published as a bootstrap release; its tag already carries its pair, and a second attestation would contradict it`,
    )
    process.exitCode = 1
    return
  }

  if (values['verify-ui-remote']) {
    const gh = (args: string[]): string =>
      execFileSync('gh', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 30_000,
      }) as string
    try {
      gh(['api', `repos/${values['ui-repository']}/commits/${uiCommit}`])
    } catch {
      console.error(
        `  UI commit ${uiCommit} does not exist on ${values['ui-repository']}; a pair must name a commit that can be checked out`,
      )
      process.exitCode = 1
      return
    }
  }

  const writeRoot = values.out ? rootOfAttestationFile(values.out) : values.root
  const result = writePairAttestation({
    root: writeRoot,
    version,
    uiCommit,
    coreCommit,
    bootstrap: true,
  })

  if (result.problems.length > 0) {
    for (const problem of result.problems) console.error(`  ${problem}`)
    process.exitCode = 1
    return
  }

  const written = values.out ?? result.file
  console.log(`wrote ${path.relative(process.cwd(), written) || written}`)
  console.log(`  release tag  v${version} -> ${coreCommit}`)
  console.log(`  UI commit    ${uiCommit}`)
  console.log(
    `\nNext: commit the file, merge it, and create the tag with\n` +
      `  git tag ${'pair/'}v${version} <commit>\n` +
      `  git push origin ${'pair/'}v${version}`,
  )
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
