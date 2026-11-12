/**
 * Message catalogs and the typed-key contract.
 *
 * An application declares its English catalog as the source of truth and
 * derives its key type from it. Every other locale is then checked against
 * that key set by the compiler (`satisfies`), and again at runtime by
 * `checkCatalog` — `satisfies` catches a missing key in a literal, but a
 * generated or merged catalog can still be short, and a user who switches to
 * that language must not see raw keys.
 */

/** Values a message may interpolate. */
export type MessageParam = string | number | Date

export type MessageParams = Readonly<Record<string, MessageParam>>

/** A catalog: flat, dotted keys mapping to ICU message text. */
export type MessageCatalog<K extends string = string> = Readonly<
  Record<K, string>
>

/** Keys of a catalog object. */
export type MessageKeyOf<C> = Extract<keyof C, string>

/**
 * A message held as data rather than as rendered text.
 *
 * State that outlives a render — a toast, a failed request, a status line —
 * must keep the key and its parameters, not the string. Storing the string
 * means the message stays in the language it was produced in after the user
 * switches, which is the mixed-language UI this package exists to prevent.
 *
 * `text` is for content that is not translatable by definition: a server's raw
 * error message with no code, a file path, a compiler diagnostic.
 */
export type MessageDescriptor<K extends string = string> =
  | { readonly key: K; readonly params?: MessageParams }
  | { readonly text: string }

export function isKeyDescriptor<K extends string>(
  descriptor: MessageDescriptor<K>,
): descriptor is { readonly key: K; readonly params?: MessageParams } {
  return 'key' in descriptor
}

/* ------------------------------------------------------------- validation */

export interface CatalogIssue {
  readonly kind:
    | 'missing-key'
    | 'extra-key'
    | 'duplicate-key'
    | 'empty-message'
    | 'same-as-reference'
  readonly locale: string
  readonly key: string
  readonly referenceLocale?: string
}

export interface CatalogCheckOptions {
  /** Locale the catalog is checked against; defaults to `en`. */
  readonly referenceLocale?: string
  /**
   * Keys whose translation legitimately equals the reference text.
   *
   * Without this, a translator who leaves "OK" as "OK" is reported as a missed
   * translation. Every entry is a claim that the two languages agree here.
   */
  readonly allowIdenticalKeys?: readonly string[]
}

/**
 * Compares a catalog against the reference key set.
 *
 * Returns issues rather than throwing so a CI check can report all of them;
 * `assertCatalog` is the fail-fast variant for call sites that want it.
 */
export function checkCatalog<K extends string>(
  reference: MessageCatalog<K>,
  locale: string,
  candidate: MessageCatalog<string>,
  options: CatalogCheckOptions = {},
): readonly CatalogIssue[] {
  const issues: CatalogIssue[] = []
  const allowIdentical = new Set(options.allowIdenticalKeys ?? [])
  const referenceKeys = Object.keys(reference)
  const candidateKeys = new Set(Object.keys(candidate))
  // Indexed by string on purpose: the two catalogs are different types, and a
  // key present in one may be absent from the other — that is what is checked.
  const referenceValues = reference as Readonly<Record<string, string>>
  const candidateValues = candidate as Readonly<Record<string, string>>

  for (const key of referenceKeys) {
    const value = candidateValues[key]
    if (value === undefined) {
      issues.push({ kind: 'missing-key', locale, key })
      continue
    }
    if (value.trim().length === 0) {
      issues.push({ kind: 'empty-message', locale, key })
      continue
    }
    if (value === referenceValues[key] && !allowIdentical.has(key)) {
      issues.push({
        kind: 'same-as-reference',
        locale,
        key,
        referenceLocale: options.referenceLocale ?? 'en',
      })
    }
  }

  for (const key of candidateKeys) {
    if (!(key in reference)) {
      issues.push({ kind: 'extra-key', locale, key })
    }
  }

  return issues
}

/** Throws listing every issue; used by tests and by `createI18n` in dev. */
export function assertCatalog<K extends string>(
  reference: MessageCatalog<K>,
  locale: string,
  candidate: MessageCatalog<string>,
  options: CatalogCheckOptions = {},
): void {
  const issues = checkCatalog(reference, locale, candidate, options)
  if (issues.length === 0) return
  const summary = issues.map(issue => `${issue.kind}: ${issue.key}`).join(', ')
  throw new Error(
    `i18n catalog "${locale}" does not match the reference: ${summary}`,
  )
}

/**
 * Fills `{name}`-style placeholders without ICU.
 *
 * Only used as the last-resort fallback when a message fails to compile at
 * runtime and the raw template must still be shown. Normal rendering goes
 * through the ICU formatter, so plural rules and number formatting apply.
 */
export function interpolate(
  template: string,
  params: MessageParams | undefined,
): string {
  if (!params) return template
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in params ? String(params[name]) : match,
  )
}
