import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import type { ZeusPluginPass } from './preprocess'
import {
  arrowFunctionExpression,
  blockStatement,
  callExpression,
  returnStatement,
} from '@babel/types'
import type { TransformResult } from '../shared/types'
import { transformSubtree } from './transform-node'

export function transformJSX(
  path: NodePath<t.JSXElement | t.JSXFragment>,
  state: ZeusPluginPass,
): void {
  if (state.skip) {
    return
  }

  const result = transformSubtree(path, {
    topLevel: true,
    lastElement: true,
  })

  if (result.outputExpr) {
    path.replaceWith(result.outputExpr)
    return
  }

  const expr = buildDomRenderExpression(path, result)
  path.replaceWith(expr)
}

function buildDomRenderExpression(
  _path: NodePath,
  result: TransformResult,
): t.Expression {
  const id = result.id
  if (!id) {
    throw new Error('[zeus-jsx] internal: missing element id')
  }

  const body: t.Statement[] = []

  for (let i = 0; i < result.exprs.length; i++) {
    body.push(result.exprs[i])
  }

  body.push(returnStatement(id))

  return callExpression(arrowFunctionExpression([], blockStatement(body)), [])
}
