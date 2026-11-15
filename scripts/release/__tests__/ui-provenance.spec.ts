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

import {
  collectUiSources,
  lockfileIntegrity,
  verifyUiSources,
} from '../ui-sources'
import {
  fetchAttestationSources,
  verifyUiProvenance,
} from '../verify-ui-provenance'

import type { verifyAttestation } from '../ui-attestation'

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
          integrity: null,
          sourceCommit: 'UNVERIFIED' as const,
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
          integrity: null,
          sourceCommit: 'UNVERIFIED' as const,
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

/**
 * A registry version without its bytes is half a provenance record.
 *
 * "registry @zeus-web/button 0.1.0-beta.34" says what was asked for. The
 * lockfile's `integrity` says which bytes pnpm will install. Recording only the
 * first lets a tampered registry entry pass as the version it claims to be.
 */
describe('npm package integrity', () => {
  const rootPath = path.resolve(import.meta.dirname, '../../..')
  const lockfile = fs.readFileSync(
    path.join(rootPath, 'pnpm-lock.yaml'),
    'utf8',
  )
  const adminManifest = path.join(rootPath, 'examples/admin/package.json')

  function adminSources() {
    return collectUiSources({
      manifestPath: adminManifest,
      root: rootPath,
      declaredPairingCommit: 'ffde55920fe9beab52dfe67bdca6d2e4023f28df',
      lockfile,
    })
  }

  it('records an integrity for every registry package', () => {
    const registry = adminSources().sources.filter(
      source => source.kind === 'registry',
    )
    expect(registry.length).toBe(24)
    expect(
      registry.filter(source => source.integrity !== null).length,
      'every pinned version must resolve to bytes in the lockfile',
    ).toBe(24)
  })

  it('records integrity in the sha512 form pnpm uses', () => {
    for (const source of adminSources().sources) {
      if (source.kind !== 'registry') continue
      expect(source.integrity, source.package).toMatch(
        /^sha512-[A-Za-z0-9+/=]+$/,
      )
    }
  })

  it('marks the source commit UNVERIFIED rather than guessing', () => {
    for (const source of adminSources().sources) {
      if (source.kind !== 'registry') continue
      expect(source.sourceCommit).toBe('UNVERIFIED')
    }
  })

  it('returns null for a version the lockfile does not contain', () => {
    expect(
      lockfileIntegrity(lockfile, '@zeus-web/button', '9.9.9-beta.1'),
    ).toBeNull()
  })

  it('rejects a tampered integrity that differs from the lockfile', () => {
    const sources = adminSources()
    const tampered = {
      ...sources,
      sources: sources.sources.map(source =>
        source.kind === 'registry' && source.package === '@zeus-web/button'
          ? { ...source, integrity: `sha512-${'A'.repeat(64)}` }
          : source,
      ),
    }
    const result = verifyUiSources({
      sources: tampered,
      manifestPath: adminManifest,
      root: rootPath,
      lockfile,
    })
    expect(result.errors.join('\n')).toMatch(/@zeus-web\/button.*integrity/i)
  })

  it('rejects a dropped integrity', () => {
    const sources = adminSources()
    const tampered = {
      ...sources,
      sources: sources.sources.map(source =>
        source.kind === 'registry' ? { ...source, integrity: null } : source,
      ),
    }
    const result = verifyUiSources({
      sources: tampered,
      manifestPath: adminManifest,
      root: rootPath,
      lockfile,
    })
    expect(result.errors.join('\n')).toMatch(/integrity/)
  })

  it('rejects a sourceCommit that claims a specific SHA', () => {
    // No mechanism in this repository ties a published version to a zeus-ui
    // commit. A document naming one is asserting something it cannot know.
    const sources = adminSources()
    const tampered = {
      ...sources,
      sources: sources.sources.map(source =>
        source.kind === 'registry'
          ? { ...source, sourceCommit: 'f'.repeat(40) }
          : source,
      ),
    }
    const result = verifyUiSources({
      sources: tampered,
      manifestPath: adminManifest,
      root: rootPath,
      lockfile,
    })
    expect(result.errors.join('\n')).toMatch(/sourceCommit/)
  })
})

