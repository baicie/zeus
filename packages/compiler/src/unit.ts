import * as t from '@babel/types'
import { createLoggerInstance } from '@baicie/logger'
import { extend } from '@zeus-js/shared'

import type {
  CompilerOptions,
  BabelState,
  BabelJSXElement,
  BabelJSXPath,
  BabelJSXElementPath,
  TransformResults,
} from './types'

//#region  file metadata
type ZeusMetadata = {
  config?: CompilerOptions
}

type FileMetadata = BabelState['file']['metadata'] & {
  zeus: ZeusMetadata
}

export function setZeusMetadata(
  state: BabelState,
  config: CompilerOptions,
): ZeusMetadata {
  const metadata = state.file.metadata as FileMetadata

  metadata.zeus = extend({}, metadata.zeus, {
    config,
  })

  return metadata.zeus
}

export function getZeusMetadata(state: BabelState): ZeusMetadata {
  const metadata = state.file.metadata as FileMetadata
  return metadata.zeus
}

//#endregion

//#region logger

export const logger = createLoggerInstance({
  prefix: 'zeus-compiler',
})

//#endregion

//#region component

type BabelJSXOpeningElementName = t.JSXOpeningElement['name']

function jsxElementNameToString(node: BabelJSXOpeningElementName): string {
  if (t.isJSXMemberExpression(node)) {
    return `${jsxElementNameToString(node.object)}.${node.property.name}`
  }
  if (t.isJSXIdentifier(node) || t.isIdentifier(node)) {
    return node.name
  }
  return `${node.namespace.name}:${node.name.name}`
}

export function getTagName(node: BabelJSXElement): string {
  const jsxName = node.openingElement.name
  return jsxElementNameToString(jsxName)
}

//#endregion

//#region isXxx

export function isJSXElementPath(
  path: BabelJSXPath,
): path is BabelJSXElementPath {
  return t.isJSXElement(path.node)
}

//#endregion

//#region attribute

export function inlineAttributeOnTemplate(
  key: string,
  value: t.JSXAttribute['value'],
  results: TransformResults,
) {
  if (!value) {
    results.template += ` ${key}`
    return
  }

  if (t.isStringLiteral(value)) {
    results.template += ` ${key}="${escapeHTML(value.value)}"`
    return
  }

  if (
    t.isJSXExpressionContainer(value) &&
    t.isNumericLiteral(value.expression)
  ) {
    results.template += ` ${key}="${value.expression.value}"`
    return
  }
}
export function setAttr(
  elem: t.Identifier,
  key: string,
  value: t.Expression,
): t.CallExpression {
  return t.callExpression(t.identifier('setAttr'), [
    elem,
    t.stringLiteral(key),
    value,
  ])
}

export function getJSXAttrName(name: t.JSXAttribute['name']): string {
  if (t.isJSXNamespacedName(name)) {
    return `${name.namespace.name}:${name.name.name}`
  }

  return name.name
}

export function escapeHTML(value: string, attr = false): string {
  const delimiter = attr ? '"' : '<'
  const escapedDelimiter = attr ? '&quot;' : '&lt;'

  let result = ''
  let lastIndex = 0

  for (let i = 0; i < value.length; i++) {
    const char = value[i]

    let escaped: string | undefined

    if (char === '&') {
      escaped = '&amp;'
    } else if (char === delimiter) {
      escaped = escapedDelimiter
    }

    if (escaped) {
      result += value.slice(lastIndex, i) + escaped
      lastIndex = i + 1
    }
  }

  return lastIndex === 0 ? value : result + value.slice(lastIndex)
}

//#endregion

//#region event

export function toEventName(name: string): string {
  return name.slice(2).toLowerCase()
}

//#endregion
