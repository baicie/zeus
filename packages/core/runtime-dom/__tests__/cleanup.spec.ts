import {
  createRuntimeDiagnosticsSession,
  createSignal,
  effect,
  onCleanup,
  onScopeDispose,
  scope,
  state,
} from '@zeus-js/signal/internal'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  bindEvent,
  bindRef,
  bindText,
  defineElement,
  mountFor,
  mountShow,
  render,
} from '../src'
import { marker } from '../src/dom'
import { ScopedSubtree } from '../src/scopedSubtree'
import { template } from '../src/template'

type ZeusElementWithEvents = Element & {
  __zeusEvents?: Record<string, EventListener>
}

describe('runtime cleanup', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('Element', dom.window.Element)
    vi.stubGlobal('customElements', {
      get: vi.fn(),
      define: vi.fn(),
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('removes a dynamic subtree when cleanup throws', () => {
    const source = document.createDocumentFragment()
    const markerNode = document.createComment('marker')
    source.append(markerNode)
    const subtree = new ScopedSubtree(source, markerNode, {
      owner: undefined,
      host: undefined,
    })
    const failure = new Error('subtree cleanup failed')

    subtree.replace(() => {
      onScopeDispose(() => {
        throw failure
      })
      return document.createTextNode('branch')
    })

    expect(source.textContent).toBe('branch')
    expect(() => subtree.dispose()).toThrow(failure)
    expect(source.childNodes).toHaveLength(1)
    expect(source.firstChild).toBe(markerNode)
    expect(subtree.current()).toHaveLength(0)
    expect(() => subtree.dispose()).not.toThrow()
  })

  it('balances owner, binding, and listener diagnostics on disposal', () => {
    const diagnostics = createRuntimeDiagnosticsSession()

    diagnostics.run(() => {
      const container = document.createElement('div')
      const text = document.createTextNode('')
      const dispose = render(() => {
        bindText(text, () => 'value')
        return text
      }, container)

      const host = document.createElement('div')
      const shadow = host.attachShadow({ mode: 'closed' })
      const button = document.createElement('button')
      shadow.append(button)
      const listenerScope = scope()
      listenerScope.run(() => {
        bindEvent(button, 'click', () => undefined)
      })

      expect(diagnostics.snapshot()).toMatchObject({
        ownersCreated: 1,
        bindingsCreated: 1,
        listenersCreated: 1,
      })

      dispose()
      listenerScope.stop()
    })

    expect(diagnostics.snapshot()).toMatchObject({
      ownersCreated: 1,
      ownersDisposed: 1,
      bindingsCreated: 1,
      bindingsDisposed: 1,
      listenersCreated: 1,
      listenersDisposed: 1,
    })
  })

  it('clears event handler on scope stop', () => {
    const s = scope()
    const button = document.createElement('button')
    const fn = vi.fn()

    s.run(() => {
      bindEvent(button, 'click', fn)
    })

    const handlerBefore = (button as ZeusElementWithEvents).__zeusEvents?.click
    expect(handlerBefore).toBe(fn)

    s.stop()

    const handlerAfter = (button as ZeusElementWithEvents).__zeusEvents?.click
    expect(handlerAfter).toBeUndefined()
  })

  it('clears ref on scope stop', () => {
    const s = scope()
    const el = document.createElement('input')
    const ref = { value: null as HTMLElement | null }

    s.run(() => {
      bindRef(el, ref as unknown as Parameters<typeof bindRef>[1])
    })

    expect(ref.value).toBe(el)

    s.stop()

    expect(ref.value).toBe(null)
  })

  it('removes list nodes on scope stop', () => {
    const s = scope()
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    s.run(() => {
      mountFor(
        root,
        m,
        () => [{ id: 1 }],
        item => item.id,
        item => {
          const li = document.createElement('li')
          li.textContent = String(item().id)
          return li
        },
      )
    })

    expect(root.childNodes.length).toBe(2)

    s.stop()

    expect(root.childNodes.length).toBe(1)
    expect(root.firstChild).toBe(m)
  })

  it('disposes keyed item scopes when records leave the list', () => {
    const listScope = scope()
    const items = state([{ id: 1 }, { id: 2 }])
    const disposedItems: number[] = []
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    listScope.run(() => {
      mountFor(
        root,
        m,
        () => items,
        item => item.id,
        item => {
          onScopeDispose(() => {
            disposedItems.push(item().id)
          })

          const li = document.createElement('li')
          li.textContent = String(item().id)
          return li
        },
      )
    })

    items.splice(0, 1)

    expect(disposedItems).toEqual([1])

    listScope.stop()

    expect(disposedItems).toEqual([1, 2])
  })

  it('disposes Show branch resources on every truthy/fallback switch', () => {
    const showScope = scope()
    const visible = state(true)
    const pulse = state(0)
    const effectRuns: string[] = []
    const disposedBranches: string[] = []
    const clone = template('<div><!></div>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    const renderBranch = (name: 'truthy' | 'fallback') => {
      effect(() => {
        effectRuns.push(`${name}:${pulse.value}`)
      })
      onCleanup(() => {
        disposedBranches.push(name)
      })

      return document.createTextNode(name)
    }

    showScope.run(() => {
      mountShow(
        root,
        m,
        () => visible.value,
        () => renderBranch('truthy'),
        () => renderBranch('fallback'),
      )
    })

    visible.value = false
    visible.value = true
    visible.value = false
    visible.value = true

    expect(disposedBranches).toEqual([
      'truthy',
      'fallback',
      'truthy',
      'fallback',
    ])

    effectRuns.length = 0
    pulse.value++

    expect(effectRuns).toEqual(['truthy:1'])

    showScope.stop()
    expect(disposedBranches).toEqual([
      'truthy',
      'fallback',
      'truthy',
      'fallback',
      'truthy',
    ])
  })

  it('disposes every old unkeyed item when the list is replaced', () => {
    const listScope = scope()
    const items = state([{ id: 1 }, { id: 2 }])
    const pulse = state(0)
    const effectRuns: number[] = []
    const disposedItems: number[] = []
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    listScope.run(() => {
      mountFor(
        root,
        m,
        () => items,
        undefined,
        item => {
          effect(() => {
            pulse.value
            effectRuns.push(item().id)
          })
          onCleanup(() => {
            disposedItems.push(item().id)
          })

          return document.createElement('li')
        },
      )
    })

    items.splice(0, items.length, { id: 3 }, { id: 4 })

    expect(disposedItems).toEqual([1, 2])

    effectRuns.length = 0
    pulse.value++

    expect(effectRuns).toEqual([3, 4])
    listScope.stop()
  })

  it('disposes every old unkeyed item when the list shrinks', () => {
    const listScope = scope()
    const items = state([{ id: 1 }, { id: 2 }, { id: 3 }])
    const pulse = state(0)
    const effectRuns: number[] = []
    const disposedItems: number[] = []
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    listScope.run(() => {
      mountFor(
        root,
        m,
        () => items,
        undefined,
        item => {
          effect(() => {
            pulse.value
            effectRuns.push(item().id)
          })
          onCleanup(() => {
            disposedItems.push(item().id)
          })

          return document.createElement('li')
        },
      )
    })

    items.splice(1, 2)

    expect(disposedItems).toEqual([1, 2, 3])

    effectRuns.length = 0
    pulse.value++

    expect(effectRuns).toEqual([1])
    listScope.stop()
  })

  it('disposes every old unkeyed item when the list is cleared', () => {
    const listScope = scope()
    const items = state([{ id: 1 }, { id: 2 }])
    const pulse = state(0)
    const effectRuns: number[] = []
    const disposedItems: number[] = []
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    listScope.run(() => {
      mountFor(
        root,
        m,
        () => items,
        undefined,
        item => {
          effect(() => {
            pulse.value
            effectRuns.push(item().id)
          })
          onCleanup(() => {
            disposedItems.push(item().id)
          })

          return document.createElement('li')
        },
      )
    })

    items.splice(0, items.length)

    expect(disposedItems).toEqual([1, 2])

    effectRuns.length = 0
    pulse.value++

    expect(effectRuns).toEqual([])
    listScope.stop()
  })

  it('runs public cleanup only for keyed records removed from the list', () => {
    const listScope = scope()
    const items = state([{ id: 1 }, { id: 2 }, { id: 3 }])
    const disposedItems: number[] = []
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    listScope.run(() => {
      mountFor(
        root,
        m,
        () => items,
        item => item.id,
        item => {
          onCleanup(() => {
            disposedItems.push(item().id)
          })

          return document.createElement('li')
        },
      )
    })

    items.splice(1, 1)

    expect(disposedItems).toEqual([2])

    listScope.stop()
    expect(disposedItems).toEqual([2, 1, 3])
  })

  it('does not run public cleanup when keyed records only move', () => {
    const listScope = scope()
    const items = state([{ id: 1 }, { id: 2 }, { id: 3 }])
    const disposedItems: number[] = []
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    listScope.run(() => {
      mountFor(
        root,
        m,
        () => items,
        item => item.id,
        item => {
          onCleanup(() => {
            disposedItems.push(item().id)
          })

          return document.createElement('li')
        },
      )
    })

    const [first, second, third] = items
    items.splice(0, items.length, third, first, second)

    expect(disposedItems).toEqual([])

    listScope.stop()
    expect(disposedItems).toEqual([3, 1, 2])
  })

  it('removes old Show nodes when condition toggles from truthy to falsy', () => {
    const flag = state(true)
    const clone = template('<div><!></div>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    mountShow(
      root,
      m,
      () => flag.value,
      () => {
        const span = document.createElement('span')
        span.textContent = 'visible'
        return span
      },
      () => {
        const em = document.createElement('em')
        em.textContent = 'hidden'
        return em
      },
    )

    expect(root.textContent).toBe('visible')

    flag.value = false

    expect(root.textContent).toBe('hidden')
    expect(root.querySelector('span')).toBeNull()
  })

  it('dispose render stops bound text effects', () => {
    const container = document.createElement('div')
    const count = { value: 0 }
    const text = document.createTextNode('')

    const dispose = render(() => {
      bindText(text, () => count.value)
      return text
    }, container)

    expect(text.data).toBe('0')

    dispose()

    count.value = 42

    expect(text.data).toBe('0')
  })

  it('onScopeDispose callback runs when scope is stopped', () => {
    const s = scope()
    let disposed = false

    s.run(() => {
      onScopeDispose(() => {
        disposed = true
      })
    })

    expect(disposed).toBe(false)

    s.stop()

    expect(disposed).toBe(true)
  })

  it('render dispose stops all bound effects', () => {
    const container = document.createElement('div')
    const count = state(0)
    const text = document.createTextNode('')

    const dispose = render(() => {
      bindText(text, () => count.value)
      return text
    }, container)

    expect(text.data).toBe('0')
    count.value = 42
    expect(text.data).toBe('42')

    dispose()

    count.value = 99

    expect(text.data).toBe('42')
  })

  it('disposes a sibling render from a render cleanup while the owner stops', () => {
    const first = document.createElement('div')
    const second = document.createElement('div')
    const owner = scope()
    let disposeSecond!: () => void

    owner.run(() => {
      render(() => {
        onScopeDispose(() => disposeSecond())
        return document.createTextNode('first')
      }, first)
      disposeSecond = render(() => document.createTextNode('second'), second)
    })

    expect(() => owner.stop()).not.toThrow()
    expect(second.textContent).toBe('')
  })

  function mountTrackedKeyedList(
    items: () => readonly { id: number }[],
    options: {
      failingCleanup: number
      failure: unknown
      failingRender?: number
      renderFailure?: unknown
    },
  ) {
    const listScope = scope()
    const [pulse, setPulse] = createSignal(0)
    const disposedItems: number[] = []
    const effectRuns: string[] = []
    const clone = template('<ul><!></ul>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    listScope.run(() => {
      mountFor(
        root,
        m,
        items,
        item => item.id,
        item => {
          const id = item().id
          if (id === options.failingRender) throw options.renderFailure
          effect(() => {
            effectRuns.push(`${id}:${pulse()}`)
          })
          onScopeDispose(() => {
            disposedItems.push(id)
            if (id === options.failingCleanup) throw options.failure
          })
          const li = document.createElement('li')
          li.textContent = String(id)
          return li
        },
      )
    })

    return { listScope, setPulse, disposedItems, effectRuns, root, m }
  }

  it('disposes every keyed record when one record cleanup throws on stop', () => {
    const failure = new Error('record cleanup failed')
    const list = mountTrackedKeyedList(() => [{ id: 1 }, { id: 2 }], {
      failingCleanup: 1,
      failure,
    })

    expect(() => list.listScope.stop()).toThrow(failure)
    expect(list.disposedItems).toEqual([1, 2])
    expect(list.root.childNodes.length).toBe(1)
    expect(list.root.firstChild === list.m).toBe(true)

    list.effectRuns.length = 0
    list.setPulse(1)
    expect(list.effectRuns).toEqual([])
  })

  it('commits the next keyed list when a removed record cleanup throws', () => {
    const failure = new Error('removed record cleanup failed')
    const [items, setItems] = createSignal([{ id: 1 }, { id: 2 }, { id: 3 }])
    const list = mountTrackedKeyedList(items, { failingCleanup: 1, failure })

    expect(() => setItems([{ id: 3 }])).toThrow(failure)
    expect(list.disposedItems).toEqual([1, 2])
    expect(list.root.textContent).toBe('3')

    list.effectRuns.length = 0
    list.setPulse(1)
    expect(list.effectRuns).toEqual(['3:1'])

    setItems([{ id: 3 }, { id: 4 }])
    expect(list.root.textContent).toBe('34')

    list.listScope.stop()
    expect(list.disposedItems).toEqual([1, 2, 3, 4])
  })

  it('rolls back every new keyed record and keeps the render error when a rollback cleanup throws', () => {
    const renderFailure = new Error('render failed')
    const failure = new Error('rollback cleanup failed')
    const [items, setItems] = createSignal([{ id: 1 }])
    const list = mountTrackedKeyedList(items, {
      failingCleanup: 2,
      failure,
      failingRender: 4,
      renderFailure,
    })

    expect(() =>
      setItems([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]),
    ).toThrow(renderFailure)
    expect(list.disposedItems).toEqual([2, 3])
    expect(list.root.textContent).toBe('1')

    list.effectRuns.length = 0
    list.setPulse(1)
    expect(list.effectRuns).toEqual(['1:1'])

    setItems([{ id: 1 }, { id: 3 }])
    expect(list.root.textContent).toBe('13')
    list.listScope.stop()
  })

  it('renders the next Show branch and stays reactive when a branch cleanup throws', () => {
    const showScope = scope()
    const [visible, setVisible] = createSignal(true)
    const failure = new Error('branch cleanup failed')
    let failCleanup = true
    const clone = template('<div><!></div>')()
    const root = clone.firstChild as Element
    const m = marker(root, 0)

    showScope.run(() => {
      mountShow(
        root,
        m,
        visible,
        () => {
          onCleanup(() => {
            if (!failCleanup) return
            failCleanup = false
            throw failure
          })
          return document.createTextNode('yes')
        },
        () => document.createTextNode('no'),
      )
    })

    expect(root.textContent).toBe('yes')
    expect(() => setVisible(false)).toThrow(failure)
    expect(root.textContent).toBe('no')

    setVisible(true)
    expect(root.textContent).toBe('yes')
    setVisible(false)
    expect(root.textContent).toBe('no')

    showScope.stop()
    expect(root.childNodes.length).toBe(1)
    expect(root.firstChild === m).toBe(true)
  })

  it('counts owner, binding and listener disposal on the creating session', () => {
    const creator = createRuntimeDiagnosticsSession()
    const other = createRuntimeDiagnosticsSession()
    const container = document.createElement('div')
    const text = document.createTextNode('')
    const host = document.createElement('div')
    const shadow = host.attachShadow({ mode: 'closed' })
    const button = document.createElement('button')
    shadow.append(button)
    const listenerScope = scope()
    let dispose!: () => void

    creator.run(() => {
      dispose = render(() => {
        bindText(text, () => 'value')
        return text
      }, container)
      listenerScope.run(() => {
        bindEvent(button, 'click', () => undefined)
      })
    })

    // One release runs inside an unrelated session, the other outside any.
    other.run(() => dispose())
    listenerScope.stop()

    expect(creator.snapshot()).toMatchObject({
      ownersCreated: 1,
      ownersDisposed: 1,
      bindingsCreated: 1,
      bindingsDisposed: 1,
      listenersCreated: 1,
      listenersDisposed: 1,
    })
    expect(other.snapshot()).toMatchObject({
      ownersCreated: 0,
      ownersDisposed: 0,
      bindingsCreated: 0,
      bindingsDisposed: 0,
      listenersCreated: 0,
      listenersDisposed: 0,
    })
    creator.dispose()
    other.dispose()
  })

  it('counts a replaced direct listener on the session that created it', () => {
    const creator = createRuntimeDiagnosticsSession()
    const other = createRuntimeDiagnosticsSession()
    const button = document.createElement('button')
    const first = vi.fn()
    const second = vi.fn()
    const listenerScope = scope()

    creator.run(() => {
      listenerScope.run(() => bindEvent(button, 'click', first, false))
    })
    other.run(() => {
      listenerScope.run(() => bindEvent(button, 'click', second, false))
    })

    button.click()
    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledTimes(1)
    expect(creator.snapshot()).toMatchObject({
      listenersCreated: 1,
      listenersDisposed: 1,
    })
    expect(other.snapshot()).toMatchObject({
      listenersCreated: 1,
      listenersDisposed: 0,
    })

    listenerScope.stop()
    expect(other.snapshot()).toMatchObject({
      listenersCreated: 1,
      listenersDisposed: 1,
    })
    creator.dispose()
    other.dispose()
  })
})