/**
 * A correct document must pass strict verification.
 *
 * `verifyUiSources` re-derives the expected set with `collectUiSources`. If it
 * forgets to pass the lockfile, every `want.integrity` is `null` while the
 * recorded values are real — so a document that is exactly right fails on all
 * 24 registry packages with "the lockfile has no integrity for …".
 *
 * That is the worst shape a bug can take here: strict mode rejects the truth,
 * and the only way to make it green is to stop supplying the lockfile, which
 * is also the way to stop checking anything.
 */
describe('strict verification accepts an exact document', () => {
  const rootPath = path.resolve(import.meta.dirname, '../../..')
  const lockfile = fs.readFileSync(
    path.join(rootPath, 'pnpm-lock.yaml'),
    'utf8',
  )
  const adminManifest = path.join(rootPath, 'examples/admin/package.json')

  it('passes a document built from the same lockfile', () => {
    const sources = collectUiSources({
      manifestPath: adminManifest,
      root: rootPath,
      declaredPairingCommit: 'ffde55920fe9beab52dfe67bdca6d2e4023f28df',
      lockfile,
    })
    const result = verifyUiSources({
      sources,
      manifestPath: adminManifest,
      root: rootPath,
      lockfile,
    })
    expect(
      result.errors,
      'a document derived from this lockfile must verify against it',
    ).toEqual([])
  })

  it('reports no integrity complaint for any of the 24 registry packages', () => {
    const sources = collectUiSources({
      manifestPath: adminManifest,
      root: rootPath,
      declaredPairingCommit: 'ffde55920fe9beab52dfe67bdca6d2e4023f28df',
      lockfile,
    })
    const result = verifyUiSources({
      sources,
      manifestPath: adminManifest,
      root: rootPath,
      lockfile,
    })
    expect(
      result.errors.filter(error => /lockfile has no integrity/.test(error)),
    ).toEqual([])
  })

  it('fails the same document when a single integrity is altered', () => {
    const sources = collectUiSources({
      manifestPath: adminManifest,
      root: rootPath,
      declaredPairingCommit: 'ffde55920fe9beab52dfe67bdca6d2e4023f28df',
      lockfile,
    })
    const tampered = {
      ...sources,
      sources: sources.sources.map(source =>
        source.kind === 'registry' && source.package === '@zeus-web/input'
          ? { ...source, integrity: `sha512-${'B'.repeat(64)}` }
          : source,
      ),
    }
    const result = verifyUiSources({
      sources: tampered,
      manifestPath: adminManifest,
      root: rootPath,
      lockfile,
    })
    expect(result.errors).toHaveLength(1)
    expect(result.errors[0]).toMatch(/@zeus-web\/input.*integrity/)
  })
})

/**
 * A strict gate that can be satisfied by omitting its inputs is not a gate.
 *
 * The v1 behaviour — skip what you cannot check — is right for a document
 * written before the fields existed. It is wrong for a release: the same green
 * result then means both "checked and clean" and "nothing was checked".
 */
/**
 * A malformed document must fail, not throw.
 *
 * `verifyUiProvenance` is called on a `build-info.json` read from disk, which
 * may have been written by an older build, hand-edited, or truncated. Returning
 * a TypeError out of it turns "this artifact is corrupt" into a stack trace that
 * says nothing about the artifact.
 */
describe('malformed input returns errors rather than throwing', () => {
  const base = {
    manifestPath: path.join(root, 'examples/admin/package.json'),
    lockfile: 'lockfileVersion: "9.0"\n',
    root,
  }
  const cases: [string, unknown][] = [
    ['null', null],
    ['undefined', undefined],
    ['an array', []],
    ['an empty object', {}],
    ['a number', 42],
    ['a string', 'nope'],
    ['uiSources that is not an object', { uiSources: 'nope' }],
    ['uiSources with no sources', { uiSources: {}, uiCommit: 'a'.repeat(40) }],
    [
      'uiSources.sources that is not an array',
      { uiSources: { sources: 5 }, uiCommit: 'a'.repeat(40) },
    ],
    [
      'sources containing a non-object',
      {
        uiSources: { sources: [5], declaredPairingCommit: 'a'.repeat(40) },
        uiCommit: 'a'.repeat(40),
      },
    ],
  ]

  for (const [label, buildInfo] of cases) {
    it(`reports ${label} as a failure`, () => {
      const result = verifyUiProvenance({ ...base, buildInfo })
      expect(result.ok).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })
  }
})

