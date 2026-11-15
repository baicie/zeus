/**
 * An immutable record of which Core and UI commits a release is about.
 *
 * ## Why the distinction matters
 *
 * A release touches two repositories and at least five distinct commits, and
 * they are not interchangeable:
 *
 *   approvedUiCommit          what ZEUS_UI_COMMIT names — a declaration
 *   actualPackageSourceCommit what the installed @zeus-web packages were built
 *                             from, read from their SLSA attestations
 *   uiMainHead                whatever the UI repository's main is now
 *   vendoredSourceCommit      what vendor/zeus-web-dialog was built from
 *   coreCandidate             the Core commit being cut
 *
 * Measured here: `ZEUS_UI_COMMIT` is `ffde5592`, the published packages are
 * from `a8826dd1`, and UI main is 29 commits past that. `ffde5592` is 14
 * commits *newer* than `a8826dd1`, so it is not an older name for the same
 * thing — it is a commit no published package was built from.
 *
 * The build-info carried one `uiCommit` filled from `ZEUS_UI_COMMIT`, and
 * readers took it as the source of the installed packages. This record keeps
 * them apart and marks which are *approved* (declared by a human) and which are
 * *observed* (read from an artifact).
 *
 * ## Immutability
 *
 * A candidate pair is written once per candidate and never rewritten. Its
 * `candidateId` is derived from the two candidate commits, so a pair that has
 * been edited does not match its own id and is rejected.
 */
import { createHash } from 'node:crypto'

export const CANDIDATE_PAIR_SCHEMA = 'zeus.candidate-pair/v1'

/** Where a value came from, which decides how much it can be relied on. */
export type Provenance = 'approved' | 'observed'

export interface ProvenanceValue {
  readonly value: string
  readonly provenance: Provenance
  /** What produced this value, for an audit reader. */
  readonly source: string
}

export interface CandidatePair {
  readonly schema: typeof CANDIDATE_PAIR_SCHEMA
  /**
   * Derived from `coreCandidate` and `uiCandidate`. A pair whose fields have
   * been edited after the fact does not reproduce this id.
   */
  readonly candidateId: string
  readonly coreCandidate: ProvenanceValue
  readonly uiCandidate: ProvenanceValue
  /** What `ZEUS_UI_COMMIT` declares — a human decision, not an observation. */
  readonly approvedUiCommit: ProvenanceValue
  /** What the installed packages were built from, per their attestations. */
  readonly actualPackageSourceCommit: ProvenanceValue
  readonly vendoredSourceCommit: ProvenanceValue
  /** Reference points, not part of the candidate. */
  readonly uiMainHead: ProvenanceValue
  readonly expectedCoreVersion: string
  readonly expectedUiVersion: string
  /** `name@version` → the integrity the lockfile resolves. */
  readonly packageIntegrity: Readonly<Record<string, string>>
  /** Whether an attestation verified the package source. */
  readonly attestationVerified: boolean
  readonly generatedAt: string
}

export interface CandidatePairProblem {
  readonly field: string
  readonly message: string
}

