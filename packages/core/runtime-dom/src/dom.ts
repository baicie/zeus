export function marker(parent: ParentNode, index: number): Comment {
  let seen = 0

  for (const node of parent.childNodes) {
    if (node.nodeType !== Node.COMMENT_NODE) continue

    const comment = node as Comment

    if (comment.data !== '' && comment.data !== '!') continue
    if (seen === index) return comment

    seen++
  }

  throw new Error(`[Zeus runtime] marker ${index} not found`)
}

export function child(parent: ParentNode, index: number): ChildNode {
  const node = parent.childNodes.item(index)

  if (!node) {
    throw new Error(`[Zeus runtime] child ${index} not found`)
  }

  return node as ChildNode
}

export function removeNodes(nodes: readonly Node[]): void {
  for (const node of nodes) {
    node.parentNode?.removeChild(node)
  }
}
