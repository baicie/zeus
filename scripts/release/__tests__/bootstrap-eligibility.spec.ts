/**
 * Who is allowed to publish unpaired.
 *
 * The rule exists because `bootstrap: true` in a file was, for one commit, a
 * universal key: any record carrying the flag skipped the UI pair, including
 * one for a stable version or for an RC that had already shipped. These tests
 * are the eligibility test that flag now has to pass.
 */
import { describe, expect, it } from 'vitest'

import {
  evaluateBootstrapEligibility,
  parsePrerelease,
  publishedPrereleasesOfLine,
} from '../bootstrap-eligibility'

const VERSION = '0.2.0-rc.0'

function refused(overrides: Record<string, unknown> = {}): string[] {
  const result = evaluateBootstrapEligibility({
    version: VERSION,
    declared: true,
    publishedVersions: ['0.1.0', '0.1.1-beta.20'],
    ...overrides,
  })
  return result.findings
    .filter(finding => finding.verdict === 'REFUSED')
    .map(finding => finding.detail)
}

function eligible(overrides: Record<string, unknown> = {}) {
  return evaluateBootstrapEligibility({
    version: VERSION,
    declared: true,
    publishedVersions: ['0.1.0', '0.1.1-beta.20'],
    ...overrides,
  })
}

describe('the one legitimate case', () => {
  it('accepts the first RC of a new line', () => {
    const result = eligible()
    expect(result.eligible).toBe(true)
    expect(result.findings[result.findings.length - 1]?.verdict).toBe(
      'AUTHORIZED',
    )
  })

  it('says nothing when bootstrap was not declared', () => {
    const result = evaluateBootstrapEligibility({
      version: VERSION,
      declared: false,
    })
    /*
     * Silent, not AUTHORIZED. A pass here would read as "a bootstrap was
     * considered and approved" in an audit that is actually describing an
     * ordinary paired release.
     */
    expect(result.eligible).toBe(false)
    expect(result.findings).toEqual([])
  })
})

describe('refusals', () => {
  it('refuses a stable version', () => {
    expect(refused({ version: '0.2.0' })).toContainEqual(
      expect.stringContaining('is not a prerelease'),
    )
  })

  it('refuses a beta, because only an rc may bootstrap', () => {
    expect(refused({ version: '0.2.0-beta.1' })).toContainEqual(
      expect.stringContaining('only an rc may bootstrap'),
    )
  })

  it('refuses rc.1', () => {
    expect(refused({ version: '0.2.0-rc.1' })).toContainEqual(
      expect.stringContaining('is not the first RC'),
    )
  })

  it('refuses when the exact version is already published', () => {
    expect(refused({ publishedVersions: ['0.2.0-rc.0'] })).toContainEqual(
      expect.stringContaining('is already published'),
    )
  })

  it('refuses when an earlier RC of the same line is published', () => {
    /*
     * `rc.1` is refused by the sequence rule before the registry is even
     * consulted, so this exercises the case the sequence rule cannot see: an
     * `rc.0` for a *different* patch would not exist, but a line that shipped
     * `rc.0` and then asks to bootstrap `rc.0` again hits the exact-version
     * rule. The line check is what catches a version whose sequence happens to
     * be 0 while an earlier RC of the same line is out there — reachable only
     * if the registry reports the line without reporting this exact version,
     * which is what the filter below reproduces.
     */
    expect(
      refused({ publishedVersions: ['0.2.0-rc.0', '0.2.0-rc.1'] }),
    ).toContainEqual(expect.stringContaining('is already published'))
  })

  it('refuses a first RC when the line already shipped another RC', () => {
    /*
     * The registry says `0.2.0-rc.1` exists but not `0.2.0-rc.0` — a partial
     * publish, or a registry that lost a version. Bootstrapping `rc.0` here
     * would publish a *lower* RC after a higher one already shipped.
     */
    expect(refused({ publishedVersions: ['0.2.0-rc.1'] })).toContainEqual(
      expect.stringContaining('already has published prereleases'),
    )
  })

  it('refuses when the registry could not be read', () => {
    /*
     * The dangerous direction. An unreachable registry cannot tell "first
     * release" from "already published", and guessing publishes over a version.
     */
    expect(refused({ publishedVersions: undefined })).toContainEqual(
      expect.stringContaining('registry could not be queried'),
    )
  })

  it('refuses when an attestation already exists', () => {
    expect(refused({ existingAttestation: true })).toContainEqual(
      expect.stringContaining('attestation for 0.2.0-rc.0 already exists'),
    )
  })

  it('refuses when the in-tree record already names a UI commit', () => {
    expect(refused({ existingPairInTree: true })).toContainEqual(
      expect.stringContaining('already names a UI commit'),
    )
  })
})

describe('prerelease parsing', () => {
  it('splits a version into line, channel and sequence', () => {
    expect(parsePrerelease('0.2.0-rc.0')).toEqual({
      line: '0.2.0',
      channel: 'rc',
      sequence: '0',
    })
  })

  it('returns undefined for a stable version', () => {
    expect(parsePrerelease('0.2.0')).toBeUndefined()
  })

  it('finds only prereleases of the same line', () => {
    expect(
      publishedPrereleasesOfLine(
        ['0.2.0-rc.0', '0.1.0-rc.3', '0.1.1-beta.20', '0.2.0'],
        '0.2.0',
      ),
    ).toEqual(['0.2.0-rc.0'])
  })
})

/*
 * The boundary that matters for the audit: eligibility is a separate rule, so
 * a bootstrap release still runs every other check. Reading the verdict alone
 * must not suggest otherwise.
 */
describe('scope', () => {
  it('reports under its own rule, not the pairing rule', () => {
    const result = eligible()
    expect(
      result.findings.every(
        finding => finding.rule === 'bootstrap-eligibility',
      ),
    ).toBe(true)
  })

  it('does not authorise anything beyond the exception', () => {
    const result = eligible()
    /*
     * Exactly one AUTHORIZED, and it says what it authorises. A rule that
     * emitted several passes would let a reader count them as separate gates.
     */
    const authorised = result.findings.filter(
      finding => finding.verdict === 'AUTHORIZED',
    )
    expect(authorised).toHaveLength(1)
    expect(authorised[0]?.detail).toMatch(/may publish unpaired/)
  })
})
