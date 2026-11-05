import { JSDOM } from 'jsdom'
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest'

import type { RendererSession } from '@zeus-js/web-c-runtime'

// @vue/runtime-dom captures `document` when it loads, so the DOM must be in
// place before Vue (or the adapter, which imports it) is imported.
const dom = new JSDOM('<!doctype html><html><body></body></html>')
const globals = {
  window: dom.window,
  document: dom.window.document,
  Node: dom.window.Node,
  Element: dom.window.Element,
  HTMLElement: dom.window.HTMLElement,
  SVGElement: dom.window.SVGElement,
  Text: dom.window.Text,
  Comment: dom.window.Comment,
}
const previous = new Map<string, unknown>()
for (const [name, value] of Object.entries(globals)) {
  previous.set(name, (globalThis as Record<string, unknown>)[name])
  Object.defineProperty(globalThis, name, {
    value,
    configurable: true,
    writable: true,
  })
}

const {
  Teleport,
  createApp,
  defineComponent,
  h,
  inject,
  nextTick,
  onMounted,
  onUnmounted,
  ref,
} = await import('vue')
const { createRendererHost } = await import('@zeus-js/web-c-runtime')
const { createVueRenderer } = await import('../src/renderer')

afterEach(() => {
  document.body.replaceChildren()
})

afterAll(() => {
  for (const [name, value] of previous) {
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    })
  }
  dom.window.close()
})

function container(): HTMLElement {
  const element = document.createElement('div')
  document.body.append(element)
  return element
}

function session(key: PropertyKey = 'a', generation = 1): RendererSession {
  return { key, generation, signal: new AbortController().signal }
}

