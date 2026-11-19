import { analyzeModuleImports } from './analysis'
import {
  classifyPlaygroundHmrUpdate,
  type PlaygroundHmrClassification,
} from './hmr'
import {
  projectEntry,
  type ProjectFile,
  type ProjectLanguage,
  type ProjectSnapshot,
} from './project'

export interface PlaygroundCompilerDiagnostic {
  readonly code: string
  readonly message: string
  readonly severity: 'error' | 'warning'
  readonly filename: string
  readonly hint?: string
  readonly span?: unknown
  readonly source?: 'compiler' | 'project'
}

export interface PlaygroundImportEdge {
  readonly specifier: string
  readonly resolvedPath: string | null
  readonly kind: 'external' | 'json' | 'local' | 'runtime' | 'style'
  readonly typeOnly: boolean
}

export interface PlaygroundCompiledModule {
  readonly path: string
  readonly language: Extract<ProjectLanguage, 'json' | 'ts' | 'tsx'>
  readonly code: string
  readonly map: unknown | null
  readonly diagnostics: readonly PlaygroundCompilerDiagnostic[]
  readonly imports: readonly PlaygroundImportEdge[]
  readonly hmr?: PlaygroundModuleHmr
}

export interface PlaygroundHmrBinding {
  readonly id: number
  readonly kind: string
  readonly value: string
}

export interface PlaygroundHmrPlan {
  readonly version: number
  readonly signature: string
  readonly bindings: readonly PlaygroundHmrBinding[]
}

export interface PlaygroundModuleHmr {
  readonly plan: PlaygroundHmrPlan | null
  readonly initial: boolean
  readonly classification?: PlaygroundHmrClassification
}

export interface PlaygroundStyle {
  readonly path: string
  readonly content: string
}

export interface PlaygroundCompileResult {
  readonly target: 'dom' | 'ssr'
  readonly entryPath: string
  readonly compilerVersion: string
  readonly modules: readonly PlaygroundCompiledModule[]
  readonly styles: readonly PlaygroundStyle[]
  readonly diagnostics: readonly PlaygroundCompilerDiagnostic[]
  readonly meta: {
    readonly durationMs: number
    readonly moduleCount: number
    readonly byteCount: number
  }
}

export interface PlaygroundCompilerResult {
  readonly code: string
  readonly map: unknown | null
  readonly diagnostics: readonly PlaygroundCompilerDiagnostic[]
  readonly hmrPlan?: PlaygroundHmrPlan | null
}

export interface PlaygroundCompiler {
  transformModule(options: {
    source: string
    filename: string
    target: 'dom' | 'ssr'
    runtimeModule: string
    delegateEvents: boolean
    sourceMap: boolean
    hmr?: boolean
  }): Promise<PlaygroundCompilerResult>
}

export interface CompileProjectOptions {
  readonly target: 'dom' | 'ssr'
  readonly runtimeModule: string
  readonly delegateEvents?: boolean
  readonly sourceMap?: boolean
  readonly hmr?: boolean
  /** Enables HMR diagnostics against an earlier snapshot. */
  readonly previousSnapshot?: ProjectSnapshot
  readonly allowedRuntimeModules?: readonly string[]
}

export const DEFAULT_PLAYGROUND_RUNTIME_MODULES = Object.freeze([
  '@zeus-js/zeus',
  '@zeus-js/zeus/jsx-dev-runtime',
  '@zeus-js/zeus/jsx-runtime',
  '@zeus-js/runtime-dom',
  '@zeus-js/runtime-ssr',
  '@zeus-js/router',
  '@zeus-js/query',
  '@zeus-js/signal',
])

const encoder = new TextEncoder()

