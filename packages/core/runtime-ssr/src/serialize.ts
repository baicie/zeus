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

export function createSSRFragment(
  html: string,
  slotName?: string,
): SSRFragment {
  return Object.freeze({
    [SSR_FRAGMENT]: true,
    html,
    ...(slotName === undefined ? {} : { slotName }),
  }) as unknown as SSRFragment
}

/** Serializes an HTML comment from a static, compiler-owned marker name. */
export function ssrMarkerComment(data: string): SSRFragment {
  if (data.includes('--') || data.includes('>')) {
    throw new TypeError(`Invalid SSR comment marker: ${JSON.stringify(data)}.`)
  }
  return createSSRFragment(`<!--${data}-->`)
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
  let html = ''
  for (const chunk of serializeSSRNodeChunks(value, Number.POSITIVE_INFINITY)) {
    html += chunk
  }
  return html
}

/**
 * Yields the serialized HTML of one node in pieces of at least `flushAt`
 * characters.
 *
 * Escaping runs before chunking, so a chunk never contains an unescaped value
 * or a half-applied raw-text rewrite. A single node larger than `flushAt` is
 * split into equal pieces: chunks are transport units of one byte stream, so a
 * consumer must concatenate them before parsing. `Infinity` yields exactly one
 * piece.
 */
export function* serializeSSRNodeChunks(
  value: SSRNode,
  flushAt: number,
): Generator<string, void, undefined> {
  assertSyncSSRValue(value)

  if (isSSRFragment(value)) {
    yield* chunkFragment(value.html, flushAt)
    return
  }

  if (Array.isArray(value)) {
    let buffer = ''
    for (const child of value) {
      for (const chunk of serializeSSRNodeChunks(child, flushAt)) {
        buffer += chunk
        if (buffer.length >= flushAt) {
          yield buffer
          buffer = ''
        }
      }
    }
    if (buffer) yield buffer
    return
  }

  if (value == null || typeof value === 'boolean') return
  if (typeof value === 'string') {
    yield escapeHTMLText(value)
    return
  }
  if (typeof value === 'number') {
    yield String(value)
    return
  }
  throw new TypeError('renderToString() received an unsupported SSR value.')
}

function* chunkFragment(
  html: string,
  flushAt: number,
): Generator<string, void, undefined> {
  if (!Number.isFinite(flushAt) || flushAt <= 0 || html.length <= flushAt) {
    yield html
    return
  }

  const size = Math.max(1, Math.floor(flushAt))
  for (let start = 0; start < html.length; ) {
    let end = Math.min(start + size, html.length)
    if (end < html.length) {
      const code = html.charCodeAt(end - 1)
      // Do not split a UTF-16 surrogate pair across transport chunks.
      if (code >= 0xd800 && code <= 0xdbff) end += 1
    }
    yield html.slice(start, end)
    start = end
  }
}

/**
 * Serializes children of a raw-text tag name that is *not* parsed as HTML raw
 * text, such as `<style>` inside SVG or MathML. CSS escapes are not honored
 * there, so the content uses ordinary text escaping instead.
 */
export function serializeSSRForeignText(
  value: SSRNode,
  tag: SSRRawTextTag,
): string {
  return serializeSSRTextValue(value, tag)
}

function serializeSSRTextValue(value: SSRNode, tag: SSRRawTextTag): string {
  assertSyncSSRValue(value)

  if (isSSRFragment(value)) {
    throw new TypeError(
      `renderToString() does not support serialized fragments inside <${tag}> text.`,
    )
  }

  if (Array.isArray(value)) {
    let text = ''
    for (const child of value) text += serializeSSRTextValue(child, tag)
    return escapeHTMLText(text)
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
