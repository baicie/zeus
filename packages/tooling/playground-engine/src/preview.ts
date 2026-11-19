import { parse } from '@babel/parser'

import {
  DEFAULT_PLAYGROUND_RUNTIME_MODULES,
  type PlaygroundCompileResult,
} from './compiler'

import type Babel from '@babel/standalone'

export interface PlaygroundPreviewModule {
  readonly path: string
  readonly code: string
  readonly imports: readonly string[]
}

export interface PlaygroundPreviewPayload {
  readonly entryPath: string
  readonly modules: readonly PlaygroundPreviewModule[]
  readonly styles: readonly {
    readonly path: string
    readonly content: string
  }[]
  readonly runtimeModules: readonly string[]
}

export interface PlaygroundPreviewOptions {
  /**
   * Maps an import specifier to the key exposed by the sandbox runtime.
   * Zeus modules default to their package specifier.
   */
  readonly runtimeModules?: Readonly<Record<string, string>>
}

export class PlaygroundPreviewError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PlaygroundPreviewError'
  }
}

interface SyntaxNode {
  readonly type: string
  readonly start?: number | null
  readonly end?: number | null
  readonly source?: SyntaxNode | null
  readonly local?: SyntaxNode | null
  readonly imported?: SyntaxNode | null
  readonly importKind?: string | null
  readonly exportKind?: string | null
  readonly specifiers?: readonly SyntaxNode[]
  readonly value?: unknown
  readonly [key: string]: unknown
}

interface Edit {
  readonly start: number
  readonly end: number
  readonly text: string
}

const MODULE_PLACEHOLDER_PREFIX = '__ZEUS_PLAYGROUND_MODULE_'
const RUNTIME_GLOBAL = '__ZEUS_PLAYGROUND_RUNTIME__'

export async function createPlaygroundPreview(
  build: PlaygroundCompileResult,
  options: PlaygroundPreviewOptions = {},
): Promise<PlaygroundPreviewPayload> {
  if (build.target !== 'dom') {
    throw new PlaygroundPreviewError(
      'Only DOM compiler output can run in the browser preview.',
    )
  }
  const errors = build.diagnostics.filter(
    diagnostic => diagnostic.severity === 'error',
  )
  if (errors.length > 0) {
    throw new PlaygroundPreviewError(
      `Cannot preview a build with ${errors.length} diagnostic(s).`,
    )
  }

  const moduleIndex = new Map(
    build.modules.map((module, index) => [module.path, index]),
  )
  const runtimeModules = options.runtimeModules ?? {}
  const runtimeKeys = new Set<string>()
  const modules: PlaygroundPreviewModule[] = []
  for (const module of build.modules) {
    const executableCode = await stripTypeScript(module.code, module.path)
    const parsed = parse(executableCode, {
      sourceType: 'module',
      plugins: ['jsx'],
    })
    const edits: Edit[] = []
    const dependencyPaths = new Set<string>()
    const declare = parsed.program.body

    for (const node of declare) {
      const syntax = node as SyntaxNode
      if (syntax.type === 'ImportDeclaration') {
        if (syntax.importKind === 'type') {
          edits.push(editForNode(syntax, ''))
          continue
        }
        const specifier = readSourceValue(syntax)
        if (!specifier) continue
        const edge = findEdge(module, specifier, runtimeModules)
        if (!edge) {
          throw previewError(module.path, specifier)
        }
        if (edge.typeOnly || edge.kind === 'style') {
          edits.push(editForNode(syntax, ''))
          continue
        }
        if (edge.kind === 'local' || edge.kind === 'json') {
          const dependencyIndex = edge.resolvedPath
            ? moduleIndex.get(edge.resolvedPath)
            : undefined
          if (dependencyIndex === undefined || !edge.resolvedPath) {
            throw previewError(module.path, specifier)
          }
          dependencyPaths.add(edge.resolvedPath)
          edits.push(
            editForSource(
              syntax,
              JSON.stringify(modulePlaceholder(dependencyIndex)),
            ),
          )
          continue
        }
        if (edge.kind === 'runtime') {
          const runtimeKey = runtimeModules[specifier] ?? specifier
          runtimeKeys.add(runtimeKey)
          edits.push(
            editForNode(syntax, importBindingsToRuntime(syntax, runtimeKey)),
          )
          continue
        }
        throw previewError(module.path, specifier)
      }

      if (
        syntax.type !== 'ExportNamedDeclaration' &&
        syntax.type !== 'ExportAllDeclaration'
      ) {
        continue
      }
      const specifier = readSourceValue(syntax)
      if (!specifier) continue
      if (syntax.exportKind === 'type') {
        edits.push(editForNode(syntax, ''))
        continue
      }
      const edge = findEdge(module, specifier, runtimeModules)
      if (!edge || edge.kind === 'external' || edge.kind === 'runtime') {
        throw previewError(module.path, specifier)
      }
      if (edge.kind === 'style') {
        throw new PlaygroundPreviewError(
          `Module "${module.path}" re-exports stylesheet "${specifier}". CSS cannot be an ES module export.`,
        )
      }
      const dependencyIndex = edge.resolvedPath
        ? moduleIndex.get(edge.resolvedPath)
        : undefined
      if (dependencyIndex === undefined || !edge.resolvedPath) {
        throw previewError(module.path, specifier)
      }
      dependencyPaths.add(edge.resolvedPath)
      edits.push(
        editForSource(
          syntax,
          JSON.stringify(modulePlaceholder(dependencyIndex)),
        ),
      )
    }

    const dynamicEdits = rewriteDynamicImports(
      parsed.program,
      module,
      moduleIndex,
    )
    edits.push(...dynamicEdits)
    const code = applyEdits(executableCode, edits).trim()
    modules.push(
      Object.freeze({
        path: module.path,
        code,
        imports: Object.freeze([...dependencyPaths]),
      }),
    )
  }

  return Object.freeze({
    entryPath: build.entryPath,
    modules: Object.freeze(modules),
    styles: Object.freeze(
      build.styles.map(style =>
        Object.freeze({ path: style.path, content: style.content }),
      ),
    ),
    runtimeModules: Object.freeze([...runtimeKeys].sort()),
  })
}

