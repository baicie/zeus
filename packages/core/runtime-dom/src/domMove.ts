const activeMoveRoots = new Set<Node>()

export function moveNodeBefore(
  parent: Node,
  node: Node,
  marker: Node | null,
): void {
  activeMoveRoots.add(node)

  try {
    const moveBefore = (parent as ParentNode).moveBefore

    // moveBefore only supports state-preserving moves when both sides have the
    // same connection state. Initial projection and slot reassignment can move
    // a detached node into a connected outlet, so those moves use insertBefore.
    if (
      typeof moveBefore === 'function' &&
      parent.nodeType !== 11 &&
      parent.isConnected === node.isConnected
    ) {
      moveBefore.call(parent, node, marker)
    } else {
      parent.insertBefore(node, marker)
    }
  } finally {
    activeMoveRoots.delete(node)
  }
}

export function isWithinRuntimeDomMove(node: Node): boolean {
  if (activeMoveRoots.size === 0) return false
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
