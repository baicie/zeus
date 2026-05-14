import * as t from '@babel/types'

import {
  getJSXAttrName,
  inlineAttributeOnTemplate,
  setAttr,
  toEventName,
} from '../utils'

import type { BabelJSXElementPath, ElementTransformResults } from '../types'

export function transformAttributes(
  path: BabelJSXElementPath,
  results: ElementTransformResults,
) {
  const attributes = path.get('openingElement').get('attributes')

  attributes.forEach(attr => {
    if (t.isJSXSpreadAttribute(attr.node)) {
      throw new Error('Spread attributes are not supported in Zeus')
    }

    const node = attr.node
    if (!node.name) return

    const key = getJSXAttrName(node.name)
    const value = node.value

    if (t.isJSXExpressionContainer(value)) {
      const expr = value.expression

      if (t.isJSXEmptyExpression(expr)) {
        throw new Error(`Attribute "${key}" expression cannot be empty`)
      }

      if (key.startsWith('on') && key.length > 2) {
        const eventName = toEventName(key)

        results.exprs.push(
          t.expressionStatement(
            t.callExpression(
              t.memberExpression(results.id, t.identifier('addEventListener')),
              [t.stringLiteral(eventName), expr],
            ),
          ),
        )
        return
      }

      results.exprs.push(t.expressionStatement(setAttr(results.id, key, expr)))
    } else {
      inlineAttributeOnTemplate(key, value, results)
    }
  })
}
