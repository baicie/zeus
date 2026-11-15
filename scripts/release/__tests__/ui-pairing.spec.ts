/**
 * Four UI commits, four different facts.
 *
 * The build-info used to carry one `uiCommit`, filled from `ZEUS_UI_COMMIT`,
 * and readers took it as the source of the installed packages. It is not. On
 * this repository the three values are:
 *
 *   approved (ZEUS_UI_COMMIT)  ffde5592  — a declaration, verifiable by nothing
 *   package source             a8826dd1  — beta.34, from SLSA
 *   UI main                    89fc93ca  — 29 commits past beta.34
 *
 * and `ffde5592` is 14 commits *newer* than `a8826dd1`, so it is not an older
 * name for the same commit either.
 */
import { describe, expect, it } from 'vitest'

import {
  UI_PAIRING_SCHEMA,
  validatePairingRecord,
  type UiPairingRecord,
} from '../ui-pairing'

const APPROVED = 'ffde55920fe9beab52dfe67bdca6d2e4023f28df'
const PACKAGE_SOURCE = 'a8826dd1f81560aaf6459d8d40a3e599f705f6e0'
const VENDORED = '74662b614e209e38a7b2b4557aa28df01141be25'

function record(overrides: Partial<UiPairingRecord> = {}): UiPairingRecord {
  return {
    schema: UI_PAIRING_SCHEMA,
    approvedUiCommit: APPROVED,
    actualPackageSourceCommit: PACKAGE_SOURCE,
    vendoredSourceCommit: VENDORED,
    expectedCoreVersion: '0.1.1-beta.20',
    expectedUiVersion: '0.1.0-beta.34',
    packageIntegrity: { '@zeus-web/button': 'sha512-abc=' },
    attestationVerified: true,
    ...overrides,
  }
}

const expected = {
  coreVersion: '0.1.1-beta.20',
  packages: ['@zeus-web/button'],
}

describe('validatePairingRecord', () => {
  it('accepts a record that keeps the four commits apart', () => {
    expect(validatePairingRecord(record(), expected)).toEqual([])
  })

  /*
   * The failure that matters. A record where the package source equals the
   * approved commit is claiming packages were built from a commit nothing was
   * built from — and it is the shape a careless generator produces, because
   * both fields get filled from `ZEUS_UI_COMMIT`.
   */
  it('rejects the approved commit presented as the package source', () => {
    const problems = validatePairingRecord(
      record({ actualPackageSourceCommit: APPROVED }),
      expected,
    )
    expect(problems.map(problem => problem.message).join('\n')).toMatch(
      /the approved commit must not be presented as the package source/,
    )
  })

  it('rejects a verified attestation with no source commit', () => {
    const problems = validatePairingRecord(
      record({
        actualPackageSourceCommit: 'UNVERIFIED',
        attestationVerified: true,
      }),
      expected,
    )
    expect(problems.map(problem => problem.message).join('\n')).toMatch(
      /names no package source commit/,
    )
  })

  it('rejects a verified attestation that binds no integrity', () => {
    const problems = validatePairingRecord(
      record({ packageIntegrity: {} }),
      expected,
    )
    const messages = problems.map(problem => problem.message).join('\n')
    expect(messages).toMatch(/binds no package integrity/)
    expect(messages).toMatch(/no integrity recorded for @zeus-web\/button/)
  })

  it('rejects a non-SHA approved commit', () => {
    const problems = validatePairingRecord(
      record({ approvedUiCommit: 'main' }),
      expected,
    )
    expect(problems.map(problem => problem.message).join('\n')).toMatch(
      /is not a 40-character SHA/,
    )
  })

  it('rejects a Core version that is not this repository', () => {
    const problems = validatePairingRecord(
      record({ expectedCoreVersion: '0.2.0-rc.0' }),
      expected,
    )
    expect(problems.map(problem => problem.message).join('\n')).toMatch(
      /record expects Core 0\.2\.0-rc\.0, this repository is 0\.1\.1-beta\.20/,
    )
  })

  it('accepts UNVERIFIED as a package source when nothing was verified', () => {
    const problems = validatePairingRecord(
      record({
        actualPackageSourceCommit: 'UNVERIFIED',
        attestationVerified: false,
      }),
      expected,
    )
    expect(problems).toEqual([])
  })
})
