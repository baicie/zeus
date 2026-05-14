import * as t from '@babel/types'

import { transformNode } from './node'
import { CompilerError, CompilerErrorCode } from '../errors'
import { createTemplate } from '../generate'
import { getJSXAttrName, trimJSXText } from '../utils'

import type {
  BabelJSXElementPath,
  BabelJSXPath,
  BabelState,
  DynamicTransformResults,
} from '../types'

export function isComponentTag(tagName: string): boolean {
  return /^[A-Z]/.test(tagName) || tagName.includes('.')
}

export function transformComponent(
  path: BabelJSXElementPath,
  state: BabelState,
): DynamicTransformResults {
  const tag = convertComponentIdentifier(path.node.openingElement.name)
  const props: Array<t.ObjectProperty | t.ObjectMethod> = []

  path
    .get('openingElement')
    .get('attributes')
    .forEach(attr => {
      const node = attr.node

      if (t.isJSXSpreadAttribute(node)) {
        throw new CompilerError({
          code: CompilerErrorCode.UNSUPPORTED_COMPONENT_PROP,
          message: 'Spread props are not supported in Zeus MVP.',
          path: attr,
        })
      }

      const key = getJSXAttrName(node.name)
      const propKey = createObjectKey(key)

      if (!node.value) {
        props.push(t.objectProperty(propKey, t.booleanLiteral(true)))
        return
      }

      if (t.isStringLiteral(node.value)) {
        props.push(t.objectProperty(propKey, node.value))
        return
      }

      if (t.isJSXExpressionContainer(node.value)) {
        if (t.isJSXEmptyExpression(node.value.expression)) {
          throw new CompilerError({
            code: CompilerErrorCode.EMPTY_EXPRESSION,
            message: `Component prop "${key}" expression cannot be empty.`,
            path: attr,
          })
        }

        props.push(t.objectProperty(propKey, node.value.expression))
      }
    })

  const children = transformComponentChildren(
    path.get('children') as BabelJSXPath[],
    state,
  )

  if (children) {
    props.push(t.objectProperty(t.identifier('children'), children))
  }

  return {
    kind: 'dynamic',
    dynamic: true,

    expr: t.callExpression(t.identifier('createComponent'), [
      tag,
      t.objectExpression(props),
    ]),

    template: '',
    templateWithClosingTags: '',

    declarations: [],
    exprs: [],
    dynamics: [],
    postExprs: [],

    isSVG: false,
    hasCustomElement: false,
    isImportNode: false,
    skipTemplate: false,

    renderer: 'dom',
  }
}

function transformComponentChildren(
  children: BabelJSXPath[],
  state: BabelState,
): t.Expression | null {
  const nodes: t.Expression[] = []

  children.forEach(child => {
    if (child.isJSXText()) {
      const text = trimJSXText(child.node.value)

      if (text) {
        nodes.push(t.stringLiteral(text))
      }

      return
    }

    const result = transformNode(child, state)

    if (!result) return

    if (result.kind === 'element') {
      nodes.push(createTemplate(result))
      return
    }

    if (result.kind === 'dynamic') {
      nodes.push(result.expr)
      return
    }

    if (result.kind === 'text') {
      nodes.push(t.stringLiteral(result.template))
    }
  })

  if (!nodes.length) {
    return null
  }

  if (nodes.length === 1) {
    return nodes[0]
  }

  return t.arrayExpression(nodes)
}

function convertComponentIdentifier(
  node: t.JSXOpeningElement['name'],
): t.Expression {
  if (t.isJSXIdentifier(node)) {
    if (node.name === 'this') {
      return t.thisExpression()
    }

    if (t.isValidIdentifier(node.name)) {
      return t.identifier(node.name)
    }

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

function createObjectKey(key: string): t.Identifier | t.StringLiteral {
  return t.isValidIdentifier(key) ? t.identifier(key) : t.stringLiteral(key)
}
