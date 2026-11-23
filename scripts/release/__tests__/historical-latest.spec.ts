/**
 * The historical baseline, and the two phases that use it.
 *
 * ## What is actually being tested
 *
 * Not "does the happy path pass". The risk in this feature is the opposite
 * one: an exemption mechanism is indistinguishable from an ignore list unless
 * each of its edges is shown to refuse. So most of these cases are
 * refusals — a re-pointed tag, a fourteenth package, a forged baseline, a
 * replayed snapshot — and each asserts that the release stops.
 *
 * ## Why the fixtures build a baseline in a temp directory
 *
 * `loadHistoricalBaseline` takes a root, so these tests exercise the real
 * reader against real files rather than a stub. A test that mocked the loader
 * would prove the policy functions work on an object it also invented.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { zeusFixedPackages } from '../../release.config'
import {
  evaluateLatestPolicy,
  verdictBlocksRelease,
  type LatestTagRecord,
  type LatestTagState,
} from '../check-latest-tags'
import {
  HISTORICAL_LATEST_PATH,
  HISTORICAL_LATEST_SCHEMA,
  digestEntries,
  judgeHistorical,
  loadHistoricalBaseline,
  type HistoricalEntry,
} from '../historical-latest'
import {
  buildSnapshot,
  compareSnapshots,
  digestSnapshot,
  loadSnapshot,
  writeSnapshot,
  type LatestSnapshot,
} from '../latest-snapshot'

const scratch: string[] = []

afterEach(() => {
  for (const directory of scratch.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

function tempRoot(): string {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-historical-'))
  scratch.push(directory)
  return directory
}

/** The 13 real packages and the versions the registry actually returns. */
const NATIVE_LATEST = '0.1.1-canary.20260812.106.1.658fe407'
const ROUTER_LATEST = '0.1.1-canary.20261020.188.1.02f2975b'
const SSR_LATEST = '0.1.0-canary.20260805.97.1.fa5d9cef'

const REAL_ENTRIES: readonly HistoricalEntry[] = [
  { name: '@zeus-js/compiler-native', latest: NATIVE_LATEST },
  { name: '@zeus-js/compiler-native-darwin-arm64', latest: NATIVE_LATEST },
  { name: '@zeus-js/compiler-native-darwin-x64', latest: NATIVE_LATEST },
  { name: '@zeus-js/compiler-native-linux-arm64-gnu', latest: NATIVE_LATEST },
  { name: '@zeus-js/compiler-native-linux-x64-gnu', latest: NATIVE_LATEST },
  { name: '@zeus-js/compiler-native-linux-x64-musl', latest: NATIVE_LATEST },
  { name: '@zeus-js/compiler-native-win32-arm64-msvc', latest: NATIVE_LATEST },
  { name: '@zeus-js/compiler-native-win32-x64-msvc', latest: NATIVE_LATEST },
  { name: '@zeus-js/runtime-ssr', latest: SSR_LATEST },
  { name: '@zeus-js/router', latest: ROUTER_LATEST },
  { name: '@zeus-js/resource', latest: ROUTER_LATEST },
  { name: '@zeus-js/query', latest: ROUTER_LATEST },
  { name: '@zeus-js/testing', latest: ROUTER_LATEST },
]

const RC = '0.2.0-rc.2'

/** A record set where every package is stable except the named overrides. */
function recordsWith(
  overrides: Readonly<Record<string, LatestTagState>> = {},
  base: LatestTagState = { status: 'LATEST_STABLE', version: '0.1.0' },
): LatestTagRecord[] {
  return zeusFixedPackages.map(name => ({
    name,
    state: overrides[name] ?? base,
  }))
}

/** The registry as it actually is: the 13 historical deviations, rest stable. */
function realRegistryRecords(): LatestTagRecord[] {
  const overrides: Record<string, LatestTagState> = {}
  for (const entry of REAL_ENTRIES) {
    overrides[entry.name] = {
      status: 'LATEST_PRERELEASE',
      version: entry.latest,
    }
  }
  /*
   * The three first publications are still unpublished before the release.
   */
  for (const name of [
    '@zeus-js/i18n',
    '@zeus-js/eslint-plugin',
    '@zeus-js/playground-engine',
  ]) {
    overrides[name] = { status: 'LATEST_ABSENT' }
  }
  return recordsWith(overrides)
}

function writeBaseline(
  root: string,
  entries: readonly HistoricalEntry[],
  overrides: Record<string, unknown> = {},
): void {
  const file = path.join(root, HISTORICAL_LATEST_PATH)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(
    file,
    JSON.stringify({
      schema: HISTORICAL_LATEST_SCHEMA,
      policyVersion: 'zeus.latest-policy/v2',
      acceptedAt: '2026-11-18T00:00:00.000Z',
      approvedBy: 'maintainer:baicie',
      decisionReference: { document: 'docs/release-process.md' },
      registry: 'https://registry.npmjs.org',
      packages: entries,
      ...overrides,
    }),
  )
}