/**
 * A duplicate package entry must not let one source hide another.
 *
 * The recorded set was a `Map` keyed by package name, so a second entry for the
 * same package silently replaced the first. A document with one wrong entry and
 * one right entry then passed or failed depending on their order — the check
 * was over whichever happened to be last.
 */
describe('duplicate package entries', () => {
  const base = {
    manifestPath: path.join(root, 'examples/admin/package.json'),
    lockfile: 'lockfileVersion: "9.0"\n',
    root,
    level: 'legacy-compatible' as const,
  }
  it('reports a package declared twice', () => {
    const uiCommit = 'a'.repeat(40)
    const result = verifyUiProvenance({
      ...base,
      buildInfo: {
        uiCommit,
        uiSources: {
          declaredPairingCommit: uiCommit,
          sources: [
            {
              kind: 'registry',
              package: '@zeus-web/button',
              version: '0.1.0-beta.34',
              integrity: 'sha512-x',
              sourceCommit: 'UNVERIFIED',
            },
            {
              kind: 'registry',
              package: '@zeus-web/button',
              version: '0.1.0-beta.34',
              integrity: 'sha512-x',
              sourceCommit: 'UNVERIFIED',
            },
          ],
        },
      },
    })
    expect(result.ok).toBe(false)
    expect(result.errors.join('\n')).toMatch(/more than once/)
  })
})

