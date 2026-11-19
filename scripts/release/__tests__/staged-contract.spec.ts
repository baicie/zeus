/**
 * The staged publication contract, tested on constructed trees.
 *
 * These are the cases the canary failure exposed: a source contract check
 * cannot answer "did the rewrite finish", and a staged check cannot answer
 * "is the committed tree consistent". Each test builds the state it describes.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import {
  checkStagedContract,
  expectedStagedVersion,
  pinnedInternalDependencies,
  readStagedManifests,
  workingTreeIsDirty,
  type Manifest,
} from '../staged-contract'

const CANARY = '0.0.0-canary.20261120.1.abc1234'
const FIXED = ['@zeus-js/zeus', '@zeus-js/signal', '@zeus-js/compiler']

const temporaryRoots: string[] = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true })
  }
})

function workspace(
  manifests: Record<string, Partial<Manifest> & { version: string }>,
): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-staged-'))
  temporaryRoots.push(root)
  for (const [name, manifest] of Object.entries(manifests)) {
    const short = name.replace('@zeus-js/', '')
    const dir = path.join(root, 'packages', 'core', short)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(
      path.join(dir, 'package.json'),
      JSON.stringify({ name, ...manifest }, null, 2),
    )
  }
  return root
}

function staged(
  version = CANARY,
  overrides: Record<string, Partial<Manifest> & { version: string }> = {},
) {
  const manifests: Record<string, Partial<Manifest> & { version: string }> = {}
  for (const name of FIXED) manifests[name] = { version }
  Object.assign(manifests, overrides)
  const root = workspace(manifests)
  return readStagedManifests(root, FIXED)
}

describe('expectedStagedVersion', () => {
  it('reads the canary version the rewrite was given', () => {
    expect(expectedStagedVersion({ ZEUS_CANARY_VERSION: CANARY })).toBe(CANARY)
    expect(expectedStagedVersion({ CANARY_VERSION: CANARY })).toBe(CANARY)
  })

  it('is undefined when no rewrite was requested', () => {
    expect(expectedStagedVersion({})).toBeUndefined()
    expect(expectedStagedVersion({ ZEUS_CANARY_VERSION: '' })).toBeUndefined()
  })
})

describe('checkStagedContract', () => {
  it('accepts a fully rewritten fixed group', () => {
    const { manifests, missing } = staged()
    expect(checkStagedContract(manifests, missing, FIXED, CANARY)).toEqual([])
  })

  it('reports a package the rewrite skipped', () => {
    const { manifests, missing } = staged(CANARY, {
      '@zeus-js/signal': { version: '0.2.0-rc.3' },
    })
    const problems = checkStagedContract(manifests, missing, FIXED, CANARY)
    expect(problems).toContainEqual({
      package: '@zeus-js/signal',
      problem: `version is 0.2.0-rc.3, expected ${CANARY}`,
    })
  })

  it('reports a package whose manifest is absent', () => {
    const { manifests, missing } = staged(CANARY, {
      '@zeus-js/compiler': { version: CANARY },
    })
    const root = workspace({ '@zeus-js/zeus': { version: CANARY } })
    const partial = readStagedManifests(root, FIXED)
    expect(partial.missing).toEqual(['@zeus-js/signal', '@zeus-js/compiler'])
    // The full tree is fine, so this also shows the two reads differ only by
    // what is on disk.
    expect(checkStagedContract(manifests, missing, FIXED, CANARY)).toEqual([])
  })
})

describe('pinnedInternalDependencies', () => {
  it('accepts workspace-protocol ranges, which resolve to the staged version', () => {
    const manifests = new Map<string, Manifest>([
      [
        '@zeus-js/zeus',
        {
          name: '@zeus-js/zeus',
          version: CANARY,
          dependencies: { '@zeus-js/signal': 'workspace:*' },
        },
      ],
    ])
    expect(pinnedInternalDependencies(manifests, FIXED, CANARY)).toEqual([])
  })

  it('reports a pinned internal dependency left on the old version', () => {
    const manifests = new Map<string, Manifest>([
      [
        '@zeus-js/zeus',
        {
          name: '@zeus-js/zeus',
          version: CANARY,
          dependencies: { '@zeus-js/signal': '0.2.0-rc.3' },
        },
      ],
    ])
    expect(pinnedInternalDependencies(manifests, FIXED, CANARY)).toEqual([
      {
        package: '@zeus-js/zeus',
        problem: `dependencies.@zeus-js/signal pins 0.2.0-rc.3, expected ${CANARY}`,
      },
    ])
  })

  it('reports a caret-pinned internal dependency left behind', () => {
    const manifests = new Map<string, Manifest>([
      [
        '@zeus-js/compiler',
        {
          name: '@zeus-js/compiler',
          version: CANARY,
          devDependencies: { '@zeus-js/signal': `^0.2.0-rc.3` },
        },
      ],
    ])
    expect(pinnedInternalDependencies(manifests, FIXED, CANARY)).toHaveLength(1)
  })
})

describe('workingTreeIsDirty', () => {
  it('reports false for a clean tree', () => {
    // The release restores the tree in a `finally`; this is the probe that
    // says whether it did. Run against a real git repository, because the
    // function shells out to `git status`.
    const root = workspace({ '@zeus-js/zeus': { version: CANARY } })
    execFileSync('git', ['init', '--quiet'], { cwd: root })
    execFileSync('git', ['add', '-A'], { cwd: root })
    execFileSync(
      'git',
      [
        '-c',
        'user.email=t@example.com',
        '-c',
        'user.name=t',
        'commit',
        '-qm',
        'init',
      ],
      { cwd: root },
    )
    expect(workingTreeIsDirty(root)).toBe(false)

    fs.writeFileSync(
      path.join(root, 'packages', 'core', 'zeus', 'package.json'),
      JSON.stringify({ name: '@zeus-js/zeus', version: 'changed' }, null, 2),
    )
    expect(workingTreeIsDirty(root)).toBe(true)
  })
})
