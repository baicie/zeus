import type { NodeTransform, TransformContext } from '@zeus-js/compiler-core'
import * as t from '@babel/types'
import type { NodePath } from '@babel/core'

// 组件转换器
export const transformComponents: NodeTransform = (path, context) => {
  if (!path.isJSXElement()) return

  const options = context.options
  const tagName = path.node.openingElement.name

  if (tagName.type === 'JSXIdentifier') {
    const name = tagName.name

    // 检查是否是内置组件
    const builtIns = options.builtIns || []
    if (builtIns.includes(name)) {
      transformBuiltInComponent(path, context, name)
    }
  }
}

// 转换内置组件
function transformBuiltInComponent(
  path: NodePath,
  context: TransformContext,
  componentName: string
) {
  // 添加特定于组件的帮助函数
  context.helpers.add(componentName)

  // 处理不同的内置组件
  switch (componentName) {
    case 'For':
      transformForComponent(path, context)
      break
    case 'Show':
      transformShowComponent(path, context)
      break
    // 处理其他内置组件...
    default:
      // 默认处理
      break
  }
}

// 转换 For 组件
function transformForComponent(path: NodePath, context: TransformContext) {
  const attributes = path.node.openingElement.attributes

  let eachAttr = null
  for (const attr of attributes) {
    if (
      attr.type === 'JSXAttribute' &&
      attr.name.type === 'JSXIdentifier' &&
      attr.name.name === 'each'
    ) {
      eachAttr = attr
      break
    }
  }

  if (!eachAttr || !eachAttr.value) return

  // 获取循环数据表达式
  let dataExpr: t.Expression
  if (eachAttr.value.type === 'JSXExpressionContainer') {
    dataExpr = eachAttr.value.expression as t.Expression
  } else if (eachAttr.value.type === 'StringLiteral') {
    dataExpr = eachAttr.value
  } else {
    return
  }

  // 创建 map 调用
  path.replaceWith(
    t.callExpression(t.memberExpression(dataExpr, t.identifier('map')), [
      t.arrowFunctionExpression(
        [t.identifier('item'), t.identifier('index')],
        t.blockStatement([
          // 渲染子元素的逻辑
        ])
      ),
    ])
  )
}

// 转换 Show 组件
function transformShowComponent(path: NodePath, context: TransformContext) {
  const attributes = path.node.openingElement.attributes

  let whenAttr = null
  for (const attr of attributes) {
    if (
      attr.type === 'JSXAttribute' &&
      attr.name.type === 'JSXIdentifier' &&
      attr.name.name === 'when'
    ) {
      whenAttr = attr
      break
    }
  }

  if (!whenAttr || !whenAttr.value) return

  // 获取条件表达式
  let conditionExpr: t.Expression
  if (whenAttr.value.type === 'JSXExpressionContainer') {
    conditionExpr = whenAttr.value.expression as t.Expression
  } else {
    return
  }

  // 创建条件表达式
  path.replaceWith(
    t.conditionalExpression(
      conditionExpr,
      // 渲染子元素的表达式
      t.arrowFunctionExpression([], t.blockStatement([])),
      t.nullLiteral()
    )
  )
}