/** Load a baseline built from `entries`, returning the loaded value. */
function baselineOf(
  entries: readonly HistoricalEntry[],
  overrides: Record<string, unknown> = {},
) {
  const root = tempRoot()
  writeBaseline(root, entries, overrides)
  const loaded = loadHistoricalBaseline(root)
  expect(loaded.problems).toEqual([])
  return loaded.baseline!
}

describe('the committed baseline describes exactly the thirteen packages', () => {
  it('is the real repository file, and validates', () => {
    const root = path.resolve(import.meta.dirname, '../../..')
    const loaded = loadHistoricalBaseline(root)
    expect(loaded.problems).toEqual([])
    expect(loaded.baseline!.packages).toHaveLength(13)
    expect(loaded.baseline!.approvedBy).toBe('maintainer:baicie')
    expect(loaded.baseline!.decisionReference?.document).toBe(
      'docs/release-process.md',
    )
  })

  it('names only packages from the fixed release group', () => {
    const root = path.resolve(import.meta.dirname, '../../..')
    const { baseline } = loadHistoricalBaseline(root)
    for (const entry of baseline!.packages) {
      expect(zeusFixedPackages, entry.name).toContain(entry.name)
    }
  })

  it('records only prereleases, never a stable version', () => {
    const root = path.resolve(import.meta.dirname, '../../..')
    const { baseline } = loadHistoricalBaseline(root)
    for (const entry of baseline!.packages) {
      expect(entry.latest, entry.name).toContain('-')
    }
  })

  /*
   * The eight native packages must be the real `zeusNativePackages`, not a
   * hand-copied list that could drift from the release group.
   */
  it('covers every native platform package', () => {
    const root = path.resolve(import.meta.dirname, '../../..')
    const { baseline } = loadHistoricalBaseline(root)
    const names = baseline!.packages.map(entry => entry.name)
    for (const native of zeusFixedPackages.filter(name =>
      name.startsWith('@zeus-js/compiler-native'),
    )) {
      expect(names, native).toContain(native)
    }
  })
})

describe('baseline validation refuses a file that would widen itself', () => {
  it('refuses a baseline whose schema is wrong', () => {
    const root = tempRoot()
    writeBaseline(root, REAL_ENTRIES, { schema: 'zeus.historical-latest/v0' })
    expect(loadHistoricalBaseline(root).problems).toContainEqual(
      expect.stringContaining('schema'),
    )
  })

  it('refuses a duplicate package name', () => {
    const duplicated = [...REAL_ENTRIES, REAL_ENTRIES[0]!]
    const root = tempRoot()
    writeBaseline(root, duplicated)
    expect(loadHistoricalBaseline(root).problems).toContainEqual(
      expect.stringContaining('more than once'),
    )
  })

  it('refuses a package outside the fixed release group', () => {
    const root = tempRoot()
    writeBaseline(root, [
      ...REAL_ENTRIES,
      { name: '@zeus-js/not-in-group', latest: '0.1.0-canary.1' },
    ])
    expect(loadHistoricalBaseline(root).problems).toContainEqual(
      expect.stringContaining('not in the fixed release group'),
    )
  })

  it('refuses an entry whose recorded latest is stable', () => {
    const root = tempRoot()
    writeBaseline(root, [
      ...REAL_ENTRIES,
      { name: '@zeus-js/zeus', latest: '0.1.0' },
    ])
    expect(loadHistoricalBaseline(root).problems).toContainEqual(
      expect.stringContaining('not a prerelease'),
    )
  })

  it('refuses a baseline with no approval identity', () => {
    const root = tempRoot()
    writeBaseline(root, REAL_ENTRIES, { approvedBy: '' })
    expect(loadHistoricalBaseline(root).problems).toContainEqual(
      expect.stringContaining('approvedBy'),
    )
  })

  it('refuses a baseline with no decision reference', () => {
    const root = tempRoot()
    writeBaseline(root, REAL_ENTRIES, { decisionReference: undefined })
    expect(loadHistoricalBaseline(root).problems).toContainEqual(
      expect.stringContaining('decisionReference'),
    )
  })

  it('reports a missing baseline rather than treating it as empty approval', () => {
    const root = tempRoot()
    const loaded = loadHistoricalBaseline(root)
    expect(loaded.baseline).toBeUndefined()
    expect(loaded.problems).toContainEqual(
      expect.stringContaining('could not be read'),
    )
  })

  it('reports invalid JSON rather than throwing', () => {
    const root = tempRoot()
    const file = path.join(root, HISTORICAL_LATEST_PATH)
    fs.mkdirSync(path.dirname(file), { recursive: true })
    fs.writeFileSync(file, '{ not json')
    expect(loadHistoricalBaseline(root).problems).toContainEqual(
      expect.stringContaining('not valid JSON'),
    )
  })
})

