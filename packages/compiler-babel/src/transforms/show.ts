// Show transformation

import type { ShowBindingIR, TemplateIR, ExprIR, BindingIR } from '@zeusjs/compiler-shared'

export interface ShowTransformContext {
  bindings: BindingIR[]
  usedHelpers: Set<string>
  templateIndex: number
}

export function visitShow(
  whenAttr: any,
  children: any[],
  fallback: any[],
  ctx: ShowTransformContext,
  path: number[],
): BindingIR {
  const whenExpr: ExprIR = {
    kind: 'js',
    node: whenAttr.value.expression,
    reactiveHint: 'unknown',
  }

  // Transform body
  const bodyIR: TemplateIR | null = children.length > 0
    ? transformChildToIR(children[0], ctx)
    : null

  // Transform fallback if present
  const fallbackIR: TemplateIR | null = fallback.length > 0
    ? transformChildToIR(fallback[0], ctx)
    : undefined

  ctx.usedHelpers.add('mountCondition')

  return {
    type: 'show',
    path,
    when: whenExpr,
    body: bodyIR!,
    fallback: fallbackIR,
  } as ShowBindingIR
}

function transformChildToIR(child: any, ctx: ShowTransformContext): TemplateIR {
  // Simplified child transformation
  // In a full implementation, this would recursively transform the JSX

  return {
    kind: 'template',
    name: `_tmpl$${ctx.templateIndex++}`,
    html: '<!--show-body-->',
    roots: 1,
    bindings: [],
  }
}

export function generateShowCode(binding: ShowBindingIR): string {
  const body = binding.body
    ? `() => ${bodyTemplateName(binding.body)}()`
    : '() => null'

  const fallback = binding.fallback
    ? `, () => ${bodyTemplateName(binding.fallback)}()`
    : ''

  return `mountCondition(_showAnchor, _showEnd, ${printExpr(binding.when)}, ${body}${fallback})`
}

function bodyTemplateName(body: TemplateIR | any): string {
  if (body.kind === 'template') {
    return body.name
  }
  return '_tmpl_body'
}

function printExpr(expr: ExprIR): string {
  if (!expr || !expr.node) return 'undefined'

  switch (expr.node.type) {
    case 'Identifier':
      return expr.node.name
    case 'CallExpression':
      const callee = printExpr({ node: expr.node.callee })
      const args = expr.node.arguments.map((a: any) => printExpr({ node: a })).join(', ')
      return `${callee}(${args})`
    default:
      return 'expr'
  }
}
