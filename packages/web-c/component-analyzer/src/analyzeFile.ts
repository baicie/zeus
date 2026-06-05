import { parseSource } from './ast'
import { extractDefineElementCalls } from './extractDefineElement'
import { extractEmits } from './extractEmits'
import { extractInlineMeta } from './extractMeta'
import {
  extractRuntimeProps,
  extractShadowOption,
  validateRuntimePropsDefinition,
} from './extractProps'
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
      const runtimePropsDiagnostics = validateRuntimePropsDefinition(
        call.options,
        call.call.arguments[1],
      )

      for (const message of runtimePropsDiagnostics) {
        diagnostics.push({
          level: 'warning',
          file,
          message: `<${call.tag}> ${message}`,
        })
      }

      const runtimeProps = extractRuntimeProps(call.options)
      const emits = extractEmits(call.options)
      const shadowOption = extractShadowOption(call.options)

      const typeProps = call.propsTypeName
        ? (localPropTypes.get(call.propsTypeName) ?? {})
        : {}

      if (
        call.propsTypeName &&
        !localPropTypes.has(call.propsTypeName) &&
        !isGlobalUtilityType(call.propsTypeName)
      ) {
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
          runtimePropsDiagnostics,
          emits,
          typeProps,
          setupMeta,
          inlineMeta,
          shadow:
            shadowOption.shadow ??
            (typeof inlineMeta.shadow === 'boolean'
              ? inlineMeta.shadow
              : undefined),
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

function isGlobalUtilityType(name: string): boolean {
  return GLOBAL_UTILITY_TYPES.has(name)
}

const GLOBAL_UTILITY_TYPES = new Set([
  'Awaited',
  'ConstructorParameters',
  'Exclude',
  'Extract',
  'InstanceType',
  'NonNullable',
  'Omit',
  'Parameters',
  'Partial',
  'Pick',
  'Readonly',
  'Record',
  'Required',
  'ReturnType',
  'ThisParameterType',
  'ThisType',
  'Uppercase',
  'Lowercase',
  'Capitalize',
  'Uncapitalize',
])
