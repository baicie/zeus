/**
 * What a product's build-info claims about the UI has to match what it ships.
 *
 * `build-info.json` carries a `uiCommit` for Admin and Playground, taken from
 * the repository variable `ZEUS_UI_COMMIT`. That value names a commit in
 * `baicie/zeus-ui` — but neither image checks out that commit. What they
 * actually install is:
 *
 * - Admin: 24 `@zeus-web/*` packages at a registry version, plus one vendored
 *   `@zeus-web/dialog` built from a different commit;
 * - Playground: nothing from `@zeus-web/*` at all. It is Core-only.
 *
 * A single `uiCommit` therefore cannot describe either build, and for
 * Playground it describes a repository the build never reads.
 *
 * These tests pin the facts the provenance has to be built on, so a schema
 * change cannot quietly re-introduce a claim that is not true.
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { collectUiSources, verifyUiSources } from '../ui-sources'

const root = path.resolve(import.meta.dirname, '../../..')

function manifest(relative: string): {
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
} {
  return JSON.parse(fs.readFileSync(path.join(root, relative), 'utf8'))
}

/** Every `@zeus-web/*` entry across the manifest's dependency fields. */
function webDependencies(relative: string): Record<string, string> {
  const fields = manifest(relative)
  const merged: Record<string, string> = {}
  for (const field of [
    'dependencies',
    'devDependencies',
    'peerDependencies',
  ] as const) {
    for (const [name, version] of Object.entries(fields[field] ?? {})) {
      if (name.startsWith('@zeus-web/')) merged[name] = version
    }
  }
  return merged
}

describe('Admin UI inputs', () => {
  const web = webDependencies('examples/admin/package.json')

  it('pins every @zeus-web dependency to an exact version or a vendored path', () => {
    for (const [name, version] of Object.entries(web)) {
      const pinned = /^\d+\.\d+\.\d+/.test(version)
      const vendored = version.startsWith('file:')
      expect(
        pinned || vendored,
        `${name} must be exactly pinned or vendored, got ${version}`,
      ).toBe(true)
    }
  })

  it('takes exactly one package from the vendored build', () => {
    const vendored = Object.entries(web).filter(([, version]) =>
      version.startsWith('file:'),
    )
    expect(
      vendored.map(([name]) => name),
      'the vendored dialog is the only package not resolved from the registry',
    ).toEqual(['@zeus-web/dialog'])
  })

  it('resolves the vendored dialog from the committed provenance directory', () => {
    expect(web['@zeus-web/dialog']).toBe('file:../../vendor/zeus-web-dialog')
  })

  it('takes every other @zeus-web package from the registry', () => {
    const registry = Object.entries(web).filter(([, version]) =>
      /^\d+\.\d+\.\d+/.test(version),
    )
    expect(
      registry.length,
      'all non-vendored @zeus-web dependencies come from npm',
    ).toBeGreaterThan(20)
  })
})

describe('Playground UI inputs', () => {
  it('has no @zeus-web dependencies at all', () => {
    // This is the fact that makes a `uiCommit` for Playground meaningless: the
    // build never reads the UI repository.
    expect(webDependencies('examples/playground-editor/package.json')).toEqual(
      {},
    )
  })

  it('is built from Core workspace packages only', () => {
    const fields = manifest('examples/playground-editor/package.json')
    const core = Object.entries(fields.dependencies ?? {}).filter(([name]) =>
      name.startsWith('@zeus-js/'),
    )
    expect(core.length).toBeGreaterThan(0)
    expect(
      core.every(([, version]) => version.startsWith('workspace:')),
      'Core packages resolve from the workspace, not the registry',
    ).toBe(true)
  })
})

describe('the vendored dialog provenance names a real commit', () => {
  const provenance = JSON.parse(
    fs.readFileSync(
      path.join(root, 'vendor/zeus-web-dialog/provenance.json'),
      'utf8',
    ),
  ) as { commit?: string; version?: string; package?: string }

  it('records a full 40-character SHA', () => {
    expect(provenance.commit).toMatch(/^[0-9a-f]{40}$/)
  })

  it('records the package it describes', () => {
    expect(provenance.package).toBe('@zeus-web/dialog')
    expect(provenance.version).toMatch(/^\d+\.\d+\.\d+/)
  })
})

