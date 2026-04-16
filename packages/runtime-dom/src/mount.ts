export function getNode(root: Node, path: number[]): Node {
  let current: Node = root
  for (const i of path) {
    current = current.childNodes[i]
  }
  return current
}

export function querySelector<T extends Element>(
  root: ParentNode,
  selector: string,
): T | null {
  return root.querySelector(selector)
}

export function querySelectorAll<T extends Element>(
  root: ParentNode,
  selector: string,
): T[] {
  return Array.from(root.querySelectorAll(selector))
}
