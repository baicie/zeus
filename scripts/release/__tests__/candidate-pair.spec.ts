/**
 * A release touches two repositories and five distinct commits, and they are
 * not interchangeable.
 *
 * Measured on this repository:
 *
 *   approved (ZEUS_UI_COMMIT)   ffde5592   a declaration
 *   package source              a8826dd1   beta.34, from SLSA
 *   UI main                     89fc93ca   29 commits past beta.34
 *
 * `ffde5592` is 14 commits *newer* than `a8826dd1` — not an older name for the
 * same commit, but a commit no published package was built from. The single
 * `uiCommit` field in build-info conflated them, and readers took the
 * declaration for the source.
 */
import { describe, expect, it } from 'vitest'

import {
  CANDIDATE_PAIR_SCHEMA,
  candidatePairId,
  validateCandidatePair,
  type CandidatePair,
} from '../candidate-pair'

const CORE = '1'.repeat(40)
const UI = '2'.repeat(40)
const APPROVED = 'ffde55920fe9beab52dfe67bdca6d2e4023f28df'
const PACKAGE_SOURCE = 'a8826dd1f81560aaf6459d8d40a3e599f705f6e0'
const VENDORED = '74662b614e209e38a7b2b4557aa28df01141be25'
const UI_MAIN = '89fc93cac5b97f29f48deb64964886476c5d7aac'

function pair(overrides: Partial<CandidatePair> = {}): CandidatePair {
  return {
    schema: CANDIDATE_PAIR_SCHEMA,
    candidateId: candidatePairId(CORE, UI),
    coreCandidate: {
      value: CORE,
      provenance: 'observed',
      source: 'git rev-parse HEAD',
    },
    uiCandidate: {
      value: UI,
      provenance: 'observed',
      source: 'git rev-parse HEAD',
    },
    approvedUiCommit: {
      value: APPROVED,
      provenance: 'approved',
      source: 'ZEUS_UI_COMMIT',
    },
    actualPackageSourceCommit: {
      value: PACKAGE_SOURCE,
      provenance: 'observed',
      source: 'SLSA attestation for @zeus-web/*@0.1.0-beta.34',
    },
    vendoredSourceCommit: {
      value: VENDORED,
      provenance: 'observed',
      source: 'vendor/zeus-web-dialog/provenance.json',
    },
    uiMainHead: {
      value: UI_MAIN,
      provenance: 'observed',
      source: 'UI repository main',
    },
    expectedCoreVersion: '0.1.1-beta.20',
    expectedUiVersion: '0.1.0-beta.34',
    packageIntegrity: { '@zeus-web/button': 'sha512-abc=' },
    attestationVerified: true,
    generatedAt: '2026-11-15T12:00:00.000Z',
    ...overrides,
  }
}

const expected = {
  coreVersion: '0.1.1-beta.20',
  packages: ['@zeus-web/button'],
}

describe('a pair that keeps the commits apart', () => {
  it('validates', () => {
    expect(validateCandidatePair(pair(), expected)).toEqual([])
  })
})

describe('the confusion this exists to prevent', () => {
  it('rejects the approved commit presented as the package source', () => {
    const problems = validateCandidatePair(
      pair({
        actualPackageSourceCommit: {
          value: APPROVED,
          provenance: 'observed',
          source: 'SLSA attestation',
        },
      }),
      expected,
    )
    expect(problems.map(p => p.message).join('\n')).toMatch(
      /the approved commit must not be presented as the package source/,
    )
  })

  it('rejects a candidate commit marked as approved rather than observed', () => {
    const problems = validateCandidatePair(
      pair({
        coreCandidate: { value: CORE, provenance: 'approved', source: 'main' },
      }),
      expected,
    )
    expect(problems.map(p => p.message).join('\n')).toMatch(
      /is the commit being cut and must be observed, not approved/,
    )
  })
})

describe('immutability', () => {
  /*
   * The id is derived from the two candidate commits, so an edited pair does
   * not reproduce its own id. That is what makes "written once per candidate"
   * checkable rather than a convention.
   */
  it('rejects a pair whose id does not match its commits', () => {
    const problems = validateCandidatePair(
      pair({
        uiCandidate: {
          value: '3'.repeat(40),
          provenance: 'observed',
          source: 'git',
        },
      }),
      expected,
    )
    expect(problems.map(p => p.message).join('\n')).toMatch(
      /does not match the commits it names/,
    )
  })

  it('derives a stable id from the same two commits', () => {
    expect(candidatePairId(CORE, UI)).toBe(candidatePairId(CORE, UI))
    expect(candidatePairId(CORE, UI)).not.toBe(candidatePairId(UI, CORE))
  })
})

describe('structure', () => {
  it('rejects a non-object', () => {
    expect(validateCandidatePair(null, expected).length).toBeGreaterThan(0)
  })

  it('rejects a wrong schema', () => {
    const problems = validateCandidatePair(
      { ...pair(), schema: 'zeus.candidate-pair/v0' },
      expected,
    )
    expect(problems.map(p => p.message).join('\n')).toMatch(/schema must be/)
  })

  it('rejects a value without provenance', () => {
    const problems = validateCandidatePair(
      {
        ...pair(),
        appliedUiCommit: undefined,
        approvedUiCommit: { value: APPROVED },
      },
      expected,
    )
    expect(problems.map(p => p.message).join('\n')).toMatch(
      /must carry value, provenance and source/,
    )
  })

  it('rejects a non-SHA commit', () => {
    const problems = validateCandidatePair(
      pair({
        coreCandidate: { value: 'main', provenance: 'observed', source: 'git' },
      }),
      expected,
    )
    expect(problems.map(p => p.message).join('\n')).toMatch(
      /is not a 40-character SHA/,
    )
  })
})

describe('attestation and integrity', () => {
  it('rejects a verified attestation with no source commit', () => {
    const problems = validateCandidatePair(
      pair({
        actualPackageSourceCommit: {
          value: 'UNVERIFIED',
          provenance: 'observed',
          source: 'not read',
        },
      }),
      expected,
    )
    expect(problems.map(p => p.message).join('\n')).toMatch(
      /names no package source commit/,
    )
  })

  it('rejects a verified attestation that binds no integrity', () => {
    const problems = validateCandidatePair(
      pair({ packageIntegrity: {} }),
      expected,
    )
    const messages = problems.map(p => p.message).join('\n')
    expect(messages).toMatch(/binds no package integrity/)
    expect(messages).toMatch(/no integrity recorded for @zeus-web\/button/)
  })

  it('accepts UNVERIFIED when nothing was verified', () => {
    const problems = validateCandidatePair(
      pair({
        actualPackageSourceCommit: {
          value: 'UNVERIFIED',
          provenance: 'observed',
          source: 'not read',
        },
        attestationVerified: false,
      }),
      expected,
    )
    expect(problems).toEqual([])
  })
})

describe('version', () => {
  it('rejects a Core version that is not this repository', () => {
    const problems = validateCandidatePair(
      pair({ expectedCoreVersion: '0.2.0-rc.0' }),
      expected,
    )
    expect(problems.map(p => p.message).join('\n')).toMatch(
      /pair expects Core 0\.2\.0-rc\.0, this repository is 0\.1\.1-beta\.20/,
    )
  })
})
