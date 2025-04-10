import type { NodePathHub } from '@zeus-js/compiler-core'
import * as t from '@babel/types'
import { getConfig, isDynamic, registerImportMethod } from '../utils'

type ComponentExpr =
  | t.JSXIdentifier
  | t.JSXMemberExpression
  | t.JSXNamespacedName

function convertComponentIdentifier(node: ComponentExpr): t.Expression {
  if (t.isJSXIdentifier(node)) {
    if (node.name === 'this') return t.thisExpression()
    return t.isValidIdentifier(node.name)
      ? t.identifier(node.name)
      : t.stringLiteral(node.name)
  } else if (t.isJSXMemberExpression(node)) {
    const prop = convertComponentIdentifier(node.property)
    const computed = t.isStringLiteral(prop)
    return t.memberExpression(
      convertComponentIdentifier(node.object),
      prop,
      computed
    )
  } else if (t.isJSXNamespacedName(node)) {
    return t.stringLiteral(`${node.namespace.name}:${node.name.name}`)
  }

  return t.identifier('undefined')
}

export function transformComponent(path: NodePathHub<t.JSXElement>): void {
  const exprs = []
  const config = getConfig(path)
  const tagId = convertComponentIdentifier(path.node.openingElement.name)
  const props = []
  const runningObject = []
  const dynamicSpread = false
  const hasChildren = path.node.children.length > 0

  if (
    config.builtIns &&
    t.isIdentifier(tagId) &&
    config.builtIns.indexOf(tagId.name) > -1 &&
    !path.scope.hasBinding(tagId.name)
  ) {
    const newTagId = registerImportMethod(path, tagId.name)
    tagId.name = newTagId.name
  }

  path
    .get('openingElement')
    .get('attributes')
    .forEach(attr => {
      const node = attr.node
      if (t.isJSXSpreadAttribute(node)) {
        if (runningObject.length) {
          props.push(t.objectExpression(runningObject))
          runningObject.length = 0
        }
        props.push(isDynamic(attr.get('argument'), {}))
      }
    })
}
