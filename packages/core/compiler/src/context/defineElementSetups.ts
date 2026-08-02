import * as t from '@babel/types'

import {
  DEFAULT_RENDERER_MODULE,
  getProgramScopeData,
} from '../codegen/support'

import type { BabelJSXPath, BabelProgramPath } from '../types'
import type { NodePath } from '@babel/core'

const ZEUS_PUBLIC_MODULE = '@zeus-js/zeus'

export function collectDefineElementSetups(
  path: BabelProgramPath,
  runtimeModule: string,
): void {
  const setups = new WeakSet<t.Function>()
  const trustedModules = new Set([
    DEFAULT_RENDERER_MODULE,
    ZEUS_PUBLIC_MODULE,
    runtimeModule,
  ])

  for (const statement of path.node.body) {
    if (
      !t.isImportDeclaration(statement) ||
      !trustedModules.has(statement.source.value)
    ) {
      continue
    }

    for (const specifier of statement.specifiers) {
      if (!isDefineElementImport(specifier)) continue

      const binding = path.scope.getBinding(specifier.local.name)

      if (!binding || binding.path.node !== specifier) continue

      for (const reference of binding.referencePaths) {
        collectSetupFromReference(reference, setups)
      }
    }
  }

  getProgramScopeData(path).defineElementSetups = setups
}

export function isDefineElementRenderRoot(path: BabelJSXPath): boolean {
  const setups = getProgramScopeData(path).defineElementSetups
  const functionPath = path.getFunctionParent()

  if (
    !setups ||
    !functionPath ||
    !t.isFunction(functionPath.node) ||
    !setups.has(functionPath.node)
  ) {
    return false
  }

  const root = skipTransparentExpressionWrappers(path)

  if (
    functionPath.isArrowFunctionExpression() &&
    functionPath.node.body === root.node
  ) {
    return true
  }

  const returnPath = root.parentPath

  return Boolean(
    returnPath?.isReturnStatement() &&
    returnPath.node.argument === root.node &&
    returnPath.getFunctionParent()?.node === functionPath.node,
  )
}

function isDefineElementImport(
  specifier: t.ImportDeclaration['specifiers'][number],
): specifier is t.ImportSpecifier {
  if (!t.isImportSpecifier(specifier)) return false

  const imported = specifier.imported

  return (
    (t.isIdentifier(imported) && imported.name === 'defineElement') ||
    (t.isStringLiteral(imported) && imported.value === 'defineElement')
  )
}

function collectSetupFromReference(
  reference: NodePath<t.Node>,
  setups: WeakSet<t.Function>,
): void {
  const call = reference.parentPath

  if (
    reference.key !== 'callee' ||
    !call?.isCallExpression() ||
    call.node.callee !== reference.node
  ) {
    return
  }

  const setup = call.get('arguments')[2]

  if (!setup) return

  const setupFunction = resolveSetupFunction(setup, new Set())

  if (setupFunction) setups.add(setupFunction)
}

function resolveSetupFunction(
  path: NodePath<t.Node>,
  visitedBindings: Set<unknown>,
): t.Function | undefined {
  const setupPath = unwrapTransparentExpressionWrappers(path)

  if (
    setupPath.isArrowFunctionExpression() ||
    setupPath.isFunctionExpression()
  ) {
    return setupPath.node
  }

  if (!setupPath.isIdentifier()) return undefined

  const binding = setupPath.scope.getBinding(setupPath.node.name)

  if (!binding?.constant || visitedBindings.has(binding)) return undefined

  visitedBindings.add(binding)

  if (binding.path.isFunctionDeclaration()) {
    return binding.path.node
  }

  if (!binding.path.isVariableDeclarator()) return undefined

  const init = binding.path.get('init')

  if (Array.isArray(init) || !init.node) return undefined

  return resolveSetupFunction(init, visitedBindings)
}

function unwrapTransparentExpressionWrappers(
  path: NodePath<t.Node>,
): NodePath<t.Node> {
  let current = path

  while (isTransparentExpressionWrapper(current.node)) {
    current = current.get('expression') as NodePath<t.Node>
  }

  return current
}

function skipTransparentExpressionWrappers(path: BabelJSXPath): NodePath {
  let current: NodePath = path

  while (current.parentPath && wrapsExpression(current.parentPath, current)) {
    current = current.parentPath
  }

  return current
}

function wrapsExpression(parent: NodePath, child: NodePath): boolean {
  const node = parent.node

  return isTransparentExpressionWrapper(node) && node.expression === child.node
}

function isTransparentExpressionWrapper(
  node: t.Node,
): node is
  | t.ParenthesizedExpression
  | t.TSAsExpression
  | t.TSSatisfiesExpression
  | t.TSTypeAssertion
  | t.TypeCastExpression
  | t.TSNonNullExpression {
  return (
    t.isParenthesizedExpression(node) ||
    t.isTSAsExpression(node) ||
    t.isTSSatisfiesExpression(node) ||
    t.isTSTypeAssertion(node) ||
    t.isTypeCastExpression(node) ||
    t.isTSNonNullExpression(node)
  )
}
