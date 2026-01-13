// packages/runtime-dom/src/directives/index.ts

// 纯函数式指令处理

export interface DirectiveBinding {
  value: any
  oldValue?: any
  arg?: string
  modifiers?: Record<string, boolean>
}

export type DirectiveHook = (el: Element, binding: DirectiveBinding) => void

export interface Directive {
  mounted?: DirectiveHook
  updated?: DirectiveHook
  unmounted?: DirectiveHook
}

// 指令注册表
const directives = new Map<string, Directive>()

export function registerDirective(name: string, directive: Directive): void {
  directives.set(name, directive)
}

export function getDirective(name: string): Directive | undefined {
  return directives.get(name)
}

// 应用指令到元素
export function applyDirective(
  el: Element,
  directive: Directive,
  binding: DirectiveBinding,
): void {
  if (directive.mounted) {
    directive.mounted(el, binding)
  }
}

// 更新指令
export function updateDirective(
  el: Element,
  directive: Directive,
  binding: DirectiveBinding,
): void {
  if (directive.updated) {
    directive.updated(el, binding)
  }
}

// 移除指令
export function removeDirective(el: Element, directive: Directive): void {
  if (directive.unmounted) {
    directive.unmounted(el, { value: undefined })
  }
}

// 批量应用指令
export function withDirectives<T extends Element>(
  element: T,
  directiveBindings: [Directive, DirectiveBinding][],
): T {
  directiveBindings.forEach(([directive, binding]) => {
    applyDirective(element, directive, binding)
  })
  return element
}

// 内置指令实现（纯函数）
export const vShow: Directive = {
  mounted: (el, binding) => updateVisibility(el, binding),
  updated: (el, binding) => updateVisibility(el, binding),
}

function updateVisibility(el: Element, binding: DirectiveBinding): void {
  const display = getComputedStyle(el).display
  const hidden = display === 'none'

  if (binding.value !== hidden) {
    ;(el as HTMLElement).style.display = binding.value
      ? (el as any)._vod || ''
      : 'none'
  }

  if (!binding.value) {
    ;(el as any)._vod = display
  }
}

export const vText: Directive = {
  mounted: (el, binding) => {
    el.textContent = String(binding.value)
  },
  updated: (el, binding) => {
    if (binding.value !== binding.oldValue) {
      el.textContent = String(binding.value)
    }
  },
}

export const vHtml: Directive = {
  mounted: (el, binding) => {
    el.innerHTML = String(binding.value)
  },
  updated: (el, binding) => {
    if (binding.value !== binding.oldValue) {
      el.innerHTML = String(binding.value)
    }
  },
}

export const vClass: Directive = {
  mounted: (el, binding) => updateClass(el, binding),
  updated: (el, binding) => updateClass(el, binding),
}

function updateClass(el: Element, binding: DirectiveBinding): void {
  const { value } = binding
  if (typeof value === 'string') {
    el.className = value
  } else if (Array.isArray(value)) {
    el.className = value.filter(Boolean).join(' ')
  } else if (typeof value === 'object') {
    const classes = Object.keys(value).filter(key => value[key])
    el.className = classes.join(' ')
  }
}

export const vStyle: Directive = {
  mounted: (el, binding) => updateStyle(el, binding),
  updated: (el, binding) => updateStyle(el, binding),
}

function updateStyle(el: Element, binding: DirectiveBinding): void {
  const { value } = binding
  const style = (el as HTMLElement).style

  if (typeof value === 'string') {
    style.cssText = value
  } else if (typeof value === 'object') {
    Object.assign(style, value)
  }
}

// 双向绑定指令
export function createVModelDirective(
  updateValue: (value: any) => void,
): Directive {
  return {
    mounted: (el, binding) => {
      updateElementValue(el, binding.value)

      const eventType = getEventType(el)
      el.addEventListener(eventType, e => {
        const value = getElementValue(el)
        updateValue(value)
      })
    },
    updated: (el, binding) => {
      if (binding.value !== binding.oldValue) {
        updateElementValue(el, binding.value)
      }
    },
  }
}

function getEventType(el: Element): string {
  if (el instanceof HTMLInputElement) {
    return el.type === 'checkbox' || el.type === 'radio' ? 'change' : 'input'
  }
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return 'change'
  }
  return 'input'
}

function getElementValue(el: Element): any {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') {
      return el.checked
    }
    if (el.type === 'number') {
      return Number(el.value)
    }
    return el.value
  }
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLSelectElement) {
    return el.value
  }
  return (el as any).value
}

function updateElementValue(el: Element, value: any): void {
  if (el instanceof HTMLInputElement) {
    if (el.type === 'checkbox') {
      el.checked = Boolean(value)
    } else {
      el.value = String(value)
    }
  } else {
    ;(el as any).value = value
  }
}

// 注册内置指令
registerDirective('show', vShow)
registerDirective('text', vText)
registerDirective('html', vHtml)
registerDirective('class', vClass)
registerDirective('style', vStyle)
