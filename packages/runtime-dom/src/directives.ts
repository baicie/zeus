// packages/runtime-dom/src/directives.ts

// 最简单的指令支持 / Simplest directive support

// 指令绑定接口 / Directive binding interface
export interface DirectiveBinding {
  value: any
}

// 指令钩子类型 / Directive hook type
export type DirectiveHook = (el: Element, binding: DirectiveBinding) => void

// 指令接口 / Directive interface
export interface Directive {
  mounted?: DirectiveHook
  updated?: DirectiveHook
}
