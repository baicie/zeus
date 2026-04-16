import { createEffect } from '@zeusjs/core'

export function createTextPlaceholder(anchor: Comment): Text {
  const text = document.createTextNode('')
  anchor.parentNode!.replaceChild(text, anchor)
  return text
}

export function bindText(node: Text, expr: () => unknown): void {
  createEffect(() => {
    const v = expr()
    node.data = v == null ? '' : String(v)
  })
}

export function setText(node: Text, value: unknown): void {
  node.data = value == null ? '' : String(value)
}
