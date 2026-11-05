import { describe, expect, it } from 'vitest'

import {
  Host,
  Show,
  Slot,
  defineElement,
  renderToString,
  ssrAttr,
  ssrElement,
  ssrFor,
  ssrProp,
  ssrShow,
  ssrSpread,
} from '../src'

/**
 * Hardening regressions found while auditing RFC-004 against the 0.2.0 SSR/DSD
 * contract. Every case here failed before the fix unless noted.
 */

describe('SSR Light DOM Host boundary', () => {
  it('reads lazy Host children once so slots still project consumers', () => {
    let reads = 0
    const Field = defineElement('z-light-read-once', { shadow: false }, () =>
      Host({
        role: 'group',
        get children() {
          reads++
          return [Slot({ name: 'title', children: 'Untitled' }), Slot()]
        },
      }),
    )

    expect(
      renderToString(() =>
        Field({
          children: [
            ssrElement('b', [ssrAttr('slot', 'title')], 'Named'),
            ssrElement('i', [], 'Body'),
          ],
        }),
      ),
    ).toBe(
      '<z-light-read-once role="group">' +
        '<!--zeus:light:root-->' +
        '<!--zeus:light:child--><b slot="title">Named</b><!--/zeus:light:child-->' +
        '<!--zeus:light:child--><i>Body</i><!--/zeus:light:child-->' +
        '<!--/zeus:light:root-->' +
        '</z-light-read-once>',
    )
    expect(reads).toBe(1)
  })

  it('marks the internal content of a Light DOM host even without projected children', () => {
    const Field = defineElement('z-light-no-slot', { shadow: false }, () =>
      Host({ children: ssrElement('p', [], 'internal') }),
    )

    expect(
      renderToString(() => Field({ children: ssrElement('i', [], 'dropped') })),
    ).toBe(
      '<z-light-no-slot>' +
        '<!--zeus:light:root--><p>internal</p><!--/zeus:light:root-->' +
        '</z-light-no-slot>',
    )
  })

  it('keeps the declared styles before Light DOM component content', () => {
    const Field = defineElement(
      'z-light-styles',
      { shadow: false, styles: ['z-light-styles { color: red }'] },
      () => Host({ children: Slot() }),
    )

    expect(renderToString(() => Field())).toBe(
      '<z-light-styles>' +
        '<!--zeus:light:root-->' +
        '<style>z-light-styles { color: red }</style>' +
        '<!--/zeus:light:root-->' +
        '</z-light-styles>',
    )
  })

  it('does not mark Shadow DOM hosts with Light DOM markers', () => {
    const Card = defineElement('z-shadow-markers', { shadow: true }, () =>
      Host({ children: ssrElement('slot', []) }),
    )

    const html = renderToString(() => Card())
    expect(html).not.toContain('zeus:light')
  })
})

describe('SSR async rejection at control-flow boundaries', () => {
  it('rejects thenable Show conditions instead of selecting a branch', () => {
    expect(() =>
      renderToString(() =>
        Show({
          when: Promise.resolve(true) as unknown as boolean,
          children: 'shown',
          fallback: 'hidden',
        }),
      ),
    ).toThrow('renderToString() does not support async render values.')
  })

  it('rejects thenable lower-level Show conditions and thenable fallbacks', () => {
    expect(() =>
      renderToString(() =>
        ssrShow(
          Promise.resolve(false) as unknown as () => boolean,
          () => 'shown',
          () => 'hidden',
        ),
      ),
    ).toThrow('renderToString() does not support async render values.')

    expect(() =>
      renderToString(() =>
        ssrShow(
          () => false,
          () => 'shown',
          () => Promise.resolve('hidden') as never,
        ),
      ),
    ).toThrow('renderToString() does not support async render values.')
  })

  it('rejects thenable For collections with the async-value error', () => {
    expect(() =>
      renderToString(() =>
        ssrFor(
          Promise.resolve(['a']) as unknown as () => readonly string[],
          item => item,
        ),
      ),
    ).toThrow('renderToString() does not support async render values.')
  })

  it('rejects a thenable spread source instead of rendering nothing', () => {
    expect(() =>
      renderToString(() =>
        ssrElement(
          'div',
          ssrSpread([(() => Promise.resolve({ title: 'later' })) as never]),
        ),
      ),
    ).toThrow('renderToString() does not support async render values.')
  })

  it('rejects thenable values read from a spread source', () => {
    expect(() =>
      renderToString(() =>
        ssrElement('div', ssrSpread([() => ({ title: Promise.resolve('x') })])),
      ),
    ).toThrow('renderToString() does not support async render values.')
  })
})

describe('SSR form property serialization', () => {
  it('clears the equivalent attribute when a property value is nullish', () => {
    expect(
      renderToString(() =>
        ssrElement('input', [
          ssrAttr('value', 'static'),
          ssrProp('value', null),
        ]),
      ),
    ).toBe('<input value="">')

    expect(
      renderToString(() =>
        ssrElement('input', [
          ssrAttr('checked', true),
          ssrProp('checked', undefined),
        ]),
      ),
    ).toBe('<input>')
  })

  it('clears textarea text content when the value property is nullish', () => {
    expect(
      renderToString(() =>
        ssrElement(
          'textarea',
          [ssrAttr('value', 'static'), ssrProp('value', null)],
          'fallback',
        ),
      ),
    ).toBe('<textarea></textarea>')
  })

  it('serializes defaultValue and defaultChecked to their HTML equivalents', () => {
    expect(
      renderToString(() =>
        ssrElement('input', [
          ssrProp('defaultValue', 'Ada'),
          ssrProp('defaultChecked', true),
        ]),
      ),
    ).toBe('<input value="Ada" checked>')

    expect(
      renderToString(() =>
        ssrElement('textarea', [ssrProp('defaultValue', 'A & B')], 'ignored'),
      ),
    ).toBe('<textarea>A &amp; B</textarea>')
  })

  it('keeps non-serializable property values omitted', () => {
    expect(
      renderToString(() =>
        ssrElement('input', [
          ssrProp('value', 'Ada'),
          ssrProp('value', { ignored: true }),
        ]),
      ),
    ).toBe('<input value="Ada">')
  })
})

describe('SSR foreign-content text serialization', () => {
  it('escapes script and style text when the compiler marks it as foreign content', () => {
    expect(
      renderToString(() =>
        ssrElement(
          'style',
          [],
          'a < b { content: "</style>" }',
          undefined,
          false,
        ),
      ),
    ).toBe('<style>a &lt; b { content: "&lt;/style&gt;" }</style>')

    expect(
      renderToString(() =>
        ssrElement(
          'script',
          [],
          'if (a < b) run("</script>")',
          undefined,
          false,
        ),
      ),
    ).toBe('<script>if (a &lt; b) run("&lt;/script&gt;")</script>')
  })

  it('keeps the automatic raw-text policy for HTML script and style', () => {
    expect(renderToString(() => ssrElement('style', [], 'a < b'))).toBe(
      '<style>a < b</style>',
    )
  })

  it('rejects serialized fragments in foreign content only when escaping is impossible', () => {
    expect(() =>
      renderToString(() =>
        ssrElement('style', [], { html: '<b>' } as never, undefined, false),
      ),
    ).toThrow('renderToString() received an unsupported SSR value.')
  })
})
