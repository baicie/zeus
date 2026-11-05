import { createSignal } from '@zeus-js/signal'
import {
  createRuntimeDiagnosticsSession,
  onScopeDispose,
} from '@zeus-js/signal/internal'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  bindText,
  createContext,
  createOwner,
  inject,
  mountShow,
  provide,
  render,
  runWithOwner,
} from '../src'
import { renderWithPreservedNodes } from '../src/render'

describe('render', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('Node', dom.window.Node)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('renders into container', () => {
    const container = document.createElement('div')
    const el = document.createElement('span')

    render(el, container)

    expect(container.firstChild).toBe(el)
  })

  it('clears container on dispose', () => {
    const container = document.createElement('div')
    const el = document.createElement('span')

    const dispose = render(el, container)

    expect(container.firstChild).toBe(el)

    dispose()

    expect(container.firstChild).toBe(null)
  })

  it('stops effects after dispose', async () => {
    const { state } = await import('@zeus-js/signal/internal')
    const container = document.createElement('div')
    const count = state(0)

    const dispose = render(() => {
      const text = document.createTextNode('')
      bindText(text, () => String(count.value))
      return text
    }, container)

    expect(container.textContent).toBe('0')

    dispose()

    count.value++

    expect(container.textContent).toBe('')
  })

  it('allows dispose to be called twice', () => {
    const container = document.createElement('div')
    const el = document.createElement('span')

    const dispose = render(el, container)

    dispose()
    dispose()

    expect(container.firstChild).toBe(null)
  })

  it('clears the DOM when scope cleanup throws', async () => {
    const { onScopeDispose } = await import('@zeus-js/signal/internal')
    const container = document.createElement('div')
    const failure = new Error('render cleanup failed')

    const dispose = render(() => {
      onScopeDispose(() => {
        throw failure
      })
      return document.createElement('span')
    }, container)

    expect(() => dispose()).toThrow(failure)
    expect(container.childNodes).toHaveLength(0)
    expect(() => dispose()).not.toThrow()
  })

  it('reports a stopped parent scope and keeps disposal idempotent', async () => {
    const { scope, onScopeDispose } = await import('@zeus-js/signal/internal')
    const parent = scope(true)
    const container = document.createElement('div')
    let cleanups = 0
    let dispose!: ReturnType<typeof renderWithPreservedNodes>
    parent.run(() => {
      dispose = renderWithPreservedNodes(() => {
        onScopeDispose(() => cleanups++)
        return document.createElement('span')
      }, container)
    })
    expect(dispose.active).toBe(true)
    parent.stop()
    expect(dispose.active).toBe(false)
    expect(cleanups).toBe(1)
    dispose()
    dispose()
    expect(cleanups).toBe(1)
    expect(container.childNodes).toHaveLength(0)
  })

  it('reports inactive when an already stopped owner prevents setup', async () => {
    const { scope, onScopeDispose } = await import('@zeus-js/signal/internal')
    const parent = scope(true)
    const container = document.createElement('div')
    let setups = 0
    let dispose!: ReturnType<typeof renderWithPreservedNodes>
    parent.run(() => {
      onScopeDispose(() => {
        dispose = renderWithPreservedNodes(() => {
          setups++
          return document.createElement('span')
        }, container)
      })
    })
    parent.stop()
    expect(setups).toBe(0)
    expect(dispose.active).toBe(false)
    expect(() => {
      dispose()
      dispose()
    }).not.toThrow()
    expect(container.childNodes).toHaveLength(0)
  })

  it('clears container on re-render', () => {
    const container = document.createElement('div')
    const child = document.createElement('p')
    child.textContent = 'old'
    container.appendChild(child)

    const dispose = render(() => {
      const span = document.createElement('span')
      span.textContent = 'new'
      return span
    }, container)

    expect(container.firstChild?.textContent).toBe('new')
    expect(container.querySelector('p')).toBe(null)

    dispose()
  })

  it('renders reactive text binding', async () => {
    const { state } = await import('@zeus-js/signal/internal')
    const container = document.createElement('div')
    const count = state(0)

    const dispose = render(() => {
      const text = document.createTextNode('')
      bindText(text, () => String(count.value))
      return text
    }, container)

    expect(container.textContent).toBe('0')

    count.value = 1
    expect(container.textContent).toBe('1')

    count.value = 2
    expect(container.textContent).toBe('2')

    dispose()
  })

  it('does not update DOM after dispose even if state changes', async () => {
    const { state } = await import('@zeus-js/signal/internal')
    const container = document.createElement('div')
    const count = state(0)

    const dispose = render(() => {
      const text = document.createTextNode('')
      bindText(text, () => String(count.value))
      return text
    }, container)

    expect(container.textContent).toBe('0')

    dispose()

    count.value = 42

    expect(container.textContent).toBe('')
  })
  it('keeps a caller-provided owner usable after one render is disposed', () => {
    const context = createContext<string>()
    const owner = createOwner(undefined)
    runWithOwner(owner, () => provide(context, 'shared'))
    const first = document.createElement('div')
    const second = document.createElement('div')
    const [visible, setVisible] = createSignal(false)

    const disposeFirst = render(() => document.createTextNode('first'), first, {
      owner,
    })
    const disposeSecond = render(
      () => {
        const fragment = document.createDocumentFragment()
        const anchor = document.createComment('')
        fragment.append(anchor)
        mountShow(fragment, anchor, visible, () =>
          document.createTextNode(inject(context)),
        )
        return fragment
      },
      second,
      { owner },
    )

    disposeFirst()
    expect(() => setVisible(true)).not.toThrow()
    expect(second.textContent).toBe('shared')

    disposeSecond()
    expect(runWithOwner(owner, () => inject(context))).toBe('shared')
  })

  it('releases bindings, cleanup and its own owner when setup throws', () => {
    const container = document.createElement('div')
    const [count, setCount] = createSignal(0)
    const text = document.createTextNode('')
    const failure = new Error('setup failed')
    let cleanups = 0
    const diagnostics = createRuntimeDiagnosticsSession()

    expect(() =>
      diagnostics.run(() =>
        render(() => {
          bindText(text, () => String(count()))
          onScopeDispose(() => cleanups++)
          container.append(text)
          throw failure
        }, container),
      ),
    ).toThrow(failure)

    setCount(5)
    expect(text.data).toBe('0')
    expect(cleanups).toBe(1)
    expect(container.childNodes).toHaveLength(0)
    expect(diagnostics.snapshot()).toMatchObject({
      ownersCreated: 1,
      ownersDisposed: 1,
      bindingsCreated: 1,
      bindingsDisposed: 1,
    })
    diagnostics.dispose()
  })

  it('keeps the setup error when cleanup also throws during the failed render', () => {
    const container = document.createElement('div')
    const failure = new Error('setup failed')

    expect(() =>
      render(() => {
        onScopeDispose(() => {
          throw new Error('cleanup failed')
        })
        throw failure
      }, container),
    ).toThrow(failure)
    expect(container.childNodes).toHaveLength(0)
  })

  it('does not release a caller-provided owner when setup throws', () => {
    const context = createContext<string>()
    const owner = createOwner(undefined)
    runWithOwner(owner, () => provide(context, 'kept'))

    expect(() =>
      render(
        () => {
          throw new Error('setup failed')
        },
        document.createElement('div'),
        { owner },
      ),
    ).toThrow('setup failed')
    expect(runWithOwner(owner, () => inject(context))).toBe('kept')
  })
})