async function stripTypeScript(
  source: string,
  filename: string,
): Promise<string> {
  try {
    const { default: BabelRuntime } = await import('@babel/standalone')
    const result = BabelRuntime.transform(source, {
      filename,
      sourceType: 'module',
      sourceMaps: false,
      presets: ['typescript'],
      // @babel/standalone's ambient types narrow plugin visitors through a
      // union that is stricter than its own public transform signature.
      plugins: [loopBudgetPlugin as never],
    })
    if (!result?.code) {
      throw new Error('Babel returned no executable module code.')
    }
    return result.code
  } catch (error) {
    throw new PlaygroundPreviewError(
      `Could not strip TypeScript from "${filename}": ${error instanceof Error ? error.message : String(error)}`,
    )
  }
}

/**
 * Injects a wall-clock budget into every loop.
 *
 * ## Order matters: block first, then insert
 *
 * `ensureBlock()` turns a single-statement loop body into a block. It must run
 * **before** anything is inserted around the loop, because the surrounding
 * container may be a single-statement position (`if (c) while (x) {}`,
 * `else while (x) {}`, a labelled statement). Babel cannot insert an array of
 * statements into such a position and throws
 * `Can't convert array path to a block statement`, which failed the whole
 * preview compile for ordinary user code.
 *
 * ## The start timestamp lives in a block, not beside the loop
 *
 * `const started = now()` placed next to the loop via `insertBefore` also
 * requires a statement-list parent. Instead the timestamp is declared as the
 * first statement of the loop's own (now guaranteed) body. That works in every
 * container, and it is re-initialised on each entry to the loop, which is the
 * behaviour a per-loop budget wants: a loop that is entered twice gets its own
 * budget each time rather than one budget for the sum of both.
 *
 * ## The clock is captured, not looked up per iteration
 *
 * `globalThis.performance.now` is user-writable and `performance` itself can be
 * replaced. The generated code therefore reads the clock through a captured
 * reference taken before user code runs, and falls back to `Date.now` if
 * neither is available. A user overwriting `performance.now` after that has no
 * effect on the budget.
 */