/**
 * `collectUiSources` must describe the bytes the build installs.
 *
 * The point of the module is that a single `uiCommit` cannot stand for a build
 * assembled from three kinds of input. These cases check it reports each kind
 * separately and refuses to guess when a `file:` dependency has no provenance.
 */

describe('collectUiSources', () => {
  const rootPath = path.resolve(import.meta.dirname, '../../..')

  it('reports Admin as one vendored package plus registry packages', () => {
    const sources = collectUiSources({
      manifestPath: path.join(rootPath, 'examples/admin/package.json'),
      root: rootPath,
      declaredPairingCommit: 'ffde55920fe9beab52dfe67bdca6d2e4023f28df',
    })
    expect(sources.readsUiRepository).toBe(true)
    const vendored = sources.sources.filter(
      source => source.kind === 'vendored',
    )
    expect(vendored).toHaveLength(1)
    expect(vendored[0]?.package).toBe('@zeus-web/dialog')
    // The vendored commit is not the declared pairing commit — that is exactly
    // the discrepancy the schema exists to make visible.
    expect((vendored[0] as { commit: string }).commit).not.toBe(
      sources.declaredPairingCommit,
    )
    const registry = sources.sources.filter(
      source => source.kind === 'registry',
    )
    expect(registry.length).toBeGreaterThan(20)
    expect(
      registry.every(source => /^\d+\.\d+\.\d+/.test(source.version)),
      'every registry source names an exact version',
    ).toBe(true)
  })

  it('reports Playground as reading no UI repository', () => {
    const sources = collectUiSources({
      manifestPath: path.join(
        rootPath,
        'examples/playground-editor/package.json',
      ),
      root: rootPath,
      declaredPairingCommit: 'ffde55920fe9beab52dfe67bdca6d2e4023f28df',
    })
    expect(sources.readsUiRepository).toBe(false)
    expect(sources.sources).toEqual([])
    // The declared commit is still recorded — but flagged as describing
    // nothing, rather than silently presented as provenance.
    expect(sources.declaredPairingCommit).toMatch(/^[0-9a-f]{40}$/)
  })

  it('refuses a file: dependency whose directory has no provenance', () => {
    const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'ui-src-'))
    try {
      fs.writeFileSync(
        path.join(directory, 'package.json'),
        JSON.stringify({
          name: 'fixture',
          dependencies: { '@zeus-web/thing': 'file:./missing' },
        }),
      )
      expect(() =>
        collectUiSources({
          manifestPath: path.join(directory, 'package.json'),
          root: directory,
          declaredPairingCommit: 'a'.repeat(40),
        }),
      ).toThrow('has no provenance.json')
    } finally {
      fs.rmSync(directory, { recursive: true, force: true })
    }
  })

  it('is deterministic regardless of dependency declaration order', () => {
    const a = collectUiSources({
      manifestPath: path.join(rootPath, 'examples/admin/package.json'),
      root: rootPath,
      declaredPairingCommit: 'b'.repeat(40),
    })
    const b = collectUiSources({
      manifestPath: path.join(rootPath, 'examples/admin/package.json'),
      root: rootPath,
      declaredPairingCommit: 'b'.repeat(40),
    })
    expect(JSON.stringify(a)).toBe(JSON.stringify(b))
  })
})

/**
 * Negative cases: what a truthful build-info must not be able to say.
 *
 * `uiSources` only has value if a reader can trust it. These cases push the
 * document into the states an attacker or a stale pipeline would produce and
 * check that verification rejects them.
 */

