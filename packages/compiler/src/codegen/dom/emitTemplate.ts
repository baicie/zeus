import * as t from '@babel/types'

import { renderTemplateHTML } from '../../passes/collectTemplates'

import type { CompilerContext } from '../../context'
import type { ElementIR } from '../../ir/nodes'

export function emitTemplateClone(
  node: ElementIR,
  context: CompilerContext,
): t.MemberExpression {
  const html = renderTemplateHTML(node)
  const template = context.registerTemplate(html, node.flags.isSVG)
  const templateCall = t.callExpression(t.cloneNode(template.id), [])

  return t.memberExpression(templateCall, t.identifier('firstChild'))
}
