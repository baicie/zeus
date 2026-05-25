import * as t from '@babel/types'

import { CompilerError, CompilerErrorCode } from '../diagnostics'
import { lowerAttribute } from './lowerAttribute'
import { lowerChildren } from './lowerChildren'
import { componentIR, elementIR, ref } from '../ir/semanticBuilders'
import { getJSXAttrName, getTagName, isComponentTag } from '../parse/jsx'
import { VoidElements } from '../utils'

import type { CompilerContext } from '../context'
import type { ComponentPropIR, ElementIR, ZeusIRNode } from '../ir/nodes'
import type { NodePath } from '@babel/core'

export function lowerElement(
  path: NodePath<t.JSXElement>,
  context: CompilerContext,
): ZeusIRNode {
  const tagName = getTagName(path.node)

  if (isComponentTag(tagName)) {
    return lowerComponent(path, context)
  }

  const attrs = path
    .get('openingElement')
    .get('attributes')
    .map(attr => lowerAttribute(attr, context))
    .filter(Boolean) as ElementIR['attrs']

  return elementIR({
    ref: ref(context.uid('el$').name),
    tagName,
    attrs,
    children: VoidElements.includes(tagName)
      ? []
      : lowerChildren(path.get('children'), context),
    flags: {
      isVoid: VoidElements.includes(tagName),
      isCustomElement: tagName.includes('-'),
    },
  })
}

function lowerComponent(
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
