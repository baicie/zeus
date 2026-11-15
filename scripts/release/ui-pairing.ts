/**
 * The four UI commits this repository can name, kept apart.
 *
 * They are not interchangeable, and treating them as one is what produced a
 * build-info that recorded a commit no package was built from:
 *
 *   approvedUiCommit          the UI commit a release is approved against
 *   actualPackageSourceCommit the commit the installed packages were built from
 *   vendoredSourceCommit      the commit `vendor/zeus-web-dialog` was built from
 *   uiMainHead                whatever the UI repository's main points at now
 *
 * `ZEUS_UI_COMMIT` names the first. The build-info used to copy it into a
 * single `uiCommit` field, which readers then took as "the source of these
 * packages" — a different claim, and false. Measured on this repository:
 *
 *   approvedUiCommit (ZEUS_UI_COMMIT)   ffde5592  (2026-11-09)
 *   actualPackageSourceCommit           a8826dd1  (beta.34, from SLSA)
 *   uiMainHead                          89fc93ca  (29 commits past beta.34)
 *
 * `ffde5592` is 14 commits *newer* than `a8826dd1`, so it is not even an older
 * name for the same thing — it is a commit no published package was built from.
 *
 * The record below makes that visible instead of leaving a reader to infer it,
 * and `validatePairingRecord` refuses a record whose declared commit is being
 * passed off as the package source.
 */
export const UI_PAIRING_SCHEMA = 'zeus.ui-pairing/v1'

export interface UiPairingRecord {
  readonly schema: typeof UI_PAIRING_SCHEMA
  /**
   * The commit the release is approved against — what `ZEUS_UI_COMMIT` names.
   * This is a *declaration*, and nothing in this repository can verify it: no
   * published package was built from it, and no checkout here contains it.
   */
  readonly approvedUiCommit: string
  /**
   * The commit the installed `@zeus-web/*` packages were built from, read from
   * their SLSA attestations. `UNVERIFIED` when no attestation was read.
   */
  readonly actualPackageSourceCommit: string
  /** The commit `vendor/zeus-web-dialog` was built from, per its provenance. */
  readonly vendoredSourceCommit: string
  /** The Core version these UI packages are expected to pair with. */
  readonly expectedCoreVersion: string
  /** The UI version of the installed packages. */
  readonly expectedUiVersion: string
  /** `name@version` → the integrity the lockfile resolves. */
  readonly packageIntegrity: Readonly<Record<string, string>>
  /** Whether an attestation was verified for `actualPackageSourceCommit`. */
  readonly attestationVerified: boolean
}

export interface PairingProblem {
  readonly field: keyof UiPairingRecord | 'record'
  readonly message: string
}

/**
 * Whether a value is a commit this repository can name.
 *
 * `UNVERIFIED` is a legitimate value for the two source commits — it records
 * that this run read nothing — but not for the approved commit, which is
 * supplied by configuration and must be a real SHA.
 */
function isCommit(value: string): boolean {
  return /^[0-9a-f]{40}$/.test(value)
}

/**
 * Checks a pairing record for the confusions the schema exists to prevent.
 *
 * The failures worth naming are not "a field is missing" — they are claims
 * that read as true and are not:
 *
 * - the declared commit used as the package source;
 * - a package source marked verified when no attestation backed it;
 * - an integrity map that does not cover the packages the record names;
 * - a Core version that is not the one this repository is.
 */
export function validatePairingRecord(
  record: UiPairingRecord,
  expected: {
    readonly coreVersion: string
    readonly packages: readonly string[]
  },
): readonly PairingProblem[] {
  const problems: PairingProblem[] = []

  if (!isCommit(record.approvedUiCommit)) {
    problems.push({
      field: 'approvedUiCommit',
      message: `approved commit ${record.approvedUiCommit} is not a 40-character SHA`,
    })
  }
  if (
    record.actualPackageSourceCommit !== 'UNVERIFIED' &&
    !isCommit(record.actualPackageSourceCommit)
  ) {
    problems.push({
      field: 'actualPackageSourceCommit',
      message: `package source ${record.actualPackageSourceCommit} is neither a SHA nor UNVERIFIED`,
    })
  }
  if (!isCommit(record.vendoredSourceCommit)) {
    problems.push({
      field: 'vendoredSourceCommit',
      message: `vendored commit ${record.vendoredSourceCommit} is not a 40-character SHA`,
    })
  }

  /*
   * The defect this whole module exists for. A record whose "package source"
   * equals the approved commit is claiming the packages were built from a
   * commit nothing was built from — and that claim is exactly what a reader
   * wants to be true.
   */
  if (
    record.actualPackageSourceCommit !== 'UNVERIFIED' &&
    record.actualPackageSourceCommit === record.approvedUiCommit
  ) {
    problems.push({
      field: 'actualPackageSourceCommit',
      message: `package source equals the approved commit ${record.approvedUiCommit}; the approved commit must not be presented as the package source`,
    })
  }

  if (record.attestationVerified) {
    if (record.actualPackageSourceCommit === 'UNVERIFIED') {
      problems.push({
        field: 'attestationVerified',
        message:
          'the record claims a verified attestation but names no package source commit',
      })
    }
    if (Object.keys(record.packageIntegrity).length === 0) {
      problems.push({
        field: 'attestationVerified',
        message:
          'the record claims a verified attestation but binds no package integrity',
      })
    }
  }

  for (const name of expected.packages) {
    if (!(name in record.packageIntegrity)) {
      problems.push({
        field: 'packageIntegrity',
        message: `no integrity recorded for ${name}`,
      })
    }
  }

  if (record.expectedCoreVersion !== expected.coreVersion) {
    problems.push({
      field: 'expectedCoreVersion',
      message: `record expects Core ${record.expectedCoreVersion}, this repository is ${expected.coreVersion}`,
    })
  }

  return problems
}
