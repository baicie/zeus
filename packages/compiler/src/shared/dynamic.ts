import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import {
  isArrowFunctionExpression,
  isBinaryExpression,
  isCallExpression,
  isClassMethod,
  isFunctionExpression,
  isJSXElement,
  isJSXFragment,
  isJSXIdentifier,
  isJSXMemberExpression,
  isMemberExpression,
  isObjectMethod,
  isOptionalCallExpression,
  isOptionalMemberExpression,
  isSpreadElement,
} from '@babel/types'
import type { DynamicCheckOptions } from './types'
import { getConfig, hasStaticMarker } from './utils'

export function isDynamic(
  path: NodePath<t.Expression>,
  options: DynamicCheckOptions = {},
): boolean {
  let checkMember = options.checkMember !== false
  let checkCallExpressions = options.checkCallExpressions !== false
  const checkTags = options.checkTags === true
  const native = options.native === true

  const expr = path.node
  const config = getConfig(path)

  if (config.generate === 'ssr' && native) {
    checkMember = false
    checkCallExpressions = false
  }

  if (isFunction(expr)) {
    return false
  }

  if (hasStaticMarker(path, config.staticMarker)) {
    return false
  }

  if (checkCallExpressions && isCallExpression(expr)) {
    return true
  }

  if (checkCallExpressions && isOptionalCallExpression(expr)) {
    return true
  }

  if (checkMember && isMemberExpression(expr)) {
    if (expr.computed) {
      return isDynamic(path.get('property') as NodePath<t.Expression>, {
        checkMember: true,
        checkTags,
        checkCallExpressions,
        native,
      })
    }
    return true
  }

  if (checkMember && isOptionalMemberExpression(expr)) {
    return true
  }

  if (checkMember && isSpreadElement(expr)) {
    return true
  }

  if (checkMember && isBinaryExpression(expr) && expr.operator === 'in') {
    return true
  }

  if (checkTags && isJSXElement(expr)) {
    return true
  }

  if (checkTags && isJSXFragment(expr) && expr.children.length > 0) {
    return true
  }

  return hasDynamicDescendant(path, {
    checkMember,
    checkTags,
    checkCallExpressions,
    native,
  })
}

function hasDynamicDescendant(
  path: NodePath<t.Expression>,
  options: {
    checkMember: boolean
    checkTags: boolean
    checkCallExpressions: boolean
    native: boolean
  },
): boolean {
  let dynamic = false

  path.traverse({
    Function(p) {
      if (isObjectMethod(p.node) && p.node.computed) {
        dynamic = isDynamic(p.get('key') as NodePath<t.Expression>, options)
      }
      p.skip()
    },
    CallExpression(p) {
      if (options.checkCallExpressions) {
        dynamic = true
        p.stop()
      }
    },
    OptionalCallExpression(p) {
      if (options.checkCallExpressions) {
        dynamic = true
        p.stop()
      }
    },
    MemberExpression(p) {
      if (options.checkMember) {
        dynamic = true
        p.stop()
      }
    },
    OptionalMemberExpression(p) {
      if (options.checkMember) {
        dynamic = true
        p.stop()
      }
    },
    SpreadElement(p) {
      if (options.checkMember) {
        dynamic = true
        p.stop()
      }
    },
    BinaryExpression(p) {
      if (options.checkMember && p.node.operator === 'in') {
        dynamic = true
        p.stop()
      }
    },
    JSXElement(p) {
      if (options.checkTags) {
        dynamic = true
        p.stop()
      } else {
        p.skip()
      }
    },
    JSXFragment(p) {
      if (options.checkTags && p.node.children.length) {
        dynamic = true
        p.stop()
      } else {
        p.skip()
      }
    },
  })

  return dynamic
}

function isFunction(node: t.Node): boolean {
  return (
    isArrowFunctionExpression(node) ||
    isFunctionExpression(node) ||
    isClassMethod(node)
  )
}

export function isComponent(tagName: string): boolean {
  if (!tagName || !tagName[0]) {
    return false
  }
  return (
    tagName[0] !== tagName[0].toLowerCase() ||
    tagName.indexOf('.') >= 0 ||
    !/^[a-zA-Z]/.test(tagName)
  )
}

export function getTagName(node: t.JSXElement): string {
  const name = node.openingElement.name
  return jsxNameToString(name)
}

function jsxNameToString(
  node: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
): string {
  if (isJSXMemberExpression(node)) {
    return `${jsxNameToString(node.object)}.${jsxPropertyName(node.property)}`
  }
  if (isJSXIdentifier(node)) {
    return node.name
  }
  return `${node.namespace.name}:${node.name.name}`
}

function jsxPropertyName(
  node: t.JSXIdentifier | t.JSXMemberExpression,
): string {
  if (isJSXIdentifier(node)) {
    return node.name
  }
  return jsxNameToString(node)
}

export function jsxTagNameFromOpeningName(
  name: t.JSXIdentifier | t.JSXMemberExpression | t.JSXNamespacedName,
): string {
  return jsxNameToString(name)
}
