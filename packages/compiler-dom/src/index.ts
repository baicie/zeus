import {
  type Declare,
  type TransformOptions,
  createCompiler,
} from '@zeus-js/compiler-core'
import { DOMNodeTransforms } from './transforms/dom-transforms'
import { transformJSX } from './transforms/jsx'
import { transformEvents } from './transforms/events'
import { transformBindings } from './transforms/bindings'
import { transformComponents } from './transforms/components'
import { extend } from '@zeus-js/shared'
import { transformSlots } from './transforms/slot-transform'

export interface DOMCompilerOptions extends TransformOptions {
  // DOM 特定选项
  isCustomElement?: (tag: string) => boolean
  isNativeTag?: (tag: string) => boolean
  // 模块名称 - 运行时模块
  moduleName: string
  // 内置组件
  builtIns?: string[]
  // 是否开启将上下文传递给自定义元素
  contextToCustomElements?: boolean
  // 是否包装条件表达式
  wrapConditionals?: boolean
  // 生成目标
  generate?: 'dom' | 'ssr'
  webComponentsMode?: 'shadow' | 'light' | 'auto'
  slotPolyfill?: boolean
  reflectProperties?: string[] | boolean
}

// 创建 DOM 编译器
export function createDOMCompiler(options: DOMCompilerOptions): Declare {
  return createCompiler(
    extend({}, options, {
      nodeTransforms: [
        ...DOMNodeTransforms,
        transformJSX,
        transformEvents,
        transformBindings,
        transformComponents,
        options.webComponentsMode !== 'shadow' ? transformSlots : null,
        ...(options.nodeTransforms || []),
      ],
      directiveTransforms: extend(
        {},
        {
          // DOM 特定指令
          on: transformEvents,
          bind: transformBindings,
          model: createModelDirectiveTransform(options),
        },
        options.directiveTransforms || {}
      ),
    })
  )
}

// 创建模型指令转换器
function createModelDirectiveTransform(options: DOMCompilerOptions) {
  return (dir: any, context: any) => {
    // 实现双向绑定转换
  }
}

// 默认导出
export default createDOMCompiler