describe('verification levels', () => {
  const rootPath = path.resolve(import.meta.dirname, '../../..')
  const lockfile = fs.readFileSync(
    path.join(rootPath, 'pnpm-lock.yaml'),
    'utf8',
  )
  const adminManifest = path.join(rootPath, 'examples/admin/package.json')
  const pairing = 'ffde55920fe9beab52dfe67bdca6d2e4023f28df'

  function adminSources() {
    return collectUiSources({
      manifestPath: adminManifest,
      root: rootPath,
      declaredPairingCommit: pairing,
      lockfile,
    })
  }

  /** Every registry package resolved to one commit, as a real read would be. */
  function attestationSources(): Record<string, { commit: string }> {
    const manifest = JSON.parse(fs.readFileSync(adminManifest, 'utf8')) as {
      dependencies: Record<string, string>
    }
    return Object.fromEntries(
      Object.entries(manifest.dependencies)
        .filter(([name]) => name.startsWith('@zeus-web/'))
        .filter(([, version]) => !version.startsWith('file:'))
        .map(([name, version]) => [
          `${name}@${version}`,
          { commit: 'a8826dd1f81560aaf6459d8d40a3e599f705f6e0' },
        ]),
    )
  }

  it('legacy-compatible verifies a v1 document without a lockfile', () => {
    const sources = adminSources()
    const v1 = { ...sources }
    delete (v1 as { relationship?: unknown }).relationship
    const result = verifyUiSources({
      sources: v1,
      manifestPath: adminManifest,
      root: rootPath,
    })
    expect(result.errors).toEqual([])
  })

  it('release-strict rejects a run with no lockfile', () => {
    const result = verifyUiSources({
      sources: adminSources(),
      manifestPath: adminManifest,
      root: rootPath,
      expectedPairingCommit: pairing,
      level: 'release-strict',
    })
    expect(result.errors.join('\n')).toMatch(
      /release-strict requires the lockfile/,
    )
  })

  it('release-strict rejects a run with no expected pairing commit', () => {
    const result = verifyUiSources({
      sources: adminSources(),
      manifestPath: adminManifest,
      root: rootPath,
      lockfile,
      level: 'release-strict',
    })
    expect(result.errors.join('\n')).toMatch(
      /requires the declared pairing commit/,
    )
  })

  it('release-strict rejects a v1 document', () => {
    const sources = adminSources()
    const v1 = { ...sources }
    delete (v1 as { relationship?: unknown }).relationship
    const result = verifyUiSources({
      sources: v1,
      manifestPath: adminManifest,
      root: rootPath,
      lockfile,
      expectedPairingCommit: pairing,
      level: 'release-strict',
    })
    expect(result.errors.join('\n')).toMatch(
      /requires a ui-sources v2 document/,
    )
  })

  it('release-strict accepts a complete, correct document', () => {
    /*
     * The document has to carry attested commits: strict mode no longer accepts
     * `UNVERIFIED` as a pass. Everything else here — integrity against the
     * lockfile, the pairing commit, the v2 relationship — is what this case is
     * actually pinning.
     */
    const attested = attestationSources()
    const sources = collectUiSources({
      manifestPath: adminManifest,
      root: rootPath,
      declaredPairingCommit: pairing,
      lockfile,
      attestationSources: attested,
    })
    const result = verifyUiSources({
      sources,
      manifestPath: adminManifest,
      root: rootPath,
      lockfile,
      expectedPairingCommit: pairing,
      attestationSources: attested,
      level: 'release-strict',
    })
    expect(result.errors).toEqual([])
  })

  /*
   * `UNVERIFIED` used to pass strict mode silently.
   *
   * The rule was "a claimed commit must be backed by an attestation"; a package
   * that claimed nothing was skipped. So the one document a release gate is
   * guaranteed to see — the one `build-info.ts` writes, which never supplies
   * `attestationSources` — passed by recording that nothing was known, and the
   * gate reported the same green as a fully attested one.
   *
   * Strict mode is where that has to stop: it must either verify the commit or
   * say the evidence is missing. Recording ignorance is not verification.
   */
  it('release-strict rejects a registry package with no attested source commit', () => {
    const result = verifyUiSources({
      sources: adminSources(),
      manifestPath: adminManifest,
      root: rootPath,
      lockfile,
      expectedPairingCommit: pairing,
      level: 'release-strict',
    })
    expect(result.errors.join('\n')).toMatch(
      /sourceCommit is UNVERIFIED and no attestation was read for it/,
    )
  })

  it('release-strict accepts the same document once attestations are supplied', () => {
    const attested = attestationSources()
    const sources = collectUiSources({
      manifestPath: adminManifest,
      root: rootPath,
      declaredPairingCommit: pairing,
      lockfile,
      attestationSources: attested,
    })
    const result = verifyUiSources({
      sources,
      manifestPath: adminManifest,
      root: rootPath,
      lockfile,
      expectedPairingCommit: pairing,
      attestationSources: attested,
      level: 'release-strict',
    })
    expect(result.errors).toEqual([])
  })

  it('release-strict still rejects a tampered integrity', () => {
    const sources = adminSources()
    const tampered = {
      ...sources,
      sources: sources.sources.map(source =>
        source.kind === 'registry' && source.package === '@zeus-web/tabs'
          ? { ...source, integrity: `sha512-${'Z'.repeat(64)}` }
          : source,
      ),
    }
    const result = verifyUiSources({
      sources: tampered,
      manifestPath: adminManifest,
      root: rootPath,
      lockfile,
      expectedPairingCommit: pairing,
      level: 'release-strict',
    })
    expect(result.errors.join('\n')).toMatch(/@zeus-web\/tabs.*integrity/)
  })

  it('release-strict still rejects a wrong pairing commit', () => {
    const result = verifyUiSources({
      sources: adminSources(),
      manifestPath: adminManifest,
      root: rootPath,
      lockfile,
      expectedPairingCommit: 'a'.repeat(40),
      level: 'release-strict',
    })
    expect(result.errors.join('\n')).toMatch(/declared pairing commit/)
  })
})

/**
 * A source commit backed by an attestation is allowed; an unbacked one is not.
 *
 * The rule against naming a specific commit exists because the tempting value
 * is the declared pairing commit — a different fact wearing the right shape.
 * When this run actually read the commit out of SLSA provenance, the value is
 * checkable and belongs in the document.
 */