describe('custom element lifecycle cleanup', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    for (const name of [
      'window',
      'document',
      'Node',
      'NodeFilter',
      'HTMLElement',
      'Element',
      'customElements',
      'MutationObserver',
      'CustomEvent',
      'Event',
    ] as const) {
      vi.stubGlobal(
        name,
        name === 'window' ? dom.window : (dom.window as never)[name],
      )
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it.each([true, false])(
    'releases every owner, binding, listener and effect across repeated connects (shadow: %s)',
    shadow => {
      const tag = `z-leak-${shadow ? 'shadow' : 'light'}`
      defineElement(tag, { shadow, props: { label: String } }, props => {
        const button = document.createElement('button')
        const text = document.createTextNode('')
        button.append(text)
        bindText(text, () => String(props.label ?? ''))
        bindEvent(button, 'click', () => undefined, false)
        effect(() => {
          void props.label
        })
        onCleanup(() => undefined)
        return button
      })

      const diagnostics = createRuntimeDiagnosticsSession()
      diagnostics.run(() => {
        const element = document.createElement(tag) as HTMLElement & {
          label?: string
        }
        for (let index = 0; index < 25; index++) {
          document.body.append(element)
          element.label = `label-${index}`
          element.remove()
        }
      })

      const snapshot = diagnostics.snapshot()
      diagnostics.dispose()
      expect(snapshot.ownersCreated).toBe(25)
      expect(snapshot.bindingsCreated).toBeGreaterThanOrEqual(25)
      expect(snapshot.listenersCreated).toBe(25)
      expect(snapshot).toMatchObject({
        ownersDisposed: snapshot.ownersCreated,
        bindingsDisposed: snapshot.bindingsCreated,
        listenersDisposed: snapshot.listenersCreated,
        effectsDisposed: snapshot.effectsCreated,
        scopesDisposed: snapshot.scopesCreated,
      })
    },
  )
})
