/**
 * `@zeus-js/i18n` — typed, reactive, ICU-based internationalization.
 *
 * Opt-in and separate from `@zeus-js/zeus`: the main entry must not grow a
 * dependency on message formatting, and an application that never localizes
 * should never download this.
 *
 * @example
 * ```tsx
 * const i18n = createI18n({
 *   messages: { en, 'zh-CN': zhCN },
 *   initialLocale: 'en',
 * })
 *
 * function SaveButton() {
 *   // Reading `t` subscribes to the locale signal, so a switch re-renders just
 *   // this text node.
 *   return <button>{i18n.t('common.save')}</button>
 * }
 *
 * await i18n.setLocale('zh-CN')
 * ```
 */

export {
  createI18n,
  reportCatalog,
  type CatalogReportEntry,
  type CreateI18nOptions,
  type I18n,
  type I18nEvents,
  type I18nStatus,
} from './create-i18n'

export {
  applyDocumentLocale,
  DEFAULT_LOCALE,
  isSupportedLocale,
  negotiateLocale,
  normalizeLocale,
  resolveLocale,
  SUPPORTED_LOCALES,
  type Locale,
} from './locale'

export {
  assertCatalog,
  checkCatalog,
  interpolate,
  isKeyDescriptor,
  type CatalogCheckOptions,
  type CatalogIssue,
  type MessageCatalog,
  type MessageDescriptor,
  type MessageKeyOf,
  type MessageParam,
  type MessageParams,
} from './message'

export {
  checkMessageSyntax,
  clearFormatterCaches,
  formatDate,
  formatIcuMessage,
  formatNumber,
  formatRelative,
  messageArgumentNames,
} from './formatters'
