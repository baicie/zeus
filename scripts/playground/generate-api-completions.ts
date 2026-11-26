/**
 * Generates the Playground editor's Zeus API completion table.
 *
 * The table must never drift from the real API, so nothing here is hand
 * listed. The script resolves the `@zeus-js/zeus` package and loads the entry
 * declaration it publishes (`exports["."].types`) through the TypeScript
 * compiler, then asks it for the module's value exports. Adding an export,
 * renaming one, changing an overload or editing a doc comment all flow through
 * on the next run, and `pnpm api:check` runs this in `--check` mode so a
 * signature change cannot land without the editor following.
 *
 * Everything is derived from the type checker rather than a regular
 * expression, which matters for the awkward cases:
 *
 * - `ErrorBoundary` is `typeof renderErrorBoundary & { ... }`, so a regex sees
 *   an intersection; the checker sees the call signature.
 * - `event`, `prop`, `createContext`, `inject` and `useContext` are overloaded;
 *   the first overload is what a user types first, so that is the one shown.
 * - Signatures carry real return types, which is what makes a completion
 *   useful (`createSignal<T>(initialValue: T): [Accessor<T>, Setter<T>]`).
 *
 * Usage:
 *   tsx scripts/playground/generate-api-completions.ts                # write
 *   tsx scripts/playground/generate-api-completions.ts --check        # verify
 *   tsx scripts/playground/generate-api-completions.ts --out <file>   # elsewhere
 */
import fs from 'node:fs'
import path from 'node:path'

import prettier from 'prettier'
import ts from 'typescript'

const repoRoot = path.resolve(import.meta.dirname, '../..')

/** The package whose `exports["."].types` is the completion surface. */
const PACKAGE_NAME = '@zeus-js/zeus'

/**
 * Where this repository's Playground editor keeps the table.
 *
 * A consumer repository passes `--out` instead: the generated file belongs to
 * the editor, not to the package being described, so its location cannot be
 * derived from the installed package.
 */
const DEFAULT_OUTPUT_FILE = path.join(
  repoRoot,
  'examples/playground-editor/src/playground/zeus-api.generated.ts',
)

/**
 * Locates the installed `@zeus-js/zeus` package directory.
 *
 * The package is looked up in each `node_modules` on the path from the file
 * being written up to the filesystem root, then from the working directory and
 * the repository root. This is done by walking directories rather than with
 * `require.resolve` on purpose: the repository's `tsconfig.json` maps
 * `@zeus-js/*` back into `src`, and runners that honour those paths (tsx does)
 * would resolve to the source tree instead of the published declarations this
 * table has to describe.
 *
 * In this repository the package is a workspace member, so
 * `examples/playground-editor/node_modules/@zeus-js/zeus` is a symlink to
 * `packages/core/zeus`; in the migrated repository the same lookup finds a
 * real install. The workspace path is only a fallback for a checkout that has
 * not been linked yet.
 */
function resolvePackageDir(outputFile: string): string {
  const anchors = [path.dirname(outputFile), process.cwd(), repoRoot]
  for (const anchor of anchors) {
    const packageDir = findInstalledPackage(anchor)
    if (packageDir) return packageDir
  }

  const workspaceDir = path.join(repoRoot, 'packages/core/zeus')
  if (fs.existsSync(path.join(workspaceDir, 'package.json'))) {
    return workspaceDir
  }
  throw new Error(
    `Could not resolve ${PACKAGE_NAME}: it is not installed and ` +
      `${path.relative(repoRoot, workspaceDir)} is not part of this checkout.`,
  )
}

/**
 * Walks `anchor` and its ancestors looking for
 * `node_modules/@zeus-js/zeus/package.json`.
 */
function findInstalledPackage(anchor: string): string | null {
  let directory = path.resolve(anchor)
  while (true) {
    const candidate = path.join(directory, 'node_modules', PACKAGE_NAME)
    if (fs.existsSync(path.join(candidate, 'package.json'))) return candidate
    const parent = path.dirname(directory)
    if (parent === directory) return null
    directory = parent
  }
}

/** What the editor shows after a value name. */
export interface ApiCompletion {
  readonly name: string
  /** One-line signature, for example `createSignal<T>(initialValue: T): ...`. */
  readonly signature: string
  /** Doc comment, collapsed to a single line. */
  readonly documentation: string
  /** `function` | `component` | `constant`. */
  readonly kind: string
}

/**
 * Return types that mean "this renders something".
 *
 * A compiler intrinsic is classified by what it returns rather than by name,
 * so this list describes Zeus's render types, not its API surface: a new
 * intrinsic returning `JSXValue` is a component without anyone editing this.
 */