describe('judging the baseline against the registry', () => {
  it('accepts exactly the thirteen recorded deviations', () => {
    const baseline = baselineOf(REAL_ENTRIES)
    const judged = judgeHistorical({
      baseline,
      records: realRegistryRecords(),
      releaseVersion: RC,
    })
    expect(judged.accepted).toHaveLength(13)
    expect(judged.drifted).toEqual([])
    expect(judged.unresolved).toEqual([])
  })

  it('refuses a historical package re-pointed at another canary', () => {
    const baseline = baselineOf(REAL_ENTRIES)
    const records = realRegistryRecords().map(record =>
      record.name === '@zeus-js/router'
        ? {
            name: record.name,
            state: {
              status: 'LATEST_PRERELEASE' as const,
              version: '0.1.1-canary.20261101.200.1.deadbeef',
            },
          }
        : record,
    )
    const judged = judgeHistorical({ baseline, records, releaseVersion: RC })
    expect(judged.accepted.map(m => m.name)).not.toContain('@zeus-js/router')
    expect(judged.drifted).toEqual([
      {
        name: '@zeus-js/router',
        expected: ROUTER_LATEST,
        observed: '0.1.1-canary.20261101.200.1.deadbeef',
      },
    ])
  })

  it('refuses a historical package re-pointed at a beta', () => {
    const baseline = baselineOf(REAL_ENTRIES)
    const records = realRegistryRecords().map(record =>
      record.name === '@zeus-js/query'
        ? {
            name: record.name,
            state: {
              status: 'LATEST_PRERELEASE' as const,
              version: '0.2.0-beta.1',
            },
          }
        : record,
    )
    const judged = judgeHistorical({ baseline, records, releaseVersion: RC })
    expect(judged.drifted.map(d => d.name)).toEqual(['@zeus-js/query'])
  })

  it('refuses a historical package re-pointed at this RC', () => {
    const baseline = baselineOf(REAL_ENTRIES)
    const records = realRegistryRecords().map(record =>
      record.name === '@zeus-js/resource'
        ? {
            name: record.name,
            state: { status: 'LATEST_PRERELEASE' as const, version: RC },
          }
        : record,
    )
    const judged = judgeHistorical({ baseline, records, releaseVersion: RC })
    /*
     * Not accepted as historical — the exemption is explicitly not allowed to
     * cover a deviation this release created — and not drifted either, because
     * it is the release's own version. It simply is not excused.
     */
    expect(judged.accepted.map(m => m.name)).not.toContain('@zeus-js/resource')
  })

  it('treats a package that became compliant as no longer exempt', () => {
    const baseline = baselineOf(REAL_ENTRIES)
    const records = realRegistryRecords().map(record =>
      record.name === '@zeus-js/testing'
        ? {
            name: record.name,
            state: { status: 'LATEST_STABLE' as const, version: '0.1.1' },
          }
        : record,
    )
    const judged = judgeHistorical({ baseline, records, releaseVersion: RC })
    expect(judged.accepted.map(m => m.name)).not.toContain('@zeus-js/testing')
    expect(judged.drifted).toEqual([])
  })

  it('treats an unreachable registry as unresolved, not as accepted', () => {
    const baseline = baselineOf(REAL_ENTRIES)
    const records = realRegistryRecords().map(record =>
      record.name === '@zeus-js/compiler-native'
        ? {
            name: record.name,
            state: {
              status: 'REGISTRY_QUERY_FAILED' as const,
              error: 'ETIMEDOUT',
            },
          }
        : record,
    )
    const judged = judgeHistorical({ baseline, records, releaseVersion: RC })
    expect(judged.unresolved).toEqual(['@zeus-js/compiler-native'])
    expect(judged.accepted.map(m => m.name)).not.toContain(
      '@zeus-js/compiler-native',
    )
  })

  it('ignores a baseline entry for a package the release does not query', () => {
    const baseline = baselineOf(REAL_ENTRIES)
    const judged = judgeHistorical({
      baseline,
      records: [],
      releaseVersion: RC,
    })
    expect(judged.accepted).toEqual([])
    expect(judged.drifted).toEqual([])
  })

  it('leaves a fourteenth unexpected package unexcused', () => {
    const baseline = baselineOf(REAL_ENTRIES)
    const records = realRegistryRecords().map(record =>
      record.name === '@zeus-js/zeus'
        ? {
            name: record.name,
            state: {
              status: 'LATEST_PRERELEASE' as const,
              version: '0.1.5-canary.20261118.1.1.ffffffff',
            },
          }
        : record,
    )
    const judged = judgeHistorical({ baseline, records, releaseVersion: RC })
    const policy = evaluateLatestPolicy({
      records,
      version: RC,
      approvedFirstPublish: [],
      acceptedHistorical: judged.accepted.map(m => m.name),
      phase: 'precheck',
    })
    expect(policy.refused).toEqual(['@zeus-js/zeus'])
    expect(verdictBlocksRelease(policy.verdict)).toBe(true)
  })
})

