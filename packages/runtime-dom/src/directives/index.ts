// packages/runtime-dom/src/directives/index.ts

export function withDirectives(
  element: Element,
  directives: Directive[],
): Element {
  directives.forEach(directive => {
    // 应用指令
  })
  return element
}

export interface Directive {
  mounted?: (el: Element, binding: DirectiveBinding) => void
  updated?: (el: Element, binding: DirectiveBinding) => void
  unmounted?: (el: Element) => void
}

export interface DirectiveBinding {
  value: any
  oldValue: any
  arg: string
  modifiers: Record<string, boolean>
}
