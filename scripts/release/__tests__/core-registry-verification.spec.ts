/**
 * The counting rules the Core registry report is judged on.
 *
 * The report is one of the five documents a pairing amendment is accepted on,
 * and the amendment's verifier re-derives every verdict from these numbers. So
 * the interesting cases are the ones where a plausible-looking count would be
 * wrong: a package that answered but is not this version, a package whose query
 * failed, and a prerelease `latest` that is not evidence of the release.
 */
import { describe, expect, it } from 'vitest'

import {
  buildCoreRegistryReport,
  CORE_REGISTRY_REPORT_SCHEMA,
  platformPackageNames,
} from '../core-registry-verification'

import type { PackageState } from '../audit-release-group'

const VERSION = '0.2.0-rc.8'
const REGISTRY = 'https://registry.npmjs.org'

function pkg(
  overrides: Partial<PackageState> & { name: string },
): PackageState {
  return {
    published: true,
    queriedAt: '2026-11-28T00:00:00.000Z',
    query: { outcome: 'ok' },
    latest: '0.1.0',
    tags: ['rc'],
    integrity: 'sha512-abc',
    ...overrides,
  }
}

describe('the report counts what it says it counts', () => {
  it('reports the group size as checked, not the number of answers', () => {
    /*
     * `checked` is the denominator a reader compares the others against. If it
     * were the count of successful queries, a report where two packages failed
     * would show 30/30 and look complete.
     */
    const report = buildCoreRegistryReport(
      VERSION,
      REGISTRY,
      [pkg({ name: '@zeus-js/shared' })],
      32,
    )
    expect(report.checked).toBe(32)
    expect(report.exactVersion).toBe(1)
  })

  it('does not count a package that resolved to another version', () => {
    const report = buildCoreRegistryReport(
      VERSION,
      REGISTRY,
      [
        pkg({ name: '@zeus-js/shared' }),
        pkg({ name: '@zeus-js/signal', published: false }),
      ],
      2,
    )
    expect(report.exactVersion).toBe(1)
  })

  it('counts the rc tag rather than assuming it follows the version', () => {
    const report = buildCoreRegistryReport(
      VERSION,
      REGISTRY,
      [
        pkg({ name: '@zeus-js/shared' }),
        pkg({ name: '@zeus-js/signal', tags: ['beta'] }),
        pkg({ name: '@zeus-js/zeus', tags: undefined }),
      ],
      3,
    )
    expect(report.rcTag).toBe(1)
  })

  it('counts only published platform packages', () => {
    const packages = [
      pkg({ name: '@zeus-js/compiler-native-darwin-arm64' }),
      pkg({ name: '@zeus-js/compiler-native-linux-x64-gnu' }),
      pkg({
        name: '@zeus-js/compiler-native-win32-x64-msvc',
        published: false,
      }),
      pkg({ name: '@zeus-js/zeus' }),
    ]
    expect(platformPackageNames(packages)).toEqual([
      '@zeus-js/compiler-native-darwin-arm64',
      '@zeus-js/compiler-native-linux-x64-gnu',
    ])
    expect(
      buildCoreRegistryReport(VERSION, REGISTRY, packages, 4).platformBinaries,
    ).toBe(2)
  })

  it('counts a prerelease latest without treating it as the release', () => {
    const report = buildCoreRegistryReport(
      VERSION,
      REGISTRY,
      [
        pkg({ name: '@zeus-js/shared', latest: '0.1.0-beta.9' }),
        pkg({ name: '@zeus-js/signal', latest: '0.1.0' }),
      ],
      2,
    )
    expect(report.prereleaseLatestCount).toBe(1)
  })

  it('counts integrity only when the field carries a digest', () => {
    const report = buildCoreRegistryReport(
      VERSION,
      REGISTRY,
      [
        pkg({ name: '@zeus-js/shared' }),
        pkg({ name: '@zeus-js/signal', integrity: undefined }),
        pkg({ name: '@zeus-js/zeus', integrity: '' }),
      ],
      3,
    )
    expect(report.integrityRecorded).toBe(1)
  })

  it('records a provenance URL for every package in the group', () => {
    const report = buildCoreRegistryReport(
      VERSION,
      REGISTRY,
      [pkg({ name: '@zeus-js/shared' }), pkg({ name: '@zeus-js/signal' })],
      2,
    )
    expect(report.provenance).toHaveLength(2)
    /*
     * The scope slash is encoded and the `@` before the version is not;
     * encoding the whole `name@version` makes the registry 404 and every
     * package look unattested.
     */
    expect(report.provenance[0]!.url).toContain('@zeus-js%2Fshared@0.2.0-rc.8')
    expect(report.provenance[0]!.url).toContain('/-/npm/v1/attestations/')
  })

  it('names its own schema and version', () => {
    const report = buildCoreRegistryReport(VERSION, REGISTRY, [], 32)
    expect(report.schema).toBe(CORE_REGISTRY_REPORT_SCHEMA)
    expect(report.version).toBe(VERSION)
    expect(report.registry).toBe(REGISTRY)
  })
})
