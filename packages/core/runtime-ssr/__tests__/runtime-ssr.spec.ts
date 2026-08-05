import { createEffect, createSignal, onCleanup } from '@zeus-js/signal'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

import * as runtimeSSR from '../src'
import {
  For,
  Show,
  renderToString,
  ssrAttr,
  ssrComponent,
  ssrElement,
  ssrFor,
  ssrProp,
  ssrShow,
  ssrStatic,
  ssrText,
  type SSRNode,
} from '../src'

describe('@zeus-js/runtime-ssr', () => {
  it('keeps a small explicit compiler and server runtime contract', () => {
    expect(Object.keys(runtimeSSR).sort()).toEqual([
      'For',
      'Show',
      'renderToString',
      'ssrAttr',
      'ssrComponent',
      'ssrElement',
      'ssrFor',
      'ssrProp',
      'ssrShow',
      'ssrStatic',
      'ssrText',
    ])
  })

  it('requires a render factory so component initialization is scope-owned', () => {
    expect(() =>
      renderToString(ssrText('outside') as unknown as () => SSRNode),
    ).toThrow('renderToString() expects a synchronous render function.')
  })

  it('rejects async render factories instead of silently dropping HTML', () => {
    const cleanup = vi.fn()

    expect(() =>
      renderToString((async () => {
        onCleanup(cleanup)
        return ssrText('later')
      }) as unknown as () => SSRNode),
    ).toThrow('renderToString() does not support async render values.')
    expect(cleanup).toHaveBeenCalledOnce()
  })

  it('rejects async component values at any depth', () => {
    const AsyncChild = async () => ssrText('later')

    expect(() =>
      renderToString(() =>
        ssrElement(
          'main',
          [],
          ssrComponent(
            AsyncChild as unknown as () => SSRNode,
            {} as Record<string, never>,
          ),
        ),
      ),
    ).toThrow('renderToString() does not support async render values.')
  })

  it('attaches a rejection handler before rejecting a rejected render value', () => {
    const rejected = Promise.reject(new Error('later'))
    const catchSpy = vi.spyOn(rejected, 'catch')

    expect(() => renderToString(() => rejected as unknown as SSRNode)).toThrow(
      'renderToString() does not support async render values.',
    )
    expect(catchSpy).toHaveBeenCalledOnce()
  })

  it('rejects unsupported node values instead of rendering an empty string', () => {
    expect(() =>
      renderToString(() => ({ invalid: true }) as unknown as SSRNode),
    ).toThrow('renderToString() received an unsupported SSR value.')
  })

  it('rejects async values across attribute, class, style, and property paths', () => {
    const views = [
      () =>
        ssrElement('div', [
          ssrAttr('title', Promise.resolve('later') as never),
        ]),
      () =>
        ssrElement('div', [
          ssrAttr('class', { active: Promise.resolve(true) as never }),
        ]),
      () =>
        ssrElement('div', [
          ssrAttr('style', { color: Promise.resolve('red') as never }),
        ]),
      () => ssrElement('input', [ssrProp('value', Promise.resolve('later'))]),
    ]

    for (const view of views) {
      expect(() => renderToString(view)).toThrow(
        'renderToString() does not support async render values.',
      )
    }
  })

  it('rejects custom thenables in text positions', () => {
    const thenable = { then() {} }

    expect(() => renderToString(() => thenable as unknown as SSRNode)).toThrow(
      'renderToString() does not support async render values.',
    )
  })

  it('recognizes fragments created by another runtime instance', () => {
    const foreignFragment = Object.freeze({
      [Symbol.for('zeus.ssr.fragment')]: true,
      html: '<strong>shared</strong>',
    }) as unknown as SSRNode

    expect(renderToString(() => foreignFragment)).toBe(
      '<strong>shared</strong>',
    )
  })

  it('escapes dynamic text while preserving compiler-owned static HTML', () => {
    const view = ssrElement(
      'p',
      [],
      [
        ssrStatic('safe &amp; static'),
        ssrText('<script>alert("x")</script> &'),
      ],
    )

    expect(renderToString(() => view)).toBe(
      '<p>safe &amp; static&lt;script&gt;alert("x")&lt;/script&gt; &amp;</p>',
    )
  })

  it('preserves raw-text semantics while preventing matching end tags', () => {
    expect(
      renderToString(() =>
        ssrElement(
          'script',
          [],
          'const less = 1 < 2; const close = "</script>";',
        ),
      ),
    ).toBe(
      '<script>const less = 1 < 2; const close = "\\u003C/script>";</script>',
    )

    expect(
      renderToString(() =>
        ssrElement(
          'style',
          [],
          '@media (width < 10px) { .x::before { content: "</style>"; } }',
        ),
      ),
    ).toBe(
      '<style>@media (width < 10px) { .x::before { content: "\\3C /style>"; } }</style>',
    )
  })

  it('prevents raw-text end tags split across child nodes', () => {
    expect(
      renderToString(() =>
        ssrElement('script', [], ['const close = "</scr', 'ipt>";']),
      ),
    ).toBe('<script>const close = "\\u003C/script>";</script>')
  })

  it('keeps following HTML outside script double-escaped parser state', () => {
    const html = renderToString(() => [
      ssrElement('script', [], '<!--<script>nested</script>'),
      ssrElement('p', [ssrAttr('id', 'after')], 'after'),
    ])
    const document = new JSDOM(html).window.document

    expect(document.querySelector('#after')?.textContent).toBe('after')
    expect(document.querySelector('script')?.textContent).toBe(
      '<!--\\u003Cscript>nested\\u003C/script>',
    )
  })

  it('rejects serialized fragments inside raw-text elements', () => {
    expect(() =>
      renderToString(() =>
        ssrElement('script', [], ssrText('if (a < b) run();')),
      ),
    ).toThrow(
      'renderToString() does not support serialized fragments inside <script> raw text.',
    )
  })

  it('recursively flattens text-position arrays and omits empty primitives', () => {
    expect(
      renderToString(() => [
        ssrStatic('<strong>trusted</strong>'),
        ['<dynamic>', 2, true, false, null, undefined],
      ]),
    ).toBe('<strong>trusted</strong>&lt;dynamic&gt;2')
  })

  it('serializes attributes, class, style, properties, and void elements', () => {
    const view = ssrElement(
      'input',
      [
        ssrAttr('disabled', true),
        ssrAttr('hidden', false),
        ssrAttr('title', 'say "hello" <now> & later'),
        ssrAttr('className', ['field', { active: true, empty: false }]),
        ssrAttr('style', {
          fontSize: 12,
          lineHeight: 1.5,
          '--tone': 'red',
        }),
        ssrProp('value', 'Ada'),
        ssrProp('value', { ignored: true }),
      ],
      null,
    )

    expect(renderToString(() => view)).toBe(
      '<input disabled title="say &quot;hello&quot; &lt;now&gt; &amp; later" class="field active" style="font-size:12px;line-height:1.5;--tone:red" value="Ada">',
    )
  })

  it('serializes only properties with an equivalent HTML representation', () => {
    const view = [
      ssrElement('input', [
        ssrProp('value', 'Ada'),
        ssrProp('checked', true),
        ssrProp('multiple', true),
        ssrProp('disabled', true),
        ssrProp('readOnly', true),
        ssrProp('tabIndex', -1),
      ]),
      ssrElement('option', [
        ssrProp('value', 'admin'),
        ssrProp('selected', true),
      ]),
      ssrElement('label', [ssrProp('htmlFor', 'email')]),
      ssrElement('select', [
        ssrProp('multiple', true),
        ssrProp('disabled', true),
      ]),
    ]

    expect(renderToString(() => view)).toBe(
      '<input value="Ada" checked multiple disabled readonly tabindex="-1"><option value="admin" selected></option><label for="email"></label><select multiple disabled></select>',
    )
  })

  it('serializes textarea value as escaped text content and overrides children', () => {
    expect(
      renderToString(() =>
        ssrElement(
          'textarea',
          [
            ssrAttr('value', 'static'),
            ssrProp('value', '\nnew <value> & text'),
          ],
          'fallback',
        ),
      ),
    ).toBe('<textarea>\n\nnew &lt;value&gt; &amp; text</textarea>')
  })

  it('lets property bindings override equivalent static attributes', () => {
    expect(
      renderToString(() =>
        ssrElement('input', [
          ssrAttr('checked', true),
          ssrAttr('value', 'fallback'),
          ssrProp('checked', false),
          ssrProp('value', 'current'),
        ]),
      ),
    ).toBe('<input value="current">')
  })

  it('rejects properties without an equivalent HTML representation', () => {
    expect(() => ssrProp('textContent', 'unsafe')).toThrow(
      'SSR cannot serialize property "textContent".',
    )
    expect(() => ssrElement('select', [ssrProp('value', 'admin')])).toThrow(
      'SSR cannot serialize property "value" on <select>.',
    )
  })

  it('normalizes nested class and style values without serializing empty attributes', () => {
    const view = ssrElement('div', [
      ssrAttr('data-zero', 0),
      ssrAttr('data-null', null),
      ssrAttr('data-false', false),
      ssrAttr('class', ['field', ['nested'], { 'selected"unsafe': true }]),
      ssrAttr('style', {
        marginTop: 0,
        lineHeight: 2,
        '--gap': 2,
        color: null,
      }),
    ])

    expect(renderToString(() => view)).toBe(
      '<div data-zero="0" class="field nested selected&quot;unsafe" style="margin-top:0;line-height:2;--gap:2"></div>',
    )
  })

  it('renders components, Show, For, fragments, and indexes in order', () => {
    let componentRuns = 0
    const Item = (props: { name: string; index: number }) => {
      componentRuns++
      return ssrElement(
        'li',
        [ssrAttr('data-index', props.index)],
        [ssrText(props.name)],
      )
    }

    expect(componentRuns).toBe(0)
    expect(
      renderToString(() =>
        ssrShow(
          () => true,
          () =>
            ssrElement(
              'ul',
              [],
              ssrFor(
                () => ['Ada', 'Lin'],
                (name, index) => ssrComponent(Item, { name, index }),
              ),
            ),
          () => ssrStatic('<p>fallback</p>'),
        ),
      ),
    ).toBe('<ul><li data-index="0">Ada</li><li data-index="1">Lin</li></ul>')
    expect(componentRuns).toBe(2)
  })

  it('evaluates only the selected Show branch and skips null For inputs', () => {
    const truthy = vi.fn(() => ssrText('truthy'))
    const fallback = vi.fn(() => ssrText('fallback'))
    const renderItem = vi.fn((item: string) => ssrText(item))

    expect(renderToString(() => ssrShow(() => false, truthy, fallback))).toBe(
      'fallback',
    )
    expect(truthy).not.toHaveBeenCalled()
    expect(fallback).toHaveBeenCalledOnce()
    expect(renderToString(() => ssrFor<string>(() => null, renderItem))).toBe(
      '',
    )
    expect(renderItem).not.toHaveBeenCalled()
  })

  it('exposes server Show and For components with the same serialization semantics', () => {
    expect(
      renderToString(() =>
        Show({
          when: true,
          children: () =>
            For({
              each: ['A', 'B'],
              children: (item, index) => [ssrText(item), ssrText(index)],
            }),
          fallback: ssrText('empty'),
        }),
      ),
    ).toBe('A0B1')
  })

  it('keeps public Show condition semantics aligned with the DOM runtime', () => {
    expect(
      renderToString(() =>
        Show({
          when: () => false,
          children: ssrText('shown'),
          fallback: ssrText('hidden'),
        }),
      ),
    ).toBe('shown')
  })

  it('preserves lazy component props and escapes their rendered values', () => {
    let titleReads = 0
    const Card = (props: {
      readonly title: string
      readonly children: SSRNode
    }) => ssrElement('section', [ssrAttr('title', props.title)], props.children)
    const props = {
      get title() {
        titleReads++
        return '"unsafe" <title>'
      },
      get children() {
        return ssrText('<body>')
      },
    }

    expect(renderToString(() => ssrComponent(Card, props))).toBe(
      '<section title="&quot;unsafe&quot; &lt;title&gt;">&lt;body&gt;</section>',
    )
    expect(titleReads).toBe(1)
  })

  it('disposes the render scope before returning', () => {
    const events: string[] = []

    const html = renderToString(() => {
      events.push('render')
      onCleanup(() => events.push('cleanup'))
      return ssrText('done')
    })

    expect(html).toBe('done')
    expect(events).toEqual(['render', 'cleanup'])
  })

  it('stops owned effects when synchronous rendering completes', () => {
    const observed: number[] = []
    let update!: (value: number) => number

    renderToString(() => {
      const [count, setCount] = createSignal(0)
      update = setCount
      createEffect(() => observed.push(count()))
      return ssrText('done')
    })

    update(1)
    expect(observed).toEqual([0])
  })

  it('runs scope cleanup when rendering throws', () => {
    const cleanup = vi.fn()
    const error = new Error('render failed')

    expect(() =>
      renderToString(() => {
        onCleanup(cleanup)
        throw error
      }),
    ).toThrow(error)
    expect(cleanup).toHaveBeenCalledOnce()
  })
})
