// packages/compiler-dom/src/transforms/slot-transform.ts
import type { NodePath } from '@babel/core'
import * as t from '@babel/types'
import type { TransformContext } from '@zeus-js/compiler-core'

export function transformSlots(
  path: NodePath<t.JSXElement>,
  context: TransformContext
): void {
  const options = context.options
  const isCustomElement = options.isCustomElement

  // 检查是否为自定义元素
  if (
    isCustomElement &&
    t.isJSXIdentifier(path.node.openingElement.name) &&
    isCustomElement(path.node.openingElement.name.name)
  ) {
    // 转换无 shadow DOM 的 slot
    transformLightDOMSlots(path, context)
  }
}

function transformLightDOMSlots(
  path: NodePath<t.JSXElement>,
  context: TransformContext
) {
  // 查找所有 slot 元素
  path.traverse({
    JSXElement(innerPath) {
      if (
        t.isJSXIdentifier(innerPath.node.openingElement.name) &&
        innerPath.node.openingElement.name.name === 'slot'
      ) {
        // 替换为 div 并添加特殊标记
        innerPath.node.openingElement.name = t.jSXIdentifier('div')
        innerPath.node.closingElement.name = t.jSXIdentifier('div')

        // 添加特殊属性 data-slot
        const slotNameAttr = innerPath.node.openingElement.attributes.find(
          attr => t.isJSXAttribute(attr) && attr.name.name === 'name'
        )

        const slotName =
          slotNameAttr &&
          t.isJSXAttribute(slotNameAttr) &&
          slotNameAttr.value &&
          t.isStringLiteral(slotNameAttr.value)
            ? slotNameAttr.value.value
            : 'default'

        innerPath.node.openingElement.attributes.push(
          t.jSXAttribute(
            t.jSXIdentifier('data-slot'),
            t.stringLiteral(slotName)
          )
        )
      }
    },
  })
}
