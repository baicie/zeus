import * as t from '@babel/types'

import { getObjectKey, getObjectProperty, staticValue } from './utils'

import type { ComponentProp, ComponentPropType } from './types'

export interface ExtractedShadow {
  shadow?: boolean
}

export function extractShadowOption(
  options: t.ObjectExpression | undefined,
): ExtractedShadow {
  if (!options) return {}

  const shadowNode = getObjectProperty(options, 'shadow')
  if (!shadowNode) return {}

  const value = staticValue(shadowNode)
  if (typeof value !== 'boolean') return {}

  return { shadow: value }
}

export function extractRuntimeProps(
  options: t.ObjectExpression | undefined,
): Record<string, ComponentProp> {
  if (!options) return {}

  const propsNode = getObjectProperty(options, 'props')

  if (!t.isObjectExpression(propsNode)) return {}

  const props: Record<string, ComponentProp> = {}

  for (const prop of propsNode.properties) {
    if (!t.isObjectProperty(prop)) continue

    const key = getObjectKey(prop.key)
    if (!key) continue

    props[key] = extractRuntimeProp(prop.value)
  }

  return props
}

export function validateRuntimePropsDefinition(
  options: t.ObjectExpression | undefined,
  optionsArgument: t.Node | undefined,
): string[] {
  const messages: string[] = []

  if (optionsArgument && !t.isObjectExpression(optionsArgument)) {
    messages.push(
      'defineElement() options must be an inline object literal so component metadata can be analyzed.',
    )
    return messages
  }

  if (!options) {
    return messages
  }

  for (const member of options.properties) {
    if (!t.isObjectProperty(member) || member.computed) {
      messages.push(
        'defineElement() options cannot contain spreads, methods, or computed keys in component output builds.',
      )
    }
  }

  const propsNode = getObjectProperty(options, 'props')

  if (!propsNode) {
    return messages
  }

  if (!t.isObjectExpression(propsNode)) {
    messages.push(
      'defineElement() props must be an inline object literal in component output builds.',
    )
    return messages
  }

  for (const member of propsNode.properties) {
    if (!t.isObjectProperty(member) || member.computed) {
      messages.push(
        'defineElement() props cannot contain spreads, methods, or computed keys.',
      )
      continue
    }

    const propName = getObjectKey(member.key)

    if (!propName) {
      messages.push('defineElement() contains a prop with an unsupported key.')
      continue
    }

    if (t.isIdentifier(member.value)) {
      if (!isPropConstructorName(member.value.name)) {
        messages.push(
          `Prop "${propName}" must use String, Number, Boolean, Object, Array, or an inline prop options object.`,
        )
      }

      continue
    }

    if (!t.isObjectExpression(member.value)) {
      messages.push(
        `Prop "${propName}" must use an inline prop options object.`,
      )
      continue
    }

    validatePropOptions(propName, member.value, messages)
  }

  return messages
}

function validatePropOptions(
  propName: string,
  options: t.ObjectExpression,
  messages: string[],
): void {
  for (const member of options.properties) {
    if (!t.isObjectProperty(member) || member.computed) {
      messages.push(
        `Prop "${propName}" options cannot contain spreads, methods, or computed keys.`,
      )
      continue
    }

    const optionName = getObjectKey(member.key)

    if (!optionName) {
      messages.push(`Prop "${propName}" contains an unsupported option key.`)
      continue
    }

    if (optionName === 'type') {
      if (
        !t.isIdentifier(member.value) ||
        !isPropConstructorName(member.value.name)
      ) {
        messages.push(
          `Prop "${propName}" type must be String, Number, Boolean, Object, or Array.`,
        )
      }

      continue
    }

    if (optionName === 'attr') {
      const value = staticValue(member.value)

      if (value === undefined && !isExplicitUndefined(member.value)) {
        messages.push(
          `Prop "${propName}" attr must be a static string, false, or undefined.`,
        )
        continue
      }

      if (value !== undefined && value !== false && typeof value !== 'string') {
        messages.push(
          `Prop "${propName}" attr must be a static string, false, or undefined.`,
        )
      }

      continue
    }

    if (optionName === 'reflect') {
      const value = staticValue(member.value)

      if (value === undefined && !isExplicitUndefined(member.value)) {
        messages.push(`Prop "${propName}" reflect must be a static boolean.`)
        continue
      }

      if (value !== undefined && typeof value !== 'boolean') {
        messages.push(`Prop "${propName}" reflect must be a static boolean.`)
      }
    }
  }
}

function extractRuntimeProp(node: t.Expression | t.PatternLike): ComponentProp {
  if (t.isIdentifier(node)) {
    return {
      type: typeFromConstructorName(node.name),
    }
  }

  if (t.isObjectExpression(node)) {
    const typeNode = getObjectProperty(node, 'type')
    const attrNode = getObjectProperty(node, 'attr')
    const reflectNode = getObjectProperty(node, 'reflect')
    const defaultNode = getObjectProperty(node, 'default')

    const type = t.isIdentifier(typeNode)
      ? typeFromConstructorName(typeNode.name)
      : 'unknown'

    const prop: ComponentProp = {
      type,
    }

    if (attrNode) {
      const attr = staticValue(attrNode)

      if (attr === false || typeof attr === 'string') {
        prop.attr = attr
      }
    }

    if (reflectNode) {
      const reflect = staticValue(reflectNode)

      if (typeof reflect === 'boolean') {
        prop.reflect = reflect
      }
    }

    if (defaultNode) {
      if (
        !t.isFunctionExpression(defaultNode) &&
        !t.isArrowFunctionExpression(defaultNode)
      ) {
        prop.default = staticValue(defaultNode)
      }
    }

    return prop
  }

  return {
    type: 'unknown',
  }
}

function isPropConstructorName(name: string): boolean {
  return (
    name === 'String' ||
    name === 'Number' ||
    name === 'Boolean' ||
    name === 'Object' ||
    name === 'Array'
  )
}

function isExplicitUndefined(node: t.Node): boolean {
  return t.isIdentifier(node) && node.name === 'undefined'
}

function typeFromConstructorName(name: string): ComponentPropType {
  switch (name) {
    case 'String':
      return 'string'
    case 'Number':
      return 'number'
    case 'Boolean':
      return 'boolean'
    case 'Object':
      return 'object'
    case 'Array':
      return 'array'
    default:
      return 'unknown'
  }
}
