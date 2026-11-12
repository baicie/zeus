/**
 * The i18n runtime.
 *
 * One `createI18n()` call yields an isolated instance: its own locale signal,
 * its own catalogs, its own formatters. Nothing is module-global, so two
 * instances can render different languages in the same page (a settings
 * preview) and a server can hold one per request.
 *
 * Switching locale is atomic. A new catalog is loaded and validated on its own,
 * and only then is the reactive locale committed — so no render ever observes
 * a half-applied language, and a failed load leaves the previous language
 * intact rather than showing keys.
 */

import { batch, createSignal } from '@zeus-js/signal'

import {
  checkMessageSyntax,
  formatDate,
  formatIcuMessage,
  formatNumber,
  formatRelative,
  messageArgumentNames,
} from './formatters'
import {
  applyDocumentLocale,
  DEFAULT_LOCALE,
  isSupportedLocale,
  type Locale,
  SUPPORTED_LOCALES,
} from './locale'
import {
  assertCatalog,
  interpolate,
  type MessageCatalog,
  type MessageDescriptor,
  type MessageParams,
} from './message'

/** Lifecycle of the active catalog. */
export type I18nStatus = 'ready' | 'loading' | 'error'

export interface I18nEvents {
  /** A key missing from the active catalog and its fallback. */
  onMissingKey?: (locale: Locale, key: string) => void
  /** A catalog failed to load; the previous locale stays active. */
  onLoadError?: (locale: Locale, error: Error) => void
  /** A message failed to compile or format; raw text was shown instead. */
  onInvalidMessage?: (locale: Locale, template: string, error: Error) => void
}

export interface CreateI18nOptions<K extends string> extends I18nEvents {
  /**
   * Catalogs available synchronously.
   *
   * The reference locale must be here regardless of how the app loads the
   * others: it is the fallback every render depends on, and a fallback that
   * arrives asynchronously would let the first paint show raw keys.
   */
  readonly messages: Partial<Record<Locale, MessageCatalog<K>>> & {
    readonly en: MessageCatalog<K>
  }
  /** Initial locale; defaults to `en`. */
  readonly initialLocale?: Locale
  /** Locale used when a key is missing or a load fails. Defaults to `en`. */
  readonly fallbackLocale?: Locale
  /**
   * Loads a catalog that is not in `messages`.
   *
   * Called at most once per locale unless a previous attempt failed — a
   * rejected load is not cached, so a retry is possible.
   */
  readonly loadCatalog?: (locale: Locale) => Promise<MessageCatalog<K>>
  /** Mirrors the active locale onto `<html lang>`. Defaults to `true`. */
  readonly syncDocumentLang?: boolean
  /**
   * Rejects a catalog whose key set differs from the reference.
   *
   * On by default in development. In production a malformed catalog still
   * renders — the missing messages fall back to the reference language — so a
   * content mistake degrades instead of blanking the page.
   */
  readonly strictCatalogs?: boolean
}

export interface I18n<K extends string> {
  /** The active locale. Reading it inside a render subscribes to changes. */
  readonly locale: () => Locale
  /** `ready` unless a `setLocale` is in flight or the last one failed. */
  readonly status: () => I18nStatus
  /** The error from the last failed `setLocale`, if any. */
  readonly error: () => Error | undefined

  /**
   * Switches the active locale.
   *
   * Resolves once the new catalog is active. Rejects if it could not be
   * loaded, leaving the previous locale in place. Concurrent calls resolve to
   * the last request made, not the last to finish.
   */
  setLocale(locale: Locale): Promise<void>
  /** Pre-loads a catalog without switching to it. */
  preload(locale: Locale): Promise<void>

  t(key: K, params?: MessageParams): string
  /** Captures a message for later rendering (toasts, status, errors). */
  message(key: K, params?: MessageParams): MessageDescriptor<K>
  /** Wraps untranslatable text (server messages, paths, diagnostics). */
  raw(text: string): MessageDescriptor
  /** Renders a descriptor in the current locale. */
  resolve(descriptor: MessageDescriptor<K>): string

