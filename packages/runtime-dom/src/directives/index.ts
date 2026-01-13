// packages/runtime-dom/src/directives/index.ts

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

// 应用指令 / Apply directive
export function applyDirective(
  el: Element,
  directive: Directive,
  binding: DirectiveBinding,
): void {
  if (directive.mounted) {
    directive.mounted(el, binding)
  }
}

// 更新指令 / Update directive
export function updateDirective(
  el: Element,
  directive: Directive,
  binding: DirectiveBinding,
): void {
  if (directive.updated) {
    directive.updated(el, binding)
  }
}

// 显示/隐藏指令 / Show/hide directive
export const vShow: Directive = {
  mounted: (el, binding) => {
    // 根据绑定值控制显示/隐藏 / Control visibility based on binding value
    ;(el as HTMLElement).style.display = binding.value ? '' : 'none'
  },
  updated: (el, binding) => {
    // 更新时重新控制显示/隐藏 / Re-control visibility on update
    ;(el as HTMLElement).style.display = binding.value ? '' : 'none'
  },
}

// 文本指令 / Text directive
export const vText: Directive = {
  mounted: (el, binding) => {
    // 设置元素文本内容 / Set element text content
    el.textContent = String(binding.value)
  },
  updated: (el, binding) => {
    // 更新时重新设置文本内容 / Reset text content on update
    el.textContent = String(binding.value)
  },
}
