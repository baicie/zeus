import * as t from '@babel/types'

import { getSSRRawTextTag } from './rawText'
import { throwUnsupportedSSRBuiltin } from './validate'
import { parseExpressionIR } from '../../adapters/babel/expression'

import type { SSRRawTextTag } from './rawText'
import type { CompilerContext } from '../../context'
import type {
  AttrBindingIR,
  ComponentIR,
  ComponentPropIR,
  ElementIR,
  ExpressionIR,
  ForIR,
  PropBindingIR,
  ShowIR,
  StaticAttributeIR,
  ZeusIRNode,
} from '@zeus-js/compiler-shared'

export function emitSSR(
  node: ZeusIRNode,
  context: CompilerContext,
  rawTextTag?: SSRRawTextTag,
): t.Expression {
  switch (node.kind) {
    case 'Element':
      return emitElement(node, context)
    case 'Fragment':
      return emitChildren(node.children, context, rawTextTag)
    case 'Text':
      if (rawTextTag) {
        return t.stringLiteral(decodeCompilerEscapedText(node.value))
      }
      return t.callExpression(context.importRuntime('ssrStatic'), [
        t.stringLiteral(node.value),
      ])
    case 'DynamicText':
      if (rawTextTag) return parseExpressionIR(node.expr)
      return t.callExpression(context.importRuntime('ssrText'), [
        parseExpressionIR(node.expr),
      ])
    case 'Component':
      return emitComponent(node, context)
    case 'Show':
      return emitShow(node, context, rawTextTag)
    case 'For':
      return emitFor(node, context, rawTextTag)
    case 'Host':
    case 'Slot':
      return throwUnsupportedSSRBuiltin(node)
    default:
      return throwUnsupportedSSRNode(node)
  }
}

function emitShow(
  node: ShowIR,
  context: CompilerContext,
  rawTextTag?: SSRRawTextTag,
): t.Expression {
  const args: t.Expression[] = [
    t.arrowFunctionExpression([], parseExpressionIR(node.when)),
    t.arrowFunctionExpression(
      [],
      emitChildrenValue(node.children, context, rawTextTag),
    ),
  ]

  if (node.fallback) {
    const fallback = Array.isArray(node.fallback)
      ? emitChildrenValue(node.fallback, context, rawTextTag)
      : parseExpressionIR(node.fallback)

    args.push(t.arrowFunctionExpression([], fallback))
  }

  return t.callExpression(context.importRuntime('ssrShow'), args)
}

function emitFor(
  node: ForIR,
  context: CompilerContext,
  rawTextTag?: SSRRawTextTag,
): t.Expression {
  const params: t.Identifier[] = [t.identifier(node.item.name)]

  if (node.index) params.push(t.identifier(node.index.name))

  return t.callExpression(context.importRuntime('ssrFor'), [
    t.arrowFunctionExpression([], parseExpressionIR(node.each)),
    t.arrowFunctionExpression(
      params,
      emitChildrenValue(node.body, context, rawTextTag),
    ),
  ])
}

function emitComponent(
  node: ComponentIR,
  context: CompilerContext,
): t.Expression {
  return t.callExpression(context.importRuntime('ssrComponent'), [
    parseExpressionIR(node.callee),
    t.objectExpression(
      node.props.map(prop => emitComponentProp(prop, context)),
    ),
  ])
}

function emitComponentProp(
  prop: ComponentPropIR,
  context: CompilerContext,
): t.ObjectProperty | t.ObjectMethod {
  const key = createObjectKey(prop.name)

  if (Array.isArray(prop.value)) {
    return t.objectMethod(
      'get',
      key,
      [],
      t.blockStatement([
        t.returnStatement(emitChildrenValue(prop.value, context)),
      ]),
    )
  }

  const value = parseExpressionIR(prop.value)

  if (isStaticPropValue(value)) {
    return t.objectProperty(key, value)
  }

  return t.objectMethod(
    'get',
    key,
    [],
    t.blockStatement([t.returnStatement(value)]),
  )
}

function emitElement(node: ElementIR, context: CompilerContext): t.Expression {
  const rawTextTag = getSSRRawTextTag(node.tagName)
  const args: t.Expression[] = [
    t.stringLiteral(node.tagName),
    t.arrayExpression(
      node.attrs.flatMap(attr => {
        switch (attr.kind) {
          case 'StaticAttribute':
            if (isEventAttributeName(attr.name)) return []
            return [emitStaticAttribute(attr, context)]
          case 'AttrBinding':
            return [emitAttributeBinding(attr, context)]
          case 'PropBinding':
            return [emitPropertyBinding(attr, context)]
          default:
            return []
        }
      }),
    ),
  ]

  if (node.children.length > 0) {
    args.push(emitChildren(node.children, context, rawTextTag))
  }

  if (node.flags.isVoid) {
    if (node.children.length === 0) args.push(t.identifier('undefined'))
    args.push(t.booleanLiteral(true))
  }

  return t.callExpression(context.importRuntime('ssrElement'), args)
}

function emitAttributeBinding(
  attr: AttrBindingIR,
  context: CompilerContext,
): t.Expression {
  return t.callExpression(context.importRuntime('ssrAttr'), [
    t.stringLiteral(attr.name),
    emitBindingValue(attr.expr),
  ])
}

function emitPropertyBinding(
  attr: PropBindingIR,
  context: CompilerContext,
): t.Expression {
  return t.callExpression(context.importRuntime('ssrProp'), [
    t.stringLiteral(attr.name),
    emitBindingValue(attr.expr),
  ])
}

function emitBindingValue(expression: ExpressionIR): t.Expression {
  const value = parseExpressionIR(expression)

  if (t.isArrowFunctionExpression(value) || t.isFunctionExpression(value)) {
    return t.callExpression(value, [])
  }

  return value
}

function emitStaticAttribute(
  attr: StaticAttributeIR,
  context: CompilerContext,
): t.Expression {
  return t.callExpression(context.importRuntime('ssrAttr'), [
    t.stringLiteral(attr.name),
    attr.value === true ? t.booleanLiteral(true) : t.stringLiteral(attr.value),
  ])
}

function emitChildren(
  children: ZeusIRNode[],
  context: CompilerContext,
  rawTextTag?: SSRRawTextTag,
): t.ArrayExpression {
  return t.arrayExpression(
    children.map(child => emitSSR(child, context, rawTextTag)),
  )
}

function emitChildrenValue(
  children: ZeusIRNode[],
  context: CompilerContext,
  rawTextTag?: SSRRawTextTag,
): t.Expression {
  if (children.length === 1) return emitSSR(children[0], context, rawTextTag)

  return emitChildren(children, context, rawTextTag)
}

function decodeCompilerEscapedText(value: string): string {
  return value.replace(/&lt;/g, '<').replace(/&amp;/g, '&')
}

function isStaticPropValue(value: t.Expression): boolean {
  return (
    t.isStringLiteral(value) ||
    t.isNumericLiteral(value) ||
    t.isBooleanLiteral(value) ||
    t.isNullLiteral(value)
  )
}

function createObjectKey(name: string): t.Identifier | t.StringLiteral {
  return t.isValidIdentifier(name) ? t.identifier(name) : t.stringLiteral(name)
}

function isEventAttributeName(name: string): boolean {
  return name.length > 2 && name.slice(0, 2).toLowerCase() === 'on'
}

export { assertSSRSupported } from './validate'

function throwUnsupportedSSRNode(node: never): never {
  const kind = (node as ZeusIRNode).kind
  throw new Error(`Unsupported SSR IR node: ${kind}`)
}
