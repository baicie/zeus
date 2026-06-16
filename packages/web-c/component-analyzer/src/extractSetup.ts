import * as t from '@babel/types'

import { walk } from './ast'
import { createComponentEvent } from './extractEmits'
import { getObjectKey, staticValue, uniqueSorted } from './utils'

import type {
  ComponentEvent,
  ComponentMethod,
  ComponentMethodParameter,
  ComponentSlot,
} from './types'

export interface SetupMeta {
  events: Record<string, ComponentEvent>
  methods: Record<string, ComponentMethod>
  slots: Record<string, ComponentSlot>
  hostAttributes: string[]
  cssParts: string[]
}

export function extractSetupMeta(setup: t.Node | undefined): SetupMeta {
  const events: Record<string, ComponentEvent> = {}
  const methods: Record<string, ComponentMethod> = {}
  const slots: Record<string, ComponentSlot> = {}
  const hostAttributes: string[] = []
  const cssParts: string[] = []

  if (!setup || t.isSpreadElement(setup) || t.isArgumentPlaceholder(setup)) {
    return {
      events,
      methods,
      slots,
      hostAttributes,
      cssParts,
    }
  }

  walk(setup, node => {
    extractEmit(node, events)
    extractExpose(node, methods)
    extractSlot(node, slots)
    extractHostAttributes(node, hostAttributes)
    extractCssParts(node, cssParts)
  })

  return {
    events,
    methods,
    slots,
    hostAttributes: uniqueSorted(hostAttributes),
    cssParts: uniqueSorted(cssParts),
  }
}

function extractEmit(
  node: t.Node,
  events: Record<string, ComponentEvent>,
): void {
  if (!t.isCallExpression(node)) return

  const emitKey = getEmitKey(node.callee)

  if (!emitKey) return

  events[emitKey] ||= createComponentEvent(emitKey)

  const detailNode = node.arguments[0]

  if (t.isObjectExpression(detailNode)) {
    events[emitKey].detail = inferDetail(detailNode)
  }
}

function getEmitKey(
  callee: t.Expression | t.V8IntrinsicIdentifier,
): string | undefined {
  if (t.isMemberExpression(callee)) {
    if (t.isIdentifier(callee.object, { name: 'emit' }) && !callee.computed) {
      return getMemberPropertyName(callee.property)
    }

    if (
      t.isMemberExpression(callee.object) &&
      t.isIdentifier(callee.object.property, { name: 'emit' }) &&
      !callee.computed
    ) {
      return getMemberPropertyName(callee.property)
    }
  }

  return undefined
}

function getMemberPropertyName(
  property: t.Expression | t.PrivateName,
): string | undefined {
  if (t.isIdentifier(property)) return property.name
  if (t.isStringLiteral(property)) return property.value
  return undefined
}

function inferDetail(node: t.ObjectExpression): Record<string, string> {
  const result: Record<string, string> = {}

  for (const prop of node.properties) {
    if (!t.isObjectProperty(prop)) continue

    const key = getObjectKey(prop.key)
    if (!key) continue

    result[key] = inferExpressionType(prop.value)
  }

  return result
}

function inferExpressionType(node: t.Expression | t.PatternLike): string {
  if (t.isStringLiteral(node)) return 'string'
  if (t.isNumericLiteral(node)) return 'number'
  if (t.isBooleanLiteral(node)) return 'boolean'
  if (t.isObjectExpression(node)) return 'object'
  if (t.isArrayExpression(node)) return 'array'
  if (t.isIdentifier(node)) return 'unknown'

  return 'unknown'
}

function extractSlot(node: t.Node, slots: Record<string, ComponentSlot>): void {
  if (!t.isJSXElement(node)) return

  const name = node.openingElement.name

  if (
    !t.isJSXIdentifier(name, { name: 'Slot' }) &&
    !t.isJSXIdentifier(name, { name: 'slot' })
  ) {
    return
  }

  const slotName = getJSXStringAttribute(node, 'name') ?? 'default'

  slots[slotName] ||= {
    name: slotName,
  }
}

function extractExpose(
  node: t.Node,
  methods: Record<string, ComponentMethod>,
): void {
  if (!t.isCallExpression(node)) return
  if (!isExposeCallee(node.callee)) return

  const first = node.arguments[0]

  if (!t.isObjectExpression(first)) return

  for (const member of first.properties) {
    if (!t.isObjectMethod(member) && !t.isObjectProperty(member)) continue

    const name = getObjectKey(member.key)

    if (!name) continue

    methods[name] = extractMethod(member, name)
  }
}

function extractMethod(
  member: t.ObjectMethod | t.ObjectProperty,
  name: string,
): ComponentMethod {
  const fn = t.isObjectMethod(member)
    ? member
    : t.isFunctionExpression(member.value) ||
        t.isArrowFunctionExpression(member.value)
      ? member.value
      : undefined

  if (!fn) {
    return { name }
  }

  const returnType = t.isTSTypeAnnotation(fn.returnType)
    ? fn.returnType.typeAnnotation
    : undefined
  const normalizedReturn = fn.async
    ? (unwrapPromiseType(returnType) ?? returnType)
    : returnType

  return {
    name,
    parameters: fn.params.map((param, index) =>
      extractMethodParameter(param, index),
    ),
    returns: formatTsType(normalizedReturn) ?? 'unknown',
    async: fn.async,
  }
}

