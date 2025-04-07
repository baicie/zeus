import type { NodePath } from '@babel/core'
import type { Declare, TransformContext, TransformOptions } from './ast'
import { createBaseTransform } from './transform'
import { isStaticExpression } from './utils'
import { extend } from '@zeus-js/shared'

export * from './ast'
export * from './transform'
export * from './utils'

// 导出一些常用的转换器
export const baseTransforms = {
  // 处理静态提升
  hoistStatic(path: NodePath, context: TransformContext): void {
    if (context.options.hoistStatic && isStaticExpression(path.node)) {
      // 实现静态节点提升
    }
  },

  // 处理标识符前缀
  prefixIdentifiers(path: NodePath, context: TransformContext): void {
    if (context.options.prefixIdentifiers && path.isIdentifier()) {
      // 实现标识符前缀
    }
  },
}

// 创建编译器
export function createCompiler(options: TransformOptions = {}): Declare {
  return createBaseTransform(
    extend(
      {},
      {
        nodeTransforms: [
          baseTransforms.hoistStatic,
          baseTransforms.prefixIdentifiers,
          ...(options.nodeTransforms || []),
        ],
      },
      options
    )
  )
}
