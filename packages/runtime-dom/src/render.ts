import { scope } from '@zeus-js/signal'

import { insert } from './insert'

import type { JSXValue } from './types'

export function render(
  value: JSXValue | (() => JSXValue),
  container: Element | DocumentFragment,
): () => void {
  const renderScope = scope()

  renderScope.run(() => {
    container.textContent = ''
    insert(container, resolveValue(value))
  })

  return () => {
    renderScope.stop()
    container.textContent = ''
  }
}

function resolveValue(value: JSXValue | (() => JSXValue)): JSXValue {
  return typeof value === 'function' ? value() : value
}