describe('attested source commits', () => {
  const rootPath = path.resolve(import.meta.dirname, '../../..')
  const lockfile = fs.readFileSync(
    path.join(rootPath, 'pnpm-lock.yaml'),
    'utf8',
  )
  const adminManifest = path.join(rootPath, 'examples/admin/package.json')
  const pairing = 'ffde55920fe9beab52dfe67bdca6d2e4023f28df'
  const attested = 'a8826dd1f81560aaf6459d8d40a3e599f705f6e0'

  function registryNames(): string[] {
    const manifest = JSON.parse(fs.readFileSync(adminManifest, 'utf8')) as {
      dependencies: Record<string, string>
    }
    return Object.entries(manifest.dependencies)
      .filter(([name]) => name.startsWith('@zeus-web/'))
      .filter(([, version]) => !version.startsWith('file:'))
      .map(([name]) => name)
  }

  const attestationSources = Object.fromEntries(
    registryNames().map(name => [
      `${name}@0.1.0-beta.34`,
      { commit: attested },
    ]),
  )

  it('records the attested commit and its provenance', () => {
    const sources = collectUiSources({
      manifestPath: adminManifest,
      root: rootPath,
      declaredPairingCommit: pairing,
      lockfile,
      attestationSources,
    })
    const registry = sources.sources.filter(
      source => source.kind === 'registry',
    )
    expect(registry.length).toBe(24)
    for (const source of registry) {
      expect(source.sourceCommit).toBe(attested)
      expect(source.sourceCommitProvenance).toBe('attestation')
    }
  })

  it('verifies a document whose commits are backed by attestations', () => {
    const sources = collectUiSources({
      manifestPath: adminManifest,
      root: rootPath,
      declaredPairingCommit: pairing,
      lockfile,
      attestationSources,
    })
    const result = verifyUiSources({
      sources,
      manifestPath: adminManifest,
      root: rootPath,
      lockfile,
      expectedPairingCommit: pairing,
      attestationSources,
      level: 'release-strict',
    })
    expect(result.errors).toEqual([])
  })

  it('rejects a commit this run did not read from an attestation', () => {
    const sources = collectUiSources({
      manifestPath: adminManifest,
      root: rootPath,
      declaredPairingCommit: pairing,
      lockfile,
      attestationSources,
    })
    const result = verifyUiSources({
      sources,
      manifestPath: adminManifest,
      root: rootPath,
      lockfile,
      expectedPairingCommit: pairing,
      level: 'release-strict',
    })
    expect(result.errors.join('\n')).toMatch(/not backed by an attestation/)
  })

  it('keeps UNVERIFIED when no attestation was read', () => {
    const sources = collectUiSources({
      manifestPath: adminManifest,
      root: rootPath,
      declaredPairingCommit: pairing,
      lockfile,
    })
    const registry = sources.sources.filter(
      source => source.kind === 'registry',
    )
    expect(registry.every(source => source.sourceCommit === 'UNVERIFIED')).toBe(
      true,
    )
  })
})

/**
 * Reading provenance is a network path, so its behaviour is pinned without one.
 *
 * `fetchAttestationSources` is what makes the strict check actionable: the
 * document is written inside an offline Docker build and records `UNVERIFIED`,
 * and only a verifier that actually fetches can turn that into evidence.
 *
 * The transport, the clock and the signature verifier are all injected. That
 * lets these tests describe outages, slow registries and retry timing exactly,
 * which is not possible against the real npm registry.
 */
