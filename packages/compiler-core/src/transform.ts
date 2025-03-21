import { NodeTypes } from './ast'
import type { TransformOptions } from './options'

export function transform(ast: any, options: TransformOptions = {}) {
  const context = createTransformContext(ast, options)
  traverseNode(ast, context)
  return ast
}

function createTransformContext(root: any, options: TransformOptions) {
  return {
    root,
    helpers: new Map(),
    components: new Set(),
    directives: new Set(),
    hoists: [],
    // ... 其他上下文信息
  }
}
