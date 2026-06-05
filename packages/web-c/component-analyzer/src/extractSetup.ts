import * as t from '@babel/types'

import { walk } from './ast'
import { createComponentEvent } from './extractEmits'
import { getObjectKey, staticValue, uniqueSorted } from './utils'

import type { ComponentEvent, ComponentMethod, ComponentSlot } from './types'

export interface SetupMeta {
  events: Record<string, ComponentEvent>
  methods: Record<string, ComponentMethod>
  slots: Record<string, ComponentSlot>
  hostAttributes: string[]
  cssParts: string[]
}

export function extractSetupMeta(
  setup: t.Expression | t.SpreadElement | t.ArgumentPlaceholder | undefined,
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

  const first = node.arguments[0]
  const eventName =
    emitKey === true && t.isStringLiteral(first)
      ? first.value
      : emitKey === true
        ? undefined
        : emitKey

  if (!eventName) return

  events[eventName] ||= createComponentEvent(eventName)

  const detailNode = emitKey === true ? node.arguments[1] : node.arguments[0]

  if (t.isObjectExpression(detailNode)) {
    events[eventName].detail = inferDetail(detailNode)
  }
}

function getEmitKey(
  callee: t.Expression | t.V8IntrinsicIdentifier,
): true | string | undefined {
  if (t.isIdentifier(callee, { name: 'emit' })) return true

  if (t.isMemberExpression(callee)) {
    if (
      t.isIdentifier(callee.object, { name: 'ctx' }) &&
      t.isIdentifier(callee.property, { name: 'emit' })
    ) {
      return true
    }

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

    methods[name] = {
      name,
    }
  }
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
