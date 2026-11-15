/**
 * The SBOM must be a CycloneDX document, not a document with a CycloneDX shape.
 *
 * The previous version put third-party dependencies in a custom top-level key
 * (`zeus:runtimeDependencies`). Validated against the official 1.5 schema, that
 * key is an additional property the spec does not allow — so the file could not
 * be consumed by anything that actually reads the standard. It looked like a
 * bill of materials and was not one.
 *
 * These tests validate against the real schema. The schemas are vendored under
 * `scripts/check/schemas/cyclonedx/` so a test does not depend on the network.
 */
import fs from 'node:fs'
import path from 'node:path'

import Ajv from 'ajv'
import addFormats from 'ajv-formats'
import { describe, expect, it } from 'vitest'

import { findWorkspacePackages } from '../../shared/utils'
import {
  buildDependencyGraph,
  collectRuntimeDependencies,
  createSbom,
  dependencyGraphProblems,
} from '../check-sbom'

const root = path.resolve(import.meta.dirname, '../../..')
const schemaDir = path.join(root, 'scripts/check/schemas/cyclonedx')

function validator(): (value: unknown) => boolean {
  /*
   * `strict: false` alone still makes ajv warn about formats it does not know
   * (`iri-reference`, `idn-email`), and vitest surfaces those warnings as a
   * test failure. They are properties of the CycloneDX schema, not of our
   * document — the fields they guard are optional and we emit none of them.
   * `logger: false` silences the report without disabling validation.
   */
  const ajv = new Ajv({ allErrors: true, strict: false, logger: false })
  addFormats(ajv)
  ajv.addSchema(
    JSON.parse(
      fs.readFileSync(path.join(schemaDir, 'spdx.schema.json'), 'utf8'),
    ),
  )
  ajv.addSchema(
    JSON.parse(
      fs.readFileSync(path.join(schemaDir, 'jsf-0.82.schema.json'), 'utf8'),
    ),
  )
  const schema = JSON.parse(
    fs.readFileSync(path.join(schemaDir, 'bom-1.5.schema.json'), 'utf8'),
  ) as object
  const validate = ajv.compile(schema)
  return value => {
    const ok = validate(value)
    if (!ok && validate.errors) {
      const detail = validate.errors
        .slice(0, 5)
        .map(error => `${error.instancePath || '(root)'} ${error.message}`)
        .join('; ')
      throw new Error(`CycloneDX 1.5 validation failed: ${detail}`)
    }
    return true
  }
}

/** The published packages, keyed by the lockfile importer path. */
function publishedImporters(): Record<string, string> {
  const lockfile = fs.readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8')
  const config = fs.readFileSync(
    path.join(root, 'scripts/release.config.ts'),
    'utf8',
  )
  const block = /export const zeusFixedPackages = \[([\s\S]*?)\]/.exec(config)
  const names = new Set(
    [...(block?.[1] ?? '').matchAll(/@(zeus-js\/[a-z0-9-]+)/g)].map(
      match => `@${match[1]}`,
    ),
  )
  const importers: Record<string, string> = {}
  for (const match of lockfile.matchAll(/^ {2}(packages\/[^:]+):\s*$/gm)) {
    const relative = match[1] as string
    const manifestPath = path.resolve(root, relative, 'package.json')
    if (!fs.existsSync(manifestPath)) continue
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
      name?: string
    }
    if (manifest.name && names.has(manifest.name)) {
      importers[relative] = manifest.name
    }
  }
  return importers
}

async function buildSbom() {
  const lockfile = fs.readFileSync(path.join(root, 'pnpm-lock.yaml'), 'utf8')
  const runtime = collectRuntimeDependencies(lockfile, publishedImporters())
  return {
    bom: await createSbom(findWorkspacePackages(), runtime),
    runtime,
  }
}

describe('CycloneDX conformance', () => {
  it('validates against the official 1.5 schema', async () => {
    const { bom } = await buildSbom()
    expect(validator()(bom)).toBe(true)
  })

  it('has no custom top-level keys', async () => {
    const { bom } = await buildSbom()
    // The schema's `additionalProperties: false` is what rejects them; this
    // names the specific mistake so a regression reads clearly.
    expect(Object.keys(bom)).not.toContain('zeus:runtimeDependencies')
  })

  it('lists third-party dependencies as standard components', async () => {
    const { bom, runtime } = await buildSbom()
    expect(runtime.length).toBeGreaterThan(0)
    const refs = new Set(
      (bom.components ?? []).map(component => component['bom-ref']),
    )
    for (const dependency of runtime) {
      expect(
        refs.has(`${dependency.name}@${dependency.version}`),
        `${dependency.name}@${dependency.version} must appear as a component`,
      ).toBe(true)
    }
  })

  it('has a dependency graph with an edge from every published package', async () => {
    const { bom } = await buildSbom()
    const dependencies = (bom as { dependencies?: unknown[] }).dependencies
    expect(Array.isArray(dependencies)).toBe(true)
    expect((dependencies ?? []).length).toBeGreaterThan(0)
  })

  it('gives every component a unique bom-ref', async () => {
    const { bom } = await buildSbom()
    const refs = (bom.components ?? []).map(component => component['bom-ref'])
    expect(new Set(refs).size).toBe(refs.length)
  })
})

