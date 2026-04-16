import { onCleanup } from '@zeusjs/core'

export interface ProjectionRecord {
  host: HTMLElement
  observer: MutationObserver
  slots: Map<string | null, Comment>
  projectedNodes: Map<Node, Comment>
}

const PROJECTION_KEY = '__zeusProjection'

function isFrameworkNode(node: Node): boolean {
  if (node.nodeType !== Node.ELEMENT_NODE) return false
  const el = node as Element
  return el.hasAttribute?.('data-zeus-slot') || el.hasAttribute?.('data-zeus')
}

function isSlotMarker(node: Node): boolean {
  if (node.nodeType !== Node.COMMENT_NODE) return false
  const text = (node as Comment).textContent || ''
  return text.startsWith('slot:') || text === 'slot'
}

export function setupLightDomProjection(host: HTMLElement): ProjectionRecord {
  const slotMarkers = collectSlotMarkers(host)
  const lightChildren = collectLightChildren(host)

  const projectedNodes = new Map<Node, Comment>()
  projectNodes(host, slotMarkers, lightChildren, projectedNodes)

  const observer = new MutationObserver(() => {
    const nodes = collectLightChildren(host)
    projectNodes(host, slotMarkers, nodes, projectedNodes)
  })

  observer.observe(host, { childList: true })

  const record: ProjectionRecord = {
    host,
    observer,
    slots: slotMarkers,
    projectedNodes,
  }

  ;(host as any)[PROJECTION_KEY] = record
  return record
}

function collectLightChildren(host: HTMLElement): Node[] {
  return Array.from(host.childNodes).filter(n => !isFrameworkNode(n) && !isSlotMarker(n))
}

function collectSlotMarkers(host: HTMLElement): Map<string | null, Comment> {
  const markers = new Map<string | null, Comment>()
  const root = host.shadowRoot || host
  const walker = document.createTreeWalker(
    root,
    NodeFilter.SHOW_COMMENT,
  )

  let node: Comment | null
  while ((node = walker.nextNode() as Comment | null)) {
    const text = node.textContent || ''
    if (text.startsWith('slot:')) {
      const name = text.slice(5) || null
      markers.set(name, node)
    } else if (text === 'slot') {
      markers.set(null, node)
    }
  }

  return markers
}

function projectNodes(
  host: HTMLElement,
  slots: Map<string | null, Comment>,
  sourceNodes: Node[],
  projectedNodes: Map<Node, Comment>,
): void {
  const unnamedSlot = slots.get(null)
  const nodesBySlot = new Map<string | null, Node[]>()

  for (const node of sourceNodes) {
    const slotName = (node as Element).getAttribute?.('slot') || null

    if (slotName && !slots.has(slotName)) continue

    const slot = slots.get(slotName) || unnamedSlot
    if (!slot) continue

    const existing = projectedNodes.get(node)
    if (existing?.nextSibling !== slot) {
      slot.parentNode?.insertBefore(node, slot)
      projectedNodes.set(node, slot)
    }

    const list = nodesBySlot.get(slotName) || []
    list.push(node)
    nodesBySlot.set(slotName, list)
  }
}

export function cleanupProjection(host: HTMLElement): void {
  const record = (host as any)[PROJECTION_KEY] as ProjectionRecord | undefined
  if (record) {
    record.observer.disconnect()
    delete (host as any)[PROJECTION_KEY]
  }
}
