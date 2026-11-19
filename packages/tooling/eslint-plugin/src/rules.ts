import type { Rule } from 'eslint'

type AstNode = {
  type: string
  parent?: AstNode
}

type IdentifierNode = AstNode & {
  type: 'Identifier'
  name: string
}

type LiteralNode = AstNode & {
  type: 'Literal'
  value: unknown
}

type ImportSpecifierNode = AstNode & {
  type: 'ImportSpecifier'
  imported: IdentifierNode | LiteralNode
  local: IdentifierNode
}

type ImportDeclarationNode = AstNode & {
  type: 'ImportDeclaration'
  source: LiteralNode
  specifiers: AstNode[]
}

type JSXIdentifierNode = AstNode & {
  type: 'JSXIdentifier'
  name: string
}

type JSXAttributeNode = AstNode & {
  type: 'JSXAttribute'
  name: JSXIdentifierNode
}

type JSXOpeningElementNode = AstNode & {
  type: 'JSXOpeningElement'
  name: AstNode
  attributes: AstNode[]
}

type JSXExpressionContainerNode = AstNode & {
  type: 'JSXExpressionContainer'
  expression: AstNode
}

type JSXElementNode = AstNode & {
  type: 'JSXElement'
  openingElement: JSXOpeningElementNode
  children: AstNode[]
}

type CallExpressionNode = AstNode & {
  type: 'CallExpression'
  callee: AstNode
}

const ZEUS_MODULES = new Set(['@zeus-js/runtime-dom', '@zeus-js/zeus'])
const INTERNAL_IMPORT = /^@zeus-js\/[^/]+\/(?:internal|src|dist)(?:\/|$)/u
const INTERNAL_RELATIVE_IMPORT =
  /(?:^|\/)packages\/(?:core|devtools|web-c)\/.*\/(?:src|dist)(?:\/|$)/u

export const noInternalImports: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow imports from Zeus source or internal entry points',
      recommended: true,
      url: 'https://github.com/baicie/zeus/blob/main/docs/compiler-host/eslint-plugin.md',
    },
    messages: {
      internalImport:
        'Import a documented Zeus package entry point instead of "{{source}}".',
    },
    schema: [],
  },
  create(context) {
    return {
      ImportDeclaration(node) {
        const source = (node as unknown as ImportDeclarationNode).source.value
        if (
          typeof source !== 'string' ||
          (!INTERNAL_IMPORT.test(source) &&
            !INTERNAL_RELATIVE_IMPORT.test(source.replace(/\\/g, '/')))
        )
          return
        context.report({
          node,
          messageId: 'internalImport',
          data: { source },
        })
      },
    }
  },
}