describe('the digest binds a verdict to the exemptions that produced it', () => {
  it('changes when an entry is added', () => {
    const before = digestEntries(REAL_ENTRIES)
    const after = digestEntries([
      ...REAL_ENTRIES,
      { name: '@zeus-js/zeus', latest: '0.1.0-canary.1' },
    ])
    expect(after).not.toBe(before)
  })

  it('changes when a version is re-pointed', () => {
    const before = digestEntries(REAL_ENTRIES)
    const after = digestEntries(
      REAL_ENTRIES.map(entry =>
        entry.name === '@zeus-js/router'
          ? { ...entry, latest: '0.1.1-canary.20990101.1.1.deadbeef' }
          : entry,
      ),
    )
    expect(after).not.toBe(before)
  })

  it('does not change when only prose changes', () => {
    const before = digestEntries(REAL_ENTRIES)
    const after = digestEntries(
      REAL_ENTRIES.map(entry => ({ ...entry, firstObserved: '2020-01-01' })),
    )
    expect(after).toBe(before)
  })
})

describe('precheck phase', () => {
  it('passes when every latest is stable', () => {
    const policy = evaluateLatestPolicy({
      records: recordsWith(),
      version: RC,
      approvedFirstPublish: [],
      phase: 'precheck',
    })
    expect(policy.verdict).toBe('PASS')
  })

  it('passes when every latest is absent', () => {
    const policy = evaluateLatestPolicy({
      records: recordsWith({}, { status: 'LATEST_ABSENT' }),
      version: RC,
      approvedFirstPublish: [],
      phase: 'precheck',
    })
    expect(policy.verdict).toBe('PASS')
  })

  it('accepts exactly the thirteen historical deviations', () => {
    const baseline = baselineOf(REAL_ENTRIES)
    const records = realRegistryRecords()
    const judged = judgeHistorical({ baseline, records, releaseVersion: RC })
    const policy = evaluateLatestPolicy({
      records,
      version: RC,
      approvedFirstPublish: [],
      acceptedHistorical: judged.accepted.map(m => m.name),
      phase: 'precheck',
    })
    expect(policy.verdict).toBe('ACCEPTED_HISTORICAL')
    expect(policy.acceptedHistorical).toHaveLength(13)
    expect(verdictBlocksRelease(policy.verdict)).toBe(false)
  })

  /*
   * The single most important refusal in this file. A precheck runs before
   * anything is published, so a first publication cannot have happened. If a
   * package the pairing record approved already shows `latest` at the release
   * version, something published outside this workflow.
   */
  it('refuses a first publication that already happened before publishing', () => {
    const policy = evaluateLatestPolicy({
      records: recordsWith({
        '@zeus-js/i18n': { status: 'LATEST_PRERELEASE', version: RC },
      }),
      version: RC,
      approvedFirstPublish: ['@zeus-js/i18n'],
      phase: 'precheck',
    })
    expect(policy.verdict).toBe('REFUSED')
    expect(verdictBlocksRelease(policy.verdict)).toBe(true)
  })

  it('does not treat a first-publish approval as a precheck exemption', () => {
    const policy = evaluateLatestPolicy({
      records: recordsWith({
        '@zeus-js/i18n': {
          status: 'LATEST_PRERELEASE',
          version: '0.1.0-canary.20260101.1.1.aaaaaaaa',
        },
      }),
      version: RC,
      approvedFirstPublish: ['@zeus-js/i18n'],
      phase: 'precheck',
    })
    expect(policy.verdict).toBe('REFUSED')
  })
})

