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

  it('carries the RC dist-tag for every publishable package', () => {
    const manifest = manifestAt()
    for (const entry of manifest.packages) {
      if (!entry.publishable) continue
      expect(entry.expectedDistTag).toBe('rc')
      expect(entry.version).toBe(TREE_VERSION)
      expect(entry.private).toBe(false)
    }
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
  it('maps the version line to the tag the release channel rule expects', () => {
    expect(distTagForVersion('0.2.0-rc.0')).toBe('rc')
    expect(distTagForVersion('0.2.0-beta.3')).toBe('beta')
    expect(distTagForVersion('0.2.0-alpha.1')).toBe('alpha')
    expect(distTagForVersion('0.2.0')).toBe('latest')
  })
})
