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
      'Host',
      'Show',
      'Slot',
      'batch',
      'createEffect',
      'createMemo',
      'createRoot',
      'createSignal',
      'defineElement',
      'mergeProps',
      'onCleanup',
      'renderToString',
      'ssrAttr',
      'ssrComponent',
      'ssrComponentFromManifest',
      'ssrCustomElement',
      'ssrElement',
      'ssrFor',
      'ssrHydrationMarker',
      'ssrProp',
      'ssrShow',
      'ssrSpread',
      'ssrStatic',
      'ssrText',
    ])
  })

  it('serializes Declarative Shadow DOM without registering the host', () => {
    expect(
      renderToString(() =>
        runtimeSSR.ssrCustomElement('z-card', {
          attributes: [ssrAttr('title', 'Card')],
          shadowRoot: ssrElement('strong', [], 'Hello'),
          shadowRootOptions: {
            mode: 'open',
            delegatesFocus: true,
            serializable: true,
          },
          children: ssrElement('span', [], 'fallback'),
        }),
      ),
    ).toBe(
      '<z-card title="Card"><template shadowrootmode="open" shadowrootdelegatesfocus shadowrootserializable><strong>Hello</strong></template><span>fallback</span></z-card>',
    )
  })

  it('renders a server-only defineElement with DSD, CSS, defaults, and slots', () => {
    const Card = runtimeSSR.defineElement(
      'z-card',
      {
        shadow: true,
        styles: '.card { color: red }',
        props: {
          title: { type: String, default: 'Default', reflect: true },
          count: { type: Number, reflect: true },
          data: { type: Object, attr: false },
        },
      },
      props =>
        runtimeSSR.Host({
          class: 'card',
          children: runtimeSSR.ssrElement(
            'section',
            [],
            [
              runtimeSSR.Slot({ name: 'heading', children: 'Fallback' }),
              runtimeSSR.Slot(),
            ],
          ),
        }),
    )

    expect(
      renderToString(() =>
        Card({
          count: 2,
          data: { value: true },
          children: runtimeSSR.ssrElement('strong', [], 'content'),
        }),
      ),
    ).toBe(
      '<z-card title="Default" count="2" class="card"><template shadowrootmode="open"><style>.card { color: red }</style><section><slot name="heading">Fallback</slot><slot></slot></section></template><strong>content</strong></z-card>',
    )
  })

  it('projects a light-DOM child into only the first matching slot outlet', () => {
    const Field = runtimeSSR.defineElement(
      'z-slot-field',
      { shadow: false },
      () => [
        runtimeSSR.Slot({ name: 'label', children: 'first fallback' }),
        runtimeSSR.Slot({ name: 'label', children: 'second fallback' }),
      ],
    )

    expect(
      renderToString(() =>
        Field({
          children: runtimeSSR.ssrElement(
            'span',
            [ssrAttr('slot', 'label')],
            'projected label',
          ),
        }),
      ),
    ).toBe(
      '<z-slot-field><span slot="label">projected label</span>second fallback</z-slot-field>',
    )
  })

  it('projects consumers with an empty slot attribute into the default slot', () => {
    const Field = runtimeSSR.defineElement(
      'z-slot-default',
      { shadow: false },
      () => runtimeSSR.Slot(),
    )

    expect(
      renderToString(() =>
        Field({
          children: [
            runtimeSSR.ssrElement(
              'span',
              [ssrAttr('slot', '')],
              'explicit default',
            ),
            runtimeSSR.ssrElement('span', [], 'implicit default'),
          ],
        }),
      ),
    ).toBe(
      '<z-slot-default><span slot="">explicit default</span><span>implicit default</span></z-slot-default>',
    )
  })

  it('ignores whitespace-only text in the default light DOM slot', () => {
    const Field = runtimeSSR.defineElement(
      'z-slot-whitespace',
      { shadow: false },
      () => runtimeSSR.Slot({ children: 'fallback' }),
    )

    expect(
      renderToString(() =>
        Field({ children: [' \n\t', runtimeSSR.ssrText(' \n\t')] }),
      ),
    ).toBe('<z-slot-whitespace>fallback</z-slot-whitespace>')
  })

  it('rejects invalid and reserved custom-element names before serialization', () => {
    for (const tag of [
      'z-card><script',
      'notcustom',
      'font-face',
      'xml-widget',
      'xmlwidget-element',
    ]) {
      expect(() => runtimeSSR.ssrCustomElement(tag)).toThrow(
        '[ZEUS_SSR_INVALID_TAG]',
      )
      expect(() => runtimeSSR.defineElement(tag, {}, () => null)).toThrow(
        '[ZEUS_SSR_INVALID_TAG]',
      )
    }
  })

  it('renders a manifest component with primitive attributes and explicit state policy', () => {
    const html = renderToString(() =>
      runtimeSSR.ssrComponentFromManifest(
        {
          schemaVersion: 1,
          components: [
            {
              tag: 'z-input',
              props: {
                value: { type: 'string', reflect: true },
                open: { type: 'boolean', default: false, reflect: true },
                model: { type: 'object', attr: false },
              },
              meta: { shadow: false },
            },
          ],
        },
        'z-input',
        { value: 'Ada', model: { id: 1 } },
        props =>
          runtimeSSR.Host({ children: runtimeSSR.ssrElement('input', []) }),
      ),
    )

    expect(html).toBe('<z-input value="Ada"><input></z-input>')
  })

  it('applies manifest shadow, defaults, and initial form state metadata', () => {
    const html = renderToString(() =>
      runtimeSSR.ssrComponentFromManifest(
        {
          schemaVersion: 1,
          components: [
            {
              tag: 'z-field',
              props: {
                title: {
                  type: 'string',
                  default: 'Default title',
                  reflect: true,
                },
                enabled: {
                  type: 'boolean',
                  default: false,
                  reflect: true,
                },
                value: { type: 'string', attr: false },
              },
              meta: {
                shadow: true,
                formAssociated: true,
              },
            },
          ],
        },
        'z-field',
        { value: 'Ada' },
        props =>
          runtimeSSR.Host({
            children: runtimeSSR.ssrElement('input', [
              runtimeSSR.ssrProp('value', props.value),
            ]),
          }),
      ),
    )

    expect(html).toBe(
      '<z-field title="Default title"><template shadowrootmode="open"><input value="Ada"></template></z-field>',
    )
  })

  it('serializes primitive constructor props and lets Host attributes override them', () => {
    const Field = runtimeSSR.defineElement(
      'z-field',
      {
        props: {
          label: String,
          count: Number,
          active: Boolean,
          model: Object,
        },
      },
      (_props, context) => {
        expect(context.host).toBeUndefined()
        expect(context.internals).toBeUndefined()
        return runtimeSSR.Host({ label: 'Host', children: 'content' })
      },
    )

    expect(
      renderToString(() =>
        Field({ label: 'Prop', count: 0, active: true, model: { id: 1 } }),
      ),
    ).toBe('<z-field count="0" active label="Host">content</z-field>')
  })

  it('evaluates compiler-style Host attribute accessors', () => {
    const Field = runtimeSSR.defineElement('z-accessor', {}, () =>
      runtimeSSR.Host({ 'data-size': () => 'large', children: 'content' }),
    )

    expect(renderToString(() => Field())).toBe(
      '<z-accessor data-size="large">content</z-accessor>',
    )
  })

  it('omits Host property, event, and ref channels from server HTML', () => {
    const Field = runtimeSSR.defineElement('z-host-channels', {}, () =>
      runtimeSSR.Host({
        'data-state': 'ready',
        'prop:value': { id: 1 },
        onClick: () => {},
        ref: () => {},
        children: 'content',
      }),
    )

    expect(renderToString(() => Field())).toBe(
      '<z-host-channels data-state="ready">content</z-host-channels>',
    )
  })

  it('rejects manifest factory defaults unless the caller supplies a value', () => {
    const manifest = {
      schemaVersion: 1,
      components: [
        {
          tag: 'z-clock',
          props: {
            value: {
              type: 'string',
              defaultStrategy: 'factory' as const,
              reflect: true,
            },
          },
        },
      ],
    }

    expect(() =>
      renderToString(() =>
        runtimeSSR.ssrComponentFromManifest(manifest, 'z-clock'),
      ),
    ).toThrow('[ZEUS_SSR_DEFAULT_FACTORY_UNSUPPORTED]')
    expect(
      renderToString(() =>
        runtimeSSR.ssrComponentFromManifest(manifest, 'z-clock', {
          value: 'now',
        }),
      ),
    ).toBe('<z-clock value="now"></z-clock>')
  })

  it('emits validated hydration markers', () => {
    expect(
      renderToString(() => runtimeSSR.ssrHydrationMarker('card.title')),
    ).toBe('<!--zeus:hydrate:card.title-->')
    expect(() => runtimeSSR.ssrHydrationMarker('bad id')).toThrow(
      'Invalid hydration marker id',
    )
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
    expect(() =>
      renderToString(() => Symbol('value') as unknown as SSRNode),
    ).toThrow('renderToString() received an unsupported SSR value.')
  })

  it('rejects functions in Show.when and For.each value positions', () => {
    expect(() => Show({ when: (() => false) as unknown as boolean })).toThrow(
      'Show `when` must be a value',
    )
    expect(() =>
      For({
        each: (() => []) as unknown as readonly string[],
        children: item => item,
      }),
    ).toThrow('<For> `each` must resolve to an array')
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

  it('requires Show conditions to be value expressions', () => {
    expect(
      renderToString(() =>
        Show({
          when: false,
          children: ssrText('shown'),
          fallback: ssrText('hidden'),
        }),
      ),
    ).toBe('hidden')
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
