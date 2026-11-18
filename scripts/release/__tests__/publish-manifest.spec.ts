/**
 * The publish set, pinned.
 *
 * A previous report claimed a `v0.2.0-rc.0` tag would publish 35 packages.
 * `zeusFixedPackages` has 32; the three first-publish packages are members of
 * that group, not additions to it; and `@zeus-js/vite-plugin` publishes from
 * its own tag line. The wrong number came from adding three lists together
 * without checking whether they overlapped.
 *
 * These tests are the check that was missing. They read the real tree, so a
 * package that silently becomes private or loses its version fails here rather
 * than during a publish.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { zeusFixedPackages } from '../../release.config'
import {
  INDEPENDENT_PACKAGES,
  KNOWN_FIRST_PUBLISH,
  PUBLISH_MANIFEST_SCHEMA,
  buildPublishManifest,
  distTagForVersion,
} from '../publish-manifest'

const root = path.resolve(import.meta.dirname, '../../..')

const scratch: string[] = []

afterEach(() => {
  for (const directory of scratch.splice(0)) {
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

/*
 * The version the tree carries, read rather than hardcoded.
 *
 * It was `'0.2.0-rc.0'` and went stale the moment Core moved to rc.1: every
 * package's version then differed from the queried one, the manifest reported
 * 32 problems, and the count assertion read `0 !== 32`. The manifest is
 * supposed to describe the tree as it is; a test that pins the version is
 * pinning the thing under test.
 */
/**
 * The channel rule, written out independently of the implementation.
 *
 * Deliberately a literal table rather than `distTagForVersion` calls: a test
 * that computes its expectation with the function under test proves only that
 * the function agrees with itself. These rows are what the release actually
 * needs to be true — `rc` for an RC, `canary` for a canary, `latest` for a
 * stable version — and the assertions below compare the implementation to
 * them.
 */
const CHANNEL_TABLE: ReadonlyArray<{ version: string; distTag: string }> = [
  { version: '0.2.0-rc.1', distTag: 'rc' },
  { version: '0.2.0-canary.20261118.12345.1.abc12345', distTag: 'canary' },
  { version: '0.2.0-beta.1', distTag: 'beta' },
  { version: '0.2.0-alpha.1', distTag: 'alpha' },
  { version: '0.2.0', distTag: 'latest' },
]

const TREE_VERSION = (
  JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')) as {
    version: string
  }
).version

function manifestAt(version = TREE_VERSION) {
  return buildPublishManifest({
    root,
    version,
    distTag: distTagForVersion(version),
  })
}