export async function compileProject(
  snapshot: ProjectSnapshot,
  compiler: PlaygroundCompiler,
  options: CompileProjectOptions,
): Promise<PlaygroundCompileResult> {
  const started = Date.now()
  const entry = projectEntry(snapshot)
  if (entry.language !== 'ts' && entry.language !== 'tsx') {
    throw new TypeError('Playground entry must be a .ts or .tsx file.')
  }

  const files = new Map(snapshot.files.map(file => [file.path, file]))
  const previousFiles = new Map(
    (options.previousSnapshot?.files ?? []).map(file => [file.path, file]),
  )
  const allowedRuntimeModules = new Set(
    options.allowedRuntimeModules ?? DEFAULT_PLAYGROUND_RUNTIME_MODULES,
  )
  allowedRuntimeModules.add(options.runtimeModule)

  const graph = collectGraph(entry, files, allowedRuntimeModules)
  const compilerResults = await Promise.all(
    graph.modules.map(async file => {
      const result = await compiler.transformModule({
        source: file.content,
        filename: file.path,
        target: options.target,
        runtimeModule: options.runtimeModule,
        delegateEvents:
          options.delegateEvents ?? snapshot.options.delegateEvents,
        sourceMap: options.sourceMap ?? snapshot.options.sourceMap,
        hmr: options.hmr,
      })
      return {
        file,
        result: normalizeCompilerResult(result, file.path),
      }
    }),
  )

  const compiledByPath = new Map(
    compilerResults.map(({ file, result }) => [file.path, result]),
  )
  const compiledModules: PlaygroundCompiledModule[] = []
  for (const file of graph.modules) {
    const result = compiledByPath.get(file.path)
    if (!result) continue
    compiledModules.push(
      Object.freeze({
        path: file.path,
        language: file.language as 'ts' | 'tsx',
        code: result.code,
        map: result.map,
        diagnostics: Object.freeze(
          result.diagnostics.map(diagnostic =>
            Object.freeze({
              ...diagnostic,
              filename: diagnostic.filename || file.path,
              source: diagnostic.source ?? ('compiler' as const),
            }),
          ),
        ),
        imports: Object.freeze(
          graph.edges.get(file.path)?.map(edge => Object.freeze(edge)) ?? [],
        ),
        ...(options.hmr
          ? {
              hmr: Object.freeze({
                plan: result.hmrPlan ? freezeHmrPlan(result.hmrPlan) : null,
                initial: !previousFiles.has(file.path),
                classification: classifyPlaygroundHmrUpdate(
                  file.path,
                  previousFiles.get(file.path)?.content,
                  file.content,
                ),
              }),
            }
          : {}),
      }),
    )
  }

  for (const file of graph.jsonModules) {
    const parsed = parseJsonModule(file)
    compiledModules.push(
      Object.freeze({
        path: file.path,
        language: 'json',
        code: parsed.code,
        map: null,
        diagnostics: Object.freeze(parsed.diagnostics),
        imports: Object.freeze([]),
      }),
    )
  }

  const graphDiagnostics = [...graph.diagnostics]
  const orderedModules = orderModules(
    compiledModules,
    entry.path,
    graphDiagnostics,
  )
  const styles = Object.freeze(
    [...graph.styles.values()]
      .sort((left, right) => left.path.localeCompare(right.path))
      .map(style =>
        Object.freeze({ path: style.path, content: style.content }),
      ),
  )
  const diagnostics = Object.freeze([
    ...graphDiagnostics,
    ...compiledModules.flatMap(module => module.diagnostics),
  ])
  const byteCount = orderedModules.reduce(
    (total, module) => total + encoder.encode(module.code).byteLength,
    0,
  )

  return Object.freeze({
    target: options.target,
    entryPath: entry.path,
    compilerVersion: snapshot.compilerVersion,
    modules: Object.freeze(orderedModules),
    styles,
    diagnostics,
    meta: Object.freeze({
      durationMs: Date.now() - started,
      moduleCount: orderedModules.length,
      byteCount,
    }),
  })
}

interface CollectedGraph {
  readonly modules: readonly ProjectFile[]
  readonly jsonModules: readonly ProjectFile[]
  readonly styles: ReadonlyMap<string, ProjectFile>
  readonly edges: ReadonlyMap<string, readonly PlaygroundImportEdge[]>
  readonly diagnostics: readonly PlaygroundCompilerDiagnostic[]
}