  formatNumber(value: number, options?: Intl.NumberFormatOptions): string
  formatDate(value: Date | number, options?: Intl.DateTimeFormatOptions): string
  formatRelative(
    value: number,
    unit: Intl.RelativeTimeFormatUnit,
    options?: Intl.RelativeTimeFormatOptions,
  ): string

  /** Releases the instance's signal; it must not be used afterwards. */
  dispose(): void
}

export function createI18n<K extends string>(
  options: CreateI18nOptions<K>,
): I18n<K> {
  const fallbackLocale = options.fallbackLocale ?? DEFAULT_LOCALE
  const syncDocumentLang = options.syncDocumentLang ?? true
  // No `process` reference: this package runs in a browser, in SSR without
  // Node types, and in a test runner. Callers that want production behaviour
  // opt out explicitly instead of relying on a bundler's define.
  const strictCatalogs = options.strictCatalogs ?? true

  const reference = options.messages.en

  /**
   * Catalogs that are fully loaded and validated. The reference is always
   * present; anything else is added only after a successful load.
   */
  const catalogs = new Map<Locale, MessageCatalog<K>>()
  catalogs.set('en', reference)
  for (const locale of SUPPORTED_LOCALES) {
    const catalog = options.messages[locale]
    if (!catalog) continue
    if (locale !== 'en' && strictCatalogs) {
      assertCatalog(reference, locale, catalog)
    }
    catalogs.set(locale, catalog)
  }

  const fallbackCatalog =
    catalogs.get(fallbackLocale) ?? catalogs.get('en') ?? reference

  const initialLocale =
    options.initialLocale && catalogs.has(options.initialLocale)
      ? options.initialLocale
      : fallbackLocale

  const [locale, setLocaleSignal] = createSignal<Locale>(initialLocale)
  const [status, setStatus] = createSignal<I18nStatus>('ready')
  const [error, setError] = createSignal<Error | undefined>(undefined)

  if (syncDocumentLang) applyDocumentLocale(initialLocale)

  /**
   * Monotonic request counter.
   *
   * Two quick switches — `zh-CN`, then `en` — must end on `en` even if the
   * Chinese catalog resolves last. Only the newest request is allowed to
   * commit; every earlier one compares against this and drops its result.
   */
  let requestRevision = 0
  let disposed = false

  /** In-flight loads, so concurrent requests for one locale share a fetch. */
  const loading = new Map<Locale, Promise<MessageCatalog<K>>>()

  async function load(locale: Locale): Promise<MessageCatalog<K>> {
    const existing = loading.get(locale)
    if (existing) return existing
    if (!options.loadCatalog) {
      const message = `No catalog loaded for "${locale}" and no loader was provided.`
      throw new Error(message)
    }
    const promise = options
      .loadCatalog(locale)
      .then(catalog => {
        if (strictCatalogs && locale !== 'en') {
          assertCatalog(reference, locale, catalog)
        }
        catalogs.set(locale, catalog)
        return catalog
      })
      .finally(() => {
        // A failed attempt must not be remembered: retrying is the documented
        // recovery, and caching the rejection would make retry impossible.
        loading.delete(locale)
      })
    loading.set(locale, promise)
    return promise
  }

  async function setLocale(next: Locale): Promise<void> {
    if (disposed) return
    if (!isSupportedLocale(next)) {
      throw new Error(`Unsupported locale: ${String(next)}`)
    }

    // The revision must advance even when this switch is a no-op, because a
    // no-op can still be the *latest* instruction. `zh-CN -> en -> zh-CN` while
    // the Chinese catalog is still loading: the middle call returns early
    // because English is already active, and without bumping the counter the
    // stale Chinese load would go on to commit and win. The counter is what
    // makes "the last request" meaningful.
    const revision = ++requestRevision
    if (next === locale() && catalogs.has(next)) return

    batch(() => {
      setStatus('loading')
      setError(undefined)
    })

    try {
      if (!catalogs.has(next)) await load(next)
      // A newer switch happened while this catalog was loading. The user's
      // last choice wins; this result is stale and must not be committed.
      if (revision !== requestRevision || disposed) return
      batch(() => {
        setLocaleSignal(next)
        setStatus('ready')
      })
      if (syncDocumentLang) applyDocumentLocale(next)
    } catch (cause) {
      const failure = cause instanceof Error ? cause : new Error(String(cause))
      if (revision !== requestRevision || disposed) return
      // Keep the working locale. Flipping to an empty catalog would turn the
      // whole page into keys; the previous language is still correct text.
      batch(() => {
        setStatus('error')
        setError(failure)
      })
      options.onLoadError?.(next, failure)
      throw failure
    }
  }

  async function preload(next: Locale): Promise<void> {
    if (catalogs.has(next) || disposed) return
    await load(next)
  }

  function catalogFor(active: Locale): MessageCatalog<K> {
    return catalogs.get(active) ?? fallbackCatalog
  }

  function reportMissing(active: Locale, key: string): void {
    options.onMissingKey?.(active, key)
  }

  function t(key: K, params?: MessageParams): string {
    const active = locale()
    const template = catalogFor(active)[key]
    if (template === undefined) {
      // The reference catalog is authoritative; a key missing even there is a
      // programming error, and showing the key makes it visible in tests.
      const fallbackTemplate = fallbackCatalog[key]
      if (fallbackTemplate === undefined) {
        reportMissing(active, key)
        return key
      }
      reportMissing(active, key)
      return formatIcuMessage(
        fallbackLocale,
        fallbackTemplate,
        params,
        options.onInvalidMessage,
      )
    }
    return formatIcuMessage(active, template, params, options.onInvalidMessage)
  }

  function message(key: K, params?: MessageParams): MessageDescriptor<K> {
    return params === undefined ? { key } : { key, params }
  }

  function raw(text: string): MessageDescriptor {
    return { text }
  }

  function resolve(descriptor: MessageDescriptor<K>): string {
    if ('text' in descriptor) return descriptor.text
    return t(descriptor.key, descriptor.params)
  }

  return {
    locale,
    status,
    error,
    setLocale,
    preload,
    t,
    message,
    raw,
    resolve,
    formatNumber: (value, formatOptions) =>
      formatNumber(locale(), value, formatOptions),
    formatDate: (value, formatOptions) =>
      formatDate(locale(), value, formatOptions),
    formatRelative: (value, unit, formatOptions) =>
      formatRelative(locale(), value, unit, formatOptions),
    dispose() {
      disposed = true
      // Bump the revision so any in-flight `setLocale` sees itself as stale
      // and skips its commit into a disposed instance.
      requestRevision += 1
    },
  }
}

