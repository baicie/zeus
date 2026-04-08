import * as t from '@babel/types'
import { addNamed } from '@babel/helper-module-imports'

export const reservedNameSpaces = new Set(['class', 'on', 'oncapture', 'style', 'use', 'prop', 'attr', 'bool'])
export const nonSpreadNameSpaces = new Set(['class', 'style', 'use', 'prop', 'attr', 'bool'])

export function getConfig(path: any): any {
  return path.hub.file.metadata.config
}

export const getRendererConfig = (path: any, renderer: string): any => {
  const config = getConfig(path)
  return config?.renderers?.find((r: any) => r.name === renderer) ?? config
}

export function registerImportMethod(path: any, name: string, moduleName?: string): t.Identifier {
  const imports = path.scope.getProgramParent().data.imports || (path.scope.getProgramParent().data.imports = new Map())
  moduleName = moduleName || getConfig(path).moduleName
  const key = `${moduleName}:${name}`
  if (!imports.has(key)) {
    const id = addNamed(path, name, moduleName, { nameHint: `_$${name}` })
    imports.set(key, id)
    return id
  }
  return t.cloneNode(imports.get(key))
}

function jsxElementNameToString(node: any): string {
  if (t.isJSXMemberExpression(node)) return `${jsxElementNameToString(node.object)}.${node.property.name}`
  if (t.isJSXIdentifier(node) || t.isIdentifier(node)) return node.name
  return `${node.namespace.name}:${node.name.name}`
}

export function getTagName(tag: any): string {
  return jsxElementNameToString(tag.openingElement.name)
}

export function isComponent(tagName: string): boolean {
  return ((tagName[0] && tagName[0].toLowerCase() !== tagName[0]) || tagName.includes('.') || /[^a-zA-Z]/.test(tagName[0]))
}

export function filterChildren(children: any[]): any[] {
  return children.filter(({ node: child }) => !(t.isJSXExpressionContainer(child) && t.isJSXEmptyExpression(child.expression)) && (!t.isJSXText(child) || !/^[\r\n]\s*$/.test(child.extra.raw)))
}

export function trimWhitespace(text: string): string {
  text = text.replace(/\r/g, '')
  if (/\n/g.test(text)) {
    text = text.split('\n').map((v, i) => (i ? v.replace(/^\s*/g, '') : v)).filter(s => !/^\s*$/.test(s)).join(' ')
  }
  return text.replace(/\s+/g, ' ')
}

export function escapeHTML(s: any, attr?: boolean): any {
  if (typeof s !== 'string') return s
  const delim = attr ? '"' : '<'
  const escDelim = attr ? '&quot;' : '&lt;'
  let iDelim = s.indexOf(delim)
  let iAmp = s.indexOf('&')
  if (iDelim < 0 && iAmp < 0) return s
  let left = 0
  let out = ''
  while (iDelim >= 0 && iAmp >= 0) {
    if (iDelim < iAmp) {
      if (left < iDelim) out += s.substring(left, iDelim)
      out += escDelim
      left = iDelim + 1
      iDelim = s.indexOf(delim, left)
    } else {
      if (left < iAmp) out += s.substring(left, iAmp)
      out += '&amp;'
      left = iAmp + 1
      iAmp = s.indexOf('&', left)
    }
  }
  return left < s.length ? out + s.substring(left) : out
}

export function isDynamic(path: any, { checkMember, checkTags, checkCallExpressions = true }: any): boolean {
  const expr = path.node
  if (t.isFunction(expr)) return false
  if (checkCallExpressions && (t.isCallExpression(expr) || t.isOptionalCallExpression(expr) || t.isTaggedTemplateExpression(expr))) return true
  if (checkMember && (t.isMemberExpression(expr) || t.isOptionalMemberExpression(expr) || t.isSpreadElement(expr))) return true
  if (checkTags && (t.isJSXElement(expr) || (t.isJSXFragment(expr) && expr.children.length))) return true
  return false
}

export function getStaticExpression(path: any): any {
  const node = path.node
  let value
  let type
  return t.isJSXExpressionContainer(node) && t.isJSXElement(path.parent) && !isComponent(getTagName(path.parent))
    && !t.isSequenceExpression(node.expression) && (value = path.get('expression').evaluate().value) !== undefined
    && ((type = typeof value) === 'string' || type === 'number') && value
}

export function transformCondition(path: any): any {
  return t.arrowFunctionExpression([], path.node)
}

