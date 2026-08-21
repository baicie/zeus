import * as t from '@babel/types'

import { isPortableTypeReference } from './portable-types'
import { getObjectKey, getObjectProperty, staticValue } from './utils'

import type { ComponentEvent } from './types'

export function extractEmits(
  options: t.ObjectExpression | undefined,
  sourceBoundTypeNames: ReadonlySet<string> = new Set(),
): Record<string, ComponentEvent> {
  const emitsNode = options ? getObjectProperty(options, 'emits') : undefined

  if (!t.isObjectExpression(emitsNode)) return {}

  const events: Record<string, ComponentEvent> = {}

  for (const member of emitsNode.properties) {
    if (!t.isObjectProperty(member) || member.computed) continue

    const key = getObjectKey(member.key)

    if (!key) continue

    events[key] = extractEventDefinition(
      key,
      member.value,
      sourceBoundTypeNames,
    )
  }

  return events
}

export function createComponentEvent(
  key: string,
  detail?: Record<string, string>,
): ComponentEvent {
  return {
    key,
    name: toKebabCase(key),
    reactName: toReactEventProp(key),
    detail,
    bubbles: true,
    composed: true,
    cancelable: false,
  }
}

function extractEventDefinition(
  key: string,
  node: t.Expression | t.PatternLike,
  sourceBoundTypeNames: ReadonlySet<string>,
): ComponentEvent {
  const result = createComponentEvent(key)

  if (!t.isCallExpression(node)) return result
  if (!t.isIdentifier(node.callee, { name: 'event' })) return result

  result.detail =
    extractEventDetailType(node, sourceBoundTypeNames) ?? result.detail

  const first = node.arguments[0]

  if (t.isStringLiteral(first)) {
    result.name = first.value
    return result
  }

  if (t.isObjectExpression(first)) {
    const name = getObjectProperty(first, 'name')
    const bubbles = getObjectProperty(first, 'bubbles')
    const composed = getObjectProperty(first, 'composed')
    const cancelable = getObjectProperty(first, 'cancelable')

    const nameValue = staticValue(name)
    const bubblesValue = staticValue(bubbles)
    const composedValue = staticValue(composed)
    const cancelableValue = staticValue(cancelable)

    if (typeof nameValue === 'string') result.name = nameValue
    if (typeof bubblesValue === 'boolean') result.bubbles = bubblesValue
    if (typeof composedValue === 'boolean') result.composed = composedValue
    if (typeof cancelableValue === 'boolean') {
      result.cancelable = cancelableValue
    }
  }

  return result
}

function extractEventDetailType(
  node: t.CallExpression,
  sourceBoundTypeNames: ReadonlySet<string>,
): Record<string, string> | undefined {
  const first = node.typeArguments?.params[0]

  if (!t.isTSTypeLiteral(first)) return undefined

  const detail: Record<string, string> = {}

  for (const member of first.members) {
    if (!t.isTSPropertySignature(member) || member.computed) return undefined

    const key = getObjectKey(member.key)
    if (!key) return undefined

    const type = inferTsType(
      member.typeAnnotation?.typeAnnotation,
      sourceBoundTypeNames,
    )
    if (type === undefined) return undefined

    detail[key] = type
  }

  return Object.keys(detail).length > 0 ? detail : undefined
}

function inferTsType(
  node: t.TSType | undefined,
  sourceBoundTypeNames: ReadonlySet<string>,
): string | undefined {
  if (!node) return 'unknown'
  if (t.isTSStringKeyword(node)) return 'string'
  if (t.isTSNumberKeyword(node)) return 'number'
  if (t.isTSBooleanKeyword(node)) return 'boolean'
  if (t.isTSObjectKeyword(node)) return 'object'
  if (t.isTSTypeLiteral(node)) {
    for (const member of node.members) {
      if (!t.isTSPropertySignature(member) || member.computed) {
        return undefined
      }

      if (
        inferTsType(
          member.typeAnnotation?.typeAnnotation,
          sourceBoundTypeNames,
        ) === undefined
      ) {
        return undefined
      }
    }

    return 'object'
  }
  if (t.isTSArrayType(node)) {
    return inferTsType(node.elementType, sourceBoundTypeNames) === undefined
      ? undefined
      : 'array'
  }
  if (t.isTSTupleType(node)) {
    return node.elementTypes.every(element => {
      const type = t.isTSNamedTupleMember(element)
        ? element.elementType
        : element
      return inferTsType(type, sourceBoundTypeNames) !== undefined
    })
      ? 'array'
      : undefined
  }
  if (t.isTSFunctionType(node)) {
    return node.typeParameters?.params.length ? undefined : 'function'
  }
  if (t.isTSTypeReference(node)) {
    return inferTsTypeReference(node, sourceBoundTypeNames)
  }

  return undefined
}

function inferTsTypeReference(
  node: t.TSTypeReference,
  sourceBoundTypeNames: ReadonlySet<string>,
): string {
  const name = t.isIdentifier(node.typeName) ? node.typeName.name : undefined

  if (!name || sourceBoundTypeNames.has(name)) return 'unknown'

  switch (name) {
    case 'String':
      return 'string'
    case 'Number':
      return 'number'
    case 'Boolean':
      return 'boolean'
    case 'Array':
    case 'ReadonlyArray':
      return !node.typeArguments?.params.length ||
        node.typeArguments.params.every(
          parameter =>
            inferTsType(parameter, sourceBoundTypeNames) !== undefined,
        )
        ? 'array'
        : 'unknown'
    case 'Function':
      return 'function'
    case 'Record':
      return 'object'
    default:
      return !node.typeArguments?.params.length &&
        isPortableTypeReference(name, sourceBoundTypeNames)
        ? name
        : 'unknown'
  }
}

function toKebabCase(value: string): string {
  return value.replace(/[A-Z]/g, match => `-${match.toLowerCase()}`)
}

function toReactEventProp(value: string): string {
  return `on${value
    .split('-')
    .filter(Boolean)
    .map(part => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
    .join('')}`
}
