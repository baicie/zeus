/**
 * The Playground's localization surface.
 *
 * The runtime lives in `@zeus-js/i18n`; this module is the Playground's
 * adapter over it, not a second implementation. Every export that existed
 * before the migration still exists with the same shape, because a dozen call
 * sites depend on `t` / `msg` / `formatMessage` and none of them should have to
 * change to gain ICU plurals and correct plural rules.
 *
 * Two things changed underneath:
 *
 * - the locale identity is `en` / `zh-CN` (BCP 47) rather than `en` / `zh`.
 *   Stored preferences that still say `zh` are upgraded on read, so an
 *   existing user keeps Chinese instead of silently reverting to English.
 * - the plural special case for `status.compileFailedCount` is gone. It was a
 *   `count === 1` branch hand-written for English; the catalog now carries an
 *   ICU plural and the runtime asks `Intl.PluralRules` — which is what makes a
 *   language with three plural forms work later without touching this file.
 */

import { createI18n, resolveLocale, type Locale } from '@zeus-js/i18n'

import { en, type PlaygroundMessageKey } from './locales/en'
import { zhCN } from './locales/zh-CN'

/** `en` / `zh-CN`; `zh` is accepted on read and mapped to `zh-CN`. */
export type PlaygroundLocale = Locale

export type MessageKey = PlaygroundMessageKey

export type MessageParams = Readonly<Record<string, string | number>>

/**
 * Keys whose Chinese text is deliberately the same as English.
 *
 * Product names and protocol terms: translating "WebC" or "Shadow" would
 * invent a word the documentation, the code and the browser all call by its
 * English name. Declared here so the runtime does not warn about them, and
 * mirrored in `scripts/check/check-i18n.ts` so CI reviews the list.
 */
const IDENTICAL_BY_DESIGN = [
  'html.title',
  'html.titleWebc',
  'html.titleNative',
  'title.nativeLab',
  'title.webcStudio',
  'product.native',
  'product.webc',
  'example.native',
  'example.webc',
  'inspector.light',
  'inspector.shadow',
  'inspector.manifest',
  'output.pill',
  'example.nativeHello.title',
  'example.nativeShowFor.title',
  'example.nativeRouterQuery.title',
  'example.webcShadow.title',
] as const

const i18n = createI18n({
  messages: { en, 'zh-CN': zhCN },
  initialLocale: 'en',
  // The controller mirrors `document.documentElement.lang` itself, because it
  // also has to restore it before first paint from a stored preference.
  syncDocumentLang: false,
  // Product names and protocol terms are identical in both languages on
  // purpose; listing them keeps the review list honest.
  allowIdenticalKeys: IDENTICAL_BY_DESIGN,
})

/**
 * The active locale, as a reactive accessor.
 *
 * `setLocale` keeps the synchronous signature the controller relied on: it
 * starts the switch and returns, and the catalog is already bundled so the
 * commit happens in the same tick. The async form on the shared runtime exists
 * for applications that load catalogs over the network; the Playground does
 * not.
 */
export const locale = i18n.locale

export function setLocale(value: PlaygroundLocale): void {
  void i18n.setLocale(value)
}

export function isPlaygroundLocale(value: unknown): value is PlaygroundLocale {
  return value === 'en' || value === 'zh-CN' || value === 'zh'
}

/**
 * Normalizes a stored or externally supplied value to a supported locale.
 *
 * `zh` is the value written by earlier versions. Mapping it here — rather than
 * rejecting it — is what lets an existing preference survive the migration.
 */
export function normalizePlaygroundLocale(value: unknown): PlaygroundLocale {
  if (typeof value !== 'string') return 'en'
  return resolveLocale(value) ?? 'en'
}

export function t(key: MessageKey, params?: MessageParams): string {
  return i18n.t(key, params)
}

/**
 * Renders a message in a specific locale without switching the active one.
 *
 * Used by the export/screenshot paths, which must render the locale the user
 * asked for rather than whichever one the UI is currently showing.
 */
export function translate(
  target: PlaygroundLocale,
  key: MessageKey,
  params?: MessageParams,
): string {
  const active = i18n.locale()
  if (target === active) return i18n.t(key, params)
  // Compiled on demand from the same catalogs; no second runtime instance, so
  // the formatter cache and plural rules are shared.
  const catalog = target === 'zh-CN' ? zhCN : en
  const template = (catalog as Record<string, string>)[key]
  if (template === undefined) return key
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}

/**
 * Runtime state keeps a message descriptor instead of a rendered string so a
 * language switch re-renders status lines, toasts and preview states without a
 * rebuild or reload. Compiler output and other untranslatable text uses the
 * `text` form.
 */
export type UiMessage =
  | { readonly key: MessageKey; readonly params?: MessageParams }
  | { readonly text: string }

export function msg(key: MessageKey, params?: MessageParams): UiMessage {
  return params === undefined ? { key } : { key, params }
}

export function raw(text: string): UiMessage {
  return { text }
}

/** Reactive: reads the locale, so callers inside JSX update on switch. */
export function formatMessage(value: UiMessage): string {
  return 'text' in value ? value.text : t(value.key, value.params)
}
