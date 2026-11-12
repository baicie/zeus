/**
 * Message formatting and Intl formatter caching.
 *
 * A compiled ICU message is an object graph; parsing one per render would put
 * the parse cost inside every reactive update, and an SSE stream re-renders the
 * same message many times per second. Caches are keyed by locale and template
 * text, and bounded so a session with many distinct messages cannot grow
 * without limit.
 *
 * Formatters are locale-scoped by construction: a cache entry never outlives
 * its locale, so switching languages cannot reuse an English formatter.
 */

import { IntlMessageFormat } from 'intl-messageformat'

import type { Locale } from './locale'
import type { MessageParams } from './message'

/** Compiled messages retained per locale before the oldest is dropped. */
const MESSAGE_CACHE_LIMIT = 500
/** Distinct option sets retained per formatter kind and locale. */
const FORMATTER_CACHE_LIMIT = 32

const messageCache = new Map<string, IntlMessageFormat>()
const numberFormatters = new Map<string, Intl.NumberFormat>()
const dateFormatters = new Map<string, Intl.DateTimeFormat>()
const relativeFormatters = new Map<string, Intl.RelativeTimeFormat>()

/**
 * Inserts into a bounded map, evicting the oldest entry.
 *
 * `Map` preserves insertion order and `keys().next()` gives the oldest, which
 * is enough here: the access pattern is "many messages, a stable hot set", and
 * a true LRU would need bookkeeping that costs more than it saves.
 */
function remember<T>(cache: Map<string, T>, key: string, value: T): T {
  if (cache.size >= MESSAGE_CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
  cache.set(key, value)
  return value
}

function rememberFormatter<T>(cache: Map<string, T>, key: string, value: T): T {
  if (cache.size >= FORMATTER_CACHE_LIMIT) {
    const oldest = cache.keys().next()
    if (!oldest.done) cache.delete(oldest.value)
  }
  cache.set(key, value)
  return value
}

/**
 * Compiles `template` for `locale`, tolerating a malformed message.
 *
 * An invalid ICU string is a content bug, and CI rejects it (see
 * `checkMessageSyntax`), but a bad catalog shipped to production must not take
 * the page down. The fallback interpolates the raw template so the visible
 * result is the author's text with values filled in, not a crash and not a raw
 * key.
 */
export function formatIcuMessage(
  locale: Locale,
  template: string,
  params: MessageParams | undefined,
  onInvalid?: (locale: Locale, template: string, error: Error) => void,
): string {
  const cacheKey = `${locale}\u0000${template}`
  let formatter = messageCache.get(cacheKey)

  if (!formatter) {
    try {
      formatter = remember(
        messageCache,
        cacheKey,
        new IntlMessageFormat(template, locale),
      )
    } catch (cause) {
      onInvalid?.(
        locale,
        template,
        cause instanceof Error ? cause : new Error(String(cause)),
      )
      return fallbackInterpolate(template, params)
    }
  }

  try {
    const output = formatter.format(params)
    return Array.isArray(output) ? output.join('') : String(output)
  } catch (cause) {
    // Arguments the message did not expect, or a missing one it did. Showing
    // the template is better than rendering "undefined".
    onInvalid?.(
      locale,
      template,
      cause instanceof Error ? cause : new Error(String(cause)),
    )
    return fallbackInterpolate(template, params)
  }
}

function fallbackInterpolate(
  template: string,
  params: MessageParams | undefined,
): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

/** Stable cache key for an options object; key order does not matter. */
function optionsKey(options: object | undefined): string {
  if (!options) return ''
  const entries = Object.entries(options)
    .filter(([, value]) => value !== undefined)
    .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
  return JSON.stringify(entries)
}

export function formatNumber(
  locale: Locale,
  value: number,
  options?: Intl.NumberFormatOptions,
): string {
  const key = `${locale}\u0000${optionsKey(options)}`
  const formatter =
    numberFormatters.get(key) ??
    rememberFormatter(
      numberFormatters,
      key,
      new Intl.NumberFormat(locale, options),
    )
  return formatter.format(value)
}

export function formatDate(
  locale: Locale,
  value: Date | number,
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = value instanceof Date ? value : new Date(value)
  // `new Date('nonsense')` yields an Invalid Date, which `Intl` formats as
  // "Invalid Date" instead of throwing. Callers get a stable string so a bad
  // timestamp cannot break a table row.
  if (Number.isNaN(date.getTime())) return ''
  const key = `${locale}\u0000${optionsKey(options)}`
  const formatter =
    dateFormatters.get(key) ??
    rememberFormatter(
      dateFormatters,
      key,
      new Intl.DateTimeFormat(locale, options),
    )
  return formatter.format(date)
}

export function formatRelative(
  locale: Locale,
  value: number,
  unit: Intl.RelativeTimeFormatUnit,
  options?: Intl.RelativeTimeFormatOptions,
): string {
  const key = `${locale}\u0000${optionsKey(options)}`
  const formatter =
    relativeFormatters.get(key) ??
    rememberFormatter(
      relativeFormatters,
      key,
      new Intl.RelativeTimeFormat(locale, { numeric: 'auto', ...options }),
    )
  return formatter.format(value, unit)
}

/**
 * Parses a message without formatting it, for CI syntax checks.
 *
 * Returns the error instead of throwing so a checker can report every bad
 * message in one run rather than stopping at the first.
 */
export function checkMessageSyntax(
  locale: Locale,
  template: string,
): Error | undefined {
  try {
    new IntlMessageFormat(template, locale)
    return undefined
  } catch (cause) {
    return cause instanceof Error ? cause : new Error(String(cause))
  }
}

/**
 * Placeholder names a message requires, from its compiled AST.
 *
 * CI compares this set across locales: a Chinese message that drops `{count}`
 * renders "位用户" with no number, and no amount of type checking on the key
 * alone would catch it.
 */
export function messageArgumentNames(
  locale: Locale,
  template: string,
): readonly string[] {
  try {
    const formatter = new IntlMessageFormat(template, locale)
    // AST node types: 0 is literal text, 7 is `#` inside a plural branch.
    // Everything else names an argument. Filtering on `'value' in node` alone
    // would treat a plain sentence as one argument whose name is the sentence.
    return formatter
      .getAst()
      .filter(node => node.type !== 0 && node.type !== 7)
      .map(node => ('value' in node ? String(node.value) : ''))
      .filter(name => name.length > 0)
  } catch {
    return []
  }
}

/** Drops every compiled message and formatter. Used between tests. */
export function clearFormatterCaches(): void {
  messageCache.clear()
  numberFormatters.clear()
  dateFormatters.clear()
  relativeFormatters.clear()
}
