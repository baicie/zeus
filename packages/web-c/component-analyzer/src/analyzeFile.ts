import * as t from '@babel/types'

import { parseSource } from './ast'
import { extractDefineElementCalls } from './extractDefineElement'
import { extractEmits } from './extractEmits'
import { extractInlineMeta } from './extractMeta'
import {
  extractComponentOptions,
  extractRuntimeProps,
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
    const localSetupBindings = collectLocalSetupBindings(ast)

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
      const componentOptions = extractComponentOptions(call.options)

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

      const setupMeta = extractSetupMeta(
        resolveSetupBinding(call.setup, localSetupBindings),
      )
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
            componentOptions.shadow ??
            (typeof inlineMeta.shadow === 'boolean'
              ? inlineMeta.shadow
              : undefined),
          formAssociated:
            componentOptions.formAssociated ??
            (typeof inlineMeta.formAssociated === 'boolean'
              ? inlineMeta.formAssociated
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

function collectLocalSetupBindings(ast: t.File): Map<string, t.Node> {
  const bindings = new Map<string, t.Node>()

  for (const node of ast.program.body) {
    if (t.isFunctionDeclaration(node) && node.id) {
      bindings.set(node.id.name, node)
      continue
    }

    if (!t.isVariableDeclaration(node)) continue

    for (const declarator of node.declarations) {
      if (!t.isIdentifier(declarator.id) || !declarator.init) continue

      if (
        t.isFunctionExpression(declarator.init) ||
        t.isArrowFunctionExpression(declarator.init)
      ) {
        bindings.set(declarator.id.name, declarator.init)
      }
    }
  }

  return bindings
}

function resolveSetupBinding(
  setup: t.Expression | t.SpreadElement | t.ArgumentPlaceholder | undefined,
  bindings: Map<string, t.Node>,
): t.Node | undefined {
  if (t.isIdentifier(setup)) {
    return bindings.get(setup.name) ?? setup
  }

  return setup
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
