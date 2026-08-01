import * as t from '@babel/types'
import { componentIR, ref } from '@zeus-js/compiler-shared'

import {
  expressionIRFromCode,
  lowerExpressionIR,
} from '../adapters/babel/expression'
import { CompilerError, CompilerErrorCode } from '../diagnostics'
import { lowerChildren } from './lowerChildren'
import { getJSXAttrName } from '../parse/jsx'

import type { CompilerContext } from '../context'
import type { NodePath } from '@babel/core'
import type {
  ComponentPropIR,
  ExpressionIR,
  ZeusIRNode,
} from '@zeus-js/compiler-shared'

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

    const value = attr.get('value')

    if (!value.node) {
      props.push({ name, value: expressionIRFromCode('true', node) })
      continue
    }

    if (value.isStringLiteral()) {
      props.push({
        name,
        value: expressionIRFromCode(
          JSON.stringify(value.node.value),
          value.node,
        ),
      })
      continue
    }

    if (value.isJSXExpressionContainer()) {
      const expression = value.get('expression')

      if (expression.isJSXEmptyExpression()) {
        throw new CompilerError({
          code: CompilerErrorCode.EMPTY_EXPRESSION,
          message: `Component prop "${name}" expression cannot be empty.`,
          path: attr,
        })
      }

      if (expression.isExpression()) {
        props.push({ name, value: lowerExpressionIR(expression) })
      }
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
): ExpressionIR {
  return expressionIRFromCode(componentIdentifierCode(node), node)
}

function componentIdentifierCode(node: t.JSXOpeningElement['name']): string {
  if (t.isJSXIdentifier(node)) {
    if (node.name === 'this') return 'this'
    return t.isValidIdentifier(node.name)
      ? node.name
      : JSON.stringify(node.name)
  }

  if (t.isJSXMemberExpression(node)) {
    const object = componentIdentifierCode(node.object)
    const property = node.property.name
    return t.isValidIdentifier(property)
      ? `${object}.${property}`
      : `${object}[${JSON.stringify(property)}]`
  }

  if (t.isJSXNamespacedName(node)) {
    return JSON.stringify(`${node.namespace.name}:${node.name.name}`)
  }

  return JSON.stringify('')
}
