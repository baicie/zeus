import type { SSRFragment, SSRNode } from './types'

const SSR_FRAGMENT = Symbol.for('zeus.ssr.fragment')
const RAW_TEXT_END_TAG = {
  script: /<\/script(?=[\t\n\f\r />]|$)/gi,
  style: /<\/style(?=[\t\n\f\r />]|$)/gi,
} satisfies Record<SSRRawTextTag, RegExp>
const RAW_TEXT_ESCAPE = {
  script: '\\u003C',
  style: '\\3C ',
} satisfies Record<SSRRawTextTag, string>

export type SSRRawTextTag = 'script' | 'style'

export function createSSRFragment(html: string): SSRFragment {
  return Object.freeze({
    [SSR_FRAGMENT]: true,
    html,
  }) as unknown as SSRFragment
}

function isSSRFragment(value: unknown): value is SSRFragment {
  return (
    typeof value === 'object' &&
    value !== null &&
    (value as Record<PropertyKey, unknown>)[SSR_FRAGMENT] === true
  )
}

export function escapeHTMLText(value: string): string {
  return value.replace(/[&<>]/g, character => TEXT_ESCAPE[character])
}

export function escapeHTMLAttribute(value: string): string {
  return value.replace(/[&"<>]/g, character => ATTRIBUTE_ESCAPE[character])
}

export function assertSyncSSRValue(value: unknown): void {
  if (!isPromiseLike(value)) return

  void Promise.resolve(value).catch(() => {})
  throw new TypeError('renderToString() does not support async render values.')
}

const TEXT_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
}

const ATTRIBUTE_ESCAPE: Record<string, string> = {
  '&': '&amp;',
  '"': '&quot;',
  '<': '&lt;',
  '>': '&gt;',
}

export function serializeSSRNode(value: SSRNode): string {
  assertSyncSSRValue(value)

  if (isSSRFragment(value)) return value.html

  if (Array.isArray(value)) {
    let html = ''
    for (const child of value) html += serializeSSRNode(child)
    return html
  }

  if (value == null || typeof value === 'boolean') return ''
  if (typeof value === 'string') return escapeHTMLText(value)
  if (typeof value === 'number') return String(value)
  throw new TypeError('renderToString() received an unsupported SSR value.')
}

export function serializeSSRRawText(
  value: SSRNode,
  tag: SSRRawTextTag,
): string {
  return escapeSSRRawText(serializeSSRRawTextValue(value, tag), tag)
}

function serializeSSRRawTextValue(value: SSRNode, tag: SSRRawTextTag): string {
  assertSyncSSRValue(value)

  if (isSSRFragment(value)) {
    throw new TypeError(
      `renderToString() does not support serialized fragments inside <${tag}> raw text.`,
    )
  }

  if (Array.isArray(value)) {
    let text = ''
    for (const child of value) text += serializeSSRRawTextValue(child, tag)
    return text
  }

  if (value == null || typeof value === 'boolean') return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  throw new TypeError('renderToString() received an unsupported SSR value.')
}

function escapeSSRRawText(value: string, tag: SSRRawTextTag): string {
  if (tag === 'script') return escapeSSRScriptText(value)

  return value.replace(
    RAW_TEXT_END_TAG[tag],
    match => `${RAW_TEXT_ESCAPE[tag]}${match.slice(1)}`,
  )
}

function escapeSSRScriptText(value: string): string {
  let escaped = false
  let result = ''

  for (let index = 0; index < value.length; ) {
    if (matchesRawTextTag(value, index, 'script', true)) {
      result += `${RAW_TEXT_ESCAPE.script}${value.slice(index + 1, index + 8)}`
      index += 8
      continue
    }

    if (!escaped && value.startsWith('<!--', index)) {
      result += '<!--'
      escaped = true
      index += 4
      continue
    }

    if (escaped && value.startsWith('-->', index)) {
      result += '-->'
      escaped = false
      index += 3
      continue
    }

    if (escaped && matchesRawTextTag(value, index, 'script', false)) {
      result += `${RAW_TEXT_ESCAPE.script}${value.slice(index + 1, index + 7)}`
      index += 7
      continue
    }

    result += value[index]
    index++
  }

  return result
}

function matchesRawTextTag(
  value: string,
  index: number,
  tag: SSRRawTextTag,
  closing: boolean,
): boolean {
  const prefix = `${closing ? '</' : '<'}${tag}`
  if (value.slice(index, index + prefix.length).toLowerCase() !== prefix) {
    return false
  }

  const delimiter = value[index + prefix.length]
  return delimiter === undefined || /[\t\n\f\r />]/.test(delimiter)
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}
