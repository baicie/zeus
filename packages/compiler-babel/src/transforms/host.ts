// Host transformation

import type { HostBindingIR, TemplateIR, BindingIR } from '@zeusjs/compiler-shared'

export interface HostTransformContext {
  bindings: BindingIR[]
  usedHelpers: Set<string>
  insideDefineElement: boolean
}

export function visitHost(
  attributes: any[],
  children: any[],
  ctx: HostTransformContext,
  path: number[],
): BindingIR | null {
  // Validate Host usage
  if (!ctx.insideDefineElement) {
    // This should trigger a diagnostic error
    // Host can only be used inside defineElement
    return null
  }

  // Extract host options from attributes
  let shadow: boolean | 'open' | 'closed' = 'open'
  let delegatesFocus = false

  for (const attr of attributes) {
    if (attr.type === 'JSXAttribute') {
      const name = attr.name?.name
      const value = attr.value

      if (name === 'shadow') {
        if (value.type === 'JSXExpressionContainer') {
          const expr = value.expression
          if (expr.type === 'BooleanLiteral') {
            shadow = expr.value ? 'open' : false
          } else if (expr.type === 'StringLiteral') {
            shadow = value.value as 'open' | 'closed' | boolean
          }
        } else if (value.type === 'JSXLiteral') {
          shadow = value.value !== 'false'
        }
      }

      if (name === 'delegatesFocus') {
        if (value.type === 'JSXExpressionContainer') {
          delegatesFocus = value.expression.value === true
        } else if (value.type === 'JSXLiteral') {
          delegatesFocus = value.value === 'true'
        }
      }
    }
  }

  // Transform body
  const bodyIR: TemplateIR | null = children.length > 0
    ? transformChildToIR(children[0], ctx)
    : null

  ctx.usedHelpers.add('createHost')

  return {
    type: 'host',
    shadow,
    delegatesFocus,
    body: bodyIR!,
  } as HostBindingIR
}

function transformChildToIR(child: any, ctx: HostTransformContext): TemplateIR {
  // Simplified child transformation

  return {
    kind: 'template',
    name: '_tmpl_host',
    html: '<!--host-body-->',
    roots: 1,
    bindings: [],
  }
}

export function generateHostCode(binding: HostBindingIR): string {
  const shadowMode = binding.shadow === false
    ? 'false'
    : binding.shadow === 'closed'
    ? "'closed'"
    : "'open'"

  const delegatesFocus = binding.delegatesFocus ? ', true' : ''

  return `createHost(${shadowMode}${delegatesFocus})`
}
