import * as t from '@babel/types'

import { emitBindings } from './emitBinding'
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
    ...emitElementDeclarations(node.children),
    ...emitBindings(node, context),
    t.returnStatement(t.identifier(node.ref.name)),
  ]

  return t.callExpression(
    t.arrowFunctionExpression([], t.blockStatement(statements)),
    [],
  )
}

function emitElementDeclarations(children: ZeusIRNode[]): t.Statement[] {
  const statements: t.Statement[] = []

  for (const child of children) {
    if (child.kind === 'Element') {
      statements.push(
        t.variableDeclaration('const', [
          t.variableDeclarator(
            t.identifier(child.ref.name),
            emitDomPathWithoutContext(child.domPath!),
          ),
        ]),
      )
      statements.push(...emitElementDeclarations(child.children))
      continue
    }

    if (child.kind === 'Fragment') {
      statements.push(...emitElementDeclarations(child.children))
    }
  }

  return statements
}

function emitDomPathWithoutContext(path: ElementIR['domPath']): t.Expression {
  if (!path) throw new Error('Element DOM path is not assigned')

  switch (path.kind) {
    case 'Root':
      throw new Error('Nested element cannot use a root DOM path')
    case 'FirstChild':
      return t.memberExpression(
        t.identifier(path.parent.name),
        t.identifier('firstChild'),
      )
    case 'NextSibling':
      return t.memberExpression(
        t.identifier(path.previous.name),
        t.identifier('nextSibling'),
      )
    case 'Marker':
      throw new Error('Element cannot use a marker DOM path')
  }
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