describe('fetchAttestationSources', () => {
  const attested = 'a8826dd1f81560aaf6459d8d40a3e599f705f6e0'
  const pkg = { name: '@zeus-web/button', version: '0.1.0-beta.34' }

  /** A registry response carrying a SLSA v1 bundle. */
  function attestationResponse(): unknown {
    const payload = Buffer.from(
      JSON.stringify({
        predicateType: 'https://slsa.dev/provenance/v1',
        predicate: {
          buildDefinition: {
            resolvedDependencies: [
              {
                uri: 'git+https://github.com/baicie/zeus-ui@refs/tags/v0.1.0-beta.34',
                digest: { gitCommit: attested },
              },
            ],
          },
        },
      }),
    ).toString('base64')
    return {
      attestations: [
        {
          predicateType: 'https://slsa.dev/provenance/v1',
          bundle: { dsseEnvelope: { payload } },
        },
      ],
    }
  }

  /** Accepts whatever bundle it is given, for tests about transport. */
  const acceptingVerify = (async () => ({
    ok: true as const,
    attestation: {
      verified: true as const,
      commit: attested,
      repository: 'baicie/zeus-ui',
      ref: 'refs/tags/v0.1.0-beta.34',
      signerIdentity: 'stub',
      signerIssuer: 'https://token.actions.githubusercontent.com',
      tlogEntries: 1,
    },
  })) as unknown as typeof verifyAttestation

  const okFetch = (async () =>
    new Response(JSON.stringify(attestationResponse()), {
      status: 200,
    })) as typeof globalThis.fetch

  it('reads the commit out of each package response', async () => {
    const { verified, failures } = await fetchAttestationSources({
      packages: [pkg],
      fetch: okFetch,
      verify: acceptingVerify,
    })
    expect(verified['@zeus-web/button@0.1.0-beta.34']?.commit).toBe(attested)
    expect(failures).toEqual({})
  })

  it('builds a URL the registry routes', async () => {
    const seen: string[] = []
    await fetchAttestationSources({
      packages: [pkg],
      verify: acceptingVerify,
      fetch: (async (url: string | URL | Request) => {
        seen.push(String(url))
        return new Response('{}', { status: 404 })
      }) as typeof globalThis.fetch,
    })
    /*
     * The version separator must stay a literal `@`. Encoding the whole
     * `name@version` turns it into `%40`, which the registry does not route —
     * every package then 404s and looks unattested while the run reports
     * "0/24 read", which reads like missing provenance rather than a broken
     * URL.
     */
    expect(seen[0]).toBe(
      'https://registry.npmjs.org/-/npm/v1/attestations/@zeus-web%2Fbutton@0.1.0-beta.34',
    )
  })

  /*
   * The four outcomes below are the reason the return type is not a map of
   * commits. "Not published with provenance", "published but the signature is
   * wrong", "the registry said 503" and "the connection died" call for
   * different responses, and the previous version collapsed all four into an
   * absent key — which the gate then reported as a missing attestation.
   */
  it('reports 404 as missing, without retrying', async () => {
    let calls = 0
    const { verified, failures } = await fetchAttestationSources({
      packages: [pkg],
      verify: acceptingVerify,
      fetch: (async () => {
        calls += 1
        return new Response('not found', { status: 404 })
      }) as typeof globalThis.fetch,
    })
    expect(calls, 'a 404 is an answer; retrying it wastes the budget').toBe(1)
    expect(verified).toEqual({})
    expect(failures['@zeus-web/button@0.1.0-beta.34']?.state).toBe('missing')
  })

  it('reports persistent 503 as retryable, after the configured attempts', async () => {
    let calls = 0
    const { failures } = await fetchAttestationSources({
      packages: [pkg],
      verify: acceptingVerify,
      attempts: 3,
      baseDelayMs: 1,
      fetch: (async () => {
        calls += 1
        return new Response('busy', { status: 503 })
      }) as typeof globalThis.fetch,
    })
    expect(calls).toBe(3)
    expect(failures['@zeus-web/button@0.1.0-beta.34']?.state).toBe('retryable')
  })

  it('reports a dropped connection as an infrastructure failure', async () => {
    const { failures } = await fetchAttestationSources({
      packages: [pkg],
      verify: acceptingVerify,
      attempts: 2,
      baseDelayMs: 1,
      fetch: (async () => {
        throw new Error('ECONNREFUSED')
      }) as typeof globalThis.fetch,
    })
    expect(failures['@zeus-web/button@0.1.0-beta.34']?.state).toBe(
      'infrastructure',
    )
  })

  it('reports a signature failure as invalid, not as missing', async () => {
    const { verified, failures } = await fetchAttestationSources({
      packages: [pkg],
      fetch: okFetch,
      verify: (async () => ({
        ok: false as const,
        failure: {
          kind: 'invalid' as const,
          detail: 'Sigstore did not verify the signature',
          errors: ['VerificationError: DSSE payload hash mismatch'],
        },
      })) as unknown as typeof verifyAttestation,
    })
    expect(verified).toEqual({})
    const status = failures['@zeus-web/button@0.1.0-beta.34']
    expect(status?.state).toBe('invalid')
    expect(JSON.stringify(status)).toMatch(/Sigstore did not verify/)
  })

  it('reports a package with no SLSA entry as missing', async () => {
    const { failures } = await fetchAttestationSources({
      packages: [pkg],
      verify: acceptingVerify,
      fetch: (async () =>
        new Response(
          JSON.stringify({
            attestations: [
              {
                predicateType:
                  'https://github.com/npm/attestation/tree/main/specs/publish/v0.1',
              },
            ],
          }),
          { status: 200 },
        )) as typeof globalThis.fetch,
    })
    expect(failures['@zeus-web/button@0.1.0-beta.34']?.state).toBe('missing')
    expect(JSON.stringify(failures)).toMatch(/no SLSA v1/)
  })

  it('retries a 5xx and succeeds when the registry recovers', async () => {
    let calls = 0
    const { verified } = await fetchAttestationSources({
      packages: [pkg],
      verify: acceptingVerify,
      baseDelayMs: 1,
      fetch: (async () => {
        calls += 1
        return calls < 3
          ? new Response('busy', { status: 503 })
          : new Response(JSON.stringify(attestationResponse()), { status: 200 })
      }) as typeof globalThis.fetch,
    })
    expect(calls).toBe(3)
    expect(verified['@zeus-web/button@0.1.0-beta.34']?.commit).toBe(attested)
  })

  /*
   * Without a total budget, a registry that accepts connections and never
   * answers hangs the job until GitHub's own timeout kills it — with no report.
   */
  it('stops at the total budget instead of running forever', async () => {
    let clock = 0
    const { failures } = await fetchAttestationSources({
      packages: Array.from({ length: 5 }, (_, index) => ({
        name: `@zeus-web/pkg${index}`,
        version: '1.0.0',
      })),
      verify: acceptingVerify,
      concurrency: 1,
      attempts: 1,
      baseDelayMs: 1,
      totalTimeoutMs: 10,
      now: () => {
        // Each read advances 5ms, so the deadline is crossed after two reads.
        clock += 5
        return clock
      },
      fetch: (async () =>
        new Response(JSON.stringify(attestationResponse()), {
          status: 200,
        })) as typeof globalThis.fetch,
    })
    const states = Object.values(failures).map(status => status.state)
    expect(states).toContain('infrastructure')
    expect(JSON.stringify(failures)).toMatch(/total budget exhausted/)
  })

  it('records one result per package for an audit trail', async () => {
    const lines: string[] = []
    await fetchAttestationSources({
      packages: [pkg, { name: '@zeus-web/gone', version: '9.9.9' }],
      verify: acceptingVerify,
      fetch: (async (url: string | URL | Request) =>
        String(url).includes('gone')
          ? new Response('nope', { status: 404 })
          : new Response(JSON.stringify(attestationResponse()), {
              status: 200,
            })) as typeof globalThis.fetch,
      onResult: (name, detail) => lines.push(`${name}: ${detail}`),
    })
    expect(lines).toHaveLength(2)
    expect(lines.join('\n')).toMatch(
      /@zeus-web\/button@0\.1\.0-beta\.34: verified/,
    )
    expect(lines.join('\n')).toMatch(/@zeus-web\/gone@9\.9\.9: missing/)
  })

  it('passes the lockfile integrity so the subject binds to real bytes', async () => {
    const seen: { expectedSha512?: string }[] = []
    await fetchAttestationSources({
      packages: [{ ...pkg, integrity: 'sha512-abc=' }],
      fetch: okFetch,
      verify: (async (
        _bundle: unknown,
        options: { expectedSha512?: string },
      ) => {
        seen.push(options)
        return {
          ok: true as const,
          attestation: {
            verified: true as const,
            commit: attested,
            repository: 'baicie/zeus-ui',
            signerIdentity: 'stub',
            signerIssuer: 'https://token.actions.githubusercontent.com',
            tlogEntries: 1,
          },
        }
      }) as unknown as typeof verifyAttestation,
    })
    expect(seen[0]?.expectedSha512).toBe('sha512-abc=')
  })
})
