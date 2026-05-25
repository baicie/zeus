import type { CompilerContext } from '../context'
import type { ElementIR, ZeusIRNode } from '../ir/nodes'

export function collectTemplates(
  node: ZeusIRNode,
  context: CompilerContext,
): void {
  if (node.kind === 'Element') {
    context.registerTemplate(renderTemplateHTML(node), node.flags.isSVG)
    return
  }

  if (node.kind === 'Fragment') {
    for (const child of node.children) {
      if (child.kind !== 'Element') continue
      context.registerTemplate(renderTemplateHTML(child), child.flags.isSVG)
    }
  }
}

export function renderTemplateHTML(node: ElementIR): string {
  const attrs = node.attrs
    .filter(attr => attr.kind === 'StaticAttribute')
    .map(attr => {
      if (attr.kind !== 'StaticAttribute') return ''
      if (attr.value === true) return ` ${attr.name}`
      return ` ${attr.name}="${escapeAttr(attr.value)}"`
    })
    .join('')

  if (node.flags.isVoid) {
    return `<${node.tagName}${attrs}>`
  }

  return `<${node.tagName}${attrs}>${node.children
    .map(renderChildTemplate)
    .join('')}</${node.tagName}>`
}

function renderChildTemplate(node: ZeusIRNode): string {
  switch (node.kind) {
    case 'Element':
      return renderTemplateHTML(node)
    case 'Text':
      return node.value
    case 'DynamicText':
    case 'Component':
    case 'Show':
    case 'For':
    case 'Host':
    case 'Slot':
      return '<!>'
    case 'Fragment':
      return node.children.map(renderChildTemplate).join('')
  }
}

function escapeAttr(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
}
