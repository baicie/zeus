import { isRawTextElement } from '../utils/html'

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

function normalizeStaticAttrName(name: string): string {
  return name === 'className' ? 'class' : name
}

export function renderTemplateHTML(node: ElementIR): string {
  const attrs = node.attrs
    .filter(attr => attr.kind === 'StaticAttribute')
    .map(attr => {
      if (attr.kind !== 'StaticAttribute') return ''

      const name = normalizeStaticAttrName(attr.name)

      if (attr.value === true) return ` ${name}`

      return ` ${name}="${escapeAttr(attr.value)}"`
    })
    .join('')

  if (node.flags.isVoid) {
    return `<${node.tagName}${attrs}>`
  }

  if (isRawTextElement(node.tagName) && hasRuntimeRawText(node.children)) {
    return `<${node.tagName}${attrs}></${node.tagName}>`
  }

  return `<${node.tagName}${attrs}>${node.children
    .map(renderChildTemplate)
    .join('')}</${node.tagName}>`
}

function hasRuntimeRawText(children: ZeusIRNode[]): boolean {
  return children.some(child => {
    if (child.kind === 'Text') return false
    if (child.kind === 'Fragment') return hasRuntimeRawText(child.children)
    return true
  })
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
    case 'Slot':
      return '<!>'
    case 'Host':
      return node.children.map(renderChildTemplate).join('')
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
