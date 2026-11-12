import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LOCALE,
  isSupportedLocale,
  negotiateLocale,
  normalizeLocale,
  resolveLocale,
  SUPPORTED_LOCALES,
} from '../src/locale'

describe('resolveLocale', () => {
  it('resolves the supported locales and their common regional forms', () => {
    expect(resolveLocale('en')).toBe('en')
    expect(resolveLocale('en-US')).toBe('en')
    expect(resolveLocale('en-GB')).toBe('en')
    expect(resolveLocale('zh-CN')).toBe('zh-CN')
  })

  it('maps the Playground legacy "zh" to zh-CN', () => {
    // Existing users have `zh` in storage. Treating it as unknown would reset
    // them to English on upgrade.
    expect(resolveLocale('zh')).toBe('zh-CN')
    expect(normalizeLocale('zh')).toBe('zh-CN')
  })

  it('maps Simplified regional tags to zh-CN', () => {
    expect(resolveLocale('zh-Hans')).toBe('zh-CN')
    expect(resolveLocale('zh-SG')).toBe('zh-CN')
    expect(resolveLocale('zh_CN')).toBe('zh-CN')
  })

  it('does not treat Traditional Chinese as Simplified', () => {
    // Showing Simplified text to someone who asked for Traditional is worse
    // than falling back to English, where at least the promise is clear.
    expect(resolveLocale('zh-TW')).toBeUndefined()
    expect(resolveLocale('zh-HK')).toBeUndefined()
    expect(resolveLocale('zh-Hant')).toBeUndefined()
  })

  it('returns undefined for unknown or empty input', () => {
    expect(resolveLocale('ja')).toBeUndefined()
    expect(resolveLocale('')).toBeUndefined()
    expect(resolveLocale(undefined)).toBeUndefined()
    expect(resolveLocale(null)).toBeUndefined()
  })

  it('is case and separator insensitive', () => {
    expect(resolveLocale('EN-us')).toBe('en')
    expect(resolveLocale('ZH_cn')).toBe('zh-CN')
  })
})

describe('normalizeLocale', () => {
  it('falls back to the default for unsupported input', () => {
    expect(normalizeLocale('ja')).toBe(DEFAULT_LOCALE)
    expect(normalizeLocale(undefined)).toBe(DEFAULT_LOCALE)
  })
})

describe('negotiateLocale', () => {
  it('honours candidate order', () => {
    expect(negotiateLocale(['ja', 'zh-CN'])).toBe('zh-CN')
    expect(negotiateLocale(['en-US', 'zh-CN'])).toBe('en')
  })

  it('skips Traditional Chinese rather than coercing it', () => {
    expect(negotiateLocale(['zh-TW', 'en'])).toBe('en')
    expect(negotiateLocale(['zh-TW'])).toBeUndefined()
  })

  it('returns undefined for an empty or absent list', () => {
    expect(negotiateLocale([])).toBeUndefined()
    expect(negotiateLocale(undefined)).toBeUndefined()
  })
})

describe('isSupportedLocale', () => {
  it('accepts exactly the bundled locales', () => {
    for (const locale of SUPPORTED_LOCALES) {
      expect(isSupportedLocale(locale)).toBe(true)
    }
    expect(isSupportedLocale('zh')).toBe(false)
    expect(isSupportedLocale('ja')).toBe(false)
    expect(isSupportedLocale(42)).toBe(false)
  })
})
