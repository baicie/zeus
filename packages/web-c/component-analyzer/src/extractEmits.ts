import * as t from '@babel/types'

import { getObjectKey, getObjectProperty, staticValue } from './utils'

import type { ComponentEvent } from './types'

export function extractEmits(
  options: t.ObjectExpression | undefined,
): Record<string, ComponentEvent> {
  const emitsNode = options ? getObjectProperty(options, 'emits') : undefined

  if (!t.isObjectExpression(emitsNode)) return {}

  const events: Record<string, ComponentEvent> = {}

  for (const member of emitsNode.properties) {
    if (!t.isObjectProperty(member) || member.computed) continue

    const key = getObjectKey(member.key)

    if (!key) continue

    events[key] = extractEventDefinition(key, member.value)
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
): ComponentEvent {
  const result = createComponentEvent(key)

  if (!t.isCallExpression(node)) return result
  if (!t.isIdentifier(node.callee, { name: 'event' })) return result

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