describe('post-publish phase', () => {
  it('accepts the three approved first publications', () => {
    const policy = evaluateLatestPolicy({
      records: recordsWith({
        '@zeus-js/i18n': { status: 'LATEST_PRERELEASE', version: RC },
        '@zeus-js/eslint-plugin': { status: 'LATEST_PRERELEASE', version: RC },
        '@zeus-js/playground-engine': {
          status: 'LATEST_PRERELEASE',
          version: RC,
        },
      }),
      version: RC,
      approvedFirstPublish: [
        '@zeus-js/i18n',
        '@zeus-js/eslint-plugin',
        '@zeus-js/playground-engine',
      ],
      phase: 'post-publish',
    })
    expect(policy.verdict).toBe('ACCEPTED_DEVIATION')
    expect(policy.acceptedDeviation).toHaveLength(3)
    expect(verdictBlocksRelease(policy.verdict)).toBe(false)
  })

  it('accepts historical and first-publish deviations together', () => {
    const baseline = baselineOf(REAL_ENTRIES)
    const records = realRegistryRecords().map(record =>
      [
        '@zeus-js/i18n',
        '@zeus-js/eslint-plugin',
        '@zeus-js/playground-engine',
      ].includes(record.name)
        ? {
            name: record.name,
            state: { status: 'LATEST_PRERELEASE' as const, version: RC },
          }
        : record,
    )
    const judged = judgeHistorical({ baseline, records, releaseVersion: RC })
    const policy = evaluateLatestPolicy({
      records,
      version: RC,
      approvedFirstPublish: [
        '@zeus-js/i18n',
        '@zeus-js/eslint-plugin',
        '@zeus-js/playground-engine',
      ],
      acceptedHistorical: judged.accepted.map(m => m.name),
      phase: 'post-publish',
    })
    expect(policy.verdict).toBe('ACCEPTED_HISTORICAL_AND_FIRST_PUBLISH')
    expect(policy.acceptedHistorical).toHaveLength(13)
    expect(policy.acceptedDeviation).toHaveLength(3)
    expect(verdictBlocksRelease(policy.verdict)).toBe(false)
  })

  it('refuses an approved package whose latest points at another version', () => {
    const policy = evaluateLatestPolicy({
      records: recordsWith({
        '@zeus-js/i18n': {
          status: 'LATEST_PRERELEASE',
          version: '0.2.0-rc.1',
        },
      }),
      version: RC,
      approvedFirstPublish: ['@zeus-js/i18n'],
      phase: 'post-publish',
    })
    expect(policy.verdict).toBe('REFUSED')
  })

  it('refuses an unapproved package whose latest moved to this RC', () => {
    const policy = evaluateLatestPolicy({
      records: recordsWith({
        '@zeus-js/zeus': { status: 'LATEST_PRERELEASE', version: RC },
      }),
      version: RC,
      approvedFirstPublish: [],
      phase: 'post-publish',
    })
    expect(policy.verdict).toBe('REFUSED')
    expect(policy.refused).toEqual(['@zeus-js/zeus'])
  })

  it('still accepts historical deviations that remain after publishing', () => {
    const baseline = baselineOf(REAL_ENTRIES)
    const records = realRegistryRecords()
    const judged = judgeHistorical({ baseline, records, releaseVersion: RC })
    const policy = evaluateLatestPolicy({
      records,
      version: RC,
      approvedFirstPublish: [],
      acceptedHistorical: judged.accepted.map(m => m.name),
      phase: 'post-publish',
    })
    expect(policy.verdict).toBe('ACCEPTED_HISTORICAL')
    expect(verdictBlocksRelease(policy.verdict)).toBe(false)
  })
})

describe('registry failures stay fail-closed in both phases', () => {
  const failures: ReadonlyArray<[string, string]> = [
    ['404 surfaced as a query failure', 'E404'],
    ['429 rate limited', 'E429'],
    ['500 server error', 'E500'],
    ['503 unavailable', 'E503'],
    ['DNS failure', 'EAI_AGAIN'],
    ['timeout', 'ETIMEDOUT'],
    ['invalid JSON', 'Unexpected token < in JSON'],
  ]

  it.each(failures)('blocks when the registry reports %s', (_label, error) => {
    for (const phase of ['precheck', 'post-publish'] as const) {
      const policy = evaluateLatestPolicy({
        records: recordsWith({
          '@zeus-js/shared': { status: 'REGISTRY_QUERY_FAILED', error },
        }),
        version: RC,
        approvedFirstPublish: [],
        phase,
      })
      expect(policy.verdict, phase).toBe('UNKNOWN')
      expect(verdictBlocksRelease(policy.verdict), phase).toBe(true)
    }
  })

  /*
   * A query failure on a *historical* package is the case where a careless
   * implementation would fall back to the baseline. It must not.
   */
  it('does not use the baseline to excuse a failed query', () => {
    const baseline = baselineOf(REAL_ENTRIES)
    const records = realRegistryRecords().map(record =>
      record.name === '@zeus-js/router'
        ? {
            name: record.name,
            state: {
              status: 'REGISTRY_QUERY_FAILED' as const,
              error: 'E503',
            },
          }
        : record,
    )
    const judged = judgeHistorical({ baseline, records, releaseVersion: RC })
    const policy = evaluateLatestPolicy({
      records,
      version: RC,
      approvedFirstPublish: [],
      acceptedHistorical: judged.accepted.map(m => m.name),
      phase: 'precheck',
    })
    expect(judged.unresolved).toEqual(['@zeus-js/router'])
    expect(policy.verdict).toBe('UNKNOWN')
    expect(verdictBlocksRelease(policy.verdict)).toBe(true)
  })
})