describe('the real publish set', () => {
  /*
   * The number this round had to settle. If it changes, it should be because
   * somebody added a package, and this test will say so.
   */
  it('publishes exactly 32 packages', () => {
    expect(zeusFixedPackages).toHaveLength(32)
    expect(manifestAt().counts.publishable).toBe(32)
  })

  it('has no problems in the current tree', () => {
    expect(manifestAt().problems).toEqual([])
  })

  /*
   * The three first publications are members of the fixed group. Counting them
   * again on top of it is what produced 35.
   */
  it('counts the first publications inside the fixed group, not beside it', () => {
    const manifest = manifestAt()
    for (const name of KNOWN_FIRST_PUBLISH) {
      expect(zeusFixedPackages).toContain(name)
      const entry = manifest.packages.find(pkg => pkg.name === name)
      expect(entry?.fixedGroup).toBe(true)
      expect(entry?.firstPublish).toBe(true)
    }
    expect(manifest.counts.firstPublish).toBe(3)
    /*
     * Every publishable package is one of the 32 — no package is reachable
     * only through the first-publish list.
     */
    expect(manifest.counts.publishable).toBe(
      manifest.counts.total - manifest.counts.independent,
    )
  })

  it('keeps the independently versioned package out of the release', () => {
    const manifest = manifestAt()
    for (const name of INDEPENDENT_PACKAGES) {
      expect(zeusFixedPackages).not.toContain(name)
      const entry = manifest.packages.find(pkg => pkg.name === name)
      expect(entry?.independentVersionLine).toBe(true)
      expect(entry?.publishable).toBe(false)
      expect(entry?.fixedGroup).toBe(false)
    }
    expect(manifest.counts.independent).toBe(1)
  })

  /*
   * Every publishable package must carry the dist-tag this version's channel
   * implies — not `'rc'`.
   *
   * This assertion used to read `toBe('rc')`, which was true for the tree it
   * was written against and false the moment the same tree was rewritten for a
   * canary run. Release Canary rewrites every manifest to
   * `0.2.0-canary.<date>.<run>.<attempt>.<sha>`, runs `release:precheck`
   * (which runs this suite), and the production code correctly returned
   * `canary` — the test failed on a correct answer.
   *
   * The expectation is still exact, not loosened: the manifest's tag must
   * equal the tag the channel rule derives, and that mapping has its own
   * fixed table below so a wrong implementation cannot pass by agreeing with
   * itself.
   */
  it('carries the dist-tag this version channel implies', () => {
    const manifest = manifestAt()
    const expected = CHANNEL_TABLE.find(
      row => row.distTag === distTagForVersion(TREE_VERSION),
    )
    /*
     * The tree's version must be one the channel rule recognises. A version
     * whose channel has no table row means the rule invented a tag nobody
     * validated, and that is a failure rather than a pass by default.
     */
    expect(
      expected,
      `${TREE_VERSION} produced a dist-tag with no channel-table entry`,
    ).toBeDefined()

    for (const entry of manifest.packages) {
      if (!entry.publishable) continue
      expect(entry.expectedDistTag).toBe(expected!.distTag)
      expect(entry.version).toBe(TREE_VERSION)
      expect(entry.private).toBe(false)
    }
  })

  /*
   * The canary shape specifically, without rewriting the tree.
   *
   * Release Canary's whole failure mode was "works for rc, not for canary",
   * so the manifest is built for a canary version string directly. The paths
   * point at the real workspace, so this exercises the real discovery code
   * with a version the tree does not currently carry — which is exactly the
   * state the canary run is in.
   */
  it('accepts a canary version and tags it canary', () => {
    const canary = '0.2.0-canary.20261118.12345.1.abc12345'
    /*
     * `buildPublishManifest` reports a version mismatch as a problem, so this
     * asserts that the canary version is treated as a *different version*
     * rather than as a malformed one: the shape is valid, the packages simply
     * are not at it yet.
     */
    const manifest = buildPublishManifest({
      root,
      version: canary,
      distTag: distTagForVersion(canary),
    })
    expect(manifest.distTag).toBe('canary')
    for (const entry of manifest.packages) {
      if (entry.independentVersionLine) continue
      expect(entry.expectedDistTag).toBe('canary')
    }
    /*
     * The tree is not at the canary version, so every package is a version
     * mismatch — and therefore nothing is publishable. That is the honest
     * answer here: this asserts the *shape* is accepted and the channel is
     * right, not that a tree at rc.1 could be published as a canary.
     */
    expect(manifest.counts.publishable).toBe(0)
    expect(manifest.problems.length).toBe(
      manifest.counts.total - manifest.counts.independent,
    )
  })

  it('names a real path for every entry', () => {
    for (const entry of manifestAt().packages) {
      const absolute = path.join(root, entry.path, 'package.json')
      expect(fs.existsSync(absolute), `${entry.name} at ${entry.path}`).toBe(
        true,
      )
    }
  })

  it('writes a manifest an audit can re-read', () => {
    const manifest = manifestAt()
    expect(manifest.schema).toBe(PUBLISH_MANIFEST_SCHEMA)
    const parsed = JSON.parse(JSON.stringify(manifest)) as typeof manifest
    expect(parsed.counts).toEqual(manifest.counts)
    expect(parsed.packages.length).toBe(manifest.packages.length)
  })
})

