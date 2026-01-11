// packages/runtime-dom/src/directives/index.ts

export interface DirectiveBinding {
  value: any
  oldValue?: any
  arg?: string
  modifiers?: Record<string, boolean>
  instance?: any
}

export interface Directive {
  mounted?: (el: Element, binding: DirectiveBinding) => void
  updated?: (el: Element, binding: DirectiveBinding) => void
  unmounted?: (el: Element) => void
}

export interface DirectiveHook {
  create: (el: Element, binding: DirectiveBinding) => void
  update: (el: Element, binding: DirectiveBinding) => void
  remove: (el: Element) => void
}

// 指令注册表
const directives = new Map<string, Directive>()

export function registerDirective(name: string, directive: Directive): void {
  directives.set(name, directive)
}

export function getDirective(name: string): Directive | undefined {
  return directives.get(name)
}

export function withDirectives<T extends Element>(
  element: T,
  directiveBindings: [Directive, DirectiveBinding][],
): T {
  directiveBindings.forEach(([directive, binding]) => {
    // 应用指令
    if (directive.mounted) {
      directive.mounted(element, binding)
    }

    // 如果指令有更新钩子，监听变化
    if (directive.updated) {
      // 这里可以添加响应式监听逻辑
    }
  })

  return element
}

// 内置指令
export const vShow: Directive = {
  mounted(el, binding) {
    updateVisibility(el, binding)
  },
  updated(el, binding) {
    updateVisibility(el, binding)
  },
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

export const vModel: Directive = {
  mounted(el, binding) {
    if (el instanceof HTMLInputElement) {
      el.value = binding.value
      el.addEventListener('input', e => {
        const target = e.target as HTMLInputElement
        binding.instance[binding.arg || 'value'] = target.value
      })
    } else if (el instanceof HTMLTextAreaElement) {
      el.value = binding.value
      el.addEventListener('input', e => {
        const target = e.target as HTMLTextAreaElement
        binding.instance[binding.arg || 'value'] = target.value
      })
    } else if (el instanceof HTMLSelectElement) {
      el.value = binding.value
      el.addEventListener('change', e => {
        const target = e.target as HTMLSelectElement
        binding.instance[binding.arg || 'value'] = target.value
      })
    }
  },
  updated(el, binding) {
    if (binding.value !== binding.oldValue) {
      ;(el as any).value = binding.value
    }
  },
}

export const vText: Directive = {
  mounted(el, binding) {
    el.textContent = binding.value
  },
  updated(el, binding) {
    if (binding.value !== binding.oldValue) {
      el.textContent = binding.value
    }
  },
}

export const vHtml: Directive = {
  mounted(el, binding) {
    el.innerHTML = binding.value
  },
  updated(el, binding) {
    if (binding.value !== binding.oldValue) {
      el.innerHTML = binding.value
    }
  },
}

// 注册内置指令
registerDirective('show', vShow)
registerDirective('model', vModel)
registerDirective('text', vText)
registerDirective('html', vHtml)