/* ---------------------------------------------------------------- */
/* Snapshots                                                         */
/* ---------------------------------------------------------------- */

const SHA = '153f9b2b2c28fe4d82d73ad04084d25adeb7f424'
const RUN_ID = '44263303787'

function precheckSnapshot(
  overrides: Record<string, LatestTagState> = {},
): LatestSnapshot {
  return buildSnapshot({
    version: RC,
    gitSha: SHA,
    runId: RUN_ID,
    registry: 'https://registry.npmjs.org',
    capturedAt: '2026-11-18T00:00:00.000Z',
    baselineDigest: digestEntries(REAL_ENTRIES),
    records: recordsWith(overrides),
  })
}

function snapshotFile(snapshot: LatestSnapshot): string {
  const root = tempRoot()
  const file = path.join(root, 'snapshot.json')
  writeSnapshot(snapshot, file)
  return file
}

describe('snapshot binding', () => {
  it('round-trips a precheck snapshot', () => {
    const file = snapshotFile(precheckSnapshot())
    const loaded = loadSnapshot(
      { version: RC, gitSha: SHA, runId: RUN_ID, packageCount: 32 },
      file,
    )
    expect(loaded.problems).toEqual([])
    expect(loaded.snapshot!.packages).toHaveLength(32)
  })

  it('refuses a missing snapshot', () => {
    const root = tempRoot()
    const loaded = loadSnapshot(
      { version: RC, gitSha: SHA, runId: RUN_ID, packageCount: 32 },
      path.join(root, 'absent.json'),
    )
    expect(loaded.snapshot).toBeUndefined()
    expect(loaded.problems).toContainEqual(expect.stringContaining('missing'))
  })

  it('refuses a snapshot from another commit', () => {
    const file = snapshotFile(precheckSnapshot())
    const loaded = loadSnapshot(
      {
        version: RC,
        gitSha: 'a2cc74d08b4f80582b5969f27340f0ca5cb94361',
        runId: RUN_ID,
        packageCount: 32,
      },
      file,
    )
    expect(loaded.problems).toContainEqual(expect.stringContaining('commit'))
  })

  it('refuses a snapshot from another version', () => {
    const file = snapshotFile(precheckSnapshot())
    const loaded = loadSnapshot(
      { version: '0.2.0-rc.1', gitSha: SHA, runId: RUN_ID, packageCount: 32 },
      file,
    )
    expect(loaded.problems).toContainEqual(expect.stringContaining('version'))
  })

  it('refuses a snapshot from another run', () => {
    const file = snapshotFile(precheckSnapshot())
    const loaded = loadSnapshot(
      { version: RC, gitSha: SHA, runId: '99999999999', packageCount: 32 },
      file,
    )
    expect(loaded.problems).toContainEqual(expect.stringContaining('run'))
  })

  /*
   * Replaying an old snapshot is the attack this binding exists to stop: an
   * old file would describe a release that is not this one, and every
   * comparison against it would be meaningless while still looking rigorous.
   */
  it('refuses a replayed snapshot even when its contents look valid', () => {
    const old = buildSnapshot({
      version: '0.2.0-rc.1',
      gitSha: 'a2cc74d08b4f80582b5969f27340f0ca5cb94361',
      runId: '44218605332',
      registry: 'https://registry.npmjs.org',
      capturedAt: '2026-11-18T00:00:00.000Z',
      baselineDigest: digestEntries(REAL_ENTRIES),
      records: recordsWith(),
    })
    const loaded = loadSnapshot(
      { version: RC, gitSha: SHA, runId: RUN_ID, packageCount: 32 },
      snapshotFile(old),
    )
    expect(loaded.snapshot).toBeUndefined()
    expect(loaded.problems.length).toBeGreaterThanOrEqual(3)
  })

  it('refuses a snapshot that covers only part of the publish set', () => {
    const partial = buildSnapshot({
      version: RC,
      gitSha: SHA,
      runId: RUN_ID,
      registry: 'https://registry.npmjs.org',
      capturedAt: '2026-11-18T00:00:00.000Z',
      baselineDigest: digestEntries(REAL_ENTRIES),
      records: recordsWith().slice(0, 10),
    })
    const loaded = loadSnapshot(
      { version: RC, gitSha: SHA, runId: RUN_ID, packageCount: 32 },
      snapshotFile(partial),
    )
    expect(loaded.problems).toContainEqual(expect.stringContaining('covers'))
  })

  it('is insensitive to capture time but sensitive to package state', () => {
    const a = precheckSnapshot()
    const b = { ...a, capturedAt: '2030-01-01T00:00:00.000Z' }
    expect(digestSnapshot(b)).toBe(digestSnapshot(a))

    const c = precheckSnapshot({
      '@zeus-js/router': { status: 'LATEST_STABLE', version: '0.1.1' },
    })
    expect(digestSnapshot(c)).not.toBe(digestSnapshot(a))
  })
})

