import * as t from '@babel/types'

import { getObjectKey, getObjectProperty, staticValue } from './utils'

import type { ComponentProp, ComponentPropType } from './types'

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