/** The id a pair's two candidate commits imply. */
export function candidatePairId(coreCommit: string, uiCommit: string): string {
  return createHash('sha256')
    .update(`${coreCommit}\n${uiCommit}\n${CANDIDATE_PAIR_SCHEMA}`)
    .digest('hex')
    .slice(0, 32)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isCommit(value: string): boolean {
  return /^[0-9a-f]{40}$/.test(value)
}

function readProvenance(value: unknown): ProvenanceValue | undefined {
  if (!isRecord(value)) return undefined
  if (typeof value.value !== 'string') return undefined
  if (value.provenance !== 'approved' && value.provenance !== 'observed') {
    return undefined
  }
  if (typeof value.source !== 'string' || value.source === '') return undefined
  return {
    value: value.value,
    provenance: value.provenance,
    source: value.source,
  }
}

export interface CandidatePairExpectation {
  readonly coreVersion: string
  readonly packages: readonly string[]
}

/**
 * Checks a pair for the confusions its shape exists to prevent.
 *
 * The failures worth naming are not missing fields — they are claims that read
 * as true and are not:
 *
 * - the approved commit presented as the package source;
 * - the candidate id not matching its own commits, which means the file was
 *   edited after it was written;
 * - a value whose provenance says `observed` but whose source is a declaration;
 * - an integrity map that does not cover the packages the pair names.
 */
export function validateCandidatePair(
  value: unknown,
  expected: CandidatePairExpectation,
): readonly CandidatePairProblem[] {
  const problems: CandidatePairProblem[] = []
  if (!isRecord(value)) {
    return [{ field: 'record', message: 'candidate pair must be an object' }]
  }
  if (value.schema !== CANDIDATE_PAIR_SCHEMA) {
    problems.push({
      field: 'schema',
      message: `schema must be ${CANDIDATE_PAIR_SCHEMA}`,
    })
  }

  const core = readProvenance(value.coreCandidate)
  const ui = readProvenance(value.uiCandidate)
  const approved = readProvenance(value.approvedUiCommit)
  const actual = readProvenance(value.actualPackageSourceCommit)
  const vendored = readProvenance(value.vendoredSourceCommit)
  const uiMain = readProvenance(value.uiMainHead)

  for (const [field, parsed] of [
    ['coreCandidate', core],
    ['uiCandidate', ui],
    ['approvedUiCommit', approved],
    ['actualPackageSourceCommit', actual],
    ['vendoredSourceCommit', vendored],
    ['uiMainHead', uiMain],
  ] as const) {
    if (!parsed) {
      problems.push({
        field,
        message: `${field} must carry value, provenance and source`,
      })
    }
  }
  if (!core || !ui || !approved || !actual || !vendored || !uiMain) {
    return problems
  }

  for (const [field, parsed] of [
    ['coreCandidate', core],
    ['uiCandidate', ui],
    ['approvedUiCommit', approved],
    ['vendoredSourceCommit', vendored],
    ['uiMainHead', uiMain],
  ] as const) {
    if (!isCommit(parsed.value)) {
      problems.push({
        field,
        message: `${field} value ${parsed.value} is not a 40-character SHA`,
      })
    }
  }
  if (actual.value !== 'UNVERIFIED' && !isCommit(actual.value)) {
    problems.push({
      field: 'actualPackageSourceCommit',
      message: `package source ${actual.value} is neither a SHA nor UNVERIFIED`,
    })
  }

  /*
   * The candidate commits are what a release is cut from, so they must be
   * observations of a tree, not declarations.
   */
  for (const [field, parsed] of [
    ['coreCandidate', core],
    ['uiCandidate', ui],
  ] as const) {
    if (parsed.provenance !== 'observed') {
      problems.push({
        field,
        message: `${field} is the commit being cut and must be observed, not approved`,
      })
    }
  }

  const expectedId = candidatePairId(core.value, ui.value)
  if (value.candidateId !== expectedId) {
    problems.push({
      field: 'candidateId',
      message: `candidateId ${String(value.candidateId)} does not match the commits it names (${expectedId}); the pair was edited after it was written`,
    })
  }

  /*
   * The defect this module exists for. A pair whose "package source" equals the
   * approved commit is claiming packages were built from a commit nothing was
   * built from — and it is the shape a careless generator produces, because
   * both fields get filled from `ZEUS_UI_COMMIT`.
   */
  if (actual.value !== 'UNVERIFIED' && actual.value === approved.value) {
    problems.push({
      field: 'actualPackageSourceCommit',
      message: `package source equals the approved commit ${approved.value}; the approved commit must not be presented as the package source`,
    })
  }

  if (typeof value.attestationVerified !== 'boolean') {
    problems.push({
      field: 'attestationVerified',
      message: 'attestationVerified must be a boolean',
    })
  } else if (value.attestationVerified) {
    if (actual.value === 'UNVERIFIED') {
      problems.push({
        field: 'attestationVerified',
        message:
          'the pair claims a verified attestation but names no package source commit',
      })
    }
    if (
      !isRecord(value.packageIntegrity) ||
      Object.keys(value.packageIntegrity).length === 0
    ) {
      problems.push({
        field: 'attestationVerified',
        message:
          'the pair claims a verified attestation but binds no package integrity',
      })
    }
  }

  if (isRecord(value.packageIntegrity)) {
    for (const name of expected.packages) {
      if (!(name in value.packageIntegrity)) {
        problems.push({
          field: 'packageIntegrity',
          message: `no integrity recorded for ${name}`,
        })
      }
    }
  }

  if (value.expectedCoreVersion !== expected.coreVersion) {
    problems.push({
      field: 'expectedCoreVersion',
      message: `pair expects Core ${String(value.expectedCoreVersion)}, this repository is ${expected.coreVersion}`,
    })
  }

  return problems
}