describe('snapshot transitions', () => {
  it('accepts an absent package that became this release', () => {
    const before = precheckSnapshot({
      '@zeus-js/i18n': { status: 'LATEST_ABSENT' },
    })
    const after = recordsWith({
      '@zeus-js/i18n': { status: 'LATEST_PRERELEASE', version: RC },
    })
    const comparison = compareSnapshots({
      before,
      after,
      version: RC,
      approvedFirstPublish: ['@zeus-js/i18n'],
    })
    expect(comparison.publishedAsFirstRelease.map(t => t.name)).toEqual([
      '@zeus-js/i18n',
    ])
    expect(comparison.unexpected).toEqual([])
  })

  it('refuses an absent package that became this release without approval', () => {
    const before = precheckSnapshot({
      '@zeus-js/zeus': { status: 'LATEST_ABSENT' },
    })
    const after = recordsWith({
      '@zeus-js/zeus': { status: 'LATEST_PRERELEASE', version: RC },
    })
    const comparison = compareSnapshots({
      before,
      after,
      version: RC,
      approvedFirstPublish: [],
    })
    expect(comparison.unexpected.map(t => t.name)).toEqual(['@zeus-js/zeus'])
  })

  it('refuses a stable latest that moved during the release', () => {
    const before = precheckSnapshot()
    const after = recordsWith({
      '@zeus-js/shared': { status: 'LATEST_STABLE', version: '0.0.9' },
    })
    const comparison = compareSnapshots({
      before,
      after,
      version: RC,
      approvedFirstPublish: [],
    })
    expect(comparison.unexpected.map(t => t.name)).toEqual(['@zeus-js/shared'])
  })

  it('refuses a prerelease latest that moved to a different prerelease', () => {
    const before = precheckSnapshot({
      '@zeus-js/router': {
        status: 'LATEST_PRERELEASE',
        version: ROUTER_LATEST,
      },
    })
    const after = recordsWith({
      '@zeus-js/router': {
        status: 'LATEST_PRERELEASE',
        version: '0.1.1-canary.20991231.1.1.deadbeef',
      },
    })
    const comparison = compareSnapshots({
      before,
      after,
      version: RC,
      approvedFirstPublish: [],
    })
    expect(comparison.unexpected.map(t => t.name)).toEqual(['@zeus-js/router'])
  })

  it('refuses a latest tag that vanished during the release', () => {
    const before = precheckSnapshot()
    const after = recordsWith({
      '@zeus-js/shared': { status: 'LATEST_ABSENT' },
    })
    const comparison = compareSnapshots({
      before,
      after,
      version: RC,
      approvedFirstPublish: [],
    })
    expect(comparison.unexpected.map(t => t.name)).toEqual(['@zeus-js/shared'])
  })

  it('allows a historical canary that moved to this release', () => {
    const before = precheckSnapshot({
      '@zeus-js/router': {
        status: 'LATEST_PRERELEASE',
        version: ROUTER_LATEST,
      },
    })
    const after = recordsWith({
      '@zeus-js/router': { status: 'LATEST_PRERELEASE', version: RC },
    })
    const comparison = compareSnapshots({
      before,
      after,
      version: RC,
      approvedFirstPublish: [],
    })
    expect(comparison.allowed.map(t => t.name)).toEqual(['@zeus-js/router'])
    expect(comparison.unexpected).toEqual([])
  })

  it('reports every unchanged package as unchanged', () => {
    const snapshot = precheckSnapshot()
    const comparison = compareSnapshots({
      before: snapshot,
      after: recordsWith(),
      version: RC,
      approvedFirstPublish: [],
    })
    expect(comparison.unchanged).toHaveLength(32)
    expect(comparison.unexpected).toEqual([])
  })

  it('refuses a package the precheck never saw', () => {
    const partial = buildSnapshot({
      version: RC,
      gitSha: SHA,
      runId: RUN_ID,
      registry: 'https://registry.npmjs.org',
      capturedAt: '2026-11-18T00:00:00.000Z',
      baselineDigest: digestEntries(REAL_ENTRIES),
      records: recordsWith().slice(0, 5),
    })
    const comparison = compareSnapshots({
      before: partial,
      after: recordsWith(),
      version: RC,
      approvedFirstPublish: [],
    })
    expect(comparison.unexpected).toHaveLength(27)
  })
})

/* ---------------------------------------------------------------- */
/* Adversarial                                                       */
/* ---------------------------------------------------------------- */

