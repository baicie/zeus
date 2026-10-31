import * as t from '@babel/types'

import { parseSource, walk } from './ast'
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
import { collectSourceBoundTypeNames } from './portable-types'
import { getObjectProperty } from './utils'

import type {
  AnalyzeFileOptions,
  AnalyzeFileResult,
  ComponentProp,
} from './types'

export function analyzeFile(options: AnalyzeFileOptions): AnalyzeFileResult {
  return analyzeFileWithImportedPropTypes(options, new Map())
}

export function analyzeFileWithImportedPropTypes(
  options: AnalyzeFileOptions,
  importedPropTypes: Map<string, Record<string, Partial<ComponentProp>>>,
): AnalyzeFileResult {
  const { file, code } = options
  const diagnostics: AnalyzeFileResult['diagnostics'] = []
  const components: AnalyzeFileResult['components'] = []

  try {
    const ast = parseSource(code, file)
    const calls = extractDefineElementCalls(ast)
    const sourceBoundTypeNames = collectSourceBoundTypeNames(ast)

    for (const name of importedPropTypes.keys()) {
      sourceBoundTypeNames.add(name)
    }

    const localPropTypes = collectLocalPropTypes(
      ast,
      importedPropTypes,
      sourceBoundTypeNames,
    )
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
      const emits = extractEmits(call.options, sourceBoundTypeNames)
      const componentOptions = extractComponentOptions(call.options)
      for (const message of componentOptions.diagnostics ?? []) {
        diagnostics.push({ level: 'error', file, message })
      }
      if (componentOptions.diagnostics?.length) continue

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

      const setup = resolveSetupBinding(call.setup, localSetupBindings)
      const setupMeta = extractSetupMeta(setup, sourceBoundTypeNames)
      const inlineMeta = extractInlineMeta(call.options)
      const formAssociated =
        componentOptions.formAssociated ??
        (typeof inlineMeta.formAssociated === 'boolean'
          ? inlineMeta.formAssociated
          : undefined)

      if (
        formAssociated &&
        !(call.options && getObjectProperty(call.options, 'form')) &&
        !readsInternals(setup)
      ) {
        diagnostics.push({
          level: 'warning',
          file,
          message: `<${call.tag}> [ZEUS_WC_FORM_CONTRACT] is formAssociated but declares no form contract and never reads internals, so it never submits a value. Add form: { value } or set formAssociated: false.`,
        })
      }

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
          formAssociated,
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

// A setup that touches `internals` manages form participation itself.
function readsInternals(setup: t.Node | null | undefined): boolean {
  let found = false
  walk(setup, node => {
    if (t.isIdentifier(node, { name: 'internals' })) found = true
  })
  return found
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
