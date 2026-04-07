import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import {
  arrayExpression,
  callExpression,
  identifier,
  nullLiteral,
  objectExpression,
  objectProperty,
  stringLiteral,
} from '@babel/types'
import type { TransformInfo, TransformResult } from '../shared/types'
import { escapeHTML } from '../shared/escape'
import {
  filterChildren,
  getConfig,
  registerImportMethod,
} from '../shared/utils'
import {
  appendConcat,
  normalizeJSXTextValue,
  resultToExpression,
  stringifyExpression,
} from './ssr/shared'
import { transformSubtree } from './transform-node'

export function transformFragmentNode(
  path: NodePath<t.JSXFragment>,
  info: TransformInfo,
): TransformResult {
  const config = getConfig(path)
  if (config.generate === 'ssr') {
    return transformFragmentSSR(path, info)
  }

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
      const txt = normalizeJSXTextValue(child.value)
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
      normalizedChildren.push(resultToExpression(childResult, 'null'))
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

function transformFragmentSSR(
  path: NodePath<t.JSXFragment>,
  info: TransformInfo,
): TransformResult {
  const childPaths = path.get('children')
  let out: t.Expression = stringLiteral('')
  for (let i = 0; i < childPaths.length; i++) {
    const childPath = childPaths[i]
    const child = childPath.node
    if (child.type === 'JSXText') {
      const txt = normalizeJSXTextValue(child.value)
      if (txt) {
        out = appendConcat(out, stringLiteral(escapeHTML(txt, false)))
      }
      continue
    }
    if (child.type === 'JSXExpressionContainer') {
      if (child.expression.type !== 'JSXEmptyExpression') {
        out = appendConcat(
          out,
          stringifyExpression(child.expression as t.Expression),
        )
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
      out = appendConcat(out, resultToExpression(childResult, 'null'))
    }
  }
  return {
    template: '',
    declarations: [],
    exprs: [],
    dynamics: [],
    postExprs: [],
    renderer: 'ssr',
    outputExpr: out,
  }
}