function collectGraph(
  entry: ProjectFile,
  files: ReadonlyMap<string, ProjectFile>,
  allowedRuntimeModules: ReadonlySet<string>,
): CollectedGraph {
  const pending = [entry]
  const seen = new Set<string>()
  const modules: ProjectFile[] = []
  const jsonModules: ProjectFile[] = []
  const styles = new Map<string, ProjectFile>()
  const edges = new Map<string, readonly PlaygroundImportEdge[]>()
  const diagnostics: PlaygroundCompilerDiagnostic[] = []

  while (pending.length > 0) {
    const file = pending.shift()!
    if (seen.has(file.path)) continue
    seen.add(file.path)
    if (file.language === 'json') {
      jsonModules.push(file)
      continue
    }
    if (file.language === 'css') {
      styles.set(file.path, file)
      continue
    }
    modules.push(file)

    let imports
    try {
      imports = analyzeModuleImports(file.content)
    } catch (error) {
      diagnostics.push(
        diagnostic({
          code: 'ZEUS_PLAYGROUND_IMPORT_ANALYSIS',
          message: `Could not analyze imports in "${file.path}": ${errorMessage(error)}`,
          filename: file.path,
        }),
      )
      edges.set(file.path, Object.freeze([]))
      continue
    }

    const fileEdges: PlaygroundImportEdge[] = []
    for (const imported of imports) {
      if (imported.typeOnly) {
        const resolved = resolveProjectImport(
          file.path,
          imported.specifier,
          files,
        )
        fileEdges.push(
          Object.freeze({
            specifier: imported.specifier,
            resolvedPath: resolved?.path ?? null,
            kind: resolved ? kindForLanguage(resolved.language) : 'external',
            typeOnly: true,
          }),
        )
        continue
      }

      const resolved = resolveProjectImport(
        file.path,
        imported.specifier,
        files,
      )
      if (resolved) {
        fileEdges.push(
          Object.freeze({
            specifier: imported.specifier,
            resolvedPath: resolved.path,
            kind: kindForLanguage(resolved.language),
            typeOnly: false,
          }),
        )
        if (resolved.language === 'css') {
          styles.set(resolved.path, resolved)
        } else if (!seen.has(resolved.path)) {
          pending.push(resolved)
        }
        continue
      }

      if (imported.specifier.startsWith('.')) {
        diagnostics.push(
          diagnostic({
            code: 'ZEUS_PLAYGROUND_IMPORT_NOT_FOUND',
            message: `Module "${file.path}" imports "${imported.specifier}", but no matching project file exists.`,
            filename: file.path,
          }),
        )
        fileEdges.push(
          Object.freeze({
            specifier: imported.specifier,
            resolvedPath: null,
            kind: 'external',
            typeOnly: false,
          }),
        )
        continue
      }

      if (allowedRuntimeModules.has(imported.specifier)) {
        fileEdges.push(
          Object.freeze({
            specifier: imported.specifier,
            resolvedPath: null,
            kind: 'runtime',
            typeOnly: false,
          }),
        )
        continue
      }

      diagnostics.push(
        diagnostic({
          code: 'ZEUS_PLAYGROUND_UNSUPPORTED_DEPENDENCY',
          message: `Module "${file.path}" imports unsupported dependency "${imported.specifier}". Browser previews only admit the declared Zeus runtime modules.`,
          filename: file.path,
        }),
      )
      fileEdges.push(
        Object.freeze({
          specifier: imported.specifier,
          resolvedPath: null,
          kind: 'external',
          typeOnly: false,
        }),
      )
    }
    edges.set(file.path, Object.freeze(fileEdges))
  }

  return {
    modules,
    jsonModules,
    styles,
    edges,
    diagnostics,
  }
}

function resolveProjectImport(
  importer: string,
  specifier: string,
  files: ReadonlyMap<string, ProjectFile>,
): ProjectFile | undefined {
  if (!specifier.startsWith('.')) return undefined
  const base = resolvePosixImport(importer, specifier)
  if (!base) return undefined
  const candidates = [
    base,
    `${base}.ts`,
    `${base}.tsx`,
    `${base}.css`,
    `${base}.json`,
    `${base}/index.ts`,
    `${base}/index.tsx`,
  ]
  for (const candidate of candidates) {
    const file = files.get(candidate)
    if (file) return file
  }
  return undefined
}

