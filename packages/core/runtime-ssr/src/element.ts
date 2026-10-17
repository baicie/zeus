import { normalizeDOMAttributeName } from '@zeus-js/shared'

import { createSSRProperty, resolveSSRElementProperties } from './property'
import {
  createSSRFragment,
  assertSyncSSRValue,
  escapeHTMLAttribute,
  serializeSSRNode,
  serializeSSRRawText,
} from './serialize'

import type {
  SSRAttribute,
  SSRAttributeEntry,
  SSRAttributeValue,
  SSRClassValue,
  SSRFragment,
  SSRNode,
  SSRStyleValue,
} from './types'

const VOID_ELEMENTS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
])

export function ssrElement(
  tag: string,
  attributes: readonly SSRAttributeEntry[] = [],
  children: SSRNode = null,
  isVoid = VOID_ELEMENTS.has(tag.toLowerCase()),
): SSRFragment {
  const resolved = resolveSSRElementProperties(tag, attributes, children)
  const opening = `<${tag}${serializeAttributes(resolved.attributes)}>`
  if (isVoid) return createSSRFragment(opening)
  const normalizedTag = tag.toLowerCase()
  const content =
    normalizedTag === 'script' || normalizedTag === 'style'
      ? serializeSSRRawText(resolved.children, normalizedTag)
      : serializeSSRNode(resolved.children)
  return createSSRFragment(`${opening}${content}</${tag}>`)
}

export function ssrAttr(
  name: string,
  value: SSRAttributeValue | SSRClassValue | SSRStyleValue,
): SSRAttributeEntry {
  assertSyncSSRValue(value)
  const normalizedName = normalizeAttributeName(name)
  assertSSRAttributeName(normalizedName)
  if (typeof value === 'function') {
    throw new TypeError(
      `JSX attribute "${name}" cannot contain a function; use prop:${name} for function values.`,
    )
  }
  if (normalizedName === 'class') {
    const normalized = normalizeClass(value as SSRClassValue)
    return normalized ? createSSRAttribute('class', normalized) : null
  }
  if (normalizedName === 'style') {
    return createStyleAttribute(value as SSRStyleValue)
  }
  if (value == null || value === false) return null
  return createSSRAttribute(
    normalizedName,
    value === true ? true : String(value),
  )
}

function createStyleAttribute(value: SSRStyleValue): SSRAttributeEntry {
  assertSyncSSRValue(value)
  if (value == null) return null
  if (typeof value === 'string') return createSSRAttribute('style', value)

  const declarations: string[] = []
  for (const [key, declarationValue] of Object.entries(value)) {
    assertSyncSSRValue(declarationValue)
    if (declarationValue == null) continue
    declarations.push(
      `${normalizeStyleName(key)}:${normalizeStyleValue(key, declarationValue)}`,
    )
  }

  return declarations.length
    ? createSSRAttribute('style', declarations.join(';'))
    : null
}

export function ssrProp(name: string, value: unknown): SSRAttributeEntry {
  return createSSRProperty(name, value)
}

function createSSRAttribute(name: string, value: string | true): SSRAttribute {
  return { name, value }
}

function serializeAttributes(attributes: readonly SSRAttributeEntry[]): string {
  let html = ''

  for (const attribute of attributes) {
    assertSyncSSRValue(attribute)
    if (!attribute) continue
    assertSSRAttributeName(attribute.name)
    assertSyncSSRValue(attribute.value)
    html += ` ${attribute.name}`
    if (attribute.value !== true) {
      html += `="${escapeHTMLAttribute(attribute.value)}"`
    }
  }

  return html
}

const XML_NAME_START =
  /^[:A-Z_a-z\u00c0-\u00d6\u00d8-\u00f6\u00f8-\u02ff\u0370-\u037d\u037f-\u1fff\u200c-\u200d\u2070-\u218f\u2c00-\u2fef\u3001-\ud7ff\uf900-\ufdcf\ufdf0-\ufffd]$/
const XML_NAME_EXTRA = /^[-.0-9\u00b7\u0300-\u036f\u203f-\u2040]$/

// DOM setAttribute validates XML Names. SSR has no DOM available, so apply
// the same code-point grammar before interpolating an attribute name.
function assertSSRAttributeName(name: string): void {
  let first = true
  for (const character of name) {
    const point = character.codePointAt(0)!
    const start =
      XML_NAME_START.test(character) || (point >= 0x10000 && point <= 0xeffff)
    if (!start && (first || !XML_NAME_EXTRA.test(character))) {
      throw new TypeError(
        `Invalid SSR attribute name: ${JSON.stringify(name)}.`,
      )
    }
    first = false
  }
  if (first) throw new TypeError('Invalid SSR attribute name: "".')
}

function normalizeAttributeName(name: string): string {
  return normalizeDOMAttributeName(name)
}

function normalizeClass(value: SSRClassValue): string {
  assertSyncSSRValue(value)
  if (!value) return ''
  if (typeof value === 'string') return value

  if (Array.isArray(value)) {
    return value.map(normalizeClass).filter(Boolean).join(' ')
  }

  const tokens = value as Readonly<Record<string, boolean | null | undefined>>
  return Object.keys(tokens)
    .filter(key => {
      assertSyncSSRValue(tokens[key])
      return tokens[key]
    })
    .join(' ')
}

function normalizeStyleName(name: string): string {
  if (name.startsWith('--')) return name
  return name.replace(/[A-Z]/g, character => `-${character.toLowerCase()}`)
}

function normalizeStyleValue(name: string, value: string | number): string {
  if (
    typeof value === 'number' &&
    value !== 0 &&
    !name.startsWith('--') &&
    !UNITLESS_STYLES.has(name)
  ) {
    return `${value}px`
  }

  return String(value)
}

const UNITLESS_STYLES = new Set([
  'opacity',
  'zIndex',
  'fontWeight',
  'lineHeight',
  'flex',
  'flexGrow',
  'flexShrink',
  'order',
])
