import type { ComponentIR, ZeusIRNode } from './nodes'

export type IRVisitor = {
  enter?: (node: ZeusIRNode, parent?: ZeusIRNode) => void
  leave?: (node: ZeusIRNode, parent?: ZeusIRNode) => void
}

export function visitIR(
  node: ZeusIRNode,
  visitor: IRVisitor,
  parent?: ZeusIRNode,
): void {
  visitor.enter?.(node, parent)

  for (const child of getIRChildren(node)) {
    visitIR(child, visitor, node)
  }

  visitor.leave?.(node, parent)
}

export function getIRChildren(node: ZeusIRNode): ZeusIRNode[] {
  switch (node.kind) {
    case 'Element':
    case 'Fragment':
    case 'Host':
      return node.children

    case 'Component':
      return node.props.flatMap(prop =>
        Array.isArray(prop.value) ? prop.value : [],
      )

    case 'Show':
      return [
        ...node.children,
        ...(Array.isArray(node.fallback) ? node.fallback : []),
      ]

    case 'For':
      return node.body

    case 'Slot':
      return node.fallback

    case 'Text':
    case 'DynamicText':
      return []
  }
}

export function getComponentChildren(node: ComponentIR): ZeusIRNode[] {
  const prop = node.props.find(prop => prop.name === 'children')
  return prop && Array.isArray(prop.value) ? prop.value : []
}