function loopBudgetPlugin({
  types: t,
}: {
  types: typeof Babel.packages.types
}) {
  const clock = () => t.callExpression(t.identifier('__zeusBudgetNow'), [])

  const visitLoop = (path: {
    ensureBlock(): void
    get(key: 'body'): {
      unshiftContainer(key: 'body', nodes: unknown[]): void
    }
    insertBefore(node: unknown): void
    scope: {
      generateUidIdentifier(name: string): { name: string }
    }
  }) => {
    // 1. Block first. `ensureBlock()` wraps a single-statement body into a
    //    block, which is what gives the guard somewhere to live when the loop
    //    is itself a single statement (`if (c) while (x) {}`, `else while (x) {}`).
    //
    //    It must run before `insertBefore`: the insert needs the parent to have
    //    a statement list, and for those shapes it does not until the body is a
    //    block. Reversing the order throws
    //    `Can't convert array path to a block statement`, which failed the whole
    //    preview compile for ordinary user code.
    path.ensureBlock()

    // 2. Capture the start timestamp immediately before the loop. Inside the
    //    body it would be re-initialised every iteration, elapsed time would
    //    always be ~0, and the budget would never fire.
    //
    //    Declaring it before the loop is safe because step 1 guaranteed the
    //    parent has a statement list. Because the declaration sits at the loop's
    //    own lexical position, re-entering the enclosing function or block
    //    re-runs it, so each entry to the loop gets its own budget.
    const started = path.scope.generateUidIdentifier('zeusLoopStarted')

    // 3. Take the body path *before* `insertBefore`. Inserting a sibling
    //    invalidates the loop's own path when the loop sits in a
    //    single-statement position, and a `path.get('body')` taken afterwards
    //    comes back undefined — "unshiftContainer is not a function". Reading it
    //    first keeps the reference pointing at the node that is about to gain
    //    the guard.
    const body = path.get('body')

    path.insertBefore(
      t.variableDeclaration('let', [
        t.variableDeclarator(t.identifier(started.name), clock()),
      ]),
    )

    // The budget is an accumulator, not a single window.
    //
    // Each pass measures the time since the previous pass and adds it to a
    // running total. A tight loop never yields, so its passes are microseconds
    // apart and the total climbs with real CPU use. A loop that awaits yields
    // for milliseconds, but the *pass itself* still costs microseconds, so a
    // legal `while (n < 8) { await sleep(200) }` accumulates almost nothing and
    // survives.
    //
    // The naive alternatives both failed:
    //   - wall clock since loop entry  → kills legal async loops (their awaits
    //     count as budget, which is the false positive this fixes);
    //   - reset the timestamp each pass → a runaway loop resets it a million
    //     times a second and never fires (the protection disappears).
    //
    // `__zeusBudgetSpent` is per loop, per entry, declared beside the loop so
    // re-entering the enclosing function starts a fresh budget.
    const spent = path.scope.generateUidIdentifier('zeusLoopSpent')
    path.insertBefore(
      t.variableDeclaration('let', [
        t.variableDeclarator(t.identifier(spent.name), t.numericLiteral(0)),
      ]),
    )

    body.unshiftContainer('body', [
      t.expressionStatement(
        t.assignmentExpression(
          '+=',
          t.identifier(spent.name),
          t.binaryExpression('-', clock(), t.identifier(started.name)),
        ),
      ),
      t.expressionStatement(
        t.assignmentExpression('=', t.identifier(started.name), clock()),
      ),
      t.ifStatement(
        t.binaryExpression(
          '>',
          t.identifier(spent.name),
          t.numericLiteral(1_000),
        ),
        t.throwStatement(
          t.newExpression(t.identifier('Error'), [
            t.stringLiteral(
              '[ZEUS_PLAYGROUND_LOOP_BUDGET] A loop exceeded the 1000 ms sandbox budget.',
            ),
          ]),
        ),
      ),
    ])
  }
  return {
    visitor: {
      DoWhileStatement: visitLoop,
      ForInStatement: visitLoop,
      ForOfStatement: visitLoop,
      ForStatement: visitLoop,
      WhileStatement: visitLoop,
      // Declare the captured clock once per module, inside the module scope.
      Program: {
        exit(programPath: {
          unshiftContainer(key: 'body', nodes: unknown[]): void
        }) {
          // Captured once, before any user code runs:
          //
          //   const __zeusPerf = globalThis.performance
          //   const __zeusBudgetNow = __zeusPerf
          //     ? __zeusPerf.now.bind(__zeusPerf)
          //     : Date.now
          //
          // `performance.now` must be called with `performance` as its receiver;
          // taking the bare method reference and calling it elsewhere throws
          // "Illegal invocation". Binding also makes the clock immune to a user
          // overwriting `globalThis.performance.now` afterwards, because the
          // bound function holds the original.
          const perfId = t.identifier('__zeusPerf')
          programPath.unshiftContainer('body', [
            t.variableDeclaration('const', [
              t.variableDeclarator(
                perfId,
                t.memberExpression(
                  t.identifier('globalThis'),
                  t.identifier('performance'),
                ),
              ),
            ]),
            t.variableDeclaration('const', [
              t.variableDeclarator(
                t.identifier('__zeusBudgetNow'),
                t.conditionalExpression(
                  perfId,
                  t.callExpression(
                    t.memberExpression(
                      t.memberExpression(perfId, t.identifier('now')),
                      t.identifier('bind'),
                    ),
                    [perfId],
                  ),
                  t.memberExpression(t.identifier('Date'), t.identifier('now')),
                ),
              ),
            ]),
          ])
        },
      },
    },
  }
}

