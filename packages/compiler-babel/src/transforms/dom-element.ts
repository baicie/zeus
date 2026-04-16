// DOM element transformation

import type { TemplateIR, BindingIR, TextBindingIR, AttrBindingIR, PropBindingIR, EventBindingIR } from '@zeusjs/compiler-shared'

export interface DomTransformContext {
  html: string
  bindings: BindingIR[]
  templateIndex: number
}

export function visitDOMElement(
  tagName: string,
  attributes: any[],
  children: any[],
  ctx: DomTransformContext,
  path: number[],
): void {
  ctx.html += `<${tagName}`

  // Process attributes
  for (const attr of attributes) {
    if (attr.type === 'JSXAttribute') {
      visitAttribute(attr, ctx, path)
    }
  }

  ctx.html += '>'

  // Process children
  visitChildren(children, ctx, path)

  ctx.html += `</${tagName}>`
}

function visitAttribute(attr: any, ctx: DomTransformContext, path: number[]): void {
  const name = attr.name?.name
  const value = attr.value

  if (!name) return

  if (value === null) {
    // Boolean attribute (e.g., disabled)
    ctx.html += ` ${name}`
    return
  }

  if (value.type === 'JSXExpressionContainer') {
    const expr = value.expression

    // Check if static
    if (isStaticExpression(expr)) {
      ctx.html += ` ${name}="${escapeHtml(String(getStaticValue(expr)))}"`
      return
    }

    // Dynamic attribute
    if (isEventAttribute(name)) {
      ctx.bindings.push({
        type: 'event',
        path,
        name: normalizeEventName(name),
        handler: { kind: 'js', node: expr },
      } as EventBindingIR)
    } else if (isDOMProperty(name)) {
      ctx.bindings.push({
        type: 'prop',
        path,
        name,
        expr: { kind: 'js', node: expr },
      } as PropBindingIR)
    } else {
      ctx.bindings.push({
        type: 'attr',
        path,
        name,
        expr: { kind: 'js', node: expr },
      } as AttrBindingIR)
    }
  }
}

function visitChildren(children: any[], ctx: DomTransformContext, parentPath: number[]): void {
  let childIndex = 0

  for (const child of children) {
    if (child.type === 'JSXText') {
      const text = child.value
      if (text.trim()) {
        ctx.html += escapeHtml(text)
      }
    } else if (child.type === 'JSXExpressionContainer') {
      const expr = child.expression
      if (expr.type === 'JSXEmptyExpression') continue

      const childPath = [...parentPath, childIndex]
      ctx.html += `<!--z-t-->${childIndex}`

      ctx.bindings.push({
        type: 'text',
        path: childPath,
        expr: { kind: 'js', node: expr },
      } as TextBindingIR)

      childIndex++
    } else if (child.type === 'JSXElement') {
      const tagName = child.openingElement.name?.name
      if (tagName) {
        visitDOMElement(
          tagName,
          child.openingElement.attributes,
          child.children,
          ctx,
          [...parentPath, childIndex]
        )
        childIndex++
      }
    }
  }
}

function isStaticExpression(node: any): boolean {
  if (!node) return false
  return node.type === 'StringLiteral' ||
         node.type === 'NumericLiteral' ||
         node.type === 'BooleanLiteral' ||
         node.type === 'NullLiteral'
}

function getStaticValue(node: any): any {
  if (node.type === 'StringLiteral') return node.value
  if (node.type === 'NumericLiteral') return node.value
  if (node.type === 'BooleanLiteral') return node.value
  if (node.type === 'NullLiteral') return null
  return undefined
}

function isEventAttribute(name: string): boolean {
  return /^on[A-Z]/.test(name)
}

function normalizeEventName(name: string): string {
  return name.slice(2).toLowerCase()
}

function isDOMProperty(name: string): boolean {
  return ['value', 'checked', 'selected', 'disabled', 'readOnly', 'hidden'].includes(name)
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
