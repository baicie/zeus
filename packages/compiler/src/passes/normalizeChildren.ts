import type { ZeusIRNode } from '../ir/nodes'

export function normalizeChildren(node: ZeusIRNode): ZeusIRNode {
  visit(node)
  return node
}

function visit(node: ZeusIRNode): void {
  switch (node.kind) {
    case 'Element':
    case 'Fragment':
    case 'Host':
      node.children = node.children.filter(child => {
        if (child.kind === 'Text') return child.value.length > 0
        return true
      })

      for (const child of node.children) visit(child)
      return

    case 'Component':
      for (const prop of node.props) {
        if (!Array.isArray(prop.value)) continue
        prop.value = prop.value.filter(child => {
          if (child.kind === 'Text') return child.value.length > 0
          return true
        })
        for (const child of prop.value) visit(child)
      }
      return

    case 'Slot':
      node.fallback = node.fallback.filter(child => {
        if (child.kind === 'Text') return child.value.length > 0
        return true
      })
      for (const child of node.fallback) visit(child)
      return

    case 'Show':
      for (const child of node.children) visit(child)
      for (const child of node.fallback ?? []) visit(child)
      return

    case 'For':
      for (const child of node.body) visit(child)
      return

    case 'Text':
    case 'DynamicText':
      return
  }
}
