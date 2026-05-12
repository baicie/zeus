import * as t from '@babel/types'
import { createLoggerInstance } from '@baicie/logger'
import { extend } from '@zeus-js/shared'

import type {
  CompilerOptions,
  BabelState,
  BabelJSXElement,
  BabelJSXPath,
  BabelJSXElementPath,
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

//#region jsxxx

export function isJSXElementPath(
  path: BabelJSXPath,
): path is BabelJSXElementPath {
  return t.isJSXElement(path.node)
}
//#endregion
