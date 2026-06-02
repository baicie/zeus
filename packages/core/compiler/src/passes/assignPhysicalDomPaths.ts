import type {
  ComponentIR,
  DynamicTextIR,
  ElementIR,
  ForIR,
  IRRef,
  PhysicalDomPath,
  ShowIR,
  SlotIR,
  ZeusIRNode,
} from '../ir/nodes'

type RefNode = ElementIR | DynamicTextIR | ComponentIR | ShowIR | ForIR | SlotIR

type PhysicalNode =
  | RefNode
  | {
      kind: 'TextPlaceholder'
    }

export function assignPhysicalDomPaths(node: ZeusIRNode): ZeusIRNode {
  visitNode(node)
  return node
}

function visitNode(node: ZeusIRNode, parent?: ElementIR): void {
  switch (node.kind) {
    case 'Element':
      assignElementPhysicalPath(node, parent)
      assignChildrenPhysicalPaths(node)
      return

    case 'Fragment':
      for (const child of node.children) {
        visitNode(child, parent)
      }
      return

    case 'Host':
      if (node.child) visitNode(node.child, parent)
      return

    case 'Show':
      for (const child of node.children) {
        visitNode(child)
      }

      if (Array.isArray(node.fallback)) {
        for (const child of node.fallback) {
          visitNode(child)
        }
      }

      return

    case 'For':
      for (const child of node.body) {
        visitNode(child)
      }
      return

    case 'Slot':
      for (const child of node.fallback) {
        visitNode(child)
      }
      return

    case 'Component':
      for (const prop of node.props) {
        if (!Array.isArray(prop.value)) continue

        for (const child of prop.value) {
          visitNode(child)
        }
      }
      return

    case 'Text':
    case 'DynamicText':
      return
  }
}

function assignElementPhysicalPath(node: ElementIR, parent?: ElementIR): void {
  if (!parent) {
    node.physicalDomPath = {
      kind: 'Root',
    }
    return
  }

  const physicalChildren = flattenPhysicalChildren(parent.children)
  const index = physicalChildren.indexOf(node as PhysicalNode)

  if (index < 0) return

  node.physicalDomPath = createPhysicalPath(parent.ref, physicalChildren, index)
}

function assignChildrenPhysicalPaths(parent: ElementIR): void {
  const physicalChildren = flattenPhysicalChildren(parent.children)

  for (let index = 0; index < physicalChildren.length; index++) {
    const child = physicalChildren[index]

    if (child.kind === 'TextPlaceholder') continue
    ;(child as RefNode).physicalDomPath = createPhysicalPath(
      parent.ref,
      physicalChildren,
      index,
    )
  }

  for (const child of parent.children) {
    visitNode(child, parent)
  }
}

function createPhysicalPath(
  parent: IRRef,
  children: PhysicalNode[],
  index: number,
): PhysicalDomPath {
  if (index === 0) {
    return {
      kind: 'FirstChild',
      parent,
    }
  }

  const previous = findPreviousRefNode(children, index)

  if (previous) {
    return {
      kind: 'NextSibling',
      previous: previous.ref,
    }
  }

  return {
    kind: 'ChildNode',
    parent,
    index,
  }
}

function findPreviousRefNode(
  children: PhysicalNode[],
  index: number,
): RefNode | undefined {
  for (let i = index - 1; i >= 0; i--) {
    const node = children[i]

    if (node.kind === 'TextPlaceholder') continue

    return node as RefNode
  }

  return undefined
}

function flattenPhysicalChildren(children: ZeusIRNode[]): PhysicalNode[] {
  const result: PhysicalNode[] = []

  for (const child of children) {
    appendPhysicalChild(result, child)
  }

  return result
}

function appendPhysicalChild(result: PhysicalNode[], node: ZeusIRNode): void {
  switch (node.kind) {
    case 'Text':
      if (node.value.length > 0) {
        result.push({
          kind: 'TextPlaceholder',
        })
      }
      return

    case 'Element':
    case 'DynamicText':
    case 'Component':
    case 'Show':
    case 'For':
    case 'Slot':
      result.push(node)
      return

    case 'Fragment':
      for (const child of node.children) {
        appendPhysicalChild(result, child)
      }
      return

    case 'Host':
      if (node.child) {
        appendPhysicalChild(result, node.child)
      }
      return
  }
}
