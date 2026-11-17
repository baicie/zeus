/**
 * The second half of the pair, recorded after the Core tag cannot move.
 *
 * ## Why a separate attestation exists
 *
 * A Core release tag is immutable, and bootstrap requires it to be: the commit
 * it names is the commit that was published, and re-pointing it would make one
 * version name two different trees. But the first release of a new version
 * line cannot know its UI commit — the UI lockfile cannot resolve until those
 * packages are on the registry, and the record has to be inside the tagged
 * commit.
 *
 * So the tag publishes unpaired, and the pair is recorded afterwards, attached
 * to the *same* Core commit:
 *
 * ```text
 * pair/v0.2.0-rc.0  ->  commit whose release-pairing/v0.2.0-rc.0.json reads
 *                       { coreCommit: <the bootstrap tag's target>,
 *                         uiCommit:   <the UI candidate>,
 *                         bootstrapTag: "v0.2.0-rc.0" }
 * ```
 *
 * The Core release tag never moves. The pair tag adds a fact about it, and the
 * fact is immutable for the same reason the release tag is: a protected tag
 * namespace, no bypass actors.
 *
 * ## What this module refuses
 *
 * Everything that would make the pair unfalsifiable rather than verified:
 * a core commit that is not the tag's target, a UI commit that moved, a
 * version that disagrees with either side, a bootstrap tag that does not
 * exist, a `verifiedAt` in the future, and — the subtle one — an attestation
 * that names a *paired* release, because that release already carries its pair
 * inside the tagged commit and a second, later claim about it could only be a
 * contradiction.
 */
import fs from 'node:fs'
import path from 'node:path'

export const PAIR_ATTESTATION_SCHEMA = 'zeus.pair-attestation/v1'

/** Where a pair attestation lives inside the Core repository. */
export const PAIR_ATTESTATION_DIRECTORY = 'release-pairing/attestations'

/**
 * The tag namespace that carries attestations.
 *
 * Deliberately not `v*`: a tag matching `v*` triggers `release.yml`, and
 * creating the pair record must never publish npm a second time. Verified
 * against the live ruleset on 2026-11-17 — `refs/tags/v*` does not match
 * `refs/tags/pair/v0.2.0-rc.0`, because the wildcard does not cross `/`.
 */
export const PAIR_TAG_PREFIX = 'pair/'

const FULL_SHA = /^[0-9a-f]{40}$/i
const SEMVER = /^\d+\.\d+\.\d+(?:-(?:alpha|beta|rc)\.\d+)?$/
const ISO_UTC = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/

export interface PairAttestation {
  readonly schema: typeof PAIR_ATTESTATION_SCHEMA
  /** The release tag this pair belongs to, e.g. `v0.2.0-rc.0`. */
  readonly releaseTag: string
  /**
   * The commit the release tag resolves to.
   *
   * This is the field that ties the attestation to an immutable artifact: a
   * pair that names any other commit describes a Core tree that was never
   * published under this version.
   */
  readonly coreCommit: string
  readonly coreVersion: string
  /** The UI candidate this Core release was verified against. */
  readonly uiCommit: string
  readonly uiVersion: string
  /**
   * Whether the release tag was published as a bootstrap (unpaired) release.
   *
   * Recorded so an auditor can tell "this pair was attached after a bootstrap
   * publication" from "this pair was inside the tagged commit all along". The
   * two are not equally strong and must not read the same.
   */
  readonly bootstrap: boolean
  readonly verifiedAt: string
}

