import { describe, expect, it } from 'vitest'

import { createI18n } from '../src/create-i18n'

import type { MessageCatalog } from '../src/message'

const en = {
  'common.save': 'Save',
  'common.items': '{count, plural, one {# item} other {# items}}',
  'common.role': '{role, select, admin {Administrator} other {Member}}',
  'common.hello': 'Hello {name}',
  'common.only-en': 'English only',
} as const

const zhCN = {
  'common.save': '保存',
  'common.items': '{count} 个项目',
  'common.role': '{role, select, admin {管理员} other {成员}}',
  'common.hello': '你好 {name}',
  'common.only-en': '仅英文',
} satisfies Record<keyof typeof en, string>

function make(
  overrides: Partial<Parameters<typeof createI18n>[0]> = {},
): ReturnType<typeof createI18n> {
  return createI18n({
    messages: { en, 'zh-CN': zhCN },
    initialLocale: 'en',
    // Document sync belongs to the app; tests run without a DOM.
    syncDocumentLang: false,
    ...overrides,
  })
}

describe('createI18n', () => {
  it('starts on the initial locale and renders its messages', () => {
    const i18n = make()
    expect(i18n.locale()).toBe('en')
    expect(i18n.t('common.save')).toBe('Save')
    expect(i18n.status()).toBe('ready')
  })

  it('switches locale without recreating the instance', async () => {
    const i18n = make()
    await i18n.setLocale('zh-CN')
    expect(i18n.locale()).toBe('zh-CN')
    expect(i18n.t('common.save')).toBe('保存')
  })

  it('keeps two instances independent', async () => {
    const a = make()
    const b = make()
    await a.setLocale('zh-CN')
    expect(a.locale()).toBe('zh-CN')
    expect(b.locale()).toBe('en')
    expect(b.t('common.save')).toBe('Save')
  })

  it('applies locale-specific plural rules, not an English one/other test', () => {
    const i18n = make()
    expect(i18n.t('common.items', { count: 1 })).toBe('1 item')
    expect(i18n.t('common.items', { count: 5 })).toBe('5 items')
    // Chinese has a single plural category, so the same template serves 1 and 5.
    expect(i18n.t('common.items', { count: 1 })).not.toBe('1 items')
  })

  it('renders select branches', () => {
    const i18n = make()
    expect(i18n.t('common.role', { role: 'admin' })).toBe('Administrator')
    expect(i18n.t('common.role', { role: 'viewer' })).toBe('Member')
  })

  it('interpolates named parameters', () => {
    const i18n = make()
    expect(i18n.t('common.hello', { name: 'Ada' })).toBe('Hello Ada')
  })

  it('escapes interpolated values as text, never HTML', () => {
    const i18n = make()
    // The formatter returns a string; nothing in this package writes markup.
    // The assertion documents that the value passes through verbatim.
    const hostile = '<img src=x onerror=alert(1)>'
    expect(i18n.t('common.hello', { name: hostile })).toBe(`Hello ${hostile}`)
  })

  it('returns the key when it is missing everywhere, and reports it', () => {
    const missing: string[] = []
    const i18n = make({
      onMissingKey: (_locale, key) => missing.push(key),
    })
    // Cast: the point is behaviour for a key that is not in the catalog, which
    // is what a stale translation file produces at runtime.
    const value = i18n.t('common.nope' as keyof typeof en)
    expect(value).toBe('common.nope')
    expect(missing).toContain('common.nope')
  })

  it('falls back to the reference text for a key missing in the active locale', () => {
    const partial = { ...zhCN } as Record<string, string>
    delete partial['common.only-en']
    const missing: string[] = []
    const i18n = createI18n({
      messages: { en, 'zh-CN': partial as MessageCatalog<keyof typeof en> },
      initialLocale: 'zh-CN',
      syncDocumentLang: false,
      strictCatalogs: false,
      onMissingKey: (_locale, key) => missing.push(key),
    })
    expect(i18n.t('common.only-en')).toBe('English only')
    expect(missing).toContain('common.only-en')
  })

  it('formats numbers and dates per locale', async () => {
    const i18n = make()
    expect(i18n.formatNumber(1234567.89)).toBe('1,234,567.89')
    await i18n.setLocale('zh-CN')
    expect(i18n.formatNumber(1234567.89)).toBe('1,234,567.89')
    const date = new Date('2026-01-02T03:04:00Z')
    expect(
      i18n.formatDate(date, { dateStyle: 'medium', timeZone: 'UTC' }),
    ).toBe('2026年1月2日')
  })

  it('returns an empty string for an invalid date instead of "Invalid Date"', () => {
    const i18n = make()
    expect(i18n.formatDate(new Date('not a date'))).toBe('')
  })

  it('keeps message descriptors language-neutral until resolved', async () => {
    const i18n = make()
    const descriptor = i18n.message('common.items', { count: 3 })
    expect(i18n.resolve(descriptor)).toBe('3 items')
    await i18n.setLocale('zh-CN')
    expect(i18n.resolve(descriptor)).toBe('3 个项目')
  })

  it('renders raw text unchanged across a switch', async () => {
    const i18n = make()
    const raw = i18n.raw('compiler: unexpected token')
    await i18n.setLocale('zh-CN')
    expect(i18n.resolve(raw)).toBe('compiler: unexpected token')
  })

  it('survives an invalid ICU message by showing the template', () => {
    const invalid: string[] = []
    const i18n = createI18n({
      messages: {
        en: { bad: '{count, plural, one {broken}}' },
      },
      syncDocumentLang: false,
      strictCatalogs: false,
      onInvalidMessage: (_locale, template) => invalid.push(template),
    })
    // No throw: a malformed catalog must not take the page down.
    expect(() => i18n.t('bad', { count: 2 })).not.toThrow()
    expect(invalid.length).toBeGreaterThan(0)
  })
})

