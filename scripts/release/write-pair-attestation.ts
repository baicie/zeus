/**
 * Records the pair for a release that published unpaired.
 *
 * ## When this runs
 *
 * After the UI candidate exists and the Core packages are on the registry.
 * It writes `release-pairing/attestations/v<version>.json` and prints the
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
 *   [--out release-pairing/attestations/v0.2.0-rc.0.json]
 * ```
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import {
  PAIR_ATTESTATION_SCHEMA,
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

/** Reads the bootstrap record inside the release tag's tree. */
export function readTaggedRecord(
  version: string,
  repository = 'baicie/zeus',
): { bootstrap: boolean; uiCommit: string | null } | undefined {
  const gh = (args: string[]): string =>
    execFileSync('gh', args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 30_000,
    }) as string
  try {
    const raw = gh([
      'api',
      `repos/${repository}/contents/release-pairing/v${version}.json?ref=v${version}`,
      '-H',
      'Accept: application/vnd.github.raw',
    ])
    const parsed = JSON.parse(raw) as {
      bootstrap?: unknown
      uiCommit?: unknown
    }
    return {
      bootstrap: parsed.bootstrap === true,
      uiCommit: typeof parsed.uiCommit === 'string' ? parsed.uiCommit : null,
    }
  } catch {
    return undefined
  }
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
      `  the tree at v${version} has no release-pairing/v${version}.json; there is nothing to pair`,
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

  const writeRoot = values.out
    ? path.dirname(path.dirname(path.resolve(values.out)))
    : values.root
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
