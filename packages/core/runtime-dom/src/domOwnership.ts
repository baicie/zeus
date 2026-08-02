interface LightDomHostOwnership {
  lightChildren: readonly Node[]
}

const activeLightDomHosts = new WeakMap<Node, LightDomHostOwnership>()
const runtimeOwnedNodes = new WeakSet<Node>()

export function registerLightDomHost(
  host: HTMLElement,
  lightChildren: readonly Node[],
): () => void {
  const ownership = { lightChildren }
  activeLightDomHosts.set(host, ownership)

  return () => {
    if (activeLightDomHosts.get(host) === ownership) {
      activeLightDomHosts.delete(host)
    }
  }
}

export function trackRuntimeDomInsertion(parent: Node, node: Node): void {
  const ownership = activeLightDomHosts.get(parent)
  if (!ownership) return

  if (node.nodeType === 11) {
    for (const child of node.childNodes) {
      trackRuntimeNode(ownership, child)
    }
    return
  }

  trackRuntimeNode(ownership, node)
}

export function isRuntimeOwnedNode(node: Node): boolean {
  return runtimeOwnedNodes.has(node)
}

function trackRuntimeNode(ownership: LightDomHostOwnership, node: Node): void {
  if (!ownership.lightChildren.includes(node)) {
    runtimeOwnedNodes.add(node)
  }
}
