import { describe, expect, it } from 'vitest'

import { reportCatalog } from '../src/create-i18n'
import { checkMessageSyntax, messageArgumentNames } from '../src/formatters'
import { assertCatalog, checkCatalog, interpolate } from '../src/message'

const en = {
  'common.save': 'Save',
  'common.items': '{count, plural, one {# item} other {# items}}',
  'common.hello': 'Hello {name}',
} as const

describe('checkCatalog', () => {
  it('reports nothing for a complete, translated catalog', () => {
    expect(
      checkCatalog(en, 'zh-CN', {
        'common.save': '保存',
        'common.items': '{count} 个项目',
        'common.hello': '你好 {name}',
      }),
    ).toEqual([])
  })

  it('reports a missing key', () => {
    const issues = checkCatalog(en, 'zh-CN', {
      'common.save': '保存',
      'common.items': '{count} 个项目',
    })
    expect(issues).toContainEqual({
      kind: 'missing-key',
      locale: 'zh-CN',
      key: 'common.hello',
    })
  })

  it('reports an extra key that the reference does not have', () => {
    const issues = checkCatalog(en, 'zh-CN', {
      'common.save': '保存',
      'common.items': '{count} 个项目',
      'common.hello': '你好 {name}',
      'common.removed': '已删除',
    })
    expect(issues).toContainEqual({
      kind: 'extra-key',
      locale: 'zh-CN',
      key: 'common.removed',
    })
  })

  it('reports an empty translation', () => {
    const issues = checkCatalog(en, 'zh-CN', {
      'common.save': '   ',
      'common.items': '{count} 个项目',
      'common.hello': '你好 {name}',
    })
    expect(issues).toContainEqual({
      kind: 'empty-message',
      locale: 'zh-CN',
      key: 'common.save',
    })
  })

  it('flags a value copied verbatim from the reference', () => {
    // Not always wrong ("OK" is "OK"), which is why the check distinguishes the
    // kinds and why `allowIdenticalKeys` exists.
    const issues = checkCatalog(en, 'zh-CN', {
      'common.save': 'Save',
      'common.items': '{count} 个项目',
      'common.hello': '你好 {name}',
    })
    expect(issues).toContainEqual({
      kind: 'same-as-reference',
      locale: 'zh-CN',
      key: 'common.save',
      referenceLocale: 'en',
    })
  })

  it('accepts an identical value that is explicitly allowed', () => {
    const issues = checkCatalog(
      en,
      'zh-CN',
      {
        'common.save': 'Save',
        'common.items': '{count} 个项目',
        'common.hello': '你好 {name}',
      },
      { allowIdenticalKeys: ['common.save'] },
    )
    expect(issues).toEqual([])
  })
})

describe('assertCatalog', () => {
  it('does not throw for text that is identical by design', () => {
    // "WebC" is correct in both languages. A catalog containing it must not
    // stop an application from starting; it is a review question.
    expect(() =>
      assertCatalog(
        { 'product.webc': 'WebC', 'common.save': 'Save' },
        'zh-CN',
        { 'product.webc': 'WebC', 'common.save': '保存' },
      ),
    ).not.toThrow()
  })

  it('reports identical text through the callback instead of throwing', () => {
    const identical: string[] = []
    assertCatalog(
      { 'product.webc': 'WebC', 'common.save': 'Save' },
      'zh-CN',
      { 'product.webc': 'WebC', 'common.save': '保存' },
      { onIdenticalText: key => identical.push(key) },
    )
    expect(identical).toEqual(['product.webc'])
  })

  it('still throws for a structurally broken catalog', () => {
    expect(() => assertCatalog(en, 'zh-CN', { 'common.save': '保存' })).toThrow(
      /missing-key/,
    )
  })

  it('throws with every issue listed', () => {
    expect(() => assertCatalog(en, 'zh-CN', { 'common.save': '保存' })).toThrow(
      /missing-key: common.items.*missing-key: common.hello/,
    )
  })

  it('does not throw for a complete catalog', () => {
    expect(() =>
      assertCatalog(en, 'zh-CN', {
        'common.save': '保存',
        'common.items': '{count} 个项目',
        'common.hello': '你好 {name}',
      }),
    ).not.toThrow()
  })
})

describe('checkMessageSyntax', () => {
  it('accepts valid ICU, including plural and select', () => {
    expect(checkMessageSyntax('en', 'Hello {name}')).toBeUndefined()
    expect(
      checkMessageSyntax('en', '{count, plural, one {# item} other {# items}}'),
    ).toBeUndefined()
    expect(
      checkMessageSyntax('en', '{role, select, admin {A} other {M}}'),
    ).toBeUndefined()
  })

  it('rejects a plural without an other branch', () => {
    // ICU requires `other`; without it a count of 2 renders nothing.
    expect(
      checkMessageSyntax('en', '{count, plural, one {# item}}'),
    ).toBeInstanceOf(Error)
  })

  it('rejects unbalanced braces', () => {
    expect(checkMessageSyntax('en', 'Hello {name')).toBeInstanceOf(Error)
  })
})

describe('messageArgumentNames', () => {
  it('extracts the placeholder names a message requires', () => {
    expect(
      messageArgumentNames('en', 'Hello {name}, you have {count}'),
    ).toEqual(expect.arrayContaining(['name', 'count']))
  })

  it('reports the same argument for a Chinese message with no plural form', () => {
    // The English message is ICU plural, the Chinese one is a plain
    // substitution. Comparing argument names rather than template text is what
    // lets a checker accept both.
    expect(
      messageArgumentNames(
        'en',
        '{count, plural, one {# item} other {# items}}',
      ),
    ).toContain('count')
    expect(messageArgumentNames('zh-CN', '{count} 个项目')).toContain('count')
  })

  it('returns an empty list for an unparseable message', () => {
    expect(messageArgumentNames('en', '{broken')).toEqual([])
  })
})

describe('reportCatalog', () => {
  it('collects each key across every locale with its arguments', () => {
    const report = reportCatalog({
      en,
      'zh-CN': {
        'common.save': '保存',
        'common.items': '{count} 个项目',
        'common.hello': '你好 {name}',
      },
    })
    const items = report.find(entry => entry.key === 'common.items')
    expect(items?.messages.en).toContain('plural')
    expect(items?.messages['zh-CN']).toBe('{count} 个项目')
    expect(items?.arguments).toContain('count')
  })

  it('returns an empty report when the reference locale is absent', () => {
    expect(reportCatalog({ 'zh-CN': { a: 'a' } })).toEqual([])
  })
})

describe('interpolate', () => {
  it('substitutes known names and leaves unknown ones untouched', () => {
    expect(interpolate('Hello {name} and {other}', { name: 'Ada' })).toBe(
      'Hello Ada and {other}',
    )
  })

  it('returns the template when there are no parameters', () => {
    expect(interpolate('Hello {name}', undefined)).toBe('Hello {name}')
  })
})
