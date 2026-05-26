import * as t from '@babel/types'

import { emitBindings } from './emitBinding'
import { emitDomPath } from './emitDomPath'
import { emitTemplateClone } from './emitTemplate'

import type { CompilerContext } from '../../context'
import type { ElementIR, ZeusIRNode } from '../../ir/nodes'

export function emitElement(
  node: ElementIR,
  context: CompilerContext,
): t.Expression {
  if (!hasRuntimeWork(node)) {
    return emitTemplateClone(node, context)
  }

  const statements: t.Statement[] = [
    t.variableDeclaration('const', [
      t.variableDeclarator(
        t.identifier(node.ref.name),
        emitTemplateClone(node, context),
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
      if (needsElementDeclaration(child)) {
        statements.push(
          t.variableDeclaration('const', [
            t.variableDeclarator(
              t.identifier(child.ref.name),
              emitDomPath(child.domPath!, context),
            ),
          ]),
        )
      }

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
      attr =>
        attr.kind === 'AttrBinding' ||
        attr.kind === 'PropBinding' ||
        attr.kind === 'EventBinding' ||
        attr.kind === 'RefBinding',
    ) || node.children.some(hasChildRuntimeWork)
  )
}

function hasChildRuntimeWork(node: ZeusIRNode): boolean {
  switch (node.kind) {
    case 'DynamicText':
    case 'Component':
    case 'Show':
    case 'For':
    case 'Slot':
      return true
    case 'Element':
      return hasRuntimeWork(node)
    case 'Fragment':
      return node.children.some(hasChildRuntimeWork)
    default:
      return false
  }
}

function needsElementDeclaration(node: ElementIR): boolean {
  if (node.attrs.some(attr => attr.kind !== 'StaticAttribute')) {
    return true
  }

  return node.children.some(child => {
    switch (child.kind) {
      case 'DynamicText':
      case 'Component':
      case 'Show':
      case 'For':
      case 'Slot':
        return true
      case 'Element':
        return needsElementDeclaration(child)
      case 'Fragment':
        return child.children.some(inner =>
          inner.kind === 'Element'
            ? needsElementDeclaration(inner)
            : inner.kind !== 'Text',
        )
      default:
        return false
    }
  })
}
