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
  return renderWithPreservedNodes(value, container, options)
}

export function renderWithPreservedNodes(
  value: JSXValue | (() => JSXValue),
  container: Element | DocumentFragment,
  options: RenderOptions = {},
  preserveNodes: readonly Node[] = [],
): () => void {
  const renderScope = scope()
  const owner = options.owner ?? createOwner()

  renderScope.run(() => {
    clearContainer(container, preserveNodes)

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
    clearContainer(container, preserveNodes)
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

function clearContainer(
  container: Element | DocumentFragment,
  preserveNodes: readonly Node[] = [],
): void {
  const preserved = new Set(preserveNodes)

  for (const child of Array.from(container.childNodes)) {
    if (!preserved.has(child)) container.removeChild(child)
  }
}

function resolveValue(value: JSXValue | (() => JSXValue)): JSXValue {
  return typeof value === 'function' ? value() : (value ?? null)
}
