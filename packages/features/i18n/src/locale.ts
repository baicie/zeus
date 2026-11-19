/**
 * Locale identity and negotiation.
 *
 * The supported set is deliberately closed: a locale this package does not have
 * a catalog for must resolve to one it does, rather than half-render. Adding a
 * language later means adding a catalog and an entry here — never widening the
 * type to `string`, which would let a typo become a silent fallback.
 */

/** Locales with a bundled catalog. The first is the default fallback. */
export const SUPPORTED_LOCALES = ['en', 'zh-CN'] as const

export type Locale = (typeof SUPPORTED_LOCALES)[number]

export const DEFAULT_LOCALE: Locale = 'en'

/**
 * Aliases written by older builds and by browsers.
 *
 * `zh` is what the Playground persisted before this package existed; keeping the
 * mapping means an existing user's stored preference still selects Chinese
 * instead of silently resetting to English. Regional Chinese is mapped only
 * where the script is unambiguous: `zh-TW` / `zh-HK` are Traditional and are
 * *not* treated as Simplified — they fall through to the default rather than
 * showing Simplified text to someone who asked for Traditional.
 */
const ALIASES: Readonly<Record<string, Locale>> = {
  en: 'en',
  'en-us': 'en',
  'en-gb': 'en',
  'en-au': 'en',
  'en-ca': 'en',
  zh: 'zh-CN',
  'zh-cn': 'zh-CN',
  'zh-hans': 'zh-CN',
  'zh-sg': 'zh-CN',
  'zh-my': 'zh-CN',
}

/**
 * Resolves any BCP 47 tag to a supported locale, or `undefined`.
 *
 * Returns `undefined` rather than falling back so the caller can distinguish
 * "the user asked for this and we chose it" from "we had no catalog and fell
 * back". Both end at a supported locale, but only the first should persist.
 */
export function resolveLocale(
  input: string | undefined | null,
): Locale | undefined {
  if (!input) return undefined
  const normalized = input.trim().toLowerCase().replace(/_/g, '-')
  if (normalized.length === 0) return undefined
  return ALIASES[normalized]
}

/** Resolves, or returns the default when nothing matched. */
export function normalizeLocale(input: string | undefined | null): Locale {
  return resolveLocale(input) ?? DEFAULT_LOCALE
}

/**
 * Picks the first supported locale from a preference list.
 *
 * Order is respected exactly: `['ja', 'zh-CN']` yields `zh-CN`, and
 * `['zh-TW', 'en']` yields `en` — a Traditional request falls past Simplified
 * to the next candidate rather than being coerced into it.
 */
export function negotiateLocale(
  candidates: readonly string[] | undefined | null,
): Locale | undefined {
  if (!candidates) return undefined
  for (const candidate of candidates) {
    const resolved = resolveLocale(candidate)
    if (resolved) return resolved
  }
  return undefined
}

export function isSupportedLocale(value: unknown): value is Locale {
  return (
    typeof value === 'string' &&
    (SUPPORTED_LOCALES as readonly string[]).includes(value)
  )
}

/**
 * Reflects the active locale on `<html lang>`.
 *
 * Accessibility tools and the browser's own hyphenation read this attribute;
 * leaving it at the document's original value while the UI renders Chinese
 * makes a screen reader announce Chinese text with an English voice. No-ops
 * outside a document (SSR, tests).
 */
export function applyDocumentLocale(locale: Locale): void {
  if (typeof document === 'undefined') return
  document.documentElement.lang = locale
}
