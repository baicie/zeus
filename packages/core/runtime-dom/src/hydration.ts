import { onScopeDispose, scope } from '@zeus-js/signal/internal'

import { bindAttr, bindProp, bindText } from './bindings'
import { createOwner, runWithOwner } from './context'
import { emitDevtoolsEvent, getDevtoolsObjectId } from './devtools'

const MARKER_PREFIX = 'zeus:hydrate:'

export interface HydrationContext {
  node(id: string, expectedTag?: string): Node
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
  const context = createHydrationContext(container)
  const hydrationScope = scope()

  try {
    hydrationScope.run(() => {
      const owner = createOwner()
      onScopeDispose(() => {
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
      }, true)
      runWithOwner(owner, () => setup(context))
    })
  } catch (error) {
    try {
      hydrationScope.stop()
    } catch {
      /* Preserve the initial hydration setup failure. */
    }
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
  const markers = indexMarkers(container)
  const node = (id: string, expectedTag?: string): Node => {
    const marker = markers.get(id)
    if (!marker) throw new Error(`ZEUS_HYDRATION_MARKER_MISSING: ${id}`)
    const target = nextHydratableNode(marker)
    if (!target) {
      throw new Error(`ZEUS_HYDRATION_TARGET_MISSING: ${id}`)
    }
    if (
      expectedTag !== undefined &&
      (target.nodeType !== 1 || (target as Element).localName !== expectedTag)
    ) {
      throw new Error(
        `ZEUS_HYDRATION_TAG_MISMATCH: ${id}; expected <${expectedTag}>`,
      )
    }
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
      element.addEventListener(name, handler)
      onScopeDispose(() => element.removeEventListener(name, handler), true)
    },
  }
}

function indexMarkers(
  container: Element | DocumentFragment,
): Map<string, Comment> {
  const markers = new Map<string, Comment>()
  const walker = container.ownerDocument!.createTreeWalker(container, 0x80)
  let current = walker.nextNode()
  while (current) {
    const data = (current as Comment).data
    if (data.startsWith(MARKER_PREFIX)) {
      const id = data.slice(MARKER_PREFIX.length)
      if (markers.has(id)) {
        throw new Error(`ZEUS_HYDRATION_DUPLICATE_MARKER: ${id}`)
      }
      markers.set(id, current as Comment)
    }
    current = walker.nextNode()
  }
  return markers
}

function nextHydratableNode(marker: Comment): Node | null {
  let node = marker.nextSibling
  while (node && node.nodeType === 8) node = node.nextSibling
  return node
}