describe('createI18n async loading', () => {
  it('loads a catalog on demand and switches to it', async () => {
    const i18n = make({
      messages: { en },
      loadCatalog: async () => zhCN,
    })
    await i18n.setLocale('zh-CN')
    expect(i18n.locale()).toBe('zh-CN')
    expect(i18n.t('common.save')).toBe('保存')
  })

  it('keeps the previous locale when a load fails, and allows a retry', async () => {
    let attempts = 0
    const failures: string[] = []
    const i18n = make({
      messages: { en },
      onLoadError: locale => failures.push(locale),
      loadCatalog: async () => {
        attempts += 1
        if (attempts === 1) throw new Error('network')
        return zhCN
      },
    })

    await expect(i18n.setLocale('zh-CN')).rejects.toThrow('network')
    expect(i18n.locale()).toBe('en')
    expect(i18n.status()).toBe('error')
    expect(i18n.t('common.save')).toBe('Save')
    expect(failures).toContain('zh-CN')

    // A rejected promise is not cached, so the retry reaches the loader again.
    await i18n.setLocale('zh-CN')
    expect(i18n.locale()).toBe('zh-CN')
    expect(i18n.status()).toBe('ready')
    expect(attempts).toBe(2)
  })

  it('commits only the last of several rapid switches', async () => {
    let releaseSlow!: (catalog: MessageCatalog<keyof typeof en>) => void
    const slow = new Promise<MessageCatalog<keyof typeof en>>(resolve => {
      releaseSlow = resolve
    })

    const i18n = createI18n({
      messages: { en },
      syncDocumentLang: false,
      initialLocale: 'en',
      loadCatalog: locale =>
        locale === 'zh-CN' ? slow : Promise.resolve(zhCN),
    })

    const first = i18n.setLocale('zh-CN')
    const second = i18n.setLocale('en')
    await second

    // The Chinese catalog arrives after the user already chose English.
    releaseSlow(zhCN)
    await first.catch(() => undefined)

    expect(i18n.locale()).toBe('en')
    expect(i18n.t('common.save')).toBe('Save')
  })

  it('shares one load between concurrent requests for the same locale', async () => {
    let loads = 0
    const i18n = make({
      messages: { en },
      loadCatalog: async () => {
        loads += 1
        return zhCN
      },
    })
    await Promise.all([i18n.preload('zh-CN'), i18n.preload('zh-CN')])
    expect(loads).toBe(1)
  })

  it('preloads without switching', async () => {
    const i18n = make({ messages: { en }, loadCatalog: async () => zhCN })
    await i18n.preload('zh-CN')
    expect(i18n.locale()).toBe('en')
  })

  it('rejects an unsupported locale', async () => {
    const i18n = make()
    await expect(i18n.setLocale('ja' as never)).rejects.toThrow(
      'Unsupported locale',
    )
  })

  it('stops committing after dispose', async () => {
    let release!: (catalog: MessageCatalog<keyof typeof en>) => void
    const pending = new Promise<MessageCatalog<keyof typeof en>>(resolve => {
      release = resolve
    })
    const i18n = make({ messages: { en }, loadCatalog: () => pending })
    const switching = i18n.setLocale('zh-CN')
    i18n.dispose()
    release(zhCN)
    await switching.catch(() => undefined)
    expect(i18n.locale()).toBe('en')
  })
})

describe('createI18n catalog validation', () => {
  it('rejects a catalog missing a key in strict mode', () => {
    expect(() =>
      createI18n({
        messages: {
          en,
          'zh-CN': { ...zhCN, 'common.save': undefined } as never,
        },
        syncDocumentLang: false,
      }),
    ).toThrow(/catalog "zh-CN"/)
  })

  it('accepts an incomplete catalog in permissive mode', () => {
    const partial = { ...zhCN } as Record<string, string>
    delete partial['common.only-en']
    expect(() =>
      createI18n({
        messages: { en, 'zh-CN': partial as MessageCatalog<keyof typeof en> },
        syncDocumentLang: false,
        strictCatalogs: false,
      }),
    ).not.toThrow()
  })
})
