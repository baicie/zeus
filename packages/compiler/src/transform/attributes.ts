import * as t from '@babel/types'

import { inlineAttributeOnTemplate, setAttr } from '../codegen/attribute'
import { registerEvent } from '../codegen/support'
import { CompilerError, CompilerErrorCode } from '../diagnostics'
import { getJSXAttrName, toEventName } from '../parse/jsx'

import type { BabelJSXElementPath, ElementTransformResults } from '../types'

export function transformAttributes(
  path: BabelJSXElementPath,
  results: ElementTransformResults,
) {
  const attributes = path.get('openingElement').get('attributes')

  attributes.forEach(attr => {
    if (t.isJSXSpreadAttribute(attr.node)) {
      throw new CompilerError({
        code: CompilerErrorCode.UNSUPPORTED_SPREAD_ATTRIBUTE,
        message: 'Spread attributes are not supported in Zeus MVP.',
        path: attr,
        hint: 'Use explicit attributes instead, for example <div id={id} />.',
      })
    }

    const node = attr.node
    if (!node.name) return

    const key = getJSXAttrName(node.name)
    const value = node.value

    if (t.isJSXExpressionContainer(value)) {
      const expr = value.expression

      if (t.isJSXEmptyExpression(expr)) {
        throw new CompilerError({
          code: CompilerErrorCode.EMPTY_EXPRESSION,
          message: `Attribute "${key}" expression cannot be empty.`,
          path: attr,
        })
      }

      if (key.startsWith('on') && key.length > 2) {
        const eventName = toEventName(key)

        registerEvent(attr, eventName)

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

      results.exprs.push(
        t.expressionStatement(setAttr(attr, results.id, key, expr)),
      )
    } else {
      inlineAttributeOnTemplate(key, value, results)
    }
  })
}
