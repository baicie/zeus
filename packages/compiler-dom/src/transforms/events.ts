import type { NodeTransform, TransformContext } from '@zeus-js/compiler-core'
import * as t from '@babel/types'
import type { NodePath } from '@babel/core'
import type { JSXAttribute } from '@babel/types'

// 事件转换器
export const transformEvents: NodeTransform = (path, context) => {
  if (!path.isJSXElement()) return

  const attributes = path.node.openingElement.attributes
  for (let i = 0; i < attributes.length; i++) {
    const attr = attributes[i]
    if (attr.type === 'JSXAttribute' && attr.name.type === 'JSXIdentifier') {
      const name = attr.name.name

      // 检查是否是事件处理器
      if (name.startsWith('on') && name.length > 2) {
        const eventName = name.slice(2).toLowerCase()
        transformEventHandler(
          path.get(`openingElement.attributes.${i}`) as NodePath<JSXAttribute>,
          context,
          eventName
        )
      }
    }
  }
}

// 转换事件处理器
function transformEventHandler(
  path: NodePath<JSXAttribute>,
  context: TransformContext,
  eventName: string
) {
  const value = path.node.value
  if (!value || value.type !== 'JSXExpressionContainer') return

  const expression = value.expression
  if (!t.isExpression(expression)) return

  // 添加 addEventListener 的帮助函数
  context.helpers.add('addEventListener')

  // 替换为 addEventListener 调用
  const elementPath = path.findParent(p => p.isJSXElement())!
  const elementName = elementPath.node.openingElement.name

  if (elementName.type === 'JSXIdentifier') {
    const statements = (elementPath.getData('eventHandlers') ||
      []) as t.ExpressionStatement[]

    statements.push(
      t.expressionStatement(
        t.callExpression(
          t.memberExpression(
            t.identifier('el'),
            t.identifier('addEventListener')
          ),
          [t.stringLiteral(eventName), expression]
        )
      )
    )

    elementPath.setData('eventHandlers', statements)

    // 从属性列表中移除这个事件属性
    path.remove()
  }
}
