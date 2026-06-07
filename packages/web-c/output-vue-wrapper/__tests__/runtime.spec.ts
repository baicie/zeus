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
      props: ['value'],
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
})
