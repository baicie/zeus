import type {
  DomPath,
  ComponentIR,
  DynamicTextIR,
  ElementIR,
  IRRef,
  ZeusIRNode,
} from '../ir/nodes'

export function assignDomPaths(node: ZeusIRNode): ZeusIRNode {
  visitNode(node)
  return node
}

function visitNode(node: ZeusIRNode, parent?: ElementIR): void {
  switch (node.kind) {
    case 'Element':
      assignElementPath(node, parent)
      assignChildPaths(node)
      return

    case 'Fragment':
      for (const child of node.children) {
        visitNode(child, parent)
      }
      return

    case 'Text':
    case 'Show':
    case 'For':
    case 'Host':
    case 'Slot':
      return

    case 'Component':
    case 'DynamicText':
      return
  }
}

function assignElementPath(node: ElementIR, parent?: ElementIR): void {
  if (!parent) {
    node.domPath = { kind: 'Root' }
    return
  }

  const staticChildren = parent.children.filter(isStaticTemplateNode)
  const index = staticChildren.indexOf(node)

  if (index === -1) return

  if (index === 0) {
    node.domPath = { kind: 'FirstChild', parent: parent.ref }
    return
  }

  const previous = staticChildren[index - 1]
  node.domPath = { kind: 'NextSibling', previous: previous.ref }
}

function assignChildPaths(parent: ElementIR): void {
  let markerIndex = 0

  for (const child of parent.children) {
    if (isMarkerTemplateNode(child)) {
      assignMarkerPath(child, parent.ref, markerIndex++)
      continue
    }

    visitNode(child, parent)
  }
}

function assignMarkerPath(
  node: DynamicTextIR | ComponentIR,
  parent: IRRef,
  index: number,
): void {
  node.domPath = {
    kind: 'Marker',
    parent,
    index,
  }
}

function isStaticTemplateNode(node: ZeusIRNode): node is ElementIR {
  return node.kind === 'Element'
}

function isMarkerTemplateNode(
  node: ZeusIRNode,
): node is DynamicTextIR | ComponentIR {
  return node.kind === 'DynamicText' || node.kind === 'Component'
}

export function formatDomPath(path: DomPath | undefined): string {
  if (!path) return 'Unassigned'

  switch (path.kind) {
    case 'Root':
      return 'Root'
    case 'FirstChild':
      return `FirstChild(${path.parent.name})`
    case 'NextSibling':
      return `NextSibling(${path.previous.name})`
    case 'Marker':
      return `Marker(${path.parent.name}, ${path.index})`
  }
}
