import { onScopeDispose, scope } from '@zeus-js/signal/internal'

import { bindAttr, bindProp, bindText } from './bindings'
import { createOwner, runWithOwner } from './context'
import { bindEvent } from './events'

const MARKER_PREFIX = 'zeus:hydrate:'

export interface HydrationContext {
  node(id: string): Node
  text(id: string, value: () => unknown): void
  attr(id: string, name: string, value: () => unknown): void
  prop(id: string, name: string, value: () => unknown): void
  event(id: string, name: string, handler: EventListener): void
}

/**
 * Reuses server-created nodes and attaches fine-grained bindings. This API is
 * intentionally explicit: compiler-generated plans can map each marker to a
 * precise node without guessing a component tree from arbitrary HTML.
 */
export function hydrate(
  container: Element | DocumentFragment,
  setup: (context: HydrationContext) => void,
): () => void {
  const hydrationScope = scope()
  const owner = createOwner()
  const context = createHydrationContext(container)

  try {
    hydrationScope.run(() => {
      runWithOwner(owner, () => setup(context))
    })
  } catch (error) {
    hydrationScope.stop()
    throw error
  }

  let disposed = false
  return () => {
    if (disposed) return
    disposed = true
    hydrationScope.stop()
  }
}

function createHydrationContext(
  container: Element | DocumentFragment,
): HydrationContext {
  const cache = new Map<string, Node>()
  const node = (id: string): Node => {
    const cached = cache.get(id)
    if (cached) return cached

    const marker = findMarker(container, id)
    const target = nextHydratableNode(marker)
    if (!target) {
      throw new Error(`ZEUS_HYDRATION_TARGET_MISSING: ${id}`)
    }
    cache.set(id, target)
    return target
  }

  return {
    node,
    text(id, value) {
      const target = node(id)
      if (target.nodeType !== 3) {
        throw new TypeError(`ZEUS_HYDRATION_TEXT_TARGET: ${id}`)
      }
      bindText(target as Text, value as () => never)
    },
    attr(id, name, value) {
      const target = node(id)
      if (target.nodeType !== 1) {
        throw new TypeError(`ZEUS_HYDRATION_ELEMENT_TARGET: ${id}`)
      }
      bindAttr(target as Element, name, value as () => never)
    },
    prop(id, name, value) {
      const target = node(id)
      if (target.nodeType !== 1) {
        throw new TypeError(`ZEUS_HYDRATION_ELEMENT_TARGET: ${id}`)
      }
      const typedTarget = target as Element & Record<string, unknown>
      bindProp(
        typedTarget,
        name as keyof typeof typedTarget,
        value as () => never,
      )
    },
    event(id, name, handler) {
      const target = node(id)
      if (target.nodeType !== 1) {
        throw new TypeError(`ZEUS_HYDRATION_ELEMENT_TARGET: ${id}`)
      }
      const element = target as Element
      bindEvent(element, name, handler)
      element.addEventListener(name, handler)
      onScopeDispose(() => element.removeEventListener(name, handler), true)
    },
  }
}

function findMarker(
  container: Element | DocumentFragment,
  id: string,
): Comment {
  const expected = `${MARKER_PREFIX}${id}`
  const walker = container.ownerDocument!.createTreeWalker(container, 0x80)
  let current = walker.nextNode()
  while (current) {
    if ((current as Comment).data === expected) return current as Comment
    current = walker.nextNode()
  }
  throw new Error(`ZEUS_HYDRATION_MARKER_MISSING: ${id}`)
}

function nextHydratableNode(marker: Comment): Node | null {
  let node = marker.nextSibling
  while (node && node.nodeType === 8) node = node.nextSibling
  return node
}
