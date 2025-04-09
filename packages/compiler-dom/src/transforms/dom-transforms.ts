import type { NodeTransform, TransformContext } from '@zeus-js/compiler-core'
import type { NodePath } from '@babel/core'
import { registerImportMethod } from '../utils'

// DOM 特定转换集合
export const DOMNodeTransforms: NodeTransform[] = [
  processElement,
  processChildren,
  processAttributes,
]

// 处理元素
function processElement(path: NodePath, context: TransformContext) {
  if (!path.isJSXElement()) return
  registerImportMethod(path, 'createElement', context.moduleName)
}

// 处理子元素
function processChildren(path: NodePath, context: TransformContext) {
  if (!path.isJSXElement()) return

  const children = path.node.children
  if (children && children.length > 0) {
    // 处理子元素
    registerImportMethod(path, 'createTextNode', context.moduleName)
  }
}

// 处理属性
function processAttributes(path: NodePath, context: TransformContext) {
  if (!path.isJSXElement()) return

  const attributes = path.node.openingElement.attributes
  if (attributes && attributes.length > 0) {
    // 处理属性
    registerImportMethod(path, 'setAttribute', context.moduleName)
  }
}