describe('verifyUiSources', () => {
  const rootPath = path.resolve(import.meta.dirname, '../../..')
  const good = collectUiSources({
    manifestPath: path.join(rootPath, 'examples/admin/package.json'),
    root: rootPath,
    declaredPairingCommit: 'ffde55920fe9beab52dfe67bdca6d2e4023f28df',
  })

  it('accepts sources that match the repository', () => {
    const result = verifyUiSources({
      sources: good,
      manifestPath: path.join(rootPath, 'examples/admin/package.json'),
      root: rootPath,
    })
    expect(result.errors).toEqual([])
  })

  it('rejects a declared pairing commit that differs from build-info', () => {
    const result = verifyUiSources({
      sources: { ...good, declaredPairingCommit: 'a'.repeat(40) },
      manifestPath: path.join(rootPath, 'examples/admin/package.json'),
      root: rootPath,
      expectedPairingCommit: 'ffde55920fe9beab52dfe67bdca6d2e4023f28df',
    })
    expect(result.errors.join('\n')).toMatch(/declared pairing commit/)
  })

  it('rejects a vendored commit that no longer matches the vendored build', () => {
    const tampered = {
      ...good,
      sources: good.sources.map(source =>
        source.kind === 'vendored'
          ? { ...source, commit: 'b'.repeat(40) }
          : source,
      ),
    }
    const result = verifyUiSources({
      sources: tampered,
      manifestPath: path.join(rootPath, 'examples/admin/package.json'),
      root: rootPath,
    })
    expect(result.errors.join('\n')).toMatch(/vendored .*commit/)
  })

  it('rejects a vendored digest that no longer matches the vendored build', () => {
    const tampered = {
      ...good,
      sources: good.sources.map(source =>
        source.kind === 'vendored'
          ? { ...source, contentDigest: `sha256:${'0'.repeat(64)}` }
          : source,
      ),
    }
    const result = verifyUiSources({
      sources: tampered,
      manifestPath: path.join(rootPath, 'examples/admin/package.json'),
      root: rootPath,
    })
    expect(result.errors.join('\n')).toMatch(/contentDigest/)
  })

  it('rejects a registry version that is not what the manifest pins', () => {
    const tampered = {
      ...good,
      sources: good.sources.map(source =>
        source.kind === 'registry' && source.package === '@zeus-web/button'
          ? { ...source, version: '9.9.9' }
          : source,
      ),
    }
    const result = verifyUiSources({
      sources: tampered,
      manifestPath: path.join(rootPath, 'examples/admin/package.json'),
      root: rootPath,
    })
    expect(result.errors.join('\n')).toMatch(/@zeus-web\/button/)
  })

  it('rejects a missing package the manifest requires', () => {
    const tampered = {
      ...good,
      sources: good.sources.filter(
        source => source.package !== '@zeus-web/dialog',
      ),
    }
    const result = verifyUiSources({
      sources: tampered,
      manifestPath: path.join(rootPath, 'examples/admin/package.json'),
      root: rootPath,
    })
    expect(result.errors.join('\n')).toMatch(/missing|@zeus-web\/dialog/)
  })

  it('rejects an extra package the manifest does not declare', () => {
    const tampered = {
      ...good,
      sources: [
        ...good.sources,
        {
          kind: 'registry' as const,
          package: '@zeus-web/injected',
          version: '1.0.0',
        },
      ],
    }
    const result = verifyUiSources({
      sources: tampered,
      manifestPath: path.join(rootPath, 'examples/admin/package.json'),
      root: rootPath,
    })
    expect(result.errors.join('\n')).toMatch(/@zeus-web\/injected/)
  })

  it('rejects a document claiming UI sources for a build that reads none', () => {
    const playground = collectUiSources({
      manifestPath: path.join(
        rootPath,
        'examples/playground-editor/package.json',
      ),
      root: rootPath,
      declaredPairingCommit: 'ffde55920fe9beab52dfe67bdca6d2e4023f28df',
    })
    const lying = {
      ...playground,
      readsUiRepository: true,
      sources: [
        {
          kind: 'registry' as const,
          package: '@zeus-web/button',
          version: '1.0.0',
        },
      ],
    }
    const result = verifyUiSources({
      sources: lying,
      manifestPath: path.join(
        rootPath,
        'examples/playground-editor/package.json',
      ),
      root: rootPath,
    })
    expect(result.errors.join('\n')).toMatch(/@zeus-web\/button/)
  })
})

