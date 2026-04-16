// For transformation

import type { ForBindingIR, TemplateIR, ExprIR, BindingIR } from '@zeusjs/compiler-shared'

export interface ForTransformContext {
  bindings: BindingIR[]
  usedHelpers: Set<string>
  templateIndex: number
}

export function visitFor(
  eachAttr: any,
  callbackExpr: any,
  children: any[],
  ctx: ForTransformContext,
  path: number[],
): BindingIR {
  const eachExpr: ExprIR = {
    kind: 'js',
    node: eachAttr.value.expression,
    reactiveHint: 'unknown',
  }

  // Extract item and index names from callback
  const params = callbackExpr.params || []
  const itemName = params[0]?.name || 'item'
  const indexName = params[1]?.name || 'index'

  // Transform body
  const bodyIR: TemplateIR | null = children.length > 1
    ? transformChildToIR(children[1], ctx)
    : null

  // Check for key expression in attributes
  let keyBy: ExprIR | undefined
  const keyAttr = callbackExpr?.attributes?.find(
    (a: any) => a.name?.name === 'key'
  )
  if (keyAttr) {
    keyBy = {
      kind: 'js',
      node: keyAttr.value.expression,
      reactiveHint: 'unknown',
    }
  }

  ctx.usedHelpers.add('mountList')

  return {
    type: 'for',
    path,
    each: eachExpr,
    itemName,
    indexName,
    body: bodyIR!,
    keyBy,
  } as ForBindingIR
}

function transformChildToIR(child: any, ctx: ForTransformContext): TemplateIR {
  // Simplified child transformation

  return {
    kind: 'template',
    name: `_tmpl$${ctx.templateIndex++}`,
    html: '<!--for-body-->',
    roots: 1,
    bindings: [],
  }
}

export function generateForCode(binding: ForBindingIR): string {
  const body = binding.body
    ? `(item, index) => ${bodyTemplateName(binding.body)}()`
    : '(item, index) => null'

  const keyFn = binding.keyBy
    ? `, (item) => ${printExpr(binding.keyBy!)}`
    : ''

  return `mountList(_forStart, _forEnd, ${printExpr(binding.each)}, ${body}${keyFn})`
}

function bodyTemplateName(body: TemplateIR | any): string {
  if (body.kind === 'template') {
    return body.name
  }
  return '_tmpl_for_body'
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
