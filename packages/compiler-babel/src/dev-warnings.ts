// Development warnings and diagnostics

import { DiagnosticCollector, DIAGNOSTIC_CODES } from '@zeusjs/compiler-shared'

export interface DevWarningsContext {
  diagnostics: DiagnosticCollector
}

export function warnReactivePropsDestructuring(
  node: any,
  ctx: DevWarningsContext,
): void {
  ctx.diagnostics.warning(
    'REACTIVE_PROPS_DESTRUCTURING',
    'Reactive props destructuring is not supported in Zeus MVP. Access props directly.',
    getLocation(node)
  )
}

export function warnUnstableKeyExpression(
  node: any,
  ctx: DevWarningsContext,
): void {
  ctx.diagnostics.warning(
    'UNSTABLE_KEY_EXPRESSION',
    'Key expression should be stable across renders for optimal performance.',
    getLocation(node)
  )
}

export function warnUnsupportedChildren(
  node: any,
  ctx: DevWarningsContext,
): void {
  ctx.diagnostics.warning(
    'UNSUPPORTED_JSX_EXPRESSION',
    'Complex children expressions are not fully supported yet.',
    getLocation(node)
  )
}

export function errorHostOutsideDefineElement(
  node: any,
  ctx: DevWarningsContext,
): void {
  ctx.diagnostics.error(
    'HOST_OUTSIDE_DEFINE_ELEMENT',
    'Host can only be used inside defineElement.',
    getLocation(node)
  )
}

export function errorSlotOutsideHost(
  node: any,
  ctx: DevWarningsContext,
): void {
  ctx.diagnostics.error(
    'SLOT_OUTSIDE_HOST',
    'Slot can only be used inside a Host element.',
    getLocation(node)
  )
}

export function errorHostInNestedContext(
  node: any,
  ctx: DevWarningsContext,
): void {
  ctx.diagnostics.error(
    'HOST_IN_NESTED_CONTEXT',
    'Host cannot appear in nested contexts. It must be the root of defineElement body.',
    getLocation(node)
  )
}

function getLocation(node: any): { line: number; column: number } | undefined {
  if (node?.loc) {
    return {
      line: node.loc.start.line,
      column: node.loc.start.column,
    }
  }
  return undefined
}

export function checkComponentValidity(fnPath: any, ctx: DevWarningsContext): void {
  // Check for props destructuring
  fnPath.traverse({
    VariableDeclarator(varPath: any) {
      const init = varPath.get('init')
      if (!init.isMemberExpression()) return

      const obj = init.get('object')
      const prop = init.get('property')

      if (obj.isIdentifier({ name: 'props' }) && prop.isIdentifier()) {
        // Check if it's a destructuring pattern
        const parent = varPath.parentPath
        if (parent?.isVariableDeclarator()) {
          // This is a direct assignment like: const title = props.title
          // This is fine in MVP
        }
      }
    },
  })
}
