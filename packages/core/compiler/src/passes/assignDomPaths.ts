import type {
  DomPath,
  ComponentIR,
  DynamicTextIR,
  ElementIR,
  ForIR,
  IRRef,
  ShowIR,
  SlotIR,
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

    case 'Component':
      for (const prop of node.props) {
        if (!Array.isArray(prop.value)) continue
        for (const child of prop.value) visitNode(child)
      }
      return

    case 'Show':
      for (const child of node.children) visitNode(child)
      if (Array.isArray(node.fallback)) {
        for (const child of node.fallback) visitNode(child)
      }
      return

    case 'For':
      for (const child of node.body) visitNode(child)
      return

    case 'Host':
      if (node.child) visitNode(node.child, parent)
      return

    case 'Slot':
      for (const child of node.fallback) visitNode(child)
      return

    case 'Text':
    case 'DynamicText':
      return
  }
}

function assignElementPath(node: ElementIR, parent?: ElementIR): void {
  if (!parent) {
    node.domPath = { kind: 'Root' }
    return
  }

  const templateChildren = parent.children.filter(isTemplateChild)
  const index = templateChildren.indexOf(node)

  if (index === -1) return

  if (index === 0) {
    node.domPath = { kind: 'FirstChild', parent: parent.ref }
    return
  }

  const previous = templateChildren[index - 1]

  if (previous.kind === 'Element') {
    node.domPath = { kind: 'NextSibling', previous: previous.ref }
    return
  }

  node.domPath = { kind: 'Child', parent: parent.ref, index }
}

function assignChildPaths(parent: ElementIR): void {
  let markerIndex = 0

  for (const child of parent.children) {
    if (isMarkerTemplateNode(child)) {
      assignMarkerPath(child, parent.ref, markerIndex++)
      visitNode(child)
      continue
    }

    visitNode(child, parent)
  }
}

function assignMarkerPath(
  node: DynamicTextIR | ComponentIR | ShowIR | ForIR | SlotIR,
  parent: IRRef,
  index: number,
): void {
  node.domPath = {
    kind: 'Marker',
    parent,
    index,
  }
}

function isTemplateChild(
  node: ZeusIRNode,
): node is ElementIR | DynamicTextIR | ComponentIR | ShowIR | ForIR | SlotIR {
  return (
    node.kind === 'Element' ||
    node.kind === 'DynamicText' ||
    node.kind === 'Component' ||
    node.kind === 'Show' ||
    node.kind === 'For' ||
    node.kind === 'Slot'
  )
}

function isMarkerTemplateNode(
  node: ZeusIRNode,
): node is DynamicTextIR | ComponentIR | ShowIR | ForIR | SlotIR {
  return (
    node.kind === 'DynamicText' ||
    node.kind === 'Component' ||
    node.kind === 'Show' ||
    node.kind === 'For' ||
    node.kind === 'Slot'
  )
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
    case 'Child':
      return `Child(${path.parent.name}, ${path.index})`
    case 'Marker':
      return `Marker(${path.parent.name}, ${path.index})`
  }
}