describe('adversarial attempts to widen the exemption', () => {
  /*
   * "Add the new deviation to the baseline and it becomes historical."
   *
   * The baseline is read from a fixed path inside the checked-out tree, so the
   * only way to do this is to commit it — which is exactly the review this is
   * supposed to attract. This test proves the *judging* half refuses when the
   * registry value is not the one recorded.
   */
  it('cannot launder a new deviation by recording it as historical', () => {
    const baseline = baselineOf(REAL_ENTRIES)
    const newDeviation = '0.1.9-canary.20261118.300.1.cafebabe'
    const records = realRegistryRecords().map(record =>
      record.name === '@zeus-js/zeus'
        ? {
            name: record.name,
            state: {
              status: 'LATEST_PRERELEASE' as const,
              version: newDeviation,
            },
          }
        : record,
    )
    const judged = judgeHistorical({ baseline, records, releaseVersion: RC })
    const policy = evaluateLatestPolicy({
      records,
      version: RC,
      approvedFirstPublish: [],
      acceptedHistorical: judged.accepted.map(m => m.name),
      phase: 'precheck',
    })
    expect(policy.refused).toContain('@zeus-js/zeus')
    expect(policy.verdict).toBe('REFUSED')
  })

  /*
   * "Repair the tag, then claim it was always like that."
   *
   * A baseline entry whose recorded version differs from the registry is
   * drift, not forgiveness — so a tag that was moved *to* a stable version
   * cannot be re-described as compliant history. The exemption is spent, not
   * rewritable.
   */
  it('does not let a baseline entry follow the registry to a new value', () => {
    const baseline = baselineOf(REAL_ENTRIES)
    const records = realRegistryRecords().map(record =>
      record.name === '@zeus-js/router'
        ? {
            name: record.name,
            state: {
              status: 'LATEST_PRERELEASE' as const,
              version: '0.1.1-canary.20261225.999.1.0badf00d',
            },
          }
        : record,
    )
    const judged = judgeHistorical({ baseline, records, releaseVersion: RC })
    expect(judged.drifted).toHaveLength(1)
    const policy = evaluateLatestPolicy({
      records,
      version: RC,
      approvedFirstPublish: [],
      acceptedHistorical: judged.accepted.map(m => m.name),
      phase: 'precheck',
    })
    expect(policy.verdict).toBe('REFUSED')
  })

  /*
   * "Pass the historical list straight from the caller."
   *
   * `evaluateLatestPolicy` trusts whatever names it is given, because its
   * caller is the only thing that can read the baseline. This asserts the
   * boundary is real: a name that is not actually a deviation is still judged
   * on its merits, and a name that is a deviation but not in the passed set is
   * refused.
   */
  it('excuses nothing unless the caller passes an exact match', () => {
    const records = recordsWith({
      '@zeus-js/router': {
        status: 'LATEST_PRERELEASE',
        version: ROUTER_LATEST,
      },
    })
    const withoutBaseline = evaluateLatestPolicy({
      records,
      version: RC,
      approvedFirstPublish: [],
      phase: 'precheck',
    })
    expect(withoutBaseline.verdict).toBe('REFUSED')

    const withBaseline = evaluateLatestPolicy({
      records,
      version: RC,
      approvedFirstPublish: [],
      acceptedHistorical: ['@zeus-js/router'],
      phase: 'precheck',
    })
    expect(withBaseline.verdict).toBe('ACCEPTED_HISTORICAL')
  })

  /*
   * "An unknown registry answer is close enough to the recorded one."
   *
   * It is not: the whole point of recording an exact version is that nobody
   * has to guess what the tag said.
   */
  it('never reads a failed query as a historical match', () => {
    const baseline = baselineOf(REAL_ENTRIES)
    const records = realRegistryRecords().map(record =>
      record.name === '@zeus-js/testing'
        ? {
            name: record.name,
            state: {
              status: 'REGISTRY_QUERY_FAILED' as const,
              error: 'socket hang up',
            },
          }
        : record,
    )
    const judged = judgeHistorical({ baseline, records, releaseVersion: RC })
    expect(judged.accepted.map(m => m.name)).not.toContain('@zeus-js/testing')
    expect(judged.unresolved).toContain('@zeus-js/testing')
  })

  /*
   * "The baseline file lives wherever the operator points it."
   *
   * There is no such option; the path is a constant. This asserts the
   * exported loader defaults to it rather than to a caller-supplied path.
   */
  it('reads the baseline from the fixed path by default', () => {
    const root = tempRoot()
    writeBaseline(root, REAL_ENTRIES)
    expect(HISTORICAL_LATEST_PATH).toBe('meta/release/historical-latest.json')
    expect(loadHistoricalBaseline(root).baseline).toBeDefined()
  })
})
