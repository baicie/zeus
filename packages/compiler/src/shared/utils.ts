import type { NodePath } from '@babel/core'
import type * as t from '@babel/types'
import { isJSXText } from '@babel/types'
import { getBabelFile, getProgramScopeData } from '../babel-cast'
import { type CompilerOptions, DEFAULT_CONFIG } from '../config'

export function getConfig(path: NodePath): Required<CompilerOptions> {
  const meta = getBabelFile(path).metadata
  if (meta && meta.config) {
    return meta.config
  }
  return DEFAULT_CONFIG
}

export function registerImportMethod(
  path: NodePath,
  name: string,
): t.Identifier {
  const config = getConfig(path)
  const moduleName = config.moduleName
  let data = getProgramScopeData(path)
  if (!data) {
    throw new Error(
      '[zeus-jsx] internal: scope data missing before registerImportMethod',
    )
  }
  if (!data.imports) {
    data.imports = new Map()
  }
  let modMap = data.imports.get(moduleName)
  if (!modMap) {
    modMap = new Map()
    data.imports.set(moduleName, modMap)
  }
  const existing = modMap.get(name)
  if (existing) {
    return existing
  }
  const id = path.scope.generateUidIdentifier(name)
  modMap.set(name, id)
  return id
}

export function toEventName(prop: string): string {
  if (prop.indexOf('on') !== 0) {
    return prop
  }
  const raw = prop.slice(2)
  if (!raw.length) {
    return raw
  }
  return raw.charAt(0).toLowerCase() + raw.slice(1)
}

export function toPropertyName(attr: string): string {
  return attr
}

export function hasStaticMarker(path: NodePath, staticMarker: string): boolean {
  const node = path.node as { leadingComments?: t.Comment[] }
  const comments = node.leadingComments
  if (!comments || !comments.length) {
    return false
  }
  for (let i = 0; i < comments.length; i++) {
    const c = comments[i]
    const v = c.value.trim()
    if (v === staticMarker || v.indexOf(staticMarker) >= 0) {
      return true
    }
  }
  return false
}

export function filterChildren(
  children: t.JSXElement['children'],
): t.JSXElement['children'] {
  return children.filter(
    c => !(isJSXText(c) && c.value.replace(/\u200c|\u200b/g, '').trim() === ''),
  )
}
