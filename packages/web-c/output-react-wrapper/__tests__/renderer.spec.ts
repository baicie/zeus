import { JSDOM } from 'jsdom'
import { afterAll, describe, expect, it } from 'vitest'

import type { RendererSession } from '@zeus-js/web-c-runtime'

// React DOM detects the DOM when it loads, so install it before importing.
const dom = new JSDOM('<!doctype html><html><body></body></html>')
const globals = {
  window: dom.window,
  document: dom.window.document,
  navigator: dom.window.navigator,
  HTMLElement: dom.window.HTMLElement,
  HTMLIFrameElement: dom.window.HTMLIFrameElement,
  Element: dom.window.Element,
  Node: dom.window.Node,
  Text: dom.window.Text,
  Event: dom.window.Event,
  MouseEvent: dom.window.MouseEvent,
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

const React = await import('react')
const { createPortal } = await import('react-dom')
const { createRendererHost } = await import('@zeus-js/web-c-runtime')
const { createReactRenderer } = await import('../src/renderer')

afterAll(async () => {
  // Let React's scheduler finish queued work before the DOM globals go away.
  await new Promise(resolve => setTimeout(resolve, 50))
  for (const [name, value] of previous) {
    Object.defineProperty(globalThis, name, {
      value,
      configurable: true,
      writable: true,
    })
  }
  dom.window.close()
})

const h = React.createElement

function container(): HTMLElement {
  const element = document.createElement('div')
  document.body.append(element)
  return element
}

function session(key: PropertyKey = 'a', generation = 1): RendererSession {
  return { key, generation, signal: new AbortController().signal }
}

describe('createReactRenderer', () => {
  it('commits synchronously, keeps state across updates and cleans up effects', () => {
    const log: string[] = []
    function Cell(props: { label: string }) {
      const [renders, setRenders] = React.useState(0)
      React.useEffect(() => {
        log.push('effect')
        return () => {
          log.push('cleanup')
        }
      }, [])
      React.useEffect(() => {
        if (renders === 0) setRenders(1)
      }, [renders])
      return h('span', { 'data-renders': renders }, props.label)
    }
    const adapter = createReactRenderer((label: string) => h(Cell, { label }))
    const target = container()

    const handle = adapter.mount(target, 'first', undefined, session())
    const span = target.querySelector('span')!
    expect(span.textContent).toBe('first')
    expect(log).toEqual(['effect'])

    adapter.update(handle, 'second', undefined)
    expect(target.querySelector('span')).toBe(span)
    expect(span.textContent).toBe('second')
    expect(span.getAttribute('data-renders')).toBe('1')

    adapter.dispose(handle)
    expect(handle.state).toBe('disposed')
    expect(target.childNodes).toHaveLength(0)
    expect(log).toEqual(['effect', 'cleanup'])
    expect(() => adapter.dispose(handle)).not.toThrow()
  })

  it('removes portal content from its external target on dispose', () => {
    const portalTarget = container()
    const adapter = createReactRenderer((label: string) =>
      h('div', null, createPortal(h('p', null, label), portalTarget)),
    )
    const target = container()

    const handle = adapter.mount(target, 'overlay', undefined, session())
    expect(portalTarget.textContent).toBe('overlay')

    adapter.dispose(handle)
    expect(portalTarget.childNodes).toHaveLength(0)
    expect(portalTarget.isConnected).toBe(true)
  })

  it('balances StrictMode effects and isolates every root', () => {
    let mounts = 0
    let cleanups = 0
    function Cell() {
      React.useEffect(() => {
        mounts++
        return () => {
          cleanups++
        }
      }, [])
      return h('i')
    }
    const adapter = createReactRenderer(() => h(Cell), { strict: true })
    const handles = Array.from({ length: 3 }, (_, index) =>
      adapter.mount(container(), undefined, undefined, session(index)),
    )

    expect(mounts).toBe(6)
    expect(cleanups).toBe(3)
    for (const handle of handles) adapter.dispose(handle)
    expect(cleanups).toBe(mounts)
  })

  it('reports render errors and leaves no rendered content behind', () => {
    function Broken(): never {
      throw new Error('cell exploded')
    }
    const adapter = createReactRenderer(() => h(Broken))
    const target = container()

    expect(() =>
      adapter.mount(target, undefined, undefined, session('row-1')),
    ).toThrow(
      expect.objectContaining({
        message:
          '[ZEUS_RENDERER_ADAPTER_FAILURE] React renderer failed for key row-1.',
        cause: expect.objectContaining({ message: 'cell exploded' }),
      }),
    )
    expect(target.childNodes).toHaveLength(0)
  })

  it('diagnoses disposed and foreign handles', () => {
    const adapter = createReactRenderer((label: string) => label)
    const other = createReactRenderer((label: string) => label)
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

  it('returns to baseline after 60 host mount/unmount cycles and ignores stale sessions', async () => {
    let active = 0
    const applied: string[] = []
    function Cell(props: { label: string; session: RendererSession }) {
      React.useEffect(() => {
        active++
        const { signal, generation } = props.session
        const timer = setTimeout(() => {
          if (!signal.aborted) applied.push(`${props.label}#${generation}`)
        })
        return () => {
          active--
          clearTimeout(timer)
        }
      }, [props.label, props.session])
      return h('span', null, props.label)
    }
    const host = createRendererHost(
      createReactRenderer((label: string, _context: undefined, session) =>
        h(Cell, { label, session }),
      ),
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
      host.render([])
    }
    expect(active).toBe(0)
    expect(cells.every(element => element.childNodes.length === 0)).toBe(true)

    host.render([
      { key: 'row-0', container: cells[0], data: 'kept', context: undefined },
    ])
    await new Promise(resolve => setTimeout(resolve, 10))
    host.dispose()

    expect(applied).toEqual(['kept#181'])
    expect(active).toBe(0)
  })
})
