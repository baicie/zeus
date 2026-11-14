/**
 * An SBOM that lists only first-party packages is not a bill of materials.
 *
 * `createSbom` walks `findWorkspacePackages()` — this repository's own packages.
 * The published packages also depend on third-party libraries (oxc through
 * napi, `intl-messageformat`, `@tanstack/query-core`, `@babel/parser`, …), and
 * none of them appear. The document has 60 components and zero of them are
 * vendored dependencies.
 *
 * That is fine for "what did this repository build", which is what the RC
 * readiness gate asks. It is not fine for "what is in the artifact a consumer
 * installs", which is what an SBOM is for. The two questions have different
 * answers and the file currently only answers the first.
 *
 * These tests pin the current scope and the dependency set, so a future change
 * either closes the gap deliberately or fails here.
 */
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')

function fixedPackageManifests(): { name: string; dir: string }[] {
  const config = fs.readFileSync(
    path.join(root, 'scripts/release.config.ts'),
    'utf8',
  )
  const block = /export const zeusFixedPackages = \[([\s\S]*?)\]/.exec(config)
  if (!block) throw new Error('zeusFixedPackages not found')
  const names = [...(block[1] ?? '').matchAll(/@(zeus-js\/[a-z0-9-]+)/g)].map(
    match => `@${match[1]}`,
  )
  const found: { name: string; dir: string }[] = []
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules') continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(absolute)
        continue
      }
      if (entry.name !== 'package.json') continue
      const manifest = JSON.parse(fs.readFileSync(absolute, 'utf8')) as {
        name?: string
      }
      if (!manifest.name || !names.includes(manifest.name)) continue
      found.push({ name: manifest.name, dir: path.dirname(absolute) })
    }
  }
  walk(path.join(root, 'packages'))
  return found
}

describe('SBOM scope', () => {
  const packages = fixedPackageManifests()

  it('finds the 32 fixed packages', () => {
    expect(packages).toHaveLength(32)
  })

  it('the published packages do depend on third-party libraries', () => {
    // This is the fact that makes the current SBOM incomplete as a bill of
    // materials for a consumer.
    const thirdParty = new Set<string>()
    for (const entry of packages) {
      const manifest = JSON.parse(
        fs.readFileSync(path.join(entry.dir, 'package.json'), 'utf8'),
      ) as { dependencies?: Record<string, string> }
      for (const name of Object.keys(manifest.dependencies ?? {})) {
        if (!name.startsWith('@zeus-js/')) thirdParty.add(name)
      }
    }
    expect(
      thirdParty.size,
      'if this ever reaches zero the SBOM gap closes itself',
    ).toBeGreaterThan(0)
  })

  it('the committed SBOM lists no third-party runtime dependency', () => {
    const sbomPath = path.join(root, 'temp/sbom/zeus.cdx.json')
    if (!fs.existsSync(sbomPath)) return
    const sbom = JSON.parse(fs.readFileSync(sbomPath, 'utf8')) as {
      components?: { name?: string }[]
    }
    const names = (sbom.components ?? []).map(component => component.name ?? '')
    /*
     * Everything in the document today is a workspace package, whatever its
     * namespace: `@zeus-js/*`, `@zeus-bench/*`, `@zeus-ui/*`, `create-zeus`,
     * `zeus-ui`. None of the 11 third-party dependencies the published
     * packages declare appear.
     */
    const workspace = new Set<string>()
    const collect = (directory: string): void => {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (entry.name === 'node_modules') continue
        const absolute = path.join(directory, entry.name)
        if (entry.isDirectory()) {
          collect(absolute)
          continue
        }
        if (entry.name !== 'package.json') continue
        const manifest = JSON.parse(fs.readFileSync(absolute, 'utf8')) as {
          name?: string
        }
        if (manifest.name) workspace.add(manifest.name)
      }
    }
    for (const base of ['packages', 'benchmarks', 'examples', 'docs']) {
      const directory = path.join(root, base)
      if (fs.existsSync(directory)) collect(directory)
    }
    const notWorkspace = names.filter(name => !workspace.has(name))
    expect(
      notWorkspace,
      'the SBOM only covers workspace packages; a third-party name here would mean the gap closed',
    ).toEqual([])
  })
})

