// Component transformation

import type { ComponentBindingIR, TemplateIR, ExprIR } from '@zeusjs/compiler-shared'

export interface ComponentTransformContext {
  bindings: any[]
  usedHelpers: Set<string>
}

export function visitComponent(
  tagName: string,
  attributes: any[],
  children: any[],
  ctx: ComponentTransformContext,
  path: number[],
): ComponentBindingIR {
  const props: Record<string, ExprIR> = {}

  // Extract props from attributes
  for (const attr of attributes) {
    if (attr.type === 'JSXAttribute') {
      const name = attr.name?.name
      const value = attr.value

      if (value && value.type === 'JSXExpressionContainer') {
        props[name] = {
          kind: 'js',
          node: value.expression,
        }
      } else if (value) {
        props[name] = {
          kind: 'js',
          node: value,
        }
      }
    }
  }

  // Convert children to IR
  const childBlocks = children.map((child: any) => {
    // Child transformation would go here
    return null
  }).filter(Boolean)

  ctx.usedHelpers.add('component')

  return {
    type: 'component',
    path,
    component: {
      kind: 'js',
      node: { type: 'Identifier', name: tagName },
    },
    props,
    children: childBlocks.length > 0 ? childBlocks : undefined,
  }
}

export function generateComponentCall(binding: ComponentBindingIR): string {
  const propsArgs = Object.entries(binding.props)
    .map(([key, expr]) => `${key}: ${printExpr(expr)}`)
    .join(', ')

  const childrenArg = binding.children
    ? `, ${binding.children.length}`
    : ''

  return `${binding.component.node.name}({ ${propsArgs} }${childrenArg})`
}

function printExpr(expr: ExprIR): string {
  if (!expr || !expr.node) return 'undefined'
  return printNode(expr.node)
}

function printNode(node: any): string {
  if (!node) return ''

  switch (node.type) {
    case 'Identifier':
      return node.name
    case 'StringLiteral':
      return `"${node.value}"`
    case 'NumericLiteral':
      return String(node.value)
    default:
      return node.name || ''
  }
}
