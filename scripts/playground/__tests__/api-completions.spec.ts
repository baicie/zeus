/**
 * Guards the generator that feeds the editor's Zeus API completion table.
 *
 * The whole point of generating the table is that it cannot drift from the
 * public API. That guarantee rests on three properties, and each one is pinned
 * here against the real published declarations:
 *
 * 1. Every value `@zeus-js/zeus` exports has an entry — nothing is hand listed.
 * 2. Every entry carries a real signature, not a truncated or empty one.
 * 3. The awkward declarations (intersections, overloads, name prefixes) are
 *    resolved by the type checker rather than guessed by a pattern.
 *
 * These run against `packages/core/zeus/dist`, so they need `pnpm build`; the
 * suite is skipped rather than failed when dist is absent.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import ts from 'typescript'
import { beforeAll, describe, expect, it } from 'vitest'

import { findWorkspacePackages } from '../../shared/utils'

interface GeneratedEntry {
  readonly name: string
  readonly signature: string
  readonly documentation: string
  readonly kind: string
}

// Located through the workspace list rather than a relative hop count, so the
// spec does not silently point outside the repository when moved.
const zeusDir = findWorkspacePackages().find(
  pkg => pkg.name === '@zeus-js/zeus',
)!.dir
const repoRoot = path.resolve(zeusDir, '../../..')
const entryFile = path.join(zeusDir, 'dist/zeus.d.ts')
const generatedFile = path.join(
  repoRoot,
  'examples/playground-editor/src/playground/zeus-api.generated.ts',
)

const hasBuild = fs.existsSync(entryFile)

/** The value exports of the published entry, resolved from `dist`. */
function publishedValueExports(): string[] {
  const configPath = ts.findConfigFile(
    repoRoot,
    ts.sys.fileExists,
    'tsconfig.json',
  )
  const read = ts.readConfigFile(configPath!, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, repoRoot)
  // Match the generator: no `paths`, so the entry resolves through the
  // published declarations rather than back into `src`.
  const { paths: _paths, baseUrl: _baseUrl, ...options } = parsed.options
  const program = ts.createProgram([entryFile], { ...options, noEmit: true })
  const checker = program.getTypeChecker()
  const source = program.getSourceFile(entryFile)!
  const moduleSymbol = checker.getSymbolAtLocation(source)!

  const names: string[] = []
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    let symbol = exported
    const seen = new Set<ts.Symbol>()
    while (symbol.getFlags() & ts.SymbolFlags.Alias) {
      if (seen.has(symbol)) break
      seen.add(symbol)
      symbol = checker.getAliasedSymbol(symbol)
    }
    if (symbol.getFlags() & ts.SymbolFlags.Value) names.push(exported.getName())
  }
  return names.sort()
}

describe.skipIf(!hasBuild)('Zeus API completion table', () => {
  let generated: readonly GeneratedEntry[]

  // Imported rather than pattern-matched out of the source text: the module is
  // a plain data file, and `prettier` is free to re-quote a string, so reading
  // it as text would test the formatter instead of the table.
  beforeAll(async () => {
    const module = (await import(pathToFileURL(generatedFile).href)) as {
      zeusApiCompletions: readonly GeneratedEntry[]
    }
    generated = module.zeusApiCompletions
  })

  it('covers exactly the value exports of @zeus-js/zeus', () => {
    // The generator is driven by the module's exports, so this equality is the
    // anti-drift guarantee: a new export without regeneration fails here, and
    // a stale entry for a removed export fails too.
    expect(generated.map(entry => entry.name).sort()).toEqual(
      publishedValueExports(),
    )
  })

  it('records a real signature for every entry', () => {
    for (const entry of generated) {
      expect(
        entry.signature.startsWith(entry.name),
        `${entry.name} signature must start with its name, got "${entry.signature}"`,
      ).toBe(true)
      // A signature with no parameter list and no type annotation means
      // extraction degraded to echoing the name.
      expect(entry.signature, `${entry.name} has no type information`).toMatch(
        /[(:<>]/,
      )
      expect(entry.signature.length).toBeGreaterThan(entry.name.length + 2)
    }
  })

  it('resolves declarations a pattern would get wrong', () => {
    const byName = new Map(generated.map(entry => [entry.name, entry]))

    // `ErrorBoundary` is declared as an intersection (`typeof renderX & {...}`)
    // with the call signature on a separate declaration. A text scan cuts it
    // off mid-type; the checker reports the real call.
    const errorBoundary = byName.get('ErrorBoundary')!
    expect(errorBoundary.signature).toContain('ErrorBoundaryProps')
    expect(errorBoundary.signature).toContain('DocumentFragment')
    expect(errorBoundary.signature).not.toContain('& {')

    // `render` is a prefix of `renderErrorBoundary`; a regex without a word
    // boundary grabs the wrong declaration.
    expect(byName.get('render')!.signature).toContain('container:')

    // Return types are the reason to use the checker at all.
    expect(byName.get('createSignal')!.signature).toContain('Accessor<T>')
    expect(byName.get('batch')!.signature).toMatch(/\):\s*T$/)

    // No leftover `import("@zeus-js/...").` qualifiers from the printer.
    for (const entry of generated) {
      expect(
        entry.signature,
        `${entry.name} keeps a module qualifier`,
      ).not.toContain('import("')
    }
  })

  it('marks render-returning exports as components', () => {
    const components = generated
      .filter(entry => entry.kind === 'component')
      .map(entry => entry.name)
      .sort()
    // These all return a render value, so they are classified by return type
    // rather than by a hand-maintained name list.
    expect(components).toEqual(
      [
        'ErrorBoundary',
        'For',
        'Host',
        'Portal',
        'Show',
        'Slot',
        'Transition',
      ].sort(),
    )
  })

  it('carries the documentation the declaration provides', () => {
    const batch = generated.find(entry => entry.name === 'batch')!
    expect(batch.documentation).toContain('Batches reactive updates')
    // One sentence, one line, no comment syntax left behind.
    for (const entry of generated) {
      expect(entry.documentation).not.toContain('*')
      expect(entry.documentation).not.toContain('\n')
    }
  })
})
