export function insertBefore(parent: ParentNode, node: Node, reference: Node): void {
  parent.insertBefore(node, reference)
}

export function insertAfter(parent: ParentNode, node: Node, reference: Node): void {
  parent.insertBefore(node, reference.nextSibling)
}

export function insertEnd(parent: ParentNode, node: Node): void {
  parent.appendChild(node)
}

export function removeNode(node: Node): void {
  node.parentNode?.removeChild(node)
}
