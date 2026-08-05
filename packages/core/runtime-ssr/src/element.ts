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
    assertSyncSSRValue(attribute.value)
    html += ` ${attribute.name}`
    if (attribute.value !== true) {
      html += `="${escapeHTMLAttribute(attribute.value)}"`
    }
  }

  return html
}

function normalizeAttributeName(name: string): string {
  return name === 'className' ? 'class' : name
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
