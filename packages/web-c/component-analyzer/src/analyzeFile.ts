import { parseSource } from './ast'
import { extractDefineElementCalls } from './extractDefineElement'
import { extractInlineMeta } from './extractMeta'
import { extractRuntimeProps } from './extractProps'
import { extractSetupMeta } from './extractSetup'
import { collectLocalPropTypes } from './extractTypeProps'
import { buildComponentRecord } from './merge'

import type { AnalyzeFileOptions, AnalyzeFileResult } from './types'

export function analyzeFile(options: AnalyzeFileOptions): AnalyzeFileResult {
  const { file, code } = options
  const diagnostics: AnalyzeFileResult['diagnostics'] = []
  const components: AnalyzeFileResult['components'] = []

  try {
    const ast = parseSource(code, file)
    const calls = extractDefineElementCalls(ast)
    const localPropTypes = collectLocalPropTypes(ast)

    for (const call of calls) {
      const runtimeProps = extractRuntimeProps(call.options)

      const typeProps = call.propsTypeName
        ? (localPropTypes.get(call.propsTypeName) ?? {})
        : {}

      if (call.propsTypeName && !localPropTypes.has(call.propsTypeName)) {
        diagnostics.push({
          level: 'warning',
          file,
          message: `Cannot resolve local props type "${call.propsTypeName}".`,
        })
      }

      const setupMeta = extractSetupMeta(call.setup)
      const inlineMeta = extractInlineMeta(call.options)

      components.push(
        buildComponentRecord({
          file,
          call,
          runtimeProps,
          typeProps,
          setupMeta,
          inlineMeta,
        }),
      )
    }
  } catch (error) {
    diagnostics.push({
      level: 'error',
      file,
      message: error instanceof Error ? error.message : String(error),
    })
  }

  return {
    file,
    components,
    diagnostics,
  }
}
