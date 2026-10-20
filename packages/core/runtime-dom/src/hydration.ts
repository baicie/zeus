import { onScopeDispose, scope } from '@zeus-js/signal/internal'

import { bindAttr, bindProp, bindText } from './bindings'
import { createOwner, runWithOwner } from './context'
import { emitDevtoolsEvent, getDevtoolsObjectId } from './devtools'

const MARKER_PREFIX = 'zeus:hydrate:'

export interface HydrationContext {
  node(id: string, expectedTag?: string, occurrence?: number): Node
  nodes(id: string, expectedTag?: string): Node[]
  text(id: string, value: () => unknown, occurrence?: number): void
  attr(
    id: string,
    name: string,
    value: () => unknown,
    occurrence?: number,
  ): void
  prop(
    id: string,
    name: string,
    value: () => unknown,
    occurrence?: number,
  ): void
  event(
    id: string,
    name: string,
    handler: EventListener,
    occurrence?: number,
  ): void
}

export interface HydrationPlanBinding {
  readonly id: number
  readonly kind: 'text' | 'attr' | 'prop' | 'event' | 'spread'
  readonly name?: string
  readonly once: boolean
}

export interface HydrationPlanNode {
  readonly id: string
  readonly nodeId: number
  readonly kind:
    | 'root'
    | 'element'
    | 'text'
    | 'component'
    | 'show'
    | 'for'
    | 'transition'
    | 'region'
  readonly tagName?: string
  readonly bindings: readonly HydrationPlanBinding[]
}

export interface HydrationPlanComponent {
  readonly id: number
  readonly templateId: string
  readonly nodes: readonly HydrationPlanNode[]
}

export interface HydrationPlan {
  readonly version: number
  readonly components: readonly HydrationPlanComponent[]
}

export type HydrationBindingHandler = (
  context: HydrationContext,
  binding: HydrationPlanBinding,
  node: HydrationPlanNode,
  occurrence: number,
) => void

/**
 * Reuses server-created nodes and attaches fine-grained bindings. This API is
 * intentionally explicit: compiler-generated plans can map each marker to a
 * precise node without guessing a component tree from arbitrary HTML.
 */
export function hydrate(
  container: Element | DocumentFragment,
  setup: (context: HydrationContext) => void,
): () => void {
  return runHydration(container, setup, false)
}

function runHydration(
  container: Element | DocumentFragment,
  setup: (context: HydrationContext) => void,
  allowDuplicateMarkers: boolean,
): () => void {
  const context = createHydrationContext(container, allowDuplicateMarkers)
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

/**
 * Reconnects every compiler-planned binding to an existing DOM tree. Missing
 * handlers fail during setup and dispose the partial hydration scope.
 */
export function hydratePlan(
  container: Element | DocumentFragment,
  plan: HydrationPlan,
  handlers: Readonly<Record<number, HydrationBindingHandler>>,
): () => void {
  if (plan.version !== 1) {
    throw new TypeError(`Unsupported hydration plan version: ${plan.version}`)
  }

  return runHydration(
    container,
    context => {
      const missing: number[] = []
      for (const component of plan.components) {
        for (const node of component.nodes) {
          const occurrences = context.nodes(node.id)
          for (const [occurrence] of occurrences.entries()) {
            for (const binding of node.bindings) {
              const handler = handlers[binding.id]
              if (!handler) {
                missing.push(binding.id)
                continue
              }
              handler(context, binding, node, occurrence)
            }
          }
        }
      }
      if (missing.length > 0) {
        throw new Error(
          `ZEUS_HYDRATION_HANDLER_MISSING: ${missing
            .sort((left, right) => left - right)
            .join(',')}`,
        )
      }
    },
    true,
  )
}

function createHydrationContext(
  container: Element | DocumentFragment,
  allowDuplicateMarkers: boolean,
): HydrationContext {
  const markers = indexMarkers(container)
  if (!allowDuplicateMarkers) {
    const duplicate = Array.from(markers).find(
      ([, entries]) => entries.length > 1,
    )
    if (duplicate) {
      throw new Error(`ZEUS_HYDRATION_DUPLICATE_MARKER: ${duplicate[0]}`)
    }
  }

  const nodes = (id: string, expectedTag?: string): Node[] => {
    const entries = markers.get(id)
    if (!entries) throw new Error(`ZEUS_HYDRATION_MARKER_MISSING: ${id}`)
    return entries.map(marker => {
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
    })
  }

  const node = (id: string, expectedTag?: string, occurrence = 0): Node => {
    const targets = nodes(id, expectedTag)
    const target = targets[occurrence]
    if (!target) {
      throw new Error(
        `ZEUS_HYDRATION_OCCURRENCE_MISSING: ${id}; occurrence ${occurrence}`,
      )
    }
    return target
  }

  return {
    node,
    nodes,
    text(id, value, occurrence) {
      const target = node(id, undefined, occurrence)
      if (target.nodeType !== 3) {
        throw new TypeError(`ZEUS_HYDRATION_TEXT_TARGET: ${id}`)
      }
      bindText(target as Text, value as () => never)
    },
    attr(id, name, value, occurrence) {
      const target = node(id, undefined, occurrence)
      if (target.nodeType !== 1) {
        throw new TypeError(`ZEUS_HYDRATION_ELEMENT_TARGET: ${id}`)
      }
      bindAttr(target as Element, name, value as () => never)
    },
    prop(id, name, value, occurrence) {
      const target = node(id, undefined, occurrence)
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
    event(id, name, handler, occurrence) {
      const target = node(id, undefined, occurrence)
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
): Map<string, Comment[]> {
  const markers = new Map<string, Comment[]>()
  const walker = container.ownerDocument!.createTreeWalker(container, 0x80)
  let current = walker.nextNode()
  while (current) {
    const data = (current as Comment).data
    if (data.startsWith(MARKER_PREFIX)) {
      const id = data.slice(MARKER_PREFIX.length)
      const entries = markers.get(id) ?? []
      entries.push(current as Comment)
      markers.set(id, entries)
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