describe('refusals', () => {
  function fixture(
    packages: Array<{ name: string; version?: string; private?: boolean }>,
  ): string {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-manifest-'))
    scratch.push(directory)
    for (const pkg of packages) {
      const target = path.join(
        directory,
        'packages',
        pkg.name.replace('@', '').replace('/', '-'),
      )
      fs.mkdirSync(target, { recursive: true })
      fs.writeFileSync(
        path.join(target, 'package.json'),
        JSON.stringify({
          name: pkg.name,
          version: pkg.version ?? '0.2.0-rc.0',
          ...(pkg.private ? { private: true } : {}),
        }),
      )
    }
    return directory
  }

  it('refuses a package that is private', () => {
    const directory = fixture([
      { name: '@zeus-js/a', private: true },
      { name: '@zeus-js/b' },
    ])
    const manifest = buildPublishManifest({
      root: directory,
      version: '0.2.0-rc.0',
      distTag: 'rc',
      fixedPackages: ['@zeus-js/a', '@zeus-js/b'],
      firstPublish: [],
      independent: [],
    })
    expect(manifest.problems).toContainEqual(
      expect.stringContaining(
        '@zeus-js/a: listed in the fixed group but its manifest is private',
      ),
    )
    expect(
      manifest.packages.find(p => p.name === '@zeus-js/a')?.publishable,
    ).toBe(false)
    expect(manifest.counts.publishable).toBe(1)
  })

  it('refuses a package whose version differs from the release', () => {
    const directory = fixture([
      { name: '@zeus-js/a' },
      { name: '@zeus-js/b', version: '0.1.0' },
    ])
    const manifest = buildPublishManifest({
      root: directory,
      version: '0.2.0-rc.0',
      distTag: 'rc',
      fixedPackages: ['@zeus-js/a', '@zeus-js/b'],
      firstPublish: [],
      independent: [],
    })
    expect(manifest.problems).toContainEqual(
      expect.stringContaining('@zeus-js/b: version 0.1.0 differs'),
    )
  })

  it('refuses a package listed twice', () => {
    const directory = fixture([{ name: '@zeus-js/a' }])
    const manifest = buildPublishManifest({
      root: directory,
      version: '0.2.0-rc.0',
      distTag: 'rc',
      fixedPackages: ['@zeus-js/a', '@zeus-js/a'],
      firstPublish: [],
      independent: [],
    })
    expect(manifest.problems).toContainEqual(
      expect.stringContaining('listed twice'),
    )
  })

  it('refuses a fixed-group package that is not on disk', () => {
    const directory = fixture([{ name: '@zeus-js/a' }])
    const manifest = buildPublishManifest({
      root: directory,
      version: '0.2.0-rc.0',
      distTag: 'rc',
      fixedPackages: ['@zeus-js/a', '@zeus-js/ghost'],
      firstPublish: [],
      independent: [],
    })
    expect(manifest.problems).toContainEqual(
      expect.stringContaining(
        '@zeus-js/ghost: listed in the fixed group but not found',
      ),
    )
  })

  /*
   * The two ways the group could be widened by mistake, both refused: a
   * first-publish name that is not in the group would authorise nothing, and an
   * independent package inside the group would publish a version belonging to
   * no release line.
   */
  it('refuses a first-publish name outside the fixed group', () => {
    const directory = fixture([{ name: '@zeus-js/a' }])
    const manifest = buildPublishManifest({
      root: directory,
      version: '0.2.0-rc.0',
      distTag: 'rc',
      fixedPackages: ['@zeus-js/a'],
      firstPublish: ['@zeus-js/not-in-group'],
      independent: [],
    })
    expect(manifest.problems).toContainEqual(
      expect.stringContaining(
        'listed as a first publication but not part of the fixed release group',
      ),
    )
  })

  it('refuses an independent package inside the fixed group', () => {
    const directory = fixture([{ name: '@zeus-js/vite-plugin' }])
    const manifest = buildPublishManifest({
      root: directory,
      version: '0.2.0-rc.0',
      distTag: 'rc',
      fixedPackages: ['@zeus-js/vite-plugin'],
      firstPublish: [],
      independent: ['@zeus-js/vite-plugin'],
    })
    expect(manifest.problems).toContainEqual(
      expect.stringContaining(
        'published from its own tag line but present in the fixed release group',
      ),
    )
  })
})

describe('dist-tag derivation', () => {
  /*
   * Every row of the fixed table, including canary. The previous version of
   * this test omitted canary entirely, which is how the rc-only assumption in
   * the manifest test went unnoticed until a canary run rewrote the tree.
   */
  it.each(CHANNEL_TABLE)(
    'maps $version to $distTag',
    ({ version, distTag }) => {
      expect(distTagForVersion(version)).toBe(distTag)
    },
  )

  it('falls back to latest only for a version with no prerelease part', () => {
    expect(distTagForVersion('1.0.0')).toBe('latest')
    expect(distTagForVersion('0.2.0-rc.9')).toBe('rc')
  })
})
