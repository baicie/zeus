import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import {
  arrayExpression,
  arrowFunctionExpression,
  blockStatement,
  callExpression,
  identifier,
  nullLiteral,
  objectExpression,
  objectProperty,
  returnStatement,
  stringLiteral,
} from '@babel/types'
import type { TransformInfo, TransformResult } from '../shared/types'
import { filterChildren, registerImportMethod } from '../shared/utils'
import { transformSubtree } from './transform-node'

export function transformFragmentNode(
  path: NodePath<t.JSXFragment>,
  info: TransformInfo,
): TransformResult {
  const children = filterChildren(
    path.node.children as t.JSXElement['children'],
  )
  if (!children.length) {
    return {
      template: '',
      declarations: [],
      exprs: [],
      dynamics: [],
      postExprs: [],
      outputExpr: nullLiteral(),
    }
  }

  const normalizedChildren: t.Expression[] = []
  const childPaths = path.get('children')
  for (let i = 0; i < childPaths.length; i++) {
    const childPath = childPaths[i]
    const child = childPath.node
    if (child.type === 'JSXText') {
      const txt = child.value.replace(/\u200c|\u200b/g, '').trim()
      if (txt) {
        normalizedChildren.push(stringLiteral(txt))
      }
      continue
    }
    if (child.type === 'JSXExpressionContainer') {
      if (child.expression.type !== 'JSXEmptyExpression') {
        normalizedChildren.push(child.expression as t.Expression)
      }
      continue
    }
    if (child.type === 'JSXElement' || child.type === 'JSXFragment') {
      const childResult = transformSubtree(
        childPath as NodePath<t.JSXElement | t.JSXFragment>,
        {
          topLevel: true,
          lastElement: info.lastElement,
        },
      )
      normalizedChildren.push(resultToExpression(childResult))
      continue
    }
  }

  if (!normalizedChildren.length) {
    return {
      template: '',
      declarations: [],
      exprs: [],
      dynamics: [],
      postExprs: [],
      outputExpr: nullLiteral(),
    }
  }

  const createComponent = registerImportMethod(path, 'createComponent')
  const fragmentComp = registerImportMethod(path, 'Fragment')
  const output = callExpression(createComponent, [
    fragmentComp,
    objectExpression([
      objectProperty(
        identifier('children'),
        arrayExpression(normalizedChildren),
      ),
    ]),
  ])
  return {
    template: '',
    declarations: [],
    exprs: [],
    dynamics: [],
    postExprs: [],
    outputExpr: output,
  }
}

function resultToExpression(result: TransformResult): t.Expression {
  if (result.outputExpr) {
    return result.outputExpr
  }
  if (!result.id) {
    return nullLiteral()
  }
  const body: t.Statement[] = []
  for (let i = 0; i < result.exprs.length; i++) {
    body.push(result.exprs[i])
  }
  body.push(returnStatement(result.id))
  return callExpression(arrowFunctionExpression([], blockStatement(body)), [])
}