export const validBuiltinUsage: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Validate Zeus Show, For, Host and Slot compiler built-ins',
      recommended: true,
      url: 'https://github.com/baicie/zeus/blob/main/docs/compiler-host/eslint-plugin.md',
    },
    messages: {
      missingShowWhen: 'Zeus <Show> requires a when prop.',
      missingForEach: 'Zeus <For> requires an each prop.',
      missingForChildren:
        'Zeus <For> requires one function child that returns the item view.',
      hostOutsideDefineElement:
        'Zeus <Host> may only appear inside a defineElement setup function.',
      hostMustBeRoot:
        'Zeus <Host> must be the root of the defineElement setup return value.',
      slotOutsideHost: 'Zeus <Slot> may only appear below a <Host> boundary.',
    },
    schema: [],
  },
  create(context) {
    const imported = {
      defineElement: new Set<string>(),
      for: new Set<string>(),
      host: new Set<string>(),
      show: new Set<string>(),
      slot: new Set<string>(),
    }

    const reset = (): void => {
      for (const names of Object.values(imported)) names.clear()
    }

    const collectImports = (node: ImportDeclarationNode): void => {
      const source = node.source.value
      if (typeof source !== 'string' || !ZEUS_MODULES.has(source)) return
      for (const candidate of node.specifiers) {
        if (candidate.type !== 'ImportSpecifier') continue
        const specifier = candidate as ImportSpecifierNode
        const importedName = jsxName(specifier.imported)
        if (!importedName) continue
        const target = builtinSet(importedName)
        target?.add(specifier.local.name)
      }
    }

    const builtinSet = (name: string): Set<string> | undefined => {
      if (name === 'defineElement') return imported.defineElement
      if (name === 'For') return imported.for
      if (name === 'Host') return imported.host
      if (name === 'Show') return imported.show
      if (name === 'Slot') return imported.slot
      return undefined
    }

    return {
      Program: reset,
      ImportDeclaration(node) {
        collectImports(node as unknown as ImportDeclarationNode)
      },
      JSXOpeningElement(node: unknown) {
        const element = node as JSXOpeningElementNode
        const name = jsxName(element.name)
        if (!name) return
        const ancestors = context.sourceCode.getAncestors(
          node as Rule.Node,
        ) as unknown as AstNode[]

        if (imported.show.has(name)) {
          if (!hasAttribute(element, 'when')) {
            report(context, node, 'missingShowWhen')
          }
          return
        }

        if (imported.for.has(name)) {
          if (!hasAttribute(element, 'each')) {
            report(context, node, 'missingForEach')
          }
          if (!hasFunctionChild(element, ancestors)) {
            report(context, node, 'missingForChildren')
          }
          return
        }

        if (imported.host.has(name)) {
          if (!isInsideDefineElement(ancestors, imported.defineElement)) {
            report(context, node, 'hostOutsideDefineElement')
          }
          if (hasEnclosingElement(ancestors, element)) {
            report(context, node, 'hostMustBeRoot')
          }
          return
        }

        if (imported.slot.has(name)) {
          const host = findEnclosingElement(ancestors, element, imported.host)
          if (
            !host ||
            !isInsideDefineElement(ancestors, imported.defineElement)
          ) {
            report(context, node, 'slotOutsideHost')
          }
        }
      },
    }
  },
}

function report(
  context: Rule.RuleContext,
  node: unknown,
  messageId: string,
): void {
  context.report({ node: node as Rule.Node, messageId })
}

function jsxName(node: AstNode): string | undefined {
  return node.type === 'Identifier' || node.type === 'JSXIdentifier'
    ? (node as IdentifierNode | JSXIdentifierNode).name
    : undefined
}

function hasAttribute(element: JSXOpeningElementNode, name: string): boolean {
  return element.attributes.some(
    attribute =>
      attribute.type === 'JSXAttribute' &&
      jsxName((attribute as JSXAttributeNode).name) === name,
  )
}

function isInsideDefineElement(
  ancestors: AstNode[],
  defineElementNames: ReadonlySet<string>,
): boolean {
  return ancestors.some(ancestor => {
    if (ancestor.type !== 'CallExpression') return false
    const callee = (ancestor as CallExpressionNode).callee
    const name = jsxName(callee)
    return name !== undefined && defineElementNames.has(name)
  })
}

function hasEnclosingElement(
  ancestors: AstNode[],
  current: JSXOpeningElementNode,
): boolean {
  return ancestors.some(ancestor => {
    if (ancestor.type === 'JSXFragment') return true
    if (ancestor.type !== 'JSXElement') return false
    return (ancestor as JSXElementNode).openingElement !== current
  })
}

function findEnclosingElement(
  ancestors: AstNode[],
  current: JSXOpeningElementNode,
  names: ReadonlySet<string>,
): JSXElementNode | undefined {
  for (let index = ancestors.length - 1; index >= 0; index -= 1) {
    const ancestor = ancestors[index]
    if (ancestor.type !== 'JSXElement') continue
    const element = ancestor as JSXElementNode
    if (element.openingElement === current) continue
    const name = jsxName(element.openingElement.name)
    if (name !== undefined && names.has(name)) return element
  }
  return undefined
}

function hasFunctionChild(
  opening: JSXOpeningElementNode,
  ancestors: AstNode[],
): boolean {
  const element = ancestors.find(
    ancestor =>
      ancestor.type === 'JSXElement' &&
      (ancestor as JSXElementNode).openingElement === opening,
  ) as JSXElementNode | undefined
  if (!element) return false
  return element.children.some(child => {
    if (child.type !== 'JSXExpressionContainer') return false
    const expression = (child as JSXExpressionContainerNode).expression
    return (
      expression.type === 'ArrowFunctionExpression' ||
      expression.type === 'FunctionExpression'
    )
  })
}