export function previewModulePlaceholder(index: number): string {
  return modulePlaceholder(index)
}

function rewriteDynamicImports(
  program: unknown,
  module: PlaygroundCompileResult['modules'][number],
  moduleIndex: ReadonlyMap<string, number>,
): Edit[] {
  const edits: Edit[] = []
  const stack: unknown[] = [program]
  while (stack.length > 0) {
    const value = stack.pop()
    if (Array.isArray(value)) {
      for (let index = value.length - 1; index >= 0; index -= 1) {
        stack.push(value[index])
      }
      continue
    }
    if (!isSyntaxNode(value)) continue
    if (value.type === 'ImportExpression') {
      const source = value.source
      if (
        isSyntaxNode(source) &&
        source.type === 'StringLiteral' &&
        typeof source.value === 'string'
      ) {
        const specifier = source.value
        const edge = module.imports.find(
          candidate => candidate.specifier === specifier,
        )
        if (edge?.kind === 'local' || edge?.kind === 'json') {
          const dependencyIndex = edge.resolvedPath
            ? moduleIndex.get(edge.resolvedPath)
            : undefined
          if (dependencyIndex !== undefined) {
            edits.push(
              editForNode(
                source,
                JSON.stringify(modulePlaceholder(dependencyIndex)),
              ),
            )
            continue
          }
        }
        throw new PlaygroundPreviewError(
          `Module "${module.path}" uses an unsupported dynamic import "${specifier}".`,
        )
      }
      throw new PlaygroundPreviewError(
        `Module "${module.path}" uses a non-literal dynamic import. Browser preview requires static import targets.`,
      )
    }
    for (const [key, child] of Object.entries(value)) {
      if (
        key === 'loc' ||
        key === 'start' ||
        key === 'end' ||
        key === 'extra' ||
        key === 'errors'
      ) {
        continue
      }
      if (Array.isArray(child) || isSyntaxNode(child)) stack.push(child)
    }
  }
  return edits
}

function findEdge(
  module: PlaygroundCompileResult['modules'][number],
  specifier: string,
  runtimeModules: Readonly<Record<string, string>>,
):
  | PlaygroundCompileResult['modules'][number]['imports'][number]
  | {
      readonly specifier: string
      readonly resolvedPath: null
      readonly kind: 'runtime'
      readonly typeOnly: false
    }
  | undefined {
  const edge = module.imports.find(
    candidate => candidate.specifier === specifier,
  )
  if (edge) return edge
  if (
    DEFAULT_PLAYGROUND_RUNTIME_MODULES.includes(specifier) ||
    Object.prototype.hasOwnProperty.call(runtimeModules, specifier)
  ) {
    return {
      specifier,
      resolvedPath: null,
      kind: 'runtime',
      typeOnly: false,
    }
  }
  return undefined
}