describe('createVueRenderer', () => {
  it('patches synchronously, keeps component state and unmounts on dispose', () => {
    const log: string[] = []
    const Cell = defineComponent({
      props: { label: { type: String, required: true } },
      setup(props) {
        const clicks = ref(0)
        onMounted(() => log.push('mounted'))
        onUnmounted(() => log.push('unmounted'))
        return () =>
          h(
            'button',
            { 'data-clicks': clicks.value, onClick: () => clicks.value++ },
            props.label,
          )
      },
    })
    const adapter = createVueRenderer((label: string) => h(Cell, { label }))
    const target = container()

    const handle = adapter.mount(target, 'first', undefined, session())
    const button = target.querySelector('button')!
    expect(button.textContent).toBe('first')
    expect(log).toEqual(['mounted'])

    adapter.update(handle, 'second', undefined)
    expect(target.querySelector('button')).toBe(button)
    expect(button.textContent).toBe('second')

    adapter.dispose(handle)
    expect(handle.state).toBe('disposed')
    expect(target.childNodes).toHaveLength(0)
    expect(log).toEqual(['mounted', 'unmounted'])
    expect(() => adapter.dispose(handle)).not.toThrow()
  })

  it('removes teleported content from its external target on dispose', () => {
    const teleportTarget = container()
    const adapter = createVueRenderer((label: string) =>
      h(Teleport, { to: teleportTarget }, [h('p', label)]),
    )

    const handle = adapter.mount(container(), 'overlay', undefined, session())
    expect(teleportTarget.textContent).toBe('overlay')

    adapter.dispose(handle)
    expect(teleportTarget.textContent).toBe('')
    expect(teleportTarget.isConnected).toBe(true)
  })

  it('resolves provides from the application context', () => {
    const app = createApp({})
    app.provide('theme', 'dark')
    const Cell = defineComponent({
      setup() {
        const theme = inject<string>('theme')
        return () => h('span', theme)
      },
    })
    const adapter = createVueRenderer(() => h(Cell), {
      appContext: app._context,
    })
    const target = container()

    const handle = adapter.mount(target, undefined, undefined, session())
    expect(target.textContent).toBe('dark')
    adapter.dispose(handle)
  })

  it('reports errors from the render function and descendants', () => {
    const Broken = defineComponent({
      setup() {
        throw new Error('setup exploded')
      },
    })
    const throwing = createVueRenderer(() => {
      throw new Error('render exploded')
    })
    const descendant = createVueRenderer(() => h(Broken))
    const first = container()
    const second = container()

    expect(() =>
      throwing.mount(first, undefined, undefined, session('row-1')),
    ).toThrow(
      expect.objectContaining({
        message:
          '[ZEUS_RENDERER_ADAPTER_FAILURE] Vue renderer failed for key row-1.',
        cause: expect.objectContaining({ message: 'render exploded' }),
      }),
    )
    expect(() =>
      descendant.mount(second, undefined, undefined, session('row-2')),
    ).toThrow(
      expect.objectContaining({
        cause: expect.objectContaining({ message: 'setup exploded' }),
      }),
    )
    // Vue warns once the failed setup leaves the component without a render.
    expect(
      'Component is missing template or render function',
    ).toHaveBeenWarned()
    expect(first.childNodes).toHaveLength(0)
    expect(second.childNodes).toHaveLength(0)
  })

  it('diagnoses disposed and foreign handles', () => {
    const adapter = createVueRenderer((label: string) => label)
    const other = createVueRenderer((label: string) => label)
    const handle = adapter.mount(container(), 'a', undefined, session())
    const foreign = other.mount(container(), 'b', undefined, session('b'))

    expect(() => adapter.update(foreign, 'x', undefined)).toThrow(
      '[ZEUS_RENDERER_CONTAINER_MISMATCH]',
    )
    adapter.dispose(handle)
    expect(() => adapter.update(handle, 'x', undefined)).toThrow(
      '[ZEUS_RENDERER_DISPOSED]',
    )
    other.dispose(foreign)
  })

  it('returns to baseline after 60 host mount/unmount cycles', () => {
    let active = 0
    const Cell = defineComponent({
      props: { label: { type: String, required: true } },
      setup(props) {
        onMounted(() => active++)
        onUnmounted(() => active--)
        return () => h('span', props.label)
      },
    })
    const host = createRendererHost(
      createVueRenderer((label: string) => h(Cell, { label })),
    )
    const cells = Array.from({ length: 3 }, container)

    for (let cycle = 0; cycle < 60; cycle++) {
      host.render(
        cells.map((element, index) => ({
          key: `row-${index}`,
          container: element,
          data: `cycle-${cycle}`,
          context: undefined,
        })),
      )
      expect(active).toBe(3)
      host.render([])
    }
    host.dispose()

    expect(active).toBe(0)
    expect(cells.every(element => element.childNodes.length === 0)).toBe(true)
  })

  it('keeps both cells when two keys swap containers in one render', () => {
    const host = createRendererHost(
      createVueRenderer((label: string) => h('span', label)),
    )
    const c1 = container()
    const c2 = container()

    host.render([
      { key: 'a', container: c1, data: 'A', context: undefined },
      { key: 'b', container: c2, data: 'B', context: undefined },
    ])
    host.render([
      { key: 'a', container: c2, data: 'A', context: undefined },
      { key: 'b', container: c1, data: 'B', context: undefined },
    ])

    expect({ c1: c1.textContent, c2: c2.textContent }).toEqual({
      c1: 'B',
      c2: 'A',
    })
    host.dispose()
    expect(c1.childNodes).toHaveLength(0)
    expect(c2.childNodes).toHaveLength(0)
  })

  it('lets errors after a patch reach the application error handler', async () => {
    const app = createApp({})
    const errorHandler = vi.fn()
    app.config.errorHandler = errorHandler
    const broken = ref(false)
    const Cell = defineComponent({
      setup() {
        return () => {
          if (broken.value) throw new Error('late render')
          return h('span', 'ok')
        }
      },
    })
    const adapter = createVueRenderer(() => h(Cell), {
      appContext: app._context,
    })
    const handle = adapter.mount(container(), undefined, undefined, session())

    broken.value = true
    await nextTick()
    expect(errorHandler).toHaveBeenCalledTimes(1)
    expect(errorHandler.mock.calls[0][0]).toMatchObject({
      message: 'late render',
    })
    // The earlier failure is not attributed to the next synchronous patch.
    broken.value = false
    expect(() => adapter.update(handle, undefined, undefined)).not.toThrow()
    adapter.dispose(handle)
    expect(errorHandler).toHaveBeenCalledTimes(1)
  })

  it('throws unmount hook errors from dispose once and lets the host retry', () => {
    let unmounts = 0
    const Cell = defineComponent({
      setup() {
        onUnmounted(() => {
          unmounts++
          throw new Error('unmount exploded')
        })
        return () => h('span', 'cell')
      },
    })
    const adapter = createVueRenderer(() => h(Cell))
    const host = createRendererHost(adapter)
    const target = container()

    host.render([
      { key: 'row-1', container: target, data: undefined, context: undefined },
    ])
    expect(() => host.render([])).toThrow(
      expect.objectContaining({
        message:
          '[ZEUS_RENDERER_ADAPTER_FAILURE] Vue renderer dispose failed for key row-1.',
        cause: expect.objectContaining({ message: 'unmount exploded' }),
      }),
    )
    expect(target.childNodes).toHaveLength(0)
    // The host retries the pending disposal; the handle is already disposed.
    expect(() => host.render([])).not.toThrow()
    expect(unmounts).toBe(1)

    const handle = adapter.mount(target, undefined, undefined, session())
    expect(() => adapter.dispose(handle)).toThrow(
      '[ZEUS_RENDERER_ADAPTER_FAILURE]',
    )
    expect(handle.state).toBe('disposed')
    expect(() => adapter.dispose(handle)).not.toThrow()
    expect(unmounts).toBe(2)
    host.dispose()
  })

  it('re-renders on update when the data reference is unchanged', () => {
    const row = { label: 'first' }
    const adapter = createVueRenderer((data: typeof row) =>
      h('span', data.label),
    )
    const target = container()

    const handle = adapter.mount(target, row, undefined, session())
    row.label = 'second'
    adapter.update(handle, row, undefined)
    expect(target.textContent).toBe('second')
    adapter.dispose(handle)
  })
})
