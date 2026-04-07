import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import type { JSXElement } from '@babel/types'
import {
  blockStatement,
  booleanLiteral,
  callExpression,
  identifier,
  isJSXExpressionContainer,
  isJSXSpreadAttribute,
  memberExpression,
  objectExpression,
  objectMethod,
  objectProperty,
  returnStatement,
  stringLiteral,
} from '@babel/types'
import type { TransformResult } from '../shared/types'
import { getTagName, isDynamic } from '../shared/dynamic'
import { getConfig, registerImportMethod } from '../shared/utils'

function openingNameToExpr(
  name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
): t.Expression {
  if (name.type === 'JSXIdentifier') {
    return identifier(name.name)
  }
  if (name.type === 'JSXMemberExpression') {
    return memberExpression(
      openingNameToExpr(name.object),
      identifier(name.property.name),
    )
  }
  throw new Error('[zeus-jsx] namespaced component tags are not supported.')
}

export function transformComponent(
  path: NodePath<JSXElement>,
): TransformResult {
  const config = getConfig(path)
  const attrs = path.get('openingElement').get('attributes')

  const builtInName = getTagName(path.node)
  let tagExpr = openingNameToExpr(path.node.openingElement.name)

  if (
    config.builtIns.indexOf(builtInName) >= 0 &&
    !path.scope.hasBinding(builtInName)
  ) {
    tagExpr = registerImportMethod(path, builtInName)
  }

  const props: Array<t.ObjectProperty | t.ObjectMethod> = []
  const spreadProps: t.Expression[] = []

  for (let i = 0; i < attrs.length; i++) {
    const a = attrs[i]
    if (isJSXSpreadAttribute(a.node)) {
      spreadProps.push(a.node.argument)
      continue
    }
    const attr = a.node
    if (attr.type !== 'JSXAttribute') {
      continue
    }
    const keyNode = attr.name
    if (keyNode.type !== 'JSXIdentifier') {
      throw new Error('[zeus-jsx] unsupported component attribute name.')
    }
    const key = keyNode.name
    if (key === 'children' || key === 'ref') {
      continue
    }
    const val = attr.value
    if (val && isJSXExpressionContainer(val)) {
      if (val.expression.type === 'JSXEmptyExpression') {
        continue
      }
      const ex = a.get('value').get('expression') as NodePath<t.Expression>
      if (isDynamic(ex, { checkMember: true, checkTags: true })) {
        props.push(
          objectMethod(
            'get',
            identifier(key),
            [],
            blockStatement([returnStatement(val.expression as t.Expression)]),
            false,
            false,
          ),
        )
      } else {
        props.push(
          objectProperty(identifier(key), val.expression as t.Expression),
        )
      }
    } else if (val && val.type === 'StringLiteral') {
      props.push(objectProperty(identifier(key), stringLiteral(val.value)))
    } else if (!val) {
      props.push(objectProperty(identifier(key), booleanLiteral(true)))
    }
  }

  const createComponent = registerImportMethod(path, 'createComponent')
  let finalProps: t.Expression = objectExpression(props)
  if (spreadProps.length) {
    const assignArgs: t.Expression[] = [objectExpression(props)]
    for (let i = 0; i < spreadProps.length; i++) {
      assignArgs.push(spreadProps[i])
    }
    finalProps = callExpression(
      memberExpression(identifier('Object'), identifier('assign')),
      assignArgs,
    )
  }
  const call = callExpression(createComponent, [tagExpr, finalProps])

  return {
    template: '',
    declarations: [],
    exprs: [],
    dynamics: [],
    postExprs: [],
    component: true,
    dynamic: true,
    outputExpr: call,
  }
}
