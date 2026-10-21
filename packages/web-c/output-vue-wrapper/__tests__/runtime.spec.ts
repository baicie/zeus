import { JSDOM } from 'jsdom'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

describe('output-vue-wrapper runtime', () => {
  let dom: JSDOM

  beforeAll(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('window', dom.window)
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('SVGElement', dom.window.SVGElement)
    vi.stubGlobal('Element', dom.window.Element)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent)
    vi.stubGlobal('customElements', dom.window.customElements)
  })

  afterAll(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('bridges named v-model events from Web Component events', async () => {
    const { defineComponent, h, nextTick, ref } = await import('vue')
    const { defineContainer } = await import('../src/runtime')

    const ZModelInput = defineContainer({
      tagName: 'z-model-input',
      props: { value: 'value' },
      events: ['value-change'],
      model: {
        prop: 'value',
        event: 'value-change',
        eventPath: 'detail.value',
      },
    })

    const received: string[] = []
    const Root = defineComponent(() => {
      const value = ref('initial')

      return () =>
        h(ZModelInput, {
          value: value.value,
          'onUpdate:value': (next: string) => {
            value.value = next
            received.push(next)
          },
        })
    })

    const { createApp } = await import('vue')
    const root = document.createElement('div')
    document.body.append(root)

    const app = createApp(Root)
    app.mount(root)
    await nextTick()

    const el = root.querySelector('z-model-input')!
    el.dispatchEvent(
      new CustomEvent('value-change', {
        bubbles: true,
        detail: { value: 'next' },
      }),
    )
    await nextTick()

    expect(received).toEqual(['next'])

    app.unmount()
    root.remove()
  })

  it('supports multiple Web Component events for one model', async () => {
    const { defineComponent, h, nextTick, ref } = await import('vue')
    const { defineContainer } = await import('../src/runtime')

    const ZModelInput = defineContainer({
      tagName: 'z-model-input',
      props: { value: 'value' },
      model: {
        prop: 'value',
        event: ['value-input', 'value-change'],
        eventPath: 'detail.value',
      },
    })

    const received: string[] = []
    const Root = defineComponent(() => {
      const value = ref('initial')

      return () =>
        h(ZModelInput, {
          value: value.value,
          'onUpdate:value': (next: string) => {
            value.value = next
            received.push(next)
          },
        })
    })

    const { createApp } = await import('vue')
    const root = document.createElement('div')
    document.body.append(root)

    const app = createApp(Root)
    app.mount(root)
    await nextTick()

    const el = root.querySelector('z-model-input')!
    el.dispatchEvent(
      new CustomEvent('value-input', {
        bubbles: true,
        detail: { value: 'typed' },
      }),
    )
    await nextTick()

    expect(received).toEqual(['typed'])

    app.unmount()
    root.remove()
  })

  it('preserves named text and element slot children', async () => {
    const { Fragment, defineComponent, h, nextTick } = await import('vue')
    const { defineContainer } = await import('../src/runtime')

    const ZSlots = defineContainer({
      tagName: 'z-slot-probe',
      slots: ['prefix', 'suffix'],
    })
    const Root = defineComponent(
      () => () =>
        h(ZSlots, null, {
          default: () => 'Golden',
          prefix: () => h(Fragment, null, ['P', h('em', null, '!')]),
          suffix: () => h('strong', null, 'S'),
        }),
    )

    const { createApp } = await import('vue')
    const root = document.createElement('div')
    document.body.append(root)

    const app = createApp(Root)
    app.mount(root)
    await nextTick()

    const host = root.querySelector('z-slot-probe')!
    expect(host.textContent).toBe('GoldenP!S')
    expect(host.querySelector('[slot="prefix"]')?.textContent).toBe('P!')
    expect(host.querySelector('[slot="suffix"]')?.textContent).toBe('S')

    app.unmount()
    root.remove()
  })

  it('projects Vue default, prefix, and suffix text into Zeus light DOM outlets', async () => {
    const { defineComponent, h, nextTick } = await import('vue')
    const { defineContainer } = await import('../src/runtime')
    const { defineElement } =
      await import('../../../core/runtime-dom/src/defineElement')
    const { Slot } = await import('../../../core/runtime-dom/src/webComponents')
    const { insertTracked } =
      await import('../../../core/runtime-dom/src/insert')

    const tagName = 'z-vue-slot-projection'
    defineElement(tagName, { shadow: false }, () => {
      const button = document.createElement('button')

      for (const [name, selector] of [
        ['prefix', 'button-prefix'],
        [undefined, 'button-label'],
        ['suffix', 'button-suffix'],
      ] as const) {
        const outlet = document.createElement('span')
        outlet.dataset.slot = selector
        insertTracked(outlet, Slot(name ? { name } : {}))
        button.append(outlet)
      }

      return button
    })
    const ZButton = defineContainer({
      tagName,
      slots: ['prefix', 'suffix'],
    })
    const Root = defineComponent(
      () => () =>
        h(ZButton, null, {
          default: () => 'Golden',
          prefix: () => 'P',
          suffix: () => 'S',
        }),
    )
    const root = document.createElement('div')
    document.body.append(root)

    const app = (await import('vue')).createApp(Root)
    app.mount(root)
    await nextTick()

    const host = root.querySelector(tagName)!
    expect(host.querySelector('[data-slot="button-prefix"]')?.textContent).toBe(
      'P',
    )
    expect(host.querySelector('[data-slot="button-label"]')?.textContent).toBe(
      'Golden',
    )
    expect(host.querySelector('[data-slot="button-suffix"]')?.textContent).toBe(
      'S',
    )

    app.unmount()
    root.remove()
  })
})