export interface AttestationProblem {
  readonly file: string
  readonly message: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** The file a version's attestation lives in. */
export function attestationFile(version: string): string {
  return `${PAIR_ATTESTATION_DIRECTORY}/v${version}.json`
}

/** The tag a version's attestation is published under. */
export function attestationTag(version: string): string {
  return `${PAIR_TAG_PREFIX}v${version}`
}

/**
 * Validates one attestation against the release it claims to describe.
 *
 * `expected` supplies the facts the caller has already established from Git and
 * the registry. Nothing here trusts the file for them.
 */
export interface AttestationExpectation {
  readonly version: string
  /** The commit `v<version>` resolves to, read from the remote. */
  readonly releaseTagCommit?: string
  /** The UI commit the release is about to publish from. */
  readonly uiCommit?: string
}

export function validatePairAttestation(
  value: unknown,
  file: string,
  expected: AttestationExpectation,
): AttestationProblem[] {
  const problems: AttestationProblem[] = []
  const push = (message: string): void => {
    problems.push({ file, message })
  }

  if (!isRecord(value)) {
    push('not a JSON object')
    return problems
  }

  if (value.schema !== PAIR_ATTESTATION_SCHEMA) {
    push(`schema must be ${PAIR_ATTESTATION_SCHEMA}`)
  }

  const expectedFile = attestationFile(expected.version)
  if (path.basename(file) !== path.basename(expectedFile)) {
    push(
      `file name must be ${path.basename(expectedFile)} so the release finds it by version`,
    )
  }

  if (typeof value.releaseTag !== 'string') {
    push('releaseTag must be a string')
  } else if (value.releaseTag !== `v${expected.version}`) {
    push(
      `releaseTag ${value.releaseTag} does not name this release (v${expected.version})`,
    )
  }

  for (const field of ['coreCommit', 'uiCommit'] as const) {
    const raw = value[field]
    if (typeof raw !== 'string' || !FULL_SHA.test(raw)) {
      push(`${field} must be a full 40-character SHA, not a branch or tag`)
    }
  }

  for (const field of ['coreVersion', 'uiVersion'] as const) {
    const raw = value[field]
    if (typeof raw !== 'string' || !SEMVER.test(raw)) {
      push(`${field} must be a version this policy releases`)
    } else if (raw !== expected.version) {
      push(
        `${field} ${raw} does not equal the release version ${expected.version}`,
      )
    }
  }

  if (typeof value.bootstrap !== 'boolean') {
    push(
      'bootstrap must be a boolean; it says whether the release tag published unpaired',
    )
  }

  if (typeof value.verifiedAt !== 'string' || !ISO_UTC.test(value.verifiedAt)) {
    push('verifiedAt must be an ISO-8601 UTC timestamp')
  } else if (Date.parse(value.verifiedAt) > Date.now() + 5 * 60_000) {
    /*
     * A timestamp from the future cannot be ordered against other claims about
     * the same version, which is the only thing it is for.
     */
    push('verifiedAt must not be in the future')
  }

  /*
   * The two comparisons that make this a *pair* rather than a statement.
   *
   * Both sides are supplied by the caller from Git, never from the file under
   * test: a record that agrees only with itself proves nothing.
   */
  if (
    expected.releaseTagCommit !== undefined &&
    typeof value.coreCommit === 'string' &&
    value.coreCommit.toLowerCase() !== expected.releaseTagCommit.toLowerCase()
  ) {
    push(
      `coreCommit ${value.coreCommit} is not the commit v${expected.version} points at (${expected.releaseTagCommit}); this attestation describes a Core tree that was never published under this version`,
    )
  }

  if (
    expected.uiCommit !== undefined &&
    typeof value.uiCommit === 'string' &&
    value.uiCommit.toLowerCase() !== expected.uiCommit.toLowerCase()
  ) {
    push(
      `uiCommit ${value.uiCommit} is not the commit being released (${expected.uiCommit})`,
    )
  }

  return problems
}

/** Reads every attestation in a directory, newest claim per version last. */
export interface StoredAttestation {
  readonly file: string
  readonly attestation: PairAttestation
}

export function readAttestationDirectory(
  directory: string,
): StoredAttestation[] {
  if (!fs.existsSync(directory)) return []
  const out: StoredAttestation[] = []
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const file = path.join(directory, entry.name)
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
      if (!isRecord(parsed)) continue
      out.push({
        /*
         * Relative to the attestation directory's parent, not to the process
         * working directory. `process.cwd()` differs between the CLI (repo
         * root) and the checks (also repo root, but not necessarily), and a
         * path that changes with the caller makes two reports of the same
         * file look like two files.
         */
        file: path.posix.join(PAIR_ATTESTATION_DIRECTORY, path.basename(file)),
        attestation: parsed as unknown as PairAttestation,
      })
    } catch {
      /* A malformed file is reported by validatePairAttestation when addressed. */
    }
  }
  return out
}

/**
 * Whether two attestations for the same version contradict each other.
 *
 * A version may only be paired once. A second attestation that names a
 * different UI commit would let one Core release claim two UI trees, and a
 * reader has no way to choose between them — so it is a refusal, not a
 * last-writer-wins.
 */
export function findConflictingAttestations(
  attestations: readonly StoredAttestation[],
  version: string,
): string[] {
  const forVersion = attestations.filter(
    entry => entry.attestation.releaseTag === `v${version}`,
  )
  if (forVersion.length <= 1) return []
  const distinct = new Set(
    forVersion.map(entry => entry.attestation.uiCommit?.toLowerCase()),
  )
  if (distinct.size <= 1) {
    return forVersion
      .slice(1)
      .map(entry => `${entry.file}: duplicate attestation for v${version}`)
  }
  return forVersion.map(
    entry =>
      `${entry.file}: conflicting attestation for v${version}; this version already names a different UI commit`,
  )
}
