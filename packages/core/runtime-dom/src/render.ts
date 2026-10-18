import { scope } from '@zeus-js/signal/internal'

import { createOwner, runWithOwner } from './context'
import { emitDevtoolsEvent, getDevtoolsObjectId } from './devtools'
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

  let disposed = false

  return () => {
    if (disposed) return
    disposed = true

    renderScope.stop()
    container.textContent = ''
    if (typeof window !== 'undefined' && window.__ZEUS_DEVTOOLS_HOOK__) {
      emitDevtoolsEvent(
        {
          type: 'owner:dispose',
          ownerId: getDevtoolsObjectId(owner),
          target: container,
        },
        { swallowErrors: true },
      )
    }
  }
}

function resolveValue(value: JSXValue | (() => JSXValue)): JSXValue {
  return typeof value === 'function' ? value() : (value ?? null)
}
