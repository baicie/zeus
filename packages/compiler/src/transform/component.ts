import * as t from '@babel/types'

import { getJSXAttrName, getTagName } from '../utils'

import type { BabelJSXElementPath, DynamicTransformResults } from '../types'

export function isComponentTag(tagName: string): boolean {
  return /^[A-Z]/.test(tagName) || tagName.includes('.')
}

export function transformComponent(
  path: BabelJSXElementPath,
): DynamicTransformResults {
  const tagName = getTagName(path.node)
  const callee = createComponentCallee(tagName)
  const props = createComponentProps(path)

  return {
    kind: 'dynamic',
    dynamic: true,
    expr: t.callExpression(callee, [props]),

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

function createComponentCallee(tagName: string): t.Expression {
  return tagName.split('.').reduce<t.Expression | null>((expr, part) => {
    if (!expr) return t.identifier(part)
    return t.memberExpression(expr, t.identifier(part))
  }, null)!
}

function createComponentProps(path: BabelJSXElementPath): t.ObjectExpression {
  const properties: t.ObjectProperty[] = []
  const attributes = path.get('openingElement').get('attributes')

  attributes.forEach(attr => {
    if (t.isJSXSpreadAttribute(attr.node)) {
      throw attr.buildCodeFrameError(
        'Component spread props are not supported in Zeus MVP',
      )
    }

    const node = attr.node
    const key = getJSXAttrName(node.name)
    const value = node.value

    properties.push(t.objectProperty(t.identifier(key), createPropValue(value)))
  })

  return t.objectExpression(properties)
}

function createPropValue(value: t.JSXAttribute['value']): t.Expression {
  if (!value) return t.booleanLiteral(true)

  if (t.isStringLiteral(value)) {
    return value
  }

  if (t.isJSXExpressionContainer(value)) {
    if (t.isJSXEmptyExpression(value.expression)) {
      throw new Error('Component prop expression cannot be empty')
    }

    return value.expression
  }

  throw new Error('Unsupported component prop value in Zeus MVP')
}
