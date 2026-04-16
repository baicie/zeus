import { createEffect } from '@zeusjs/core'

export function bindClassName(el: HTMLElement, expr: () => string): void {
  createEffect(() => {
    el.className = expr() || ''
  })
}

export function setClassName(el: HTMLElement, value: string): void {
  el.className = value || ''
}

export function bindClassMap(
  el: HTMLElement,
  expr: () => Record<string, boolean>,
): void {
  let prev: Record<string, boolean> = {}
  createEffect(() => {
    const next = expr() || {}
    for (const k in prev) {
      if (!next[k]) el.classList.remove(k)
    }
    for (const k in next) {
      if (next[k]) el.classList.add(k)
    }
    prev = next
  })
}
