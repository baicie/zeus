const activeMoveRoots = new Set<Node>()

export function moveNodeBefore(
  parent: Node,
  node: Node,
  marker: Node | null,
): void {
  activeMoveRoots.add(node)

  try {
    const moveBefore = (parent as ParentNode).moveBefore

    if (typeof moveBefore === 'function') {
      moveBefore.call(parent, node, marker)
    } else {
      parent.insertBefore(node, marker)
    }
  } finally {
    activeMoveRoots.delete(node)
  }
}

export function isWithinRuntimeDomMove(node: Node): boolean {
  let current: Node | null = node

  while (current) {
    if (activeMoveRoots.has(current)) return true

    if (current.parentNode) {
      current = current.parentNode
      continue
    }

    const root = current.getRootNode()
    current = 'host' in root ? (root as ShadowRoot).host : null
  }

  return false
}
