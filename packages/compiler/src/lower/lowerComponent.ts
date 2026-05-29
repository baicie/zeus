import * as t from '@babel/types'

import { CompilerError, CompilerErrorCode } from '../diagnostics'
import { lowerChildren } from './lowerChildren'
import { componentIR, ref } from '../ir/semanticBuilders'
import { getJSXAttrName } from '../parse/jsx'

import type { CompilerContext } from '../context'
import type { ComponentPropIR, ZeusIRNode } from '../ir/nodes'
import type { NodePath } from '@babel/core'

export function lowerComponent(
  path: NodePath<t.JSXElement>,
  context: CompilerContext,
): ZeusIRNode {
  const tag = convertComponentIdentifier(path.node.openingElement.name)
  const props: ComponentPropIR[] = []

  for (const attr of path.get('openingElement').get('attributes')) {
    const node = attr.node

    if (t.isJSXSpreadAttribute(node)) {
      throw new CompilerError({
        code: CompilerErrorCode.UNSUPPORTED_COMPONENT_PROP,
        message: 'Spread props are not supported in Zeus MVP.',
        path: attr,
      })
    }

    const name = getJSXAttrName(node.name)

    if (!node.value) {
      props.push({ name, value: t.booleanLiteral(true) })
      continue
    }

    if (t.isStringLiteral(node.value)) {
      props.push({ name, value: node.value })
      continue
    }

    if (t.isJSXExpressionContainer(node.value)) {
      if (t.isJSXEmptyExpression(node.value.expression)) {
        throw new CompilerError({
          code: CompilerErrorCode.EMPTY_EXPRESSION,
          message: `Component prop "${name}" expression cannot be empty.`,
          path: attr,
        })
      }

      props.push({ name, value: node.value.expression })
    }
  }

  const children = lowerChildren(path.get('children'), context)

  if (children.length > 0) {
    props.push({ name: 'children', value: children })
  }

  return componentIR({
    ref: ref(context.uid('cmp$').name),
    callee: tag,
    props,
  })
}

function convertComponentIdentifier(
  node: t.JSXOpeningElement['name'],
): t.Expression {
  if (t.isJSXIdentifier(node)) {
    if (node.name === 'this') return t.thisExpression()
    if (t.isValidIdentifier(node.name)) return t.identifier(node.name)
    return t.stringLiteral(node.name)
  }

  if (t.isJSXMemberExpression(node)) {
    const object = convertComponentIdentifier(node.object)
    const property = convertComponentIdentifier(node.property)

    return t.memberExpression(object, property, t.isStringLiteral(property))
  }

  if (t.isJSXNamespacedName(node)) {
    return t.stringLiteral(`${node.namespace.name}:${node.name.name}`)
  }

  return node
}