describe('multi-version dependencies', () => {
  /*
   * A Map keyed by package name silently merges two versions of the same
   * library. A bill of materials that reports one component where there are two
   * is wrong in the direction that matters: it hides a version.
   */
  const multiVersionLockfile = `lockfileVersion: '9.0'

importers:

  packages/a:
    dependencies:
      shared-lib:
        specifier: ^1.0.0
        version: 1.0.0

  packages/b:
    dependencies:
      shared-lib:
        specifier: ^2.0.0
        version: 2.0.0
`

  it('keeps both versions as separate components', () => {
    const dependencies = collectRuntimeDependencies(multiVersionLockfile, {
      'packages/a': '@zeus-js/a',
      'packages/b': '@zeus-js/b',
    })
    expect(
      dependencies
        .filter(entry => entry.name === 'shared-lib')
        .map(entry => entry.version)
        .sort(),
      'both versions must survive collection',
    ).toEqual(['1.0.0', '2.0.0'])
  })

  it('records which package requires which version', () => {
    const dependencies = collectRuntimeDependencies(multiVersionLockfile, {
      'packages/a': '@zeus-js/a',
      'packages/b': '@zeus-js/b',
    })
    const one = dependencies.find(
      entry => entry.name === 'shared-lib' && entry.version === '1.0.0',
    )
    const two = dependencies.find(
      entry => entry.name === 'shared-lib' && entry.version === '2.0.0',
    )
    expect(one?.requiredBy).toEqual(['@zeus-js/a'])
    expect(two?.requiredBy).toEqual(['@zeus-js/b'])
  })
})

/**
 * The graph check must catch the ways a dependency graph goes wrong.
 *
 * A previous version compared only `name@version`, so moving a dependency from
 * one published package to another — a real change in what installs what —
 * passed untouched.
 */

describe('dependency graph validation', () => {
  const workspace = [
    {
      type: 'library' as const,
      name: '@zeus-js/a',
      version: '1.0.0',
      'bom-ref': '@zeus-js/a@1.0.0',
    },
    {
      type: 'library' as const,
      name: '@zeus-js/b',
      version: '1.0.0',
      'bom-ref': '@zeus-js/b@1.0.0',
    },
  ]
  const runtime = [
    { name: 'left-pad', version: '1.3.0', requiredBy: ['@zeus-js/a'] },
    { name: 'right-pad', version: '2.0.0', requiredBy: ['@zeus-js/b'] },
  ]
  const names = ['@zeus-js/a', '@zeus-js/b']

  function document() {
    const thirdParty = runtime.map(entry => ({
      type: 'library' as const,
      name: entry.name,
      version: entry.version,
      'bom-ref': `${entry.name}@${entry.version}`,
      scope: 'required' as const,
    }))
    return {
      bomFormat: 'CycloneDX',
      specVersion: '1.5',
      version: 1,
      metadata: { timestamp: '1970-01-01T00:00:00.000Z', tools: [] },
      components: [...workspace, ...thirdParty],
      dependencies: buildDependencyGraph(workspace, runtime),
    }
  }

  it('accepts a graph the lockfile implies', () => {
    expect(dependencyGraphProblems(document(), runtime, names)).toEqual([])
  })

  it('rejects a moved edge', () => {
    // Same `name@version` set, different owner: only a graph check sees it.
    const moved = [
      { name: 'left-pad', version: '1.3.0', requiredBy: ['@zeus-js/b'] },
      { name: 'right-pad', version: '2.0.0', requiredBy: ['@zeus-js/a'] },
    ]
    const problems = dependencyGraphProblems(document(), moved, names)
    expect(problems.join('\n')).toMatch(
      /missing an edge|edge to .* does not imply/,
    )
  })

  it('rejects a missing component', () => {
    const doc = document()
    doc.components = doc.components.filter(
      component => component['bom-ref'] !== 'left-pad@1.3.0',
    )
    expect(dependencyGraphProblems(doc, runtime, names).join('\n')).toMatch(
      /missing component/,
    )
  })

  it('rejects a duplicate bom-ref', () => {
    const doc = document()
    doc.components.push({ ...doc.components[0]! })
    expect(dependencyGraphProblems(doc, runtime, names).join('\n')).toMatch(
      /duplicate bom-ref/,
    )
  })

  it('rejects an extra component', () => {
    const doc = document()
    doc.components.push({
      type: 'library' as const,
      name: 'unexpected',
      version: '9.9.9',
      'bom-ref': 'unexpected@9.9.9',
    })
    expect(dependencyGraphProblems(doc, runtime, names).join('\n')).toMatch(
      /not implied by the lockfile/,
    )
  })

  it('rejects a wrong version', () => {
    const wrong = [
      { name: 'left-pad', version: '1.4.0', requiredBy: ['@zeus-js/a'] },
      { name: 'right-pad', version: '2.0.0', requiredBy: ['@zeus-js/b'] },
    ]
    const problems = dependencyGraphProblems(document(), wrong, names)
    expect(problems.join('\n')).toMatch(/missing component.*left-pad@1\.4\.0/)
  })

  it('rejects a dangling edge', () => {
    const doc = document()
    doc.dependencies.push({
      ref: '@zeus-js/a@1.0.0',
      dependsOn: ['ghost@0.0.0'],
    })
    expect(dependencyGraphProblems(doc, runtime, names).join('\n')).toMatch(
      /dangling edge/,
    )
  })

  it('rejects a dependency node naming a missing component', () => {
    const doc = document()
    doc.dependencies.push({ ref: 'ghost@0.0.0', dependsOn: [] })
    expect(dependencyGraphProblems(doc, runtime, names).join('\n')).toMatch(
      /names a missing component/,
    )
  })
})