function resolvePosixImport(
  importer: string,
  specifier: string,
): string | undefined {
  const segments = importer.split('/')
  segments.pop()
  for (const segment of specifier.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (segments.length === 0) return undefined
      segments.pop()
    } else {
      segments.push(segment)
    }
  }
  return segments.join('/')
}

function kindForLanguage(
  language: ProjectLanguage,
): PlaygroundImportEdge['kind'] {
  if (language === 'css') return 'style'
  if (language === 'json') return 'json'
  return 'local'
}

function parseJsonModule(file: ProjectFile): {
  code: string
  diagnostics: readonly PlaygroundCompilerDiagnostic[]
} {
  try {
    const value: unknown = JSON.parse(file.content)
    return {
      code: `export default ${JSON.stringify(value)};`,
      diagnostics: Object.freeze([]),
    }
  } catch (error) {
    return {
      code: 'export default undefined;',
      diagnostics: Object.freeze([
        diagnostic({
          code: 'ZEUS_PLAYGROUND_JSON_PARSE',
          message: `Module "${file.path}" is invalid JSON: ${errorMessage(error)}`,
          filename: file.path,
        }),
      ]),
    }
  }
}

function orderModules(
  modules: readonly PlaygroundCompiledModule[],
  entryPath: string,
  diagnostics: PlaygroundCompilerDiagnostic[],
): PlaygroundCompiledModule[] {
  const byPath = new Map(modules.map(module => [module.path, module]))
  const result: PlaygroundCompiledModule[] = []
  const visiting = new Set<string>()
  const visited = new Set<string>()
  const reportedCycles = new Set<string>()

  const visit = (filePath: string): void => {
    if (visited.has(filePath)) return
    const module = byPath.get(filePath)
    if (!module) return
    if (visiting.has(filePath)) {
      if (!reportedCycles.has(filePath)) {
        reportedCycles.add(filePath)
        diagnostics.push(
          diagnostic({
            code: 'ZEUS_PLAYGROUND_IMPORT_CYCLE',
            message: `Module "${filePath}" participates in a static import cycle. Browser preview requires an acyclic module graph.`,
            filename: filePath,
          }),
        )
      }
      return
    }
    visiting.add(filePath)
    for (const edge of module.imports) {
      if (
        (edge.kind === 'local' || edge.kind === 'json') &&
        edge.resolvedPath
      ) {
        visit(edge.resolvedPath)
      }
    }
    visiting.delete(filePath)
    visited.add(filePath)
    result.push(module)
  }

  visit(entryPath)
  for (const module of modules) visit(module.path)
  return result
}

function normalizeCompilerResult(
  result: PlaygroundCompilerResult,
  filename: string,
): PlaygroundCompilerResult {
  return {
    code: result.code,
    map: result.map ?? null,
    diagnostics: Object.freeze(
      (result.diagnostics ?? []).map(diagnostic => ({
        ...diagnostic,
        filename: diagnostic.filename || filename,
        source: diagnostic.source ?? ('compiler' as const),
      })),
    ),
    hmrPlan: result.hmrPlan ? freezeHmrPlan(result.hmrPlan) : null,
  }
}

function freezeHmrPlan(plan: PlaygroundHmrPlan): PlaygroundHmrPlan {
  return Object.freeze({
    version: plan.version,
    signature: plan.signature,
    bindings: Object.freeze(
      plan.bindings.map(binding =>
        Object.freeze({
          id: binding.id,
          kind: binding.kind,
          value: binding.value,
        }),
      ),
    ),
  })
}

function diagnostic(options: {
  code: string
  message: string
  filename: string
}): PlaygroundCompilerDiagnostic {
  return Object.freeze({
    ...options,
    severity: 'error',
    source: 'project',
  })
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
