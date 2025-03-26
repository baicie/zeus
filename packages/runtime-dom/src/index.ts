// DOM 渲染核心
export { render, hydrate, createRenderer } from './renderer'

// DOM 操作工具
export {
  createElement,
  createTextNode,
  insert,
  remove,
  setAttribute,
  addEventListener,
  removeEventListener,
} from './nodeOps'

// 指令系统
export { directive, registerDirective } from './directives'

// DOM 组件
export { defineComponent, defineCustomElement } from './component'

// 类型导出
export type {
  RendererOptions,
  ComponentOptions,
  DirectiveOptions,
} from './types'

export {
  template,
  createComponent,
  delegateEvents,
  spread,
  effect,
  // ... 其他需要的 DOM 操作函数
} from 'dom-expressions/dist/dom.js'

// 可能需要的类型定义
export type * from 'dom-expressions/src/client.d.ts'
