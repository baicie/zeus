import * as t from '@babel/types'

import { emitBindings } from './emitBinding'
import { emitDomPath } from './emitDomPath'
import { renderTemplateHTML } from '../../passes/collectTemplates'

import type { CompilerContext } from '../../context'
import type { ElementIR, ZeusIRNode } from '../../ir/nodes'

export function emitElement(
  node: ElementIR,
  context: CompilerContext,
): t.Expression {
  const html = renderTemplateHTML(node)
  const template = context.registerTemplate(html, node.flags.isSVG)
  const templateCall = t.callExpression(t.cloneNode(template.id), [])

  if (!hasRuntimeWork(node)) {
    return t.memberExpression(templateCall, t.identifier('firstChild'))
  }

  const statements: t.Statement[] = [
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(node.ref.name),
        t.memberExpression(templateCall, t.identifier('firstChild')),
      ),
    ]),
    ...emitElementDeclarations(node.children, context),
    ...emitBindings(node, context),
    t.returnStatement(t.identifier(node.ref.name)),
  ]

  return t.callExpression(
    t.arrowFunctionExpression([], t.blockStatement(statements)),
    [],
  )
}

function emitElementDeclarations(
  children: ZeusIRNode[],
  context: CompilerContext,
): t.Statement[] {
  const statements: t.Statement[] = []

  for (const child of children) {
    if (child.kind === 'Element') {
      statements.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier(child.ref.name),
            emitDomPath(child.domPath!, context),
          ),
        ]),
      )
      statements.push(...emitElementDeclarations(child.children, context))
      continue
    }

    if (child.kind === 'Fragment') {
      statements.push(...emitElementDeclarations(child.children, context))
    }
  }

  return statements
}

function hasRuntimeWork(node: ElementIR): boolean {
  return (
    node.attrs.some(
      attr => attr.kind === 'AttrBinding' || attr.kind === 'EventBinding',
    ) || node.children.some(hasChildRuntimeWork)
  )
}

function hasChildRuntimeWork(node: ZeusIRNode): boolean {
  switch (node.kind) {
    case 'DynamicText':
    case 'Component':
      return true
    case 'Element':
      return hasRuntimeWork(node)
    case 'Fragment':
      return node.children.some(hasChildRuntimeWork)
    default:
      return false
  }
}
