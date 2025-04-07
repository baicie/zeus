import type { NodeTransform, TransformContext } from '@zeus-js/compiler-core'
import * as t from '@babel/types'
import type { NodePath } from '@babel/core'
import type { JSXAttribute } from '@babel/types'

// 绑定转换器
export const transformBindings: NodeTransform = (path, context) => {
  if (!path.isJSXElement()) return

  const attributes = path.node.openingElement.attributes
  for (let i = 0; i < attributes.length; i++) {
    const attr = attributes[i]
    if (attr.type === 'JSXAttribute' && attr.name.type === 'JSXIdentifier') {
      const name = attr.name.name

      // 检查是否是绑定属性
      if (name.startsWith('bind:') || name === 'bind') {
        transformBinding(
          path.get(`openingElement.attributes.${i}`) as NodePath<JSXAttribute>,
          context
        )
      }
    }
  }
}

// 转换绑定
function transformBinding(
  path: NodePath<JSXAttribute>,
  context: TransformContext
) {
  const attrName = path.node.name.name as string
  const value = path.node.value

  if (!value || value.type !== 'JSXExpressionContainer') return
  const expression = value.expression
  if (!t.isExpression(expression)) return

  let propName: string
  if (attrName === 'bind') {
    // 获取绑定目标
    if (t.isMemberExpression(expression)) {
      const property = expression.property
      if (t.isIdentifier(property)) {
        propName = property.name
      } else {
        return
      }
    } else {
      return
    }
  } else {
    // bind:prop 形式
    propName = attrName.slice(5)
  }

  // 添加响应式绑定帮助函数
  context.helpers.add('createBinding')

  // 替换为绑定调用
  const elementPath = path.findParent(p => p.isJSXElement())!
  const statements = (elementPath.getData('bindings') ||
    []) as t.ExpressionStatement[]

  statements.push(
    t.expressionStatement(
      t.callExpression(t.identifier('createBinding'), [
        t.identifier('el'),
        t.stringLiteral(propName),
        expression,
      ])
    )
  )

  elementPath.setData('bindings', statements)

  // 从属性列表中移除这个绑定属性
  path.remove()
}
