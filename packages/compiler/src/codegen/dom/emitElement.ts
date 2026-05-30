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
  IRRef,
  PhysicalDomPath,
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
  const declared = new Set<string>()
  const refNodeMap = collectRefNodeMap(children)

  for (const child of children) {
    collectRequiredDomRefDeclaration(
      child,
      statements,
      context,
      refNodeMap,
      declared,
    )
  }

  return statements
}

function collectRefNodeMap(children: ZeusIRNode[]): Map<string, DomRefNode> {
  const map = new Map<string, DomRefNode>()

  for (const child of children) {
    collectRefNode(child, map)
  }

  return map
}

function collectRefNode(node: ZeusIRNode, map: Map<string, DomRefNode>): void {
  switch (node.kind) {
    case 'Element':
      map.set(node.ref.name, node)

      for (const child of node.children) {
        collectRefNode(child, map)
      }

      return

    case 'DynamicText':
    case 'Component':
    case 'Show':
    case 'For':
    case 'Slot':
      map.set(node.ref.name, node)
      return

    case 'Fragment':
      for (const child of node.children) {
        collectRefNode(child, map)
      }
      return

    case 'Host':
      if (node.child) collectRefNode(node.child, map)
      return

    default:
      return
  }
}

function collectRequiredDomRefDeclaration(
  node: ZeusIRNode,
  statements: t.Statement[],
  context: CompilerContext,
  refNodeMap: Map<string, DomRefNode>,
  declared: Set<string>,
): void {
  switch (node.kind) {
    case 'Element':
      if (needsDomRefDeclaration(node)) {
        emitDomRefDeclarationWithDeps(
          node,
          statements,
          context,
          refNodeMap,
          declared,
        )
      }

      for (const child of node.children) {
        collectRequiredDomRefDeclaration(
          child,
          statements,
          context,
          refNodeMap,
          declared,
        )
      }

      return

    case 'DynamicText':
    case 'Component':
    case 'Show':
    case 'For':
    case 'Slot':
      emitDomRefDeclarationWithDeps(
        node as DomRefNode,
        statements,
        context,
        refNodeMap,
        declared,
      )
      return

    case 'Fragment':
      for (const child of node.children) {
        collectRequiredDomRefDeclaration(
          child,
          statements,
          context,
          refNodeMap,
          declared,
        )
      }
      return

    case 'Host':
      if (node.child) {
        collectRequiredDomRefDeclaration(
          node.child,
          statements,
          context,
          refNodeMap,
          declared,
        )
      }
      return

    default:
      return
  }
}

function emitDomRefDeclarationWithDeps(
  node: DomRefNode,
  statements: t.Statement[],
  context: CompilerContext,
  refNodeMap: Map<string, DomRefNode>,
  declared: Set<string>,
): void {
  if (declared.has(node.ref.name)) {
    return
  }

  if (!node.physicalDomPath) {
    throw new Error(`${node.kind} physical DOM path is not assigned`)
  }

  emitPhysicalDomPathDependencies(
    node.physicalDomPath,
    statements,
    context,
    refNodeMap,
    declared,
  )

  statements.push(createDomRefDeclaration(node, context))
  declared.add(node.ref.name)
}

function emitPhysicalDomPathDependencies(
  path: PhysicalDomPath,
  statements: t.Statement[],
  context: CompilerContext,
  refNodeMap: Map<string, DomRefNode>,
  declared: Set<string>,
): void {
  switch (path.kind) {
    case 'Root':
      return

    case 'FirstChild':
      emitRefDependency(path.parent, statements, context, refNodeMap, declared)
      return

    case 'ChildNode':
      emitRefDependency(path.parent, statements, context, refNodeMap, declared)
      return

    case 'NextSibling':
      emitRefDependency(
        path.previous,
        statements,
        context,
        refNodeMap,
        declared,
      )
      return
  }
}

function emitRefDependency(
  ref: IRRef,
  statements: t.Statement[],
  context: CompilerContext,
  refNodeMap: Map<string, DomRefNode>,
  declared: Set<string>,
): void {
  const dep = refNodeMap.get(ref.name)

  if (!dep) return

  emitDomRefDeclarationWithDeps(dep, statements, context, refNodeMap, declared)
}

function createDomRefDeclaration(
  node: DomRefNode,
  _context: CompilerContext,
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
        return child.child ? innerKind(child.child) : false

      default:
        return false
    }
  })
}

function innerKind(node: ZeusIRNode): boolean {
  switch (node.kind) {
    case 'Element':
      return needsDomRefDeclaration(node)
    case 'Text':
      return false
    default:
      return true
  }
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
    case 'Host':
      return node.child ? hasChildRuntimeWork(node.child) : false
    default:
      return false
  }
}
