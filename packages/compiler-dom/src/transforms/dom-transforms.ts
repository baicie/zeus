import type { NodeTransform, TransformContext } from '@zeus-js/compiler-core'
// 定义结果类型
interface TransformResult {
  template: string
  templateWithClosingTags: string
  declarations: any[]
  exprs: any[]
  dynamics: any[]
  postExprs: any[]
  id?: any
  isSVG: boolean
  hasCustomElement: boolean
  tagName: string
  renderer: 'dom'
  skipTemplate: boolean
}

// DOM 特定转换集合
export const DOMNodeTransforms: NodeTransform[] = []
