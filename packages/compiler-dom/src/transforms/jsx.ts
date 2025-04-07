import type { NodeTransform, TransformContext } from '@zeus-js/compiler-core'
import * as t from '@babel/types'
import type { NodePath } from '@babel/core'
import type { JSXElement } from '@babel/types'
import { isComponent, normalizeProps } from '../utils'

export const transformJSX: NodeTransform = (path, context) => {
  if (!path.isJSXElement()) return

  const options = context.options
  const element = path.node as JSXElement
  const tagName = element.openingElement.name

  // 处理标签名
  if (tagName.type === 'JSXIdentifier') {
    const name = tagName.name

    // 检查是否是组件
    if (isComponent(name, options)) {
      transformComponent(path, context, name)
    } else {
      transformDOMElement(path, context, name)
    }
  }
}

// 转换 DOM 元素
function transformDOMElement(
  path: NodePath<JSXElement>,
  context: TransformContext,
  tagName: string
) {
  // 创建元素
  const createElement = t.callExpression(
    t.identifier('document.createElement'),
    [t.stringLiteral(tagName)]
  )

  // 处理属性和子元素
  const props = normalizeProps(path.node.openingElement.attributes)
  const children = path.node.children

  // 创建属性处理和子元素处理
  const statements: t.Statement[] = [
    t.variableDeclaration('const', [
      t.variableDeclarator(t.identifier('el'), createElement),
    ]),
  ]

  // 处理属性
  if (props.length > 0) {
    for (const prop of props) {
      if (prop.type === 'JSXAttribute' && prop.name.type === 'JSXIdentifier') {
        const name = prop.name.name
        const value = prop.value

        let valueExpr: t.Expression
        if (!value) {
          valueExpr = t.booleanLiteral(true)
        } else if (value.type === 'StringLiteral') {
          valueExpr = value
        } else if (value.type === 'JSXExpressionContainer') {
          valueExpr = value.expression as t.Expression
        } else {
          continue
        }

        // 设置属性
        statements.push(
          t.expressionStatement(
            t.callExpression(
              t.memberExpression(
                t.identifier('el'),
                t.identifier('setAttribute')
              ),
              [t.stringLiteral(name), valueExpr]
            )
          )
        )
      }
    }
  }

  // 处理子元素
  if (children.length > 0) {
    for (const child of children) {
      if (child.type === 'JSXText') {
        if (child.value.trim()) {
          statements.push(
            t.expressionStatement(
              t.callExpression(
                t.memberExpression(
                  t.identifier('el'),
                  t.identifier('appendChild')
                ),
                [
                  t.callExpression(
                    t.memberExpression(
                      t.identifier('document'),
                      t.identifier('createTextNode')
                    ),
                    [t.stringLiteral(child.value.trim())]
                  ),
                ]
              )
            )
          )
        }
      }
      // 处理其他类型的子元素...
    }
  }

  // 返回元素
  statements.push(t.returnStatement(t.identifier('el')))

  // 使用 IIFE 包装元素创建和属性设置
  path.replaceWith(
    t.callExpression(
      t.arrowFunctionExpression([], t.blockStatement(statements)),
      []
    )
  )
}

// 转换组件
function transformComponent(
  path: NodePath<JSXElement>,
  context: TransformContext,
  componentName: string
) {
  // 处理组件渲染
  const props = normalizeProps(path.node.openingElement.attributes)
  const propsObj = t.objectExpression(
    props
      .map(prop => {
        if (
          prop.type === 'JSXAttribute' &&
          prop.name.type === 'JSXIdentifier'
        ) {
          const name = prop.name.name
          const value = prop.value

          let valueExpr: t.Expression
          if (!value) {
            valueExpr = t.booleanLiteral(true)
          } else if (value.type === 'StringLiteral') {
            valueExpr = value
          } else if (value.type === 'JSXExpressionContainer') {
            valueExpr = value.expression as t.Expression
          } else {
            return null
          }

          return t.objectProperty(t.identifier(name), valueExpr)
        }
        return null
      })
      .filter(Boolean) as t.ObjectProperty[]
  )

  // 创建组件调用
  path.replaceWith(t.callExpression(t.identifier(componentName), [propsObj]))
}
