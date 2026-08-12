// packages/runtime-dom/src/range.ts

import { trackRuntimeDomInsertion } from './domOwnership'

import type { JSXValue } from './types'

export class DynamicRange {
  private nodes: Node[] = []

  constructor(
    private readonly parent: Node,
    private readonly marker: Node | null,
  ) {}

  replace(value: JSXValue): void {
    this.clear()
    this.nodes = insertTracked(this.parent, value, this.marker)
  }

  clear(): void {
    for (const node of this.nodes) {
      node.parentNode?.removeChild(node)
    }
    this.nodes = []
  }

  current(): readonly Node[] {
    return this.nodes
  }
}

export function insertTracked(
  parent: Node,
  value: JSXValue,
  marker: Node | null = null,
): Node[] {
  if (
    value === undefined ||
    value == null ||
    value === false ||
    value === true
  ) {
    return []
  }

  if (Array.isArray(value)) {
    const nodes: Node[] = []
    for (const item of value) {
      nodes.push(...insertTracked(parent, item, marker))
    }
    return nodes
  }

  if (value instanceof Node && value.nodeType === Node.DOCUMENT_FRAGMENT_NODE) {
    const nodes = Array.from(value.childNodes)
    for (const node of nodes) {
      trackRuntimeDomInsertion(parent, node)
      parent.insertBefore(node, marker)
    }
    return nodes
  }

  const node =
    value instanceof Node ? value : document.createTextNode(String(value))

  trackRuntimeDomInsertion(parent, node)
  parent.insertBefore(node, marker)

  return [node]
}

export function removeNodes(nodes: readonly Node[]): void {
  for (const node of nodes) {
    node.parentNode?.removeChild(node)
  }
}

export function moveRangeBefore(
  nodes: readonly Node[],
  parent: Node,
  marker: Node | null = null,
): void {
  for (const node of nodes) {
    trackRuntimeDomInsertion(parent, node)
    parent.insertBefore(node, marker)
  }
}

export function firstNode(nodes: readonly Node[]): Node | null {
  return nodes[0] ?? null
}

export function lastNode(nodes: readonly Node[]): Node | null {
  return nodes[nodes.length - 1] ?? null
}
