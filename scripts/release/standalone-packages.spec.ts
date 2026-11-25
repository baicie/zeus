import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { findWorkspacePackages } from '../shared/utils'

const root = path.resolve(import.meta.dirname, '../..')

/**
 * The two lists that decide a package's independent release line.
 *
 * `standalone-release.ts` versions a package; `standalone-publish.ts` publishes
 * it. A package in one and not the other has a release path that stops halfway
 * — which is exactly what happened to `@zeus-js/devtools-consumer`: it was
 * added to `standalone-publish` and missed in `standalone-release`, so it could
 * be published by tag but never versioned.
 *
 * The lists are read from source rather than imported because both files call
 * into `@baicie/release` at module scope, and importing them would run a release.
 */
function readList(file: string, pattern: RegExp): string[] {
  /*
   * The root, not `scripts/release`: `release.config.ts` lives at the top.
   * The first version of this read from `scripts/release` and produced
   * `ENOENT … /workspace/git-code/release.config.ts` — a path one directory too
   * high, which is what happens when `path.resolve` walks from the wrong root.
   */
  /*
   * `release.config.ts` is at the repository root; the two standalone scripts
   * are under `scripts/release`. A single root for both is what produced
   * `ENOENT … /zeus/standalone-release.ts`.
   */
  const base =
    file === 'release.config.ts'
      ? path.join(root, 'scripts')
      : path.join(root, 'scripts/release')
  const source = fs.readFileSync(path.join(base, file), 'utf8')
  const match = pattern.exec(source)

  if (!match) throw new Error(`could not read the standalone list from ${file}`)

  /*
   * Comments are stripped before the names are read.
   *
   * `standalone-publish.ts` explains its reasoning inside the array literal,
   * and that comment contains `'import.meta.env.DEV'` — so a non-greedy match of
   * the literal stopped at the first closing bracket *inside the comment*, and
   * `@zeus-js/devtools-consumer`, which sits after it, was never read. The list
   * looked shorter than it is; stripping comments first is what makes the
   * comparison about the lists and not about their prose.
   */
  const withoutComments = match[1]
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')

  return [...withoutComments.matchAll(/'([^']+)'/g)].map(entry => entry[1])
}

/*
 * `create-zeus` and `zeus-ui` are published bare; the rest are scoped.
 *
 * A blanket `@zeus-js/` prefix turned `create-zeus` into `@zeus-js/create-zeus`,
 * which is a package that does not exist — the test said so, on the first run.
 */
const SCOPED = new Set(['vite-plugin', 'devtools-consumer'])
const toPackageName = (name: string) =>
  name.startsWith('@') || !SCOPED.has(name) ? name : `@zeus-js/${name}`

describe('the standalone release lists', () => {
  it('name the same packages for versioning and for publishing', () => {
    const released = readList(
      'standalone-release.ts',
      /const standalonePackages = \[([^\]]+)\]/,
    ).map(toPackageName)
    const published = readList(
      'standalone-publish.ts',
      /const standalonePackages = new Set\(\[([\s\S]*?)\]\)/,
    ).map(toPackageName)

    expect(released.slice().sort()).toEqual(published.slice().sort())
  })

  it('name only packages that exist in the workspace', () => {
    const workspace = new Set(findWorkspacePackages().map(entry => entry.name))
    const released = readList(
      'standalone-release.ts',
      /const standalonePackages = \[([^\]]+)\]/,
    ).map(toPackageName)

    for (const name of released) {
      expect(
        workspace.has(name),
        `${name} is listed but is not a workspace package`,
      ).toBe(true)
    }
  })

  it('name no package that is in the fixed release group', () => {
    /*
     * A package with its own version line must not also be published by every
     * Core release: that would put two versions of it on npm per tag.
     */
    const fixed = readList(
      'release.config.ts',
      /export const zeusFixedPackages = \[([\s\S]*?)\]/,
    )

    const released = readList(
      'standalone-release.ts',
      /const standalonePackages = \[([^\]]+)\]/,
    ).map(toPackageName)

    for (const name of released) {
      expect(
        fixed.includes(name),
        `${name} is standalone and must not be in the fixed group`,
      ).toBe(false)
    }
  })
})

describe('standalone release tags', () => {
  it('names tags the release workflow actually triggers on', () => {
    /*
     * The dry run produced `@zeus-js/devtools-consumer@0.1.1-beta.15` while
     * `devtools-release.yml` listens for `devtools-consumer@*`. A tag that
     * matches no trigger starts no workflow, so "the tag was pushed" and "the
     * package was published" come apart silently — the release looks complete
     * and nothing is on npm.
     *
     * The tag format is read from `standalone-release.ts` rather than assumed,
     * because a test that hard-codes the format it expects cannot catch a
     * change to it.
     */
    const source = fs.readFileSync(
      path.join(root, 'scripts/release/standalone-release.ts'),
      'utf8',
    )
    const toTag = /toTag: \(pkg, version\) => `([^`]+)`/.exec(source)
    const workflow = fs.readFileSync(
      path.join(root, '.github/workflows/devtools-release.yml'),
      'utf8',
    )

    expect(
      toTag,
      'toTag should be readable from standalone-release.ts',
    ).not.toBeNull()

    const patterns = [...workflow.matchAll(/^\s*-\s*'([^']+)@\*'/gm)].map(
      entry => entry[1],
    )

    expect(
      patterns.length,
      'the workflow should declare tag patterns',
    ).toBeGreaterThan(0)

    const released = readList(
      'standalone-release.ts',
      /const standalonePackages = \[([^\]]+)\]/,
    )

    for (const name of released) {
      /* The tag component is what `toTag` puts before the `@`. */
      const short = name.replace(/^@zeus-js\//, '')

      expect(
        patterns.includes(short),
        `${name} would tag as "${short}@…" but the workflow triggers on ${patterns.map(p => `${p}@*`).join(', ')}`,
      ).toBe(true)
    }
  })

  it('produces a tag without the npm scope for every standalone package', () => {
    const source = fs.readFileSync(
      path.join(root, 'scripts/release/standalone-release.ts'),
      'utf8',
    )
    const body = /toTag: \(pkg, version\) => `([^`]+)`/.exec(source)?.[1] ?? ''

    /* The template must strip the scope; a bare `${pkg}@${version}` does not. */
    expect(body).toMatch(/replace\(\/\^@zeus-js\\\/\//)
  })
})
