import { declare } from '@babel/helper-plugin-utils'
import type * as BabelCore from '@babel/core'
import type { Declare, TransformContext, TransformOptions } from './ast'
import { createTransformContext, injectHelpers } from './utils'
import SyntaxJSX from '@babel/plugin-syntax-jsx'

export function createBaseTransform(baseOptions: TransformOptions): Declare {
  return declare(api => {
    api.assertVersion(7)

    // 创建转换访问器
    function createTransformVisitor(
      context: TransformContext
    ): BabelCore.Visitor {
      return {
        // 处理 JSX 元素
        JSXElement: {
          enter(path) {
            context.currentPath = path
            if (baseOptions.nodeTransforms) {
              baseOptions.nodeTransforms.forEach(transform => {
                transform(path, context)
              })
            }
          },
          exit(path) {
            // 处理可能的清理工作
          },
        },

        // 处理 JSX 属性
        JSXAttribute(path) {
          const name = path.node.name.name as string
          // 处理指令
          if (name.startsWith('on') || name.startsWith('bind')) {
            if (baseOptions.directiveTransforms) {
              const directiveTransform = baseOptions.directiveTransforms[name]
              if (directiveTransform) {
                directiveTransform(path, context)
              }
            }
          }
        },

        // 处理程序入口
        Program: {
          enter(path) {
            // 初始化转换上下文
            context.currentPath = path
          },
          exit() {
            // 注入帮助函数
            if (context.helpers.size > 0) {
              injectHelpers(context)
            }
          },
        },
      }
    }

    return {
      name: '@zeus-js/compiler-core',
      inherits: SyntaxJSX.default,
      visitor: createTransformVisitor(createTransformContext(baseOptions)),
    }
  })
}
