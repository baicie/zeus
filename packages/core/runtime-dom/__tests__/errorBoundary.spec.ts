import { createSignal, onCleanup } from '@zeus-js/signal'
import { ErrorBoundary, render } from '@zeus-js/zeus'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bindText } from '../src'

describe('ErrorBoundary', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('Element', dom.window.Element)
    vi.stubGlobal('DocumentFragment', dom.window.DocumentFragment)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('renders a fallback after a child factory throws and preserves DOM shape', () => {
    const container = document.createElement('main')
    const onError = vi.fn()
    const error = new Error('boom')

    const dispose = render(
      () =>
        ErrorBoundary({
          children: () => {
            throw error
          },
          fallback: caught => {
            const node = document.createElement('p')
            node.dataset.error = String(caught === error)
            node.textContent = 'fallback'
            return node
          },
          onError,
        }),
      container,
    )

    expect(container.querySelector('[data-error="true"]')?.textContent).toBe(
      'fallback',
    )
    expect(container.children).toHaveLength(1)
    expect(onError).toHaveBeenCalledOnce()

    dispose()
    expect(container.childNodes).toHaveLength(0)
  })

  it('resets the failed child and disposes the previous branch', () => {
    const container = document.createElement('main')
    const [shouldThrow, setShouldThrow] = createSignal(true)
    const cleanups: string[] = []
    let reset!: () => void

    const dispose = render(
      () =>
        ErrorBoundary({
          children: () => {
            const node = document.createElement('span')
            onCleanup(() => cleanups.push('child'))
            if (shouldThrow()) throw new Error('retry')
            node.textContent = 'ready'
            return node
          },
          fallback: (_error, retry) => {
            reset = retry
            const node = document.createElement('strong')
            onCleanup(() => cleanups.push('fallback'))
            node.textContent = 'error'
            return node
          },
        }),
      container,
    )

    expect(container.textContent).toBe('error')
    expect(cleanups).toEqual(['child'])

    setShouldThrow(false)
    reset()

    expect(container.textContent).toBe('ready')
    expect(cleanups).toEqual(['child', 'fallback'])

    dispose()
    expect(cleanups).toEqual(['child', 'fallback', 'child'])
  })

  it('requires explicit child and fallback factories', () => {
    expect(() =>
      render(
        () =>
          ErrorBoundary({
            children: 'value' as never,
            fallback: () => null,
          }),
        document.createElement('main'),
      ),
    ).toThrow('ZEUS_ERROR_BOUNDARY_CHILDREN_REQUIRED')
    expect(() =>
      render(
        () =>
          ErrorBoundary({
            children: () => null,
            fallback: 'value' as never,
          }),
        document.createElement('main'),
      ),
    ).toThrow('ZEUS_ERROR_BOUNDARY_FALLBACK_REQUIRED')
  })

  it('requires an active render scope', () => {
    expect(() =>
      ErrorBoundary({
        children: () => null,
        fallback: () => null,
      }),
    ).toThrow('ZEUS_ERROR_BOUNDARY_SCOPE_REQUIRED')
  })

  it('lets fallback errors escape instead of swallowing them', () => {
    expect(() =>
      render(
        () =>
          ErrorBoundary({
            children: () => {
              throw new Error('child')
            },
            fallback: () => {
              throw new Error('fallback')
            },
          }),
        document.createElement('main'),
      ),
    ).toThrow('fallback')
  })

  it('preserves the child render error when cleanup also fails', () => {
    const childError = new Error('child render')
    const cleanupError = new Error('child cleanup')
    const container = document.createElement('main')

    const dispose = render(
      () =>
        ErrorBoundary({
          children: () => {
            onCleanup(() => {
              throw cleanupError
            })
            throw childError
          },
          fallback: caught => {
            const node = document.createElement('p')
            node.textContent = caught === childError ? 'child' : 'wrong'
            return node
          },
        }),
      container,
    )

    expect(container.textContent).toBe('child')
    dispose()
  })

  it('captures errors from a child binding effect and switches to fallback', () => {
    const container = document.createElement('main')
    const [shouldThrow, setShouldThrow] = createSignal(false)
    const onError = vi.fn()
    const error = new Error('binding')

    const dispose = render(
      () =>
        ErrorBoundary({
          children: () => {
            const text = document.createTextNode('')
            bindText(text, () => {
              if (shouldThrow()) throw error
              return 'ready'
            })
            return text
          },
          fallback: caught => {
            const node = document.createElement('strong')
            node.textContent = caught === error ? 'fallback' : 'wrong'
            return node
          },
          onError,
        }),
      container,
    )

    expect(container.textContent).toBe('ready')
    expect(() => setShouldThrow(true)).not.toThrow()
    expect(container.textContent).toBe('fallback')
    expect(onError).toHaveBeenCalledWith(error)

    dispose()
  })

  it('lets later fallback binding errors escape the failed boundary', () => {
    const container = document.createElement('main')
    const [shouldThrow, setShouldThrow] = createSignal(false)
    const fallbackError = new Error('fallback binding')

    const dispose = render(
      () =>
        ErrorBoundary({
          children: () => {
            throw new Error('child')
          },
          fallback: () => {
            const text = document.createTextNode('fallback')
            bindText(text, () => {
              if (shouldThrow()) throw fallbackError
              return 'fallback'
            })
            return text
          },
        }),
      container,
    )

    expect(() => setShouldThrow(true)).toThrow(fallbackError)
    dispose()
  })

  it('disposes a failed binding scope and can reset it without duplicate effects', () => {
    const container = document.createElement('main')
    const [shouldThrow, setShouldThrow] = createSignal(false)
    const onError = vi.fn()
    const error = new Error('binding retry')
    let reset!: () => void
    let runs = 0

    const dispose = render(
      () =>
        ErrorBoundary({
          children: () => {
            const text = document.createTextNode('')
            bindText(text, () => {
              runs += 1
              if (shouldThrow()) throw error
              return `value-${runs}`
            })
            return text
          },
          fallback: (_caught, retry) => {
            reset = retry
            return document.createTextNode('fallback')
          },
          onError,
        }),
      container,
    )

    setShouldThrow(true)
    expect(container.textContent).toBe('fallback')
    const errorCount = onError.mock.calls.length

    setShouldThrow(false)
    reset()
    expect(container.textContent).toMatch(/^value-/)
    expect(onError).toHaveBeenCalledTimes(errorCount)

    const runsAfterReset = runs
    dispose()
    setShouldThrow(true)
    expect(runs).toBe(runsAfterReset)
  })
})
