/**
 * JSX AST parsing utilities.
 *
 * Low-level helpers for extracting and interpreting information from Babel's
 * JSX AST nodes — tag names, attribute names, and path type guards.
 * These do NOT produce IR or Babel AST; they only read the JSX tree.
 */
import * as t from '@babel/types'

import type {
  BabelJSXElement,
  BabelJSXElementPath,
  BabelJSXPath,
  TransformResults,
  DynamicTransformResults,
  ElementTransformResults,
} from '../types'

type JSXOpeningElementName = t.JSXOpeningElement['name']

function jsxElementNameToString(node: JSXOpeningElementName): string {
  if (t.isJSXMemberExpression(node)) {
    return `${jsxElementNameToString(node.object)}.${node.property.name}`
  }

  if (t.isJSXIdentifier(node) || t.isIdentifier(node)) {
    return node.name
  }

  return `${node.namespace.name}:${node.name.name}`
}

export function getTagName(node: BabelJSXElement): string {
  return jsxElementNameToString(node.openingElement.name)
}

export function getJSXAttrName(name: t.JSXAttribute['name']): string {
  if (t.isJSXNamespacedName(name)) {
    return `${name.namespace.name}:${name.name.name}`
  }

  return name.name
}

export function isJSXElementPath(
  path: BabelJSXPath,
): path is BabelJSXElementPath {
  return t.isJSXElement(path.node)
}

export function isComponentTag(tagName: string): boolean {
  return /^[A-Z]/.test(tagName) || tagName.includes('.')
}

export function isElementResult(
  result: TransformResults,
): result is ElementTransformResults {
  return result.kind === 'element'
}

export function isDynamicResult(
  result: TransformResults,
): result is DynamicTransformResults {
  return result.kind === 'dynamic'
}

export function toEventName(name: string): string {
  return name.slice(2).toLowerCase()
}
