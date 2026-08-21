import * as t from '@babel/types'

import { walk } from './ast'
import { createComponentEvent } from './extractEmits'
import {
  isPortableTypeReference,
  withTypeParameterBindings,
} from './portable-types'
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

export function extractSetupMeta(
  setup: t.Node | undefined,
  sourceBoundTypeNames: ReadonlySet<string> = new Set(),
): SetupMeta {
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

  const setupTypeNames = collectSetupSourceBoundTypeNames(
    setup,
    sourceBoundTypeNames,
  )

  walk(setup, node => {
    extractEmit(node, events)
    extractExpose(node, methods, setupTypeNames)
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

function collectSetupSourceBoundTypeNames(
  setup: t.Node,
  sourceBoundTypeNames: ReadonlySet<string>,
): ReadonlySet<string> {
  let names = new Set(sourceBoundTypeNames)

  walk(setup, node => {
    if (
      t.isTSInterfaceDeclaration(node) ||
      t.isTSTypeAliasDeclaration(node) ||
      t.isClassDeclaration(node) ||
      t.isTSEnumDeclaration(node) ||
      t.isTSImportEqualsDeclaration(node)
    ) {
      if (node.id) names.add(node.id.name)
      return
    }

    if (t.isTSModuleDeclaration(node)) {
      if (t.isIdentifier(node.id)) names.add(node.id.name)
      if (t.isStringLiteral(node.id)) names.add(node.id.value)
      return
    }

    if (isFunctionWithTypeParameters(node)) {
      names = new Set(withTypeParameterBindings(names, node.typeParameters))
    }
  })

  return names
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
    const detail = inferDetail(detailNode)

    if (detail) {
      events[emitKey].detail = detail
    }
  }
}

function getEmitKey(
  callee: t.Expression | t.Super | t.Import | t.V8IntrinsicIdentifier,
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

function inferDetail(
  node: t.ObjectExpression,
): Record<string, string> | undefined {
  const result: Record<string, string> = {}

  for (const prop of node.properties) {
    if (!t.isObjectProperty(prop) || prop.computed) return undefined

    const key = getObjectKey(prop.key)
    if (!key) return undefined

    const type = inferExpressionType(prop.value)
    if (type === undefined) return undefined

    result[key] = type
  }

  return result
}

function inferExpressionType(
  node: t.Expression | t.PatternLike,
): string | undefined {
  if (t.isStringLiteral(node)) return 'string'
  if (t.isNumericLiteral(node)) return 'number'
  if (t.isBooleanLiteral(node)) return 'boolean'
  if (t.isObjectExpression(node)) {
    return inferDetail(node) ? 'object' : undefined
  }
  if (t.isArrayExpression(node)) {
    for (const element of node.elements) {
      if (!element || !t.isExpression(element)) return undefined
      if (inferExpressionType(element) === undefined) return undefined
    }
    return 'array'
  }
  if (t.isIdentifier(node)) return 'unknown'

  return undefined
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
  sourceBoundTypeNames: ReadonlySet<string>,
): void {
  if (!t.isCallExpression(node)) return
  if (!isExposeCallee(node.callee)) return

  const first = node.arguments[0]

  if (!t.isObjectExpression(first)) return

  for (const member of first.properties) {
    if (
      (!t.isObjectMethod(member) && !t.isObjectProperty(member)) ||
      member.computed
    ) {
      continue
    }

    const name = getObjectKey(member.key)

    if (!name) continue

    methods[name] = extractMethod(member, name, sourceBoundTypeNames)
  }
}

function extractMethod(
  member: t.ObjectMethod | t.ObjectProperty,
  name: string,
  sourceBoundTypeNames: ReadonlySet<string>,
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

  const methodTypeNames = withTypeParameterBindings(
    sourceBoundTypeNames,
    fn.typeParameters,
  )

  const returnType = t.isTSTypeAnnotation(fn.returnType)
    ? fn.returnType.typeAnnotation
    : undefined
  const normalizedReturn = fn.async
    ? (unwrapPromiseType(returnType, methodTypeNames) ?? returnType)
    : returnType

  return {
    name,
    parameters: fn.params.map((param, index) =>
      extractMethodParameter(param, index, methodTypeNames),
    ),
    returns: formatTsType(normalizedReturn, methodTypeNames) ?? 'unknown',
    async: fn.async,
  }
}

function extractMethodParameter(
  param: t.Identifier | t.Pattern | t.RestElement | t.TSParameterProperty,
  index: number,
  sourceBoundTypeNames: ReadonlySet<string>,
): ComponentMethodParameter {
  if (t.isTSParameterProperty(param)) {
    return extractMethodParameter(param.parameter, index, sourceBoundTypeNames)
  }

  if (t.isAssignmentPattern(param)) {
    return {
      name: t.isIdentifier(param.left) ? param.left.name : `arg${index}`,
      type:
        formatTsType(
          getPatternTypeAnnotation(param.left),
          sourceBoundTypeNames,
        ) ??
        inferExpressionType(param.right) ??
        'unknown',
      optional: true,
    }
  }

  if (t.isRestElement(param)) {
    return {
      name: t.isIdentifier(param.argument)
        ? param.argument.name
        : `args${index}`,
      type:
        formatTsType(getPatternTypeAnnotation(param), sourceBoundTypeNames) ??
        formatTsType(
          getPatternTypeAnnotation(param.argument),
          sourceBoundTypeNames,
        ) ??
        'unknown[]',
      optional: false,
      rest: true,
    }
  }

  return {
    name: t.isIdentifier(param) ? param.name : `arg${index}`,
    type:
      formatTsType(getPatternTypeAnnotation(param), sourceBoundTypeNames) ??
      'unknown',
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
  sourceBoundTypeNames: ReadonlySet<string>,
): t.TSType | undefined {
  if (
    t.isTSTypeReference(node) &&
    t.isIdentifier(node.typeName, { name: 'Promise' }) &&
    !sourceBoundTypeNames.has('Promise')
  ) {
    return node.typeArguments?.params[0]
  }

  return undefined
}

function formatTsType(
  node: t.TSType | null | undefined,
  sourceBoundTypeNames: ReadonlySet<string>,
): string | undefined {
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
    return `${formatTsType(node.elementType, sourceBoundTypeNames) ?? 'unknown'}[]`
  }
  if (t.isTSUnionType(node)) {
    return node.types
      .map(type => formatTsType(type, sourceBoundTypeNames) ?? 'unknown')
      .join(' | ')
  }
  if (t.isTSLiteralType(node)) {
    return staticLiteralType(node.literal)
  }
  if (t.isTSTypeReference(node)) {
    const name = formatEntityName(node.typeName)
    const params = node.typeArguments?.params

    if (!isPortableTypeReference(name, sourceBoundTypeNames)) {
      return undefined
    }

    if (!params?.length) return name
    if (
      !params.every(param => isFullyPortableType(param, sourceBoundTypeNames))
    ) {
      return undefined
    }

    const formattedParams: string[] = []

    for (const param of params) {
      const formatted = formatTsType(param, sourceBoundTypeNames)

      if (formatted === undefined) return undefined
      formattedParams.push(formatted)
    }

    return `${name}<${formattedParams.join(', ')}>`
  }

  return 'unknown'
}

function isFullyPortableType(
  node: t.TSType,
  sourceBoundTypeNames: ReadonlySet<string>,
): boolean {
  if (
    t.isTSStringKeyword(node) ||
    t.isTSNumberKeyword(node) ||
    t.isTSBooleanKeyword(node) ||
    t.isTSVoidKeyword(node) ||
    t.isTSUnknownKeyword(node) ||
    t.isTSAnyKeyword(node) ||
    t.isTSNullKeyword(node) ||
    t.isTSUndefinedKeyword(node)
  ) {
    return true
  }

  if (t.isTSArrayType(node)) {
    return isFullyPortableType(node.elementType, sourceBoundTypeNames)
  }

  if (t.isTSUnionType(node)) {
    return node.types.every(type =>
      isFullyPortableType(type, sourceBoundTypeNames),
    )
  }

  if (t.isTSLiteralType(node)) {
    return staticLiteralType(node.literal) !== 'unknown'
  }

  if (t.isTSTypeReference(node)) {
    const name = formatEntityName(node.typeName)
    const params = node.typeArguments?.params

    return (
      isPortableTypeReference(name, sourceBoundTypeNames) &&
      (!params?.length ||
        params.every(param => isFullyPortableType(param, sourceBoundTypeNames)))
    )
  }

  return false
}

function isFunctionWithTypeParameters(
  node: t.Node,
): node is
  | t.FunctionDeclaration
  | t.FunctionExpression
  | t.ArrowFunctionExpression {
  return (
    t.isFunctionDeclaration(node) ||
    t.isFunctionExpression(node) ||
    t.isArrowFunctionExpression(node)
  )
}

function formatEntityName(name: t.TSEntityName): string {
  if (t.isIdentifier(name)) return name.name
  if (t.isTSQualifiedName(name)) {
    return `${formatEntityName(name.left)}.${name.right.name}`
  }
  return 'this'
}

function staticLiteralType(node: t.Expression): string {
  if (t.isStringLiteral(node)) return JSON.stringify(node.value)
  if (t.isNumericLiteral(node)) return String(node.value)
  if (t.isBooleanLiteral(node)) return String(node.value)
  return 'unknown'
}

function isExposeCallee(
  callee: t.Expression | t.Super | t.Import | t.V8IntrinsicIdentifier,
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