const RENDER_RETURN_TYPES = new Set(['JSXValue', 'DocumentFragment', 'Comment'])

function resolveDtsEntry(packageDir: string): string {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8'),
  ) as {
    exports?: Record<string, unknown>
  }
  const dot = manifest.exports?.['.']
  const types = findTypesTarget(dot)
  if (!types) {
    throw new Error('@zeus-js/zeus does not declare a types entry for ".".')
  }
  const file = path.resolve(packageDir, types)
  if (!fs.existsSync(file)) {
    throw new Error(
      `Declaration entry ${path.relative(repoRoot, file)} is missing. ` +
        'Run "pnpm build-dts" before generating: "pnpm build" emits the JS ' +
        'bundles but the declaration files come from a separate step.',
    )
  }
  return file
}

/** Walks a conditional `exports` value looking for its `types` target. */
function findTypesTarget(value: unknown): string | null {
  if (!value || typeof value !== 'object') return null
  const record = value as Record<string, unknown>
  if (typeof record.types === 'string') return record.types
  for (const key of ['import', 'module', 'require', 'node', 'default']) {
    const found = findTypesTarget(record[key])
    if (found) return found
  }
  return null
}

/** Follows re-export aliases back to the declaration that defines the value. */
function resolveAlias(checker: ts.TypeChecker, symbol: ts.Symbol): ts.Symbol {
  let current = symbol
  const seen = new Set<ts.Symbol>()
  while (current.getFlags() & ts.SymbolFlags.Alias) {
    if (seen.has(current)) break
    seen.add(current)
    try {
      current = checker.getAliasedSymbol(current)
    } catch {
      break
    }
  }
  return current
}

/**
 * Reads the JSDoc a symbol's declaration actually carries.
 *
 * Declaration files bundle docs next to the declaration, and the checker does
 * not expose them through the symbol for re-exports, so the leading comment
 * range is read from the source text.
 */
function documentationOf(symbol: ts.Symbol): string {
  const declarations = symbol.getDeclarations() ?? []
  for (const declaration of declarations) {
    const source = declaration.getSourceFile()
    const ranges = ts.getLeadingCommentRanges(
      source.text,
      declaration.getFullStart(),
    )
    if (!ranges) continue
    for (const range of ranges) {
      const text = source.text.slice(range.pos, range.end)
      if (!text.startsWith('/**')) continue
      const summary = summarize(text)
      if (summary) return summary
    }
  }
  return ''
}

/**
 * Collapses a doc comment to one sentence.
 *
 * A completion popup shows one line, so anything past the first sentence is
 * noise, and the cap stops a run-on sentence from flooding the tooltip.
 */
function summarize(comment: string): string {
  const text = comment
    .split('\n')
    .map(line => line.replace(/^\s*\/?\*+\/?/, '').trim())
    .filter(line => line.length > 0 && !line.startsWith('@'))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (text.length === 0) return ''
  const sentence = /^(.+?[.!?])(?:\s|$)/.exec(text)?.[1] ?? text
  return sentence.length > 160 ? `${sentence.slice(0, 157)}…` : sentence
}

/** Strips the `import("@zeus-js/x").` qualifier the checker prints. */
function unqualify(signature: string): string {
  return signature.replace(/import\("[^"]+"\)\./g, '')
}

function signatureOf(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  at: ts.Node,
): string | undefined {
  const type = checker.getTypeOfSymbolAtLocation(symbol, at)
  const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call)
  const signature = signatures[0]
  if (!signature) return undefined
  // `signatureToString` prints the type parameters and parameters only; the
  // name comes from the export, which is what the user types.
  const text = checker.signatureToString(
    signature,
    at,
    ts.TypeFormatFlags.NoTruncation,
  )
  return unqualify(`${symbol.getName()}${text}`)
}

function kindOf(
  checker: ts.TypeChecker,
  symbol: ts.Symbol,
  at: ts.Node,
): string {
  const type = checker.getTypeOfSymbolAtLocation(symbol, at)
  const signatures = checker.getSignaturesOfType(type, ts.SignatureKind.Call)
  const signature = signatures[0]
  if (!signature) return 'constant'
  const returns = checker.getReturnTypeOfSignature(signature)
  const name =
    returns.aliasSymbol?.getName() ?? returns.getSymbol()?.getName() ?? ''
  return RENDER_RETURN_TYPES.has(name) ? 'component' : 'function'
}

