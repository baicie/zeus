import { createSignal, onCleanup } from '@zeus-js/signal'
import { scope } from '@zeus-js/signal/internal'
import { JSDOM } from 'jsdom'
import { describe, expect, it, vi } from 'vitest'

import { hydrate, hydratePlan } from '../src'
import { delegateEvents, resetDelegatedEvents } from '../src/events'

describe('hydrate', () => {
  it('reuses marked DOM nodes for text, props, attrs and events', () => {
    const dom = new JSDOM(
      '<main><!--zeus:hydrate:title--><h1><!--zeus:hydrate:title-text-->Server title</h1><!--zeus:hydrate:button--><button>go</button></main>',
    )
    const main = dom.window.document.querySelector('main')!
    const title = main.querySelector('h1')!
    const button = main.querySelector('button')!
    const [value, setValue] = createSignal('Client title')
    const clicks: number[] = []

    const dispose = hydrate(main, context => {
      context.text('title-text', value)
      context.attr('title', 'data-hydrated', () => 'yes')
      context.prop('button', 'disabled', () => false)
      context.event('button', 'click', () => clicks.push(1))
    })

    expect(main.querySelector('h1')).toBe(title)
    expect(title.textContent).toBe('Client title')
    expect(title.getAttribute('data-hydrated')).toBe('yes')
    expect(button.disabled).toBe(false)
    button.dispatchEvent(new dom.window.Event('click', { bubbles: true }))
    expect(clicks).toEqual([1])

    setValue('Updated')
    expect(title.textContent).toBe('Updated')
    dispose()
    button.dispatchEvent(new dom.window.Event('click', { bubbles: true }))
    expect(clicks).toEqual([1])
  })

  it('reports missing or mismatched hydration targets', () => {
    const dom = new JSDOM('<main><!--zeus:hydrate:title--><div></div></main>')
    const main = dom.window.document.querySelector('main')!
    expect(() =>
      hydrate(main, context => context.text('missing', () => 'x')),
    ).toThrow('ZEUS_HYDRATION_MARKER_MISSING: missing')
    expect(() =>
      hydrate(main, context => context.text('title', () => 'x')),
    ).toThrow('ZEUS_HYDRATION_TEXT_TARGET: title')
    expect(() =>
      hydrate(main, context => {
        context.node('title', 'input')
      }),
    ).toThrow('ZEUS_HYDRATION_TAG_MISMATCH: title; expected <input>')
    expect(main.querySelector('div')).not.toBeNull()
  })

  it('reconnects every binding from a compiler hydration plan', () => {
    const dom = new JSDOM(
      '<main><!--zeus:hydrate:c1.root--><!--zeus:hydrate:c1.e1--><button><!--zeus:hydrate:c1.t2-->Server</button></main>',
    )
    const main = dom.window.document.querySelector('main')!
    const button = main.querySelector('button')!
    const [label, setLabel] = createSignal('Client')
    const clicks: number[] = []
    button.focus()

    const dispose = hydratePlan(
      main,
      {
        version: 1,
        components: [
          {
            id: 1,
            templateId: 'c1.root',
            nodes: [
              {
                id: 'c1.root',
                nodeId: 1,
                kind: 'root',
                optional: false,
                bindings: [],
              },
              {
                id: 'c1.e1',
                nodeId: 1,
                kind: 'element',
                optional: false,
                tagName: 'button',
                bindings: [
                  {
                    id: 3,
                    kind: 'event',
                    name: 'click',
                    once: false,
                  },
                ],
              },
              {
                id: 'c1.t2',
                nodeId: 2,
                kind: 'text',
                optional: false,
                bindings: [{ id: 4, kind: 'text', once: false }],
              },
            ],
          },
        ],
      },
      {
        3(context, binding, node) {
          expect(binding.kind).toBe('event')
          expect(node.tagName).toBe('button')
          context.event(node.id, binding.name!, () => clicks.push(1))
        },
        4(context, binding) {
          expect(binding.kind).toBe('text')
          context.text('c1.t2', label)
        },
      },
    )

    expect(main.querySelector('button')).toBe(button)
    expect(dom.window.document.activeElement).toBe(button)
    expect(button.textContent).toBe('Client')
    button.click()
    setLabel('Updated')
    expect(button.textContent).toBe('Updated')
    expect(clicks).toEqual([1])
    dispose()
    button.click()
    setLabel('Disposed')
    expect(clicks).toEqual([1])
    expect(button.textContent).toBe('Updated')
  })

  it('rejects a plan with missing binding handlers and disposes partial work', () => {
    const dom = new JSDOM(
      '<main><!--zeus:hydrate:c1.root--><!--zeus:hydrate:c1.e1--><button>go</button></main>',
    )
    const main = dom.window.document.querySelector('main')!
    const button = main.querySelector('button')!
    expect(() =>
      hydratePlan(
        main,
        {
          version: 1,
          components: [
            {
              id: 1,
              templateId: 'c1.root',
              nodes: [
                {
                  id: 'c1.e1',
                  nodeId: 1,
                  kind: 'element',
                  optional: false,
                  tagName: 'button',
                  bindings: [
                    {
                      id: 3,
                      kind: 'event',
                      name: 'click',
                      once: false,
                    },
                  ],
                },
              ],
            },
          ],
        },
        {},
      ),
    ).toThrow('ZEUS_HYDRATION_HANDLER_MISSING: 3')
    button.click()
  })

  it('reconnects repeated template markers through hydration occurrences', () => {
    const dom = new JSDOM(
      '<main><span><!--zeus:hydrate:c1.t2-->A</span><span><!--zeus:hydrate:c1.t2-->B</span></main>',
    )
    const main = dom.window.document.querySelector('main')!
    const [first, setFirst] = createSignal('First')
    const [second, setSecond] = createSignal('Second')
    const dispose = hydratePlan(
      main,
      {
        version: 1,
        components: [
          {
            id: 1,
            templateId: 'c1.root',
            nodes: [
              {
                id: 'c1.t2',
                nodeId: 2,
                kind: 'text',
                optional: false,
                bindings: [{ id: 4, kind: 'text', once: false }],
              },
            ],
          },
        ],
      },
      {
        4(context, _binding, node, occurrence) {
          context.text(node.id, occurrence === 0 ? first : second, occurrence)
        },
      },
    )
    const spans = Array.from(main.querySelectorAll('span'))
    expect(spans.map(span => span.textContent)).toEqual(['First', 'Second'])
    setFirst('One')
    setSecond('Two')
    expect(spans.map(span => span.textContent)).toEqual(['One', 'Two'])
    dispose()
  })

  it('skips compiler branch nodes that were not rendered on the server', () => {
    const dom = new JSDOM(
      '<main><!--zeus:hydrate:c1.root--><strong>rendered</strong></main>',
    )
    const main = dom.window.document.querySelector('main')!
    let handled = false
    const dispose = hydratePlan(
      main,
      {
        version: 1,
        components: [
          {
            id: 1,
            templateId: 'c1.root',
            nodes: [
              {
                id: 'c1.root',
                nodeId: 1,
                kind: 'root',
                optional: false,
                bindings: [],
              },
              {
                id: 'c1.t2',
                nodeId: 2,
                kind: 'text',
                optional: true,
                bindings: [{ id: 4, kind: 'text', once: false }],
              },
            ],
          },
        ],
      },
      {
        4() {
          handled = true
        },
      },
    )

    expect(handled).toBe(false)
    expect(main.textContent).toBe('rendered')
    dispose()
  })

  it('still rejects a rendered optional marker without a target node', () => {
    const dom = new JSDOM('<main><!--zeus:hydrate:c1.t2--></main>')
    const main = dom.window.document.querySelector('main')!

    expect(() =>
      hydratePlan(
        main,
        {
          version: 1,
          components: [
            {
              id: 1,
              templateId: 'c1.root',
              nodes: [
                {
                  id: 'c1.t2',
                  nodeId: 2,
                  kind: 'text',
                  optional: true,
                  bindings: [{ id: 4, kind: 'text', once: false }],
                },
              ],
            },
          ],
        },
        { 4() {} },
      ),
    ).toThrow('ZEUS_HYDRATION_TARGET_MISSING: c1.t2')
  })

  it('fires once when compiled components have already delegated the event', () => {
    const dom = new JSDOM(
      '<main><!--zeus:hydrate:button--><button>go</button></main>',
    )
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('Node', dom.window.Node)
    const main = document.querySelector('main')!
    const button = main.querySelector('button')!
    const clicks: EventTarget[] = []
    delegateEvents(['click'])
    const dispose = hydrate(main, context => {
      context.event('button', 'click', event =>
        clicks.push(event.currentTarget!),
      )
    })
    try {
      button.click()
      expect(clicks).toEqual([button])
      dispose()
      button.click()
      expect(clicks).toEqual([button])
    } finally {
      dispose()
      resetDelegatedEvents()
      vi.unstubAllGlobals()
    }
  })

  it('rejects duplicate marker ids before setup mutates the existing tree', () => {
    const dom = new JSDOM(
      '<main><!--zeus:hydrate:input--><input><!--zeus:hydrate:input--><button>go</button></main>',
    )
    const main = dom.window.document.querySelector('main')!
    let setupRan = false
    expect(() =>
      hydrate(main, () => {
        setupRan = true
      }),
    ).toThrow('ZEUS_HYDRATION_DUPLICATE_MARKER: input')
    expect(setupRan).toBe(false)
    expect(main.querySelectorAll('input,button')).toHaveLength(2)
  })

  it('preserves the focused input and selection when reconciling equal values', () => {
    const dom = new JSDOM(
      '<main><!--zeus:hydrate:input--><input value="server"></main>',
    )
    const main = dom.window.document.querySelector('main')!
    const input = main.querySelector('input')!
    input.focus()
    input.setSelectionRange(1, 4)
    const [value, setValue] = createSignal(input.value)
    const dispose = hydrate(main, context => {
      context.node('input', 'input')
      context.prop('input', 'value', value)
    })
    expect(dom.window.document.activeElement).toBe(input)
    expect([input.selectionStart, input.selectionEnd]).toEqual([1, 4])
    setValue('updated')
    expect(input.value).toBe('updated')
    dispose()
    setValue('disposed')
    expect(input.value).toBe('updated')
  })

  it('releases attached events and reactive bindings when setup fails', () => {
    const dom = new JSDOM(
      '<main><!--zeus:hydrate:button--><button><!--zeus:hydrate:text-->server</button></main>',
    )
    const main = dom.window.document.querySelector('main')!
    const button = main.querySelector('button')!
    const [value, setValue] = createSignal('initial')
    let clicks = 0
    expect(() =>
      hydrate(main, context => {
        context.text('text', value)
        context.event('button', 'click', () => {
          clicks++
        })
        context.node('missing')
      }),
    ).toThrow('ZEUS_HYDRATION_MARKER_MISSING: missing')
    setValue('leaked')
    button.click()
    expect(button.textContent).toBe('initial')
    expect(clicks).toBe(0)
  })

  it('preserves the hydration mismatch while attempting all failing setup cleanup', () => {
    const dom = new JSDOM(
      '<main><!--zeus:hydrate:button--><button>go</button></main>',
    )
    const main = dom.window.document.querySelector('main')!
    const button = main.querySelector('button')!
    let clicks = 0
    const cleanup = vi.fn()
    try {
      expect(() =>
        hydrate(main, context => {
          context.event('button', 'click', () => clicks++)
          onCleanup(() => {
            throw new Error('cleanup failed')
          })
          onCleanup(cleanup)
          context.node('missing')
        }),
      ).toThrow('ZEUS_HYDRATION_MARKER_MISSING: missing')
      expect(cleanup).toHaveBeenCalledOnce()
      button.click()
      expect(clicks).toBe(0)
    } finally {
      dom.window.close()
    }
  })

  it('hydrates a ShadowRoot from its own DOM realm and releases direct events', () => {
    const dom = new JSDOM('<main></main>')
    const shadow = dom.window.document.querySelector('main')!.attachShadow({
      mode: 'open',
    })
    shadow.innerHTML =
      '<!--zeus:hydrate:input--><input><!--zeus:hydrate:text-->server'
    const input = shadow.querySelector('input')!
    const [value, setValue] = createSignal('client')
    let focuses = 0
    const dispose = hydrate(shadow, context => {
      expect(context.node('input', 'input')).toBe(input)
      context.text('text', value)
      context.event('input', 'focus', () => focuses++)
    })
    try {
      input.dispatchEvent(new dom.window.Event('focus'))
      setValue('updated')
      expect(focuses).toBe(1)
      expect(shadow.textContent).toBe('updated')
      dispose()
      input.dispatchEvent(new dom.window.Event('focus'))
      setValue('disposed')
      expect(focuses).toBe(1)
      expect(shadow.textContent).toBe('updated')
      expect(shadow.querySelector('input')).toBe(input)
    } finally {
      dispose()
      dom.window.close()
    }
  })

  it.each([
    'dispose',
    'setup failure',
    'parent scope stop',
    'created during parent disposal',
  ] as const)(
    'reports the hydration owner disposal to DevTools on %s',
    mode => {
      const dom = new JSDOM('<main></main>')
      const events: { type: string; ownerId?: number }[] = []
      Object.defineProperty(dom.window, '__ZEUS_DEVTOOLS_HOOK__', {
        value: {
          emit: (event: { type: string; ownerId?: number }) =>
            events.push(event),
        },
      })
      vi.stubGlobal('window', dom.window)
      try {
        const main = dom.window.document.querySelector('main')!
        if (mode === 'setup failure') {
          expect(() =>
            hydrate(main, () => {
              throw new Error('setup failed')
            }),
          ).toThrow('setup failed')
        } else if (mode === 'created during parent disposal') {
          const parentScope = scope()
          const setup = vi.fn()
          parentScope.run(() => onCleanup(() => hydrate(main, setup)))
          parentScope.stop()
          expect(setup).not.toHaveBeenCalled()
        } else if (mode === 'parent scope stop') {
          const parentScope = scope()
          const dispose = parentScope.run(() => hydrate(main, () => {}))!
          parentScope.stop()
          dispose()
        } else {
          const dispose = hydrate(main, () => {})
          dispose()
          dispose()
        }
        const created = events.filter(event => event.type === 'owner:create')
        const disposed = events.filter(event => event.type === 'owner:dispose')
        expect(created).toHaveLength(
          mode === 'created during parent disposal' ? 0 : 1,
        )
        expect(disposed.map(event => event.ownerId)).toEqual(
          created.map(event => event.ownerId),
        )
      } finally {
        vi.unstubAllGlobals()
        dom.window.close()
      }
    },
  )
})
