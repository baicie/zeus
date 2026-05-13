import * as t from '@babel/types'

import { VoidElements } from './constant'
import {
  getJSXAttrName,
  getTagName,
  inlineAttributeOnTemplate,
  setAttr,
  toEventName,
} from './unit'

import type { BabelJSXElementPath, BabelState, TransformResults } from './types'

export function transformElementDOM(
  path: BabelJSXElementPath,
  state: BabelState,
): TransformResults {
  const tagName = getTagName(path.node)
  const voidTag = VoidElements.includes(tagName)

  const results: TransformResults = {
    template: `<${tagName}`,
    templateWithClosingTags: `<${tagName}`,
    declarations: [],
    exprs: [],
    dynamics: [],
    postExprs: [],
    isSVG: false,
    hasCustomElement: tagName.indexOf('-') > -1,
    isImportNode: tagName === 'img' || tagName === 'iframe',
    skipTemplate: false,
    tagName,
    renderer: 'dom',
  }

  // 4. 处理属性
  transformAttributes(path, results)

  // 5. 闭合标签
  results.template += '>'
  results.templateWithClosingTags += '>'
  if (!voidTag) {
    // transformChildren(path, results)
    results.template += `</${tagName}>`
    results.templateWithClosingTags += `</${tagName}>`
  }

  return results
}

function transformAttributes(
  path: BabelJSXElementPath,
  results: TransformResults,
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
              t.memberExpression(results.id!, t.identifier('addEventListener')),
              [t.stringLiteral(eventName), expr],
            ),
          ),
        )
        return
      }

      // other dynamic attr
      results.exprs.push(t.expressionStatement(setAttr(results.id!, key, expr)))
    } else {
      // static attr
      inlineAttributeOnTemplate(key, value, results)
    }
  })
}
