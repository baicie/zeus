// packages/runtime-dom/src/slot.ts

import { isRuntimeOwnedNode, registerLightDomHost } from './domOwnership'
import { getCurrentHostContext } from './hostContext'
import { insert } from './insert'
import { insertTracked } from './range'

import type { JSXValue } from './types'

export function createSlot(name?: string, fallback?: () => JSXValue): JSXValue {
  const context = getCurrentHostContext()

  if (!context) {
    return createNativeSlot(name, fallback)
  }

  if (context.mode === 'shadow') {
    return createNativeSlot(name, fallback)
  }

  if (context.projection) {
    return context.projection.createSlot(name, fallback)
  }

  const assigned = findLightSlotNodes(context.lightChildren, name)

  if (assigned.length > 0) {
    return Array.from(assigned)
  }

  return fallback ? fallback() : null
}

export interface LightDomProjection {
  createSlot(name?: string, fallback?: () => JSXValue): DocumentFragment
  connect(): void
  disconnect(): void
}

interface LightDomSlotOutlet {
  name?: string
  start: Comment
  end: Comment
  fallbackNodes: Node[]
}

export function createLightDomProjection(
  host: HTMLElement,
  lightChildren: Node[],
): LightDomProjection {
  const outlets: LightDomSlotOutlet[] = []
  let observer: MutationObserver | undefined
  let unregisterHost: (() => void) | undefined

  const observe = (): void => {
    observer?.observe(host, {
      attributes: true,
      attributeFilter: ['slot'],
      childList: true,
      subtree: true,
    })

    for (const node of lightChildren) {
      if (node.nodeType !== Node.ELEMENT_NODE || host.contains(node)) continue

      observer?.observe(node, {
        attributes: true,
        attributeFilter: ['slot'],
      })
    }
  }

  const reconcile = (): void => {
    observer?.disconnect()

    const claimed = new Set<Node>()

    for (const outlet of outlets) {
      const assigned = lightChildren.filter(node => {
        if (claimed.has(node) || !matchesLightSlot(node, outlet.name)) {
          return false
        }

        claimed.add(node)
        return true
      })

      replaceOutletNodes(
        outlet,
        assigned.length > 0 ? assigned : outlet.fallbackNodes,
      )
    }

    for (const node of lightChildren) {
      if (!claimed.has(node) && host.contains(node)) {
        node.parentNode?.removeChild(node)
      }
    }

    observer?.takeRecords()
    observe()
  }

  const handleMutations = (records: MutationRecord[]): void => {
    const added = new Set<Node>()
    const removed = new Set<Node>()
    let changed = false

    for (const record of records) {
      if (record.type === 'attributes') {
        if (lightChildren.includes(record.target)) changed = true
        continue
      }

      for (const node of record.removedNodes) {
        if (lightChildren.includes(node)) removed.add(node)
      }

      if (record.target !== host) continue

      const additions = Array.from(record.addedNodes).filter(node => {
        return !isRuntimeOwnedNode(node)
      })

      if (additions.length === 0) continue

      for (const node of additions) added.add(node)
      insertLightChildren(lightChildren, additions, record)
      changed = true
    }

    for (const node of removed) {
      if (added.has(node) || host.contains(node)) continue

      const index = lightChildren.indexOf(node)
      if (index >= 0) {
        lightChildren.splice(index, 1)
        changed = true
      }
    }

    if (changed) reconcile()
  }

  return {
    createSlot(name, fallback) {
      const fragment = document.createDocumentFragment()
      const start = document.createComment(
        name ? `zeus-slot:${name}` : 'zeus-slot',
      )
      const end = document.createComment('/zeus-slot')

      fragment.append(start, end)

      const outlet: LightDomSlotOutlet = {
        name,
        start,
        end,
        fallbackNodes: fallback ? insertTracked(fragment, fallback(), end) : [],
      }

      outlets.push(outlet)
      reconcile()

      return fragment
    },
    connect() {
      if (observer) return

      const Observer = host.ownerDocument.defaultView?.MutationObserver
      if (!Observer) return

      unregisterHost = registerLightDomHost(host, lightChildren)
      observer = new Observer(handleMutations)
      observe()
    },
    disconnect() {
      observer?.disconnect()
      observer = undefined
      unregisterHost?.()
      unregisterHost = undefined
    },
  }
}

function replaceOutletNodes(
  outlet: LightDomSlotOutlet,
  nextNodes: readonly Node[],
): void {
  const parent = outlet.end.parentNode
  if (!parent || parent !== outlet.start.parentNode) return

  const currentNodes: Node[] = []
  let current = outlet.start.nextSibling

  while (current && current !== outlet.end) {
    currentNodes.push(current)
    current = current.nextSibling
  }

  if (
    currentNodes.length === nextNodes.length &&
    currentNodes.every((node, index) => node === nextNodes[index])
  ) {
    return
  }

  current = outlet.start.nextSibling

  while (current && current !== outlet.end) {
    const next = current.nextSibling
    parent.removeChild(current)
    current = next
  }

  for (const node of nextNodes) {
    parent.insertBefore(node, outlet.end)
  }
}

function insertLightChildren(
  lightChildren: Node[],
  additions: readonly Node[],
  record: MutationRecord,
): void {
  for (const node of additions) {
    const currentIndex = lightChildren.indexOf(node)
    if (currentIndex >= 0) lightChildren.splice(currentIndex, 1)
  }

  let insertionIndex = lightChildren.length
  const previousIndex = record.previousSibling
    ? lightChildren.indexOf(record.previousSibling)
    : -1
  const nextIndex = record.nextSibling
    ? lightChildren.indexOf(record.nextSibling)
    : -1

  if (previousIndex >= 0) {
    insertionIndex = previousIndex + 1
  } else if (nextIndex >= 0) {
    insertionIndex = nextIndex
  } else if (record.previousSibling === null) {
    insertionIndex = 0
  }

  lightChildren.splice(insertionIndex, 0, ...additions)
}

function createNativeSlot(
  name?: string,
  fallback?: () => JSXValue,
): HTMLSlotElement {
  const slot = document.createElement('slot')

  if (name) {
    slot.setAttribute('name', name)
  }

  const fallbackValue = fallback?.()

  if (fallbackValue != null) {
    insert(slot, fallbackValue)
  }

  return slot
}

function findLightSlotNodes(nodes: readonly Node[], name?: string): Node[] {
  return nodes.filter(node => matchesLightSlot(node, name))
}

function matchesLightSlot(node: Node, name?: string): boolean {
  if (name) {
    if (node.nodeType !== Node.ELEMENT_NODE) return false
    return (node as Element).getAttribute('slot') === name
  }

  if (node.nodeType === Node.ELEMENT_NODE) {
    return !(node as Element).hasAttribute('slot')
  }

  return isMeaningfulTextNode(node)
}

function isMeaningfulTextNode(node: Node): boolean {
  if (node.nodeType !== Node.TEXT_NODE) return false
  return Boolean(node.textContent?.trim())
}