export function convertJSXIdentifier(node: any): any {
  if (t.isJSXIdentifier(node)) {
    if (t.isValidIdentifier(node.name)) node.type = 'Identifier'
    else return t.stringLiteral(node.name)
  } else if (t.isJSXMemberExpression(node)) {
    return t.memberExpression(convertJSXIdentifier(node.object), convertJSXIdentifier(node.property))
  } else if (t.isJSXNamespacedName(node)) {
    return t.stringLiteral(`${node.namespace.name}:${node.name.name}`)
  }
  return node
}

export function toEventName(name: string): string {
  return name.slice(2).toLowerCase()
}

export function toAttributeName(name: string): string {
  return name.replace(/([A-Z])/g, g => `-${g[0].toLowerCase()}`)
}

export function toPropertyName(name: string): string {
  return name.toLowerCase().replace(/-([a-z])/g, (_m, w) => w.toUpperCase())
}

export function hasStaticMarker(object: any, path: any): boolean {
  if (!object) return false
  if (
    object.leadingComments &&
    object.leadingComments[0] &&
    object.leadingComments[0].value.trim() === getConfig(path).staticMarker
  ) {
    return true
  }
  if (object.expression) return hasStaticMarker(object.expression, path)
  return false
}

export function wrappedByText(list: any[], startIndex: number): boolean {
  let index = startIndex
  let wrapped = false
  while (--index >= 0) {
    const node = list[index]
    if (!node) continue
    if (node.text) {
      wrapped = true
      break
    }
    if (node.id) return false
  }
  if (!wrapped) return false
  index = startIndex
  while (++index < list.length) {
    const node = list[index]
    if (!node) continue
    if (node.text) return true
    if (node.id) return false
  }
  return false
}

const chars = 'etaoinshrdlucwmfygpbTAOISWCBvkxjqzPHFMDRELNGUKVYJQZX_$'
const base = chars.length

export function getNumberedId(num: number): string {
  let out = ''
  do {
    const digit = num % base
    num = Math.floor(num / base)
    out = chars[digit] + out
  } while (num !== 0)
  return out
}

const templateEscapes = new Map([
  ['{', '\\{'],
  ['`', '\\`'],
  ['\\', '\\\\'],
  ['\n', '\\n'],
  ['\t', '\\t'],
  ['\b', '\\b'],
  ['\f', '\\f'],
  ['\v', '\\v'],
  ['\r', '\\r'],
  ['\u2028', '\\u2028'],
  ['\u2029', '\\u2029'],
])

export function escapeStringForTemplate(str: string): string {
  return str.replace(/[{\\`\n\t\b\f\v\r\u2028\u2029]/g, ch => templateEscapes.get(ch) as string)
}

export function checkLength(children: any[]): boolean {
  let i = 0
  children.forEach(path => {
    const child = path.node
    if (
      !(t.isJSXExpressionContainer(child) && t.isJSXEmptyExpression(child.expression)) &&
      (!t.isJSXText(child) || !/^\s*$/.test(child.extra.raw) || /^ *$/.test(child.extra.raw))
    ) {
      i++
    }
  })
  return i > 1
}

export function evaluateAndInline(value: any, valueNode: any): void {
  if (t.isJSXExpressionContainer(value)) {
    evaluateAndInline(value.expression, valueNode.get('expression'))
  } else if (t.isObjectProperty(value)) {
    evaluateAndInline(value.value, valueNode.get('value'))
  } else if (
    t.isStringLiteral(value) ||
    t.isNumericLiteral(value) ||
    t.isBooleanLiteral(value) ||
    t.isNullLiteral(value)
  ) {
    return
  } else if (t.isObjectExpression(value)) {
    const properties = value.properties
    const propertiesNode = valueNode.get('properties')
    for (let i = 0; i < properties.length; i++) {
      evaluateAndInline(properties[i], propertiesNode[i])
    }
  } else {
    const r = valueNode.evaluate()
    if (r.confident) {
      if (typeof r.value === 'string') valueNode.replaceWith(t.stringLiteral(r.value))
      else if (typeof r.value === 'number') valueNode.replaceWith(t.numericLiteral(r.value))
      else if (typeof r.value === 'boolean') valueNode.replaceWith(t.booleanLiteral(r.value))
    }
  }
}

export function canNativeSpread(key: string, { checkNameSpaces }: { checkNameSpaces?: boolean } = {}): boolean {
  if (checkNameSpaces && key.includes(':') && nonSpreadNameSpaces.has(key.split(':')[0])) return false
  if (key === 'ref') return false
  return true
}
