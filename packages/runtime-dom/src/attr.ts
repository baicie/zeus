import { createEffect } from '@zeusjs/core'

export function bindAttr(el: Element, name: string, expr: () => unknown): void {
  createEffect(() => {
    const v = expr()
    if (v == null || v === false) {
      el.removeAttribute(name)
    } else {
      el.setAttribute(name, String(v))
    }
  })
}

export function setAttr(el: Element, name: string, value: unknown): void {
  if (value == null || value === false) {
    el.removeAttribute(name)
  } else {
    el.setAttribute(name, String(value))
  }
}

export function removeAttr(el: Element, name: string): void {
  el.removeAttribute(name)
}