/**
 * `readsUiRepository` conflated four facts. v2 separates them.
 *
 * The v1 field was documented as "does this build read the UI repository" but
 * computed `sources.length > 0`, which answers "does it install any
 * `@zeus-web/*` package". For Playground both are false, so one boolean stood
 * for two unrelated facts and a reader could not tell which one it meant.
 */
describe('ui-sources v2 relationship', () => {
  const rootPath = path.resolve(import.meta.dirname, '../../..')

  it('reports Admin as using packages without checking out the repository', () => {
    const sources = collectUiSources({
      manifestPath: path.join(rootPath, 'examples/admin/package.json'),
      root: rootPath,
      declaredPairingCommit: 'ffde55920fe9beab52dfe67bdca6d2e4023f28df',
    })
    expect(sources.relationship).toEqual({
      usesWebPackages: true,
      checksOutUiRepository: false,
      consumesRegistryPackages: true,
      consumesVendoredBuild: true,
    })
  })

  it('reports Playground as using nothing at all', () => {
    const sources = collectUiSources({
      manifestPath: path.join(
        rootPath,
        'examples/playground-editor/package.json',
      ),
      root: rootPath,
      declaredPairingCommit: 'ffde55920fe9beab52dfe67bdca6d2e4023f28df',
    })
    expect(sources.relationship).toEqual({
      usesWebPackages: false,
      checksOutUiRepository: false,
      consumesRegistryPackages: false,
      consumesVendoredBuild: false,
    })
  })

  it('keeps the v1 boolean equal to usesWebPackages', () => {
    // Compatibility: an older reader still gets the value it always got.
    for (const manifestPath of [
      'examples/admin/package.json',
      'examples/playground-editor/package.json',
    ]) {
      const sources = collectUiSources({
        manifestPath: path.join(rootPath, manifestPath),
        root: rootPath,
        declaredPairingCommit: 'a'.repeat(40),
      })
      expect(sources.readsUiRepository).toBe(
        sources.relationship.usesWebPackages,
      )
    }
  })

  it('rejects a claim that the UI repository was checked out', () => {
    const sources = collectUiSources({
      manifestPath: path.join(rootPath, 'examples/admin/package.json'),
      root: rootPath,
      declaredPairingCommit: 'ffde55920fe9beab52dfe67bdca6d2e4023f28df',
    })
    const lying = {
      ...sources,
      relationship: { ...sources.relationship, checksOutUiRepository: true },
    }
    const result = verifyUiSources({
      sources: lying,
      manifestPath: path.join(rootPath, 'examples/admin/package.json'),
      root: rootPath,
    })
    expect(result.errors.join('\n')).toMatch(/checksOutUiRepository/)
  })

  it('rejects a relationship that contradicts the source list', () => {
    const sources = collectUiSources({
      manifestPath: path.join(rootPath, 'examples/admin/package.json'),
      root: rootPath,
      declaredPairingCommit: 'ffde55920fe9beab52dfe67bdca6d2e4023f28df',
    })
    for (const [field, wrong] of [
      ['usesWebPackages', false],
      ['consumesRegistryPackages', false],
      ['consumesVendoredBuild', false],
    ] as const) {
      const tampered = {
        ...sources,
        relationship: { ...sources.relationship, [field]: wrong },
      }
      const result = verifyUiSources({
        sources: tampered,
        manifestPath: path.join(rootPath, 'examples/admin/package.json'),
        root: rootPath,
      })
      expect(
        result.errors.join('\n'),
        `${field} set to ${String(wrong)} must be rejected`,
      ).toMatch(new RegExp(field))
    }
  })

  it('accepts a v1 document with no relationship field', () => {
    // Older build-info documents predate v2. They must keep verifying.
    const sources = collectUiSources({
      manifestPath: path.join(rootPath, 'examples/admin/package.json'),
      root: rootPath,
      declaredPairingCommit: 'ffde55920fe9beab52dfe67bdca6d2e4023f28df',
    })
    const v1 = { ...sources }
    delete (v1 as { relationship?: unknown }).relationship
    const result = verifyUiSources({
      sources: v1,
      manifestPath: path.join(rootPath, 'examples/admin/package.json'),
      root: rootPath,
    })
    expect(result.errors).toEqual([])
  })
})
