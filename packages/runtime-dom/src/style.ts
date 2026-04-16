import { createEffect } from '@zeusjs/core'

export function bindStyleObject(
  el: HTMLElement,
  expr: () => Record<string, string | null>,
): void {
  let prev: Record<string, string | null> = {}
  createEffect(() => {
    const next = expr() || {}
    for (const k in prev) {
      if (!(k in next) || next[k] == null) el.style.removeProperty(k)
    }
    for (const k in next) {
      const v = next[k]
      if (v != null) el.style.setProperty(k, v)
    }
    prev = next
  })
}

export function bindStyleString(el: HTMLElement, expr: () => string): void {
  createEffect(() => {
    el.style.cssText = expr() || ''
  })
}

export function setStyleProperty(
  el: HTMLElement,
  property: string,
  value: string | null,
): void {
  if (value == null) {
    el.style.removeProperty(property)
  } else {
    el.style.setProperty(property, value)
  }
}