function importBindingsToRuntime(node: SyntaxNode, runtimeKey: string): string {
  const runtime = `globalThis.${RUNTIME_GLOBAL}[${JSON.stringify(runtimeKey)}]`
  const specifiers = node.specifiers ?? []
  if (specifiers.length === 0) return `void ${runtime};`

  const declarations: string[] = []
  for (const specifier of specifiers) {
    const local = readIdentifier(specifier.local)
    if (!local) {
      throw new PlaygroundPreviewError(
        'Compiled runtime import contains an invalid local binding.',
      )
    }
    if (specifier.type === 'ImportDefaultSpecifier') {
      declarations.push(`const ${local} = ${runtime}.default;`)
      continue
    }
    if (specifier.type === 'ImportNamespaceSpecifier') {
      declarations.push(`const ${local} = ${runtime};`)
      continue
    }
    if (specifier.type === 'ImportSpecifier') {
      const imported = readImportedName(specifier.imported)
      if (!imported) {
        throw new PlaygroundPreviewError(
          'Compiled runtime import contains an invalid imported binding.',
        )
      }
      declarations.push(
        `const { ${formatImportedBinding(imported, local)} } = ${runtime};`,
      )
      continue
    }
    throw new PlaygroundPreviewError(
      `Unsupported compiled import specifier "${specifier.type}".`,
    )
  }
  return declarations.join(' ')
}

function formatImportedBinding(imported: string, local: string): string {
  const key = /^[A-Za-z_$][\w$]*$/.test(imported)
    ? imported
    : JSON.stringify(imported)
  return imported === local ? key : `${key}: ${local}`
}

function readImportedName(
  node: SyntaxNode | null | undefined,
): string | undefined {
  if (!node) return undefined
  if (node.type === 'Identifier' || node.type === 'StringLiteral') {
    return typeof node.value === 'string' ? node.value : readIdentifier(node)
  }
  return undefined
}

function readIdentifier(
  node: SyntaxNode | null | undefined,
): string | undefined {
  if (!node) return undefined
  return typeof node.name === 'string'
    ? node.name
    : typeof node.value === 'string'
      ? node.value
      : undefined
}

function readSourceValue(node: SyntaxNode): string | undefined {
  return isSyntaxNode(node.source) && typeof node.source.value === 'string'
    ? node.source.value
    : undefined
}

function editForNode(node: SyntaxNode, text: string): Edit {
  if (typeof node.start !== 'number' || typeof node.end !== 'number') {
    throw new PlaygroundPreviewError(
      'Compiled module contains a syntax node without source locations.',
    )
  }
  return { start: node.start, end: node.end, text }
}

function editForSource(node: SyntaxNode, text: string): Edit {
  if (!isSyntaxNode(node.source)) {
    throw new PlaygroundPreviewError(
      'Compiled module import is missing its source node.',
    )
  }
  return editForNode(node.source, text)
}

function applyEdits(source: string, edits: readonly Edit[]): string {
  if (edits.length === 0) return source
  const ordered = [...edits].sort((left, right) => {
    if (left.start !== right.start) return right.start - left.start
    return right.end - left.end
  })
  let output = source
  let boundary = Number.POSITIVE_INFINITY
  for (const edit of ordered) {
    if (edit.end > boundary) {
      throw new PlaygroundPreviewError(
        'Compiled module produced overlapping preview edits.',
      )
    }
    output = `${output.slice(0, edit.start)}${edit.text}${output.slice(edit.end)}`
    boundary = edit.start
  }
  return output
}

function modulePlaceholder(index: number): string {
  return `${MODULE_PLACEHOLDER_PREFIX}${index}__`
}

function previewError(modulePath: string, specifier: string): Error {
  return new PlaygroundPreviewError(
    `Module "${modulePath}" imports "${specifier}", which cannot be linked in the browser preview.`,
  )
}

function isSyntaxNode(value: unknown): value is SyntaxNode {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { type?: unknown }).type === 'string'
  )
}