/* ------------------------------------------------------------- inspection */

export interface CatalogReportEntry {
  readonly locale: Locale
  readonly key: string
  readonly messages: Readonly<Partial<Record<Locale, string>>>
  readonly arguments: readonly string[]
}

/**
 * Builds the cross-locale report CI checks.
 *
 * Exposed from the package rather than living only in the checker so the same
 * rules are testable here. `messageArgumentNames` reads the compiled ICU AST,
 * so `{count}` in English and `{count}` in Chinese are recognised as the same
 * argument even though the plural structure differs.
 */
export function reportCatalog<K extends string>(
  catalogs: Partial<Record<Locale, MessageCatalog<K>>>,
  referenceLocale: Locale = 'en',
): readonly CatalogReportEntry[] {
  const reference = catalogs[referenceLocale]
  if (!reference) return []
  return Object.keys(reference).map(key => {
    const messages: Partial<Record<Locale, string>> = {}
    let argumentsList: readonly string[] = []
    for (const locale of SUPPORTED_LOCALES) {
      const catalog = catalogs[locale] as
        | Readonly<Record<string, string>>
        | undefined
      const template = catalog?.[key]
      if (template === undefined) continue
      messages[locale] = template
      if (locale === referenceLocale) {
        argumentsList = messageArgumentNames(locale, template)
      } else if (argumentsList.length === 0) {
        argumentsList = messageArgumentNames(locale, template)
      }
    }
    return { locale: referenceLocale, key, messages, arguments: argumentsList }
  })
}

/** Re-exported for checkers that validate a single message. */
export { checkMessageSyntax, interpolate }