function collect(outputFile: string): ApiCompletion[] {
  const entry = resolveDtsEntry(resolvePackageDir(outputFile))
  const configPath = ts.findConfigFile(
    repoRoot,
    ts.sys.fileExists,
    'tsconfig.json',
  )
  if (!configPath) throw new Error('Could not find tsconfig.json.')
  const read = ts.readConfigFile(configPath, ts.sys.readFile)
  const parsed = ts.parseJsonConfigFileContent(read.config, ts.sys, repoRoot)

  // `paths` maps `@zeus-js/*` back into `src` for the repository's own type
  // check. A completion table has to describe what the package *publishes*, so
  // it is dropped here: the entry then resolves through `node_modules` and the
  // signatures come from `dist/*.d.ts`.
  const { paths: _paths, baseUrl: _baseUrl, ...options } = parsed.options

  const program = ts.createProgram([entry], {
    ...options,
    noEmit: true,
    composite: false,
    incremental: false,
    declaration: false,
    declarationMap: false,
  })
  const checker = program.getTypeChecker()
  const source = program.getSourceFile(entry)
  if (!source) throw new Error(`Could not load ${entry}.`)
  const moduleSymbol = checker.getSymbolAtLocation(source)
  if (!moduleSymbol) throw new Error(`${entry} is not a module.`)

  const entries: ApiCompletion[] = []
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol = resolveAlias(checker, exported)
    // Type-only exports (`Accessor`, `ShowProps`, ...) appear in type
    // positions, where this editor has no semantic analysis to offer them.
    if (!(symbol.getFlags() & ts.SymbolFlags.Value)) continue

    const name = exported.getName()
    const signature = signatureOf(checker, symbol, source)
    // A non-callable value still deserves an entry if it is an intrinsic; a
    // plain runtime constant without a call signature is not useful here.
    if (!signature) continue

    entries.push({
      name,
      signature,
      documentation: documentationOf(symbol),
      kind: kindOf(checker, symbol, source),
    })
  }

  entries.sort((left, right) => left.name.localeCompare(right.name))
  return entries
}

async function render(entries: readonly ApiCompletion[]): Promise<string> {
  const body = entries
    .map(entry =>
      [
        '  {',
        `    name: ${JSON.stringify(entry.name)},`,
        `    signature: ${JSON.stringify(entry.signature)},`,
        `    documentation: ${JSON.stringify(entry.documentation)},`,
        `    kind: ${JSON.stringify(entry.kind)},`,
        '  },',
      ].join('\n'),
    )
    .join('\n')

  const source = `// Generated by scripts/playground/generate-api-completions.ts — do not edit.
// Regenerate with \`pnpm playground:api\`; \`pnpm api:check\` fails when this
// file no longer matches the declarations \`@zeus-js/zeus\` publishes.
import type { ApiCompletion } from './zeus-api'

export const zeusApiCompletions: readonly ApiCompletion[] = [
${body}
]
`
  return prettier.format(source, {
    parser: 'typescript',
    semi: false,
    singleQuote: true,
    printWidth: 80,
  })
}

/**
 * Reads `--out <file>` / `--out=<file>`, or returns null for the default path.
 *
 * An explicit output is resolved against the working directory: a consumer
 * repository names a path in its own tree, not one relative to this script.
 */
function parseOutFlag(argv: readonly string[]): string | null {
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index]
    if (argument === '--out') {
      const value = argv[index + 1]
      if (!value || value.startsWith('--')) {
        throw new Error('--out requires a file path.')
      }
      return path.resolve(process.cwd(), value)
    }
    if (argument.startsWith('--out=')) {
      const value = argument.slice('--out='.length)
      if (!value) throw new Error('--out requires a file path.')
      return path.resolve(process.cwd(), value)
    }
  }
  return null
}

async function main(): Promise<void> {
  const check = process.argv.includes('--check')
  const outputFile = parseOutFlag(process.argv.slice(2)) ?? DEFAULT_OUTPUT_FILE
  const entries = collect(outputFile)

  if (entries.length === 0) {
    throw new Error(
      'Found no public value exports in the @zeus-js/zeus declarations. ' +
        'The build output is probably stale.',
    )
  }

  const next = await render(entries)

  if (check) {
    const current = fs.existsSync(outputFile)
      ? fs.readFileSync(outputFile, 'utf8')
      : ''
    if (current !== next) {
      console.error(
        '::error::Zeus API completions are stale. Run `pnpm playground:api` and commit the result.',
      )
      process.exit(1)
    }
    console.log(`api completions ok: ${entries.length} entries`)
    return
  }

  fs.mkdirSync(path.dirname(outputFile), { recursive: true })
  fs.writeFileSync(outputFile, next)
  console.log(
    `wrote ${entries.length} completions to ${path.relative(repoRoot, outputFile)}`,
  )
}

void main()
