import { JSDOM } from 'jsdom'
import { afterAll, describe, expect, it, vi } from 'vitest'

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
const { createPortal, flushSync } = await import('react-dom')
const { createRoot } = await import('react-dom/client')
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

  it('keeps both cells when two keys swap containers in one render', () => {
    const host = createRendererHost(
      createReactRenderer((label: string) => h('span', null, label)),
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

  // A cell whose next render throws, triggered outside mount/update/dispose.
  function lateFailure() {
    let explode!: () => void
    function Cell() {
      const [broken, setBroken] = React.useState(false)
      explode = () => setBroken(true)
      if (broken) throw new Error('late render')
      return h('span', null, 'ok')
    }
    return { node: () => h(Cell), explode: () => explode() }
  }

  it('reports errors after a mount returned to onError with the session', async () => {
    const reported: Array<[unknown, RendererSession]> = []
    const cell = lateFailure()
    const adapter = createReactRenderer(cell.node, {
      onError: (error, current) => reported.push([error, current]),
    })
    const current = session('row-1')
    const handle = adapter.mount(container(), undefined, undefined, current)

    cell.explode()
    await vi.waitFor(() => expect(reported).toHaveLength(1))
    expect(reported[0][0]).toMatchObject({ message: 'late render' })
    expect(reported[0][1]).toBe(current)
    // The earlier failure is not attributed to the next synchronous update.
    expect(() => adapter.update(handle, undefined, undefined)).not.toThrow()
    adapter.dispose(handle)
    expect(reported).toHaveLength(1)
  })

  it('passes errors after a mount to reportError, or console.error without it', async () => {
    const reportError = vi.fn()
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})
    // `vi.unstubAllGlobals` would also undo the setup file's stubs, so the
    // global is swapped by hand.
    const target = globalThis as { reportError?: unknown }
    const original = Object.getOwnPropertyDescriptor(target, 'reportError')
    try {
      target.reportError = reportError
      const first = lateFailure()
      const adapter = createReactRenderer(first.node)
      const handle = adapter.mount(container(), undefined, undefined, session())
      first.explode()
      await vi.waitFor(() => expect(reportError).toHaveBeenCalledTimes(1))
      expect(reportError.mock.calls[0][0]).toMatchObject({
        message: 'late render',
      })
      adapter.dispose(handle)

      delete target.reportError
      const second = lateFailure()
      const fallback = createReactRenderer(second.node)
      const other = fallback.mount(container(), undefined, undefined, session())
      second.explode()
      await vi.waitFor(() =>
        expect(consoleError).toHaveBeenCalledWith(
          expect.objectContaining({ message: 'late render' }),
        ),
      )
      fallback.dispose(other)
      expect(reportError).toHaveBeenCalledTimes(1)
    } finally {
      if (original) Object.defineProperty(target, 'reportError', original)
      else delete target.reportError
      consoleError.mockRestore()
    }
  })

  it.each(['useLayoutEffect', 'useEffect'] as const)(
    'throws %s cleanup errors from dispose once and lets the host retry',
    hook => {
      let cleanups = 0
      function Cell() {
        React[hook](
          () => () => {
            cleanups++
            throw new Error('cleanup exploded')
          },
          [],
        )
        return h('span', null, 'cell')
      }
      const adapter = createReactRenderer(() => h(Cell))
      const host = createRendererHost(adapter)
      const target = container()

      host.render([
        {
          key: 'row-1',
          container: target,
          data: undefined,
          context: undefined,
        },
      ])
      expect(() => host.render([])).toThrow(
        expect.objectContaining({
          message:
            '[ZEUS_RENDERER_ADAPTER_FAILURE] React renderer dispose failed for key row-1.',
          cause: expect.objectContaining({ message: 'cleanup exploded' }),
        }),
      )
      expect(target.childNodes).toHaveLength(0)
      // The host retries the pending disposal; the handle is already disposed.
      expect(() => host.render([])).not.toThrow()
      expect(cleanups).toBe(1)

      const handle = adapter.mount(target, undefined, undefined, session())
      expect(() => adapter.dispose(handle)).toThrow(
        '[ZEUS_RENDERER_ADAPTER_FAILURE]',
      )
      expect(handle.state).toBe('disposed')
      expect(() => adapter.dispose(handle)).not.toThrow()
      expect(cleanups).toBe(2)
      host.dispose()
    },
  )

  it.each(['useLayoutEffect', 'useEffect'] as const)(
    'rejects a mount from inside an outer React %s',
    hook => {
      // React logs that flushSync cannot run during a commit; keep it quiet.
      const consoleError = vi
        .spyOn(console, 'error')
        .mockImplementation(() => {})
      try {
        const adapter = createReactRenderer((label: string) =>
          h('span', null, label),
        )
        const target = container()
        let thrown: unknown
        function Outer() {
          React[hook](() => {
            try {
              adapter.mount(target, 'inner', undefined, session('row-1'))
            } catch (error) {
              thrown = error
            }
          }, [])
          return null
        }
        const outer = createRoot(container())
        flushSync(() => outer.render(h(Outer)))

        expect(thrown).toMatchObject({
          message:
            '[ZEUS_RENDERER_ADAPTER_FAILURE] React renderer could not commit key row-1 synchronously. Call mount and update outside React rendering and commits.',
        })
        // The root created for the rejected mount does not render later.
        expect(target.childNodes).toHaveLength(0)
        outer.unmount()
      } finally {
        consoleError.mockRestore()
      }
    },
  )
})
