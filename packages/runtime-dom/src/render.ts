import { scope } from '@zeus-js/signal'

import { createOwner, runWithOwner } from './context'
import { emitDevtoolsEvent } from './devtools'
import { insert } from './insert'

import type { JSXValue } from './types'

export interface RenderOptions {
  owner?: ReturnType<typeof createOwner>
}

export function render(
  value: JSXValue | (() => JSXValue),
  container: Element | DocumentFragment,
  options: RenderOptions = {},
): () => void {
  const renderScope = scope()
  const owner = options.owner ?? createOwner()

  renderScope.run(() => {
    container.textContent = ''

    runWithOwner(owner, () => {
      insert(container, resolveValue(value))
    })
  })

  emitDevtoolsEvent({ type: 'render', target: container })

  return () => {
    renderScope.stop()
    container.textContent = ''
  }
}

function resolveValue(value: JSXValue | (() => JSXValue)): JSXValue {
  return typeof value === 'function' ? value() : (value ?? null)
}
