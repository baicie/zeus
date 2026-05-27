import * as t from '@babel/types'

import { emitBindings } from './emitBinding'
import { emitPhysicalDomPath } from './emitDomPath'
import { emitTemplateClone } from './emitTemplate'

import type { CompilerContext } from '../../context'
import type {
  ComponentIR,
  DynamicTextIR,
  ElementIR,
  ForIR,
  ShowIR,
  SlotIR,
  ZeusIRNode,
} from '../../ir/nodes'

type DomRefNode =
  | ElementIR
  | DynamicTextIR
  | ComponentIR
  | ShowIR
  | ForIR
  | SlotIR

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

    ...emitDomRefDeclarations(node.children, context),

    ...emitBindings(node, context),

    t.returnStatement(t.identifier(node.ref.name)),
  ]

  return t.callExpression(
    t.arrowFunctionExpression([], t.blockStatement(statements)),
    [],
  )
}

function emitDomRefDeclarations(
  children: ZeusIRNode[],
  context: CompilerContext,
): t.Statement[] {
  const statements: t.Statement[] = []

  for (const child of children) {
    collectDomRefDeclaration(child, statements, context)
  }

  return statements
}

function collectDomRefDeclaration(
  node: ZeusIRNode,
  statements: t.Statement[],
  context: CompilerContext,
): void {
  switch (node.kind) {
    case 'Element':
      if (needsDomRefDeclaration(node)) {
        statements.push(createDomRefDeclaration(node, context))
      }

      for (const child of node.children) {
        collectDomRefDeclaration(child, statements, context)
      }

      return

    case 'DynamicText':
    case 'Component':
    case 'Show':
    case 'For':
    case 'Slot':
      statements.push(createDomRefDeclaration(node as DomRefNode, context))
      return

    case 'Fragment':
      for (const child of node.children) {
        collectDomRefDeclaration(child, statements, context)
      }
      return

    case 'Host':
      for (const child of node.children) {
        collectDomRefDeclaration(child, statements, context)
      }
      return

    default:
      return
  }
}

function createDomRefDeclaration(
  node: DomRefNode,
  context: CompilerContext,
): t.VariableDeclaration {
  if (!node.physicalDomPath) {
    throw new Error(`${node.kind} physical DOM path is not assigned`)
  }

  return t.variableDeclaration('const', [
    t.variableDeclarator(
      t.identifier(node.ref.name),
      emitPhysicalDomPath(node.physicalDomPath),
    ),
  ])
}

function needsDomRefDeclaration(node: ElementIR): boolean {
  if (!node.physicalDomPath) return false

  if (
    node.attrs.some(
      attr =>
        attr.kind === 'AttrBinding' ||
        attr.kind === 'PropBinding' ||
        attr.kind === 'EventBinding' ||
        attr.kind === 'RefBinding',
    )
  ) {
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
        return needsDomRefDeclaration(child)

      case 'Fragment':
        return child.children.some(inner =>
          inner.kind === 'Element'
            ? needsDomRefDeclaration(inner)
            : inner.kind !== 'Text',
        )

      case 'Host':
        return child.children.some(inner =>
          inner.kind === 'Element'
            ? needsDomRefDeclaration(inner)
            : inner.kind !== 'Text',
        )

      default:
        return false
    }
  })
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
    case 'Host':
      return node.children.some(hasChildRuntimeWork)
    default:
      return false
  }
}
