import {
  GenMapping,
  addSegment,
  setSourceContent,
  toEncodedMap,
} from '@jridgewell/gen-mapping'
import {
  TraceMap,
  decodedMappings,
  originalPositionFor,
  sourceContentFor,
} from '@jridgewell/trace-mapping'
import ts from 'typescript'

import { cleanUrl, isTypeScriptLike } from './filter'
import { transformModule } from './native'

import type { NativeCompilerOptions } from './native'
import type { SourceMapInput as TraceSourceMapInput } from '@jridgewell/trace-mapping'
import type { SourceMapInput } from 'rollup'

export interface TransformZeusOptions {
  id: string
  code: string
  compiler?: Partial<NativeCompilerOptions> | false
  sourcemap?: boolean
  transpile?: boolean
}

export async function transformZeus(
  options: TransformZeusOptions,
): Promise<{ code: string; map: unknown } | null> {
  const { id, code, compiler, sourcemap = true, transpile = false } = options

  const filename = cleanUrl(id)
  const isTs = isTypeScriptLike(id)

  const shouldRunCompiler = compiler !== false
  const shouldStripTs = transpile && isTs

  if (!shouldRunCompiler && !shouldStripTs) {
    return null
  }

  const compilerOptions = compiler === false ? {} : (compiler ?? {})
  let transformedCode = code
  let map: SourceMapInput = null

  if (shouldRunCompiler) {
    const result = transformModule({
      source: code,
      filename,
      target: 'dom',
      runtimeModule: compilerOptions.moduleName ?? '@zeus-js/runtime-dom',
      delegateEvents: compilerOptions.delegateEvents ?? true,
      sourceMap: sourcemap,
    })
    const diagnostic = result.diagnostics.find(
      entry => entry.severity === 'error',
    )
    if (diagnostic) {
      throw createCompilerError(diagnostic)
    }
    transformedCode = result.code
    map = result.map
  }

  if (shouldStripTs) {
    const result = ts.transpileModule(transformedCode, {
      fileName: filename,
      compilerOptions: {
        module: ts.ModuleKind.Preserve,
        target: ts.ScriptTarget.ES2016,
        jsx: ts.JsxEmit.Preserve,
        sourceMap: sourcemap,
      },
    })
    transformedCode = result.outputText.replace(
      /\n?\/\/# sourceMappingURL=.*$/u,
      '',
    )
    const transpileMap = result.sourceMapText
      ? (JSON.parse(result.sourceMapText) as SourceMapInput)
      : null
    map = transpileMap
      ? map
        ? composeSourceMaps(transpileMap, map)
        : transpileMap
      : map
  }

  return { code: transformedCode, map }
}

function composeSourceMaps(
  outer: Exclude<SourceMapInput, null>,
  inner: Exclude<SourceMapInput, null>,
): SourceMapInput {
  const outerMap = new TraceMap(outer as unknown as TraceSourceMapInput)
  const innerMap = new TraceMap(inner as unknown as TraceSourceMapInput)
  const generated = new GenMapping({ file: outerMap.file })

  for (const [line, segments] of decodedMappings(outerMap).entries()) {
    for (const segment of segments) {
      if (segment.length < 4) continue
      const originalLine = segment[2]
      const originalColumn = segment[3]
      if (originalLine == null || originalColumn == null) continue
      const original = originalPositionFor(innerMap, {
        line: originalLine + 1,
        column: originalColumn,
      })
      if (
        original.source == null ||
        original.line == null ||
        original.column == null
      ) {
        continue
      }
      addSegment(
        generated,
        line,
        segment[0],
        original.source,
        original.line - 1,
        original.column,
      )
    }
  }

  for (const source of innerMap.sources) {
    if (source == null) continue
    setSourceContent(generated, source, sourceContentFor(innerMap, source))
  }

  return toEncodedMap(generated) as SourceMapInput
}

function createCompilerError(diagnostic: {
  code: string
  message: string
  filename: string
  span?: { start: { line: number; column: number } }
}) {
  const error = new Error(`${diagnostic.code}: ${diagnostic.message}`)
  error.name = 'ZeusCompilerDiagnostic'
  Object.assign(error, {
    code: diagnostic.code,
    filename: diagnostic.filename,
    loc: diagnostic.span
      ? {
          line: diagnostic.span.start.line,
          column: diagnostic.span.start.column,
        }
      : undefined,
    diagnostic,
  })
  return error
}