/**
 * The runtime dependency list has to be derived from the lockfile, not typed.
 */
import {
  collectRuntimeDependencies,
  runtimeDependenciesMatch,
} from '../check-sbom'

describe('collectRuntimeDependencies', () => {
  const lockfile = `lockfileVersion: '9.0'

importers:

  packages/core/zeus:
    dependencies:
      '@zeus-js/signal':
        specifier: workspace:*
        version: link:../signal
      picocolors:
        specifier: ^1.0.0
        version: 1.1.1
    devDependencies:
      vitest:
        specifier: ^4.0.0
        version: 4.1.9

  packages/core/i18n:
    dependencies:
      intl-messageformat:
        specifier: ^10.0.0
        version: 10.7.18(tslib@2.8.1)
      '@zeus-js/zeus':
        specifier: workspace:*
        version: link:../zeus

  examples/admin:
    dependencies:
      react:
        specifier: ^19.0.0
        version: 19.2.6
`

  it('lists only registry dependencies of published packages', () => {
    const deps = collectRuntimeDependencies(lockfile, {
      'packages/core/zeus': '@zeus-js/zeus',
      'packages/core/i18n': '@zeus-js/i18n',
    })
    expect(deps.map(dep => dep.name).sort()).toEqual([
      'intl-messageformat',
      'picocolors',
    ])
  })

  it('ignores workspace links', () => {
    const deps = collectRuntimeDependencies(lockfile, {
      'packages/core/zeus': '@zeus-js/zeus',
    })
    expect(deps.some(dep => dep.name.startsWith('@zeus-js/'))).toBe(false)
  })

  it('ignores devDependencies', () => {
    const deps = collectRuntimeDependencies(lockfile, {
      'packages/core/zeus': '@zeus-js/zeus',
    })
    expect(deps.some(dep => dep.name === 'vitest')).toBe(false)
  })

  it('ignores packages that are not published', () => {
    const deps = collectRuntimeDependencies(lockfile, {
      'packages/core/zeus': '@zeus-js/zeus',
    })
    expect(deps.some(dep => dep.name === 'react')).toBe(false)
  })

  it('records which published package requires each dependency', () => {
    const deps = collectRuntimeDependencies(lockfile, {
      'packages/core/zeus': '@zeus-js/zeus',
      'packages/core/i18n': '@zeus-js/i18n',
    })
    const i18n = deps.find(dep => dep.name === 'intl-messageformat')
    expect(i18n?.requiredBy).toEqual(['@zeus-js/i18n'])
    expect(i18n?.version).toBe('10.7.18')
  })
})

describe('runtimeDependenciesMatch', () => {
  const expected = [
    { name: 'a', version: '1.0.0', requiredBy: ['@zeus-js/zeus'] },
    { name: 'b', version: '2.0.0', requiredBy: ['@zeus-js/i18n'] },
  ]

  it('accepts a document that lists exactly the lockfile set', () => {
    expect(
      runtimeDependenciesMatch(
        { 'zeus:runtimeDependencies': expected },
        expected,
      ),
    ).toBe(true)
  })

  it('is order-independent', () => {
    expect(
      runtimeDependenciesMatch(
        { 'zeus:runtimeDependencies': [...expected].reverse() },
        expected,
      ),
    ).toBe(true)
  })

  it('rejects a missing dependency', () => {
    expect(
      runtimeDependenciesMatch(
        { 'zeus:runtimeDependencies': expected.slice(0, 1) },
        expected,
      ),
    ).toBe(false)
  })

  it('rejects an extra dependency', () => {
    expect(
      runtimeDependenciesMatch(
        {
          'zeus:runtimeDependencies': [
            ...expected,
            { name: 'c', version: '3.0.0', requiredBy: [] },
          ],
        },
        expected,
      ),
    ).toBe(false)
  })

  it('rejects a version that drifted', () => {
    expect(
      runtimeDependenciesMatch(
        {
          'zeus:runtimeDependencies': [
            { name: 'a', version: '9.9.9', requiredBy: [] },
            expected[1]!,
          ],
        },
        expected,
      ),
    ).toBe(false)
  })

  it('rejects a document with no runtime section when one is expected', () => {
    expect(runtimeDependenciesMatch({}, expected)).toBe(false)
  })
})