function extractMethodParameter(
  param: t.Identifier | t.Pattern | t.RestElement | t.TSParameterProperty,
  index: number,
): ComponentMethodParameter {
  if (t.isTSParameterProperty(param)) {
    return extractMethodParameter(param.parameter, index)
  }

  if (t.isAssignmentPattern(param)) {
    return {
      name: t.isIdentifier(param.left) ? param.left.name : `arg${index}`,
      type:
        formatTsType(getPatternTypeAnnotation(param.left)) ??
        inferExpressionType(param.right),
      optional: true,
    }
  }

  if (t.isRestElement(param)) {
    return {
      name: t.isIdentifier(param.argument)
        ? param.argument.name
        : `args${index}`,
      type:
        formatTsType(getPatternTypeAnnotation(param)) ??
        formatTsType(getPatternTypeAnnotation(param.argument)) ??
        'unknown[]',
      optional: false,
      rest: true,
    }
  }

  return {
    name: t.isIdentifier(param) ? param.name : `arg${index}`,
    type: formatTsType(getPatternTypeAnnotation(param)) ?? 'unknown',
    optional: Boolean(t.isIdentifier(param) && param.optional),
  }
}

function getPatternTypeAnnotation(node: t.Node): t.TSType | null | undefined {
  if (
    t.isIdentifier(node) ||
    t.isObjectPattern(node) ||
    t.isArrayPattern(node) ||
    t.isRestElement(node)
  ) {
    return t.isTSTypeAnnotation(node.typeAnnotation)
      ? node.typeAnnotation.typeAnnotation
      : undefined
  }

  return undefined
}

function unwrapPromiseType(
  node: t.TSType | null | undefined,
): t.TSType | undefined {
  if (
    t.isTSTypeReference(node) &&
    t.isIdentifier(node.typeName, { name: 'Promise' })
  ) {
    return node.typeParameters?.params[0]
  }

  return undefined
}

function formatTsType(node: t.TSType | null | undefined): string | undefined {
  if (!node) return undefined
  if (t.isTSStringKeyword(node)) return 'string'
  if (t.isTSNumberKeyword(node)) return 'number'
  if (t.isTSBooleanKeyword(node)) return 'boolean'
  if (t.isTSVoidKeyword(node)) return 'void'
  if (t.isTSUnknownKeyword(node)) return 'unknown'
  if (t.isTSAnyKeyword(node)) return 'any'
  if (t.isTSNullKeyword(node)) return 'null'
  if (t.isTSUndefinedKeyword(node)) return 'undefined'
  if (t.isTSArrayType(node)) {
    return `${formatTsType(node.elementType) ?? 'unknown'}[]`
  }
  if (t.isTSUnionType(node)) {
    return node.types.map(type => formatTsType(type) ?? 'unknown').join(' | ')
  }
  if (t.isTSLiteralType(node)) {
    return staticLiteralType(node.literal)
  }
  if (t.isTSTypeReference(node)) {
    const name = formatEntityName(node.typeName)
    const params = node.typeParameters?.params

    return params?.length
      ? `${name}<${params.map(type => formatTsType(type) ?? 'unknown').join(', ')}>`
      : name
  }

  return 'unknown'
}

function formatEntityName(name: t.TSEntityName): string {
  return t.isIdentifier(name)
    ? name.name
    : `${formatEntityName(name.left)}.${name.right.name}`
}

function staticLiteralType(node: t.Expression): string {
  if (t.isStringLiteral(node)) return JSON.stringify(node.value)
  if (t.isNumericLiteral(node)) return String(node.value)
  if (t.isBooleanLiteral(node)) return String(node.value)
  return 'unknown'
}

function isExposeCallee(
  callee: t.Expression | t.V8IntrinsicIdentifier,
): boolean {
  if (t.isIdentifier(callee, { name: 'expose' })) return true

  return (
    t.isMemberExpression(callee) &&
    t.isIdentifier(callee.property, { name: 'expose' })
  )
}

function extractHostAttributes(node: t.Node, hostAttributes: string[]): void {
  if (!t.isJSXElement(node)) return

  const name = node.openingElement.name

  if (!t.isJSXIdentifier(name, { name: 'Host' })) return

  for (const attr of node.openingElement.attributes) {
    if (!t.isJSXAttribute(attr)) continue
    if (!t.isJSXIdentifier(attr.name)) continue

    const attrName = normalizeJsxAttrName(attr.name.name)

    if (
      attrName.startsWith('data-') ||
      attrName.startsWith('aria-') ||
      attrName === 'role' ||
      attrName === 'part' ||
      attrName === 'class' ||
      attrName === 'style' ||
      attrName === 'id' ||
      attrName === 'tabindex'
    ) {
      hostAttributes.push(attrName)
    }
  }
}

function extractCssParts(node: t.Node, cssParts: string[]): void {
  if (!t.isJSXElement(node)) return

  const value = getJSXStringAttribute(node, 'part')

  if (!value) return

  for (const part of value.split(/\s+/)) {
    if (part) cssParts.push(part)
  }
}

function getJSXStringAttribute(
  node: t.JSXElement,
  attrName: string,
): string | undefined {
  for (const attr of node.openingElement.attributes) {
    if (!t.isJSXAttribute(attr)) continue
    if (!t.isJSXIdentifier(attr.name, { name: attrName })) continue

    if (!attr.value) return ''

    if (t.isStringLiteral(attr.value)) {
      return attr.value.value
    }

    if (
      t.isJSXExpressionContainer(attr.value) &&
      t.isExpression(attr.value.expression)
    ) {
      const value = staticValue(attr.value.expression)

      if (typeof value === 'string') return value
    }
  }

  return undefined
}

function normalizeJsxAttrName(name: string): string {
  switch (name) {
    case 'className':
      return 'class'
    case 'tabIndex':
      return 'tabindex'
    default:
      return name
  }
}
