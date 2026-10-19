import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it } from 'vitest'

import { createDevtoolsConsumer, type ZeusDevtoolsEvent } from '../src'

function event(
  type: ZeusDevtoolsEvent['type'],
  fields: Partial<ZeusDevtoolsEvent> = {},
): ZeusDevtoolsEvent {
  return {
    id: 1,
    timestamp: 10,
    type,
    ...fields,
  }
}

describe('DevTools consumer/panel', () => {
  let dom: JSDOM | undefined

  afterEach(() => {
    dom?.window.close()
    dom = undefined
  })

  it('reduces owner, effect, binding and dependency events into a panel graph', () => {
    dom = new JSDOM('<!doctype html><html><body /></html>')
    const consumer = createDevtoolsConsumer()
    const text = dom.window.document.createTextNode('count')

    consumer.consume(event('owner:create', { ownerId: 1 }))
    consumer.consume(
      event('owner:create', {
        ownerId: 2,
        payload: { parentId: 1 },
      }),
    )
    consumer.consume(
      event('effect:run', {
        effectId: 3,
        payload: { duration: 1.25 },
      }),
    )
    consumer.consume(
      event('dependency:track', {
        bindingId: 4,
        effectId: 3,
        sourceId: 5,
        payload: { key: 'value', operation: 'get' },
      }),
    )
    consumer.consume(
      event('binding:commit', {
        bindingId: 4,
        effectId: 3,
        target: text,
        targetId: 6,
        payload: { kind: 'text', once: false },
      }),
    )

    const snapshot = consumer.getSnapshot()
    expect(snapshot.owners).toEqual([
      { id: 1, childIds: [2], disposed: false },
      { id: 2, parentId: 1, childIds: [], disposed: false },
    ])
    expect(snapshot.effects).toMatchObject([
      {
        id: 3,
        bindingIds: [4],
        runCount: 1,
        totalDuration: 1.25,
        lastDuration: 1.25,
      },
    ])
    expect(snapshot.bindings[0]).toMatchObject({
      id: 4,
      targetId: 6,
      kind: 'text',
      dependencies: [{ sourceId: 5, key: 'value', operation: 'get' }],
    })
    expect(snapshot.sources[0]).toMatchObject({
      id: 5,
      bindingIds: [4],
      dependencies: [{ sourceId: 5, key: 'value', operation: 'get' }],
    })
  })

  it('removes stale dependency edges and marks cleaned bindings', () => {
    dom = new JSDOM('<!doctype html><html><body /></html>')
    const consumer = createDevtoolsConsumer()
    const text = dom.window.document.createTextNode('count')
    const base = {
      bindingId: 4,
      effectId: 3,
      sourceId: 5,
      payload: { key: 'value', operation: 'get' },
    }

    consumer.consume(event('dependency:track', base))
    consumer.consume(event('binding:commit', { ...base, target: text }))
    consumer.consume(event('dependency:untrack', base))
    consumer.consume(event('binding:cleanup', { ...base, target: text }))

    expect(consumer.getSnapshot().bindings[0]).toMatchObject({
      id: 4,
      cleaned: true,
      dependencies: [],
    })
    expect(consumer.getSnapshot().sources[0]).toMatchObject({
      id: 5,
      bindingIds: [],
      dependencies: [],
    })
    expect(consumer.selectNode(text)).toBeUndefined()
    expect(consumer.getSnapshot().selected).toBeUndefined()
  })

  it('selects DOM bindings and their source signals from a click', () => {
    dom = new JSDOM(
      '<!doctype html><html><body><button>count</button></body></html>',
    )
    const button = dom.window.document.querySelector('button')!
    const text = button.firstChild!
    const selections: number[][] = []
    const consumer = createDevtoolsConsumer(dom.window, {
      onSelect(selection) {
        selections.push([...selection.sourceIds])
      },
    })
    consumer.connect()
    consumer.consume(
      event('binding:commit', {
        bindingId: 4,
        effectId: 3,
        target: button,
        targetId: 6,
        payload: { kind: 'attr:data-state', once: false },
      }),
    )
    consumer.consume(
      event('dependency:track', {
        bindingId: 4,
        effectId: 3,
        sourceId: 5,
        payload: { key: 'value', operation: 'get' },
      }),
    )
    consumer.consume(
      event('binding:commit', {
        bindingId: 7,
        effectId: 8,
        target: text,
        targetId: 9,
        payload: { kind: 'text', once: false },
      }),
    )

    button.dispatchEvent(new dom.window.MouseEvent('click', { bubbles: true }))

    expect(consumer.getSnapshot().selected).toMatchObject({
      targetId: 6,
      bindingIds: [4, 7],
      effectIds: [3, 8],
      sourceIds: [5],
    })
    expect(selections).toEqual([[5]])
    consumer.disconnect()
  })

  it('removes only the disconnected consumer from a shared hook manager', () => {
    dom = new JSDOM('<!doctype html><html><body /></html>')
    const previousEvents: ZeusDevtoolsEvent[] = []
    const previousHook = {
      emit: (next: ZeusDevtoolsEvent) => previousEvents.push(next),
    }
    Object.defineProperty(dom.window, '__ZEUS_DEVTOOLS_HOOK__', {
      configurable: true,
      value: previousHook,
    })
    const first = createDevtoolsConsumer(dom.window)
    const second = createDevtoolsConsumer(dom.window)
    first.connect()
    second.connect()

    const firstEvent = event('render', { id: 2 })
    dom.window.__ZEUS_DEVTOOLS_HOOK__!.emit(firstEvent)
    expect(first.getSnapshot().eventCount).toBe(1)
    expect(second.getSnapshot().eventCount).toBe(1)
    expect(previousEvents).toEqual([firstEvent])

    first.disconnect()
    const secondEvent = event('render', { id: 3 })
    dom.window.__ZEUS_DEVTOOLS_HOOK__!.emit(secondEvent)
    expect(first.getSnapshot().eventCount).toBe(1)
    expect(second.getSnapshot().eventCount).toBe(2)
    expect(previousEvents).toEqual([firstEvent, secondEvent])

    second.disconnect()
    expect(dom.window.__ZEUS_DEVTOOLS_HOOK__).toBe(previousHook)
  })

  it('uses binding commit duration instead of another effect run duration', () => {
    const consumer = createDevtoolsConsumer()
    consumer.consume(
      event('effect:run', { effectId: 1, payload: { duration: 10 } }),
    )
    consumer.consume(
      event('effect:run', { effectId: 2, payload: { duration: 20 } }),
    )
    consumer.consume(
      event('binding:commit', {
        bindingId: 3,
        effectId: 1,
        payload: { kind: 'text', once: false, duration: 10 },
      }),
    )
    consumer.consume(
      event('binding:commit', {
        bindingId: 4,
        effectId: 2,
        payload: { kind: 'text', once: false, duration: 20 },
      }),
    )

    expect(consumer.getSnapshot().bindings).toMatchObject([
      { id: 3, lastDuration: 10, totalDuration: 10 },
      { id: 4, lastDuration: 20, totalDuration: 20 },
    ])
  })

  it('delivers one notification per microtask while snapshots stay synchronous', async () => {
    const consumer = createDevtoolsConsumer()
    const snapshots: number[] = []
    const unsubscribe = consumer.subscribe(snapshot => {
      snapshots.push(snapshot.eventCount)
    })

    for (let id = 1; id <= 2000; id++) {
      consumer.consume(event('binding:commit', { bindingId: id }))
    }

    expect(snapshots).toEqual([0])
    expect(consumer.getSnapshot().bindings).toHaveLength(2000)
    expect(consumer.getSnapshot().eventCount).toBe(2000)
    await Promise.resolve()
    expect(snapshots).toEqual([0, 2000])

    consumer.consume(event('binding:cleanup', { bindingId: 1 }))
    unsubscribe()
    await Promise.resolve()
    expect(snapshots).toEqual([0, 2000])
  })

  it('bounds inactive history without removing active graph entries', () => {
    const consumer = createDevtoolsConsumer(undefined, { historyLimit: 2 })
    const mount = (id: number) => {
      consumer.consume(event('owner:create', { ownerId: id }))
      consumer.consume(event('effect:run', { effectId: id }))
      consumer.consume(
        event('dependency:track', {
          bindingId: id,
          sourceId: id,
          payload: { key: 'value', operation: 'get' },
        }),
      )
      consumer.consume(event('binding:commit', { bindingId: id, effectId: id }))
    }

    for (const id of [1, 2, 3]) mount(id)
    for (let id = 10; id < 30; id++) {
      mount(id)
      consumer.consume(event('binding:cleanup', { bindingId: id }))
      consumer.consume(event('owner:dispose', { ownerId: id }))
    }

    const snapshot = consumer.getSnapshot()
    for (const entries of [
      snapshot.owners,
      snapshot.effects,
      snapshot.bindings,
      snapshot.sources,
    ]) {
      expect(entries.map(entry => entry.id)).toEqual([1, 2, 3, 28, 29])
    }
    expect(snapshot.bindings.filter(binding => binding.cleaned)).toHaveLength(2)
    expect(snapshot.bindings[0]?.dependencies).toHaveLength(1)
    expect(snapshot.sources[0]?.bindingIds).toEqual([1])
  })

  it('keeps an effect and source active until their last binding is cleaned', () => {
    const consumer = createDevtoolsConsumer(undefined, { historyLimit: 0 })
    for (const bindingId of [1, 2]) {
      consumer.consume(event('binding:commit', { bindingId, effectId: 3 }))
      consumer.consume(
        event('dependency:track', {
          bindingId,
          sourceId: 4,
          payload: { key: 'value', operation: 'get' },
        }),
      )
    }

    consumer.consume(event('binding:cleanup', { bindingId: 1 }))
    expect(consumer.getSnapshot().effects).toMatchObject([
      { id: 3, bindingIds: [2] },
    ])
    expect(consumer.getSnapshot().sources).toMatchObject([
      { id: 4, bindingIds: [2] },
    ])

    consumer.consume(event('binding:cleanup', { bindingId: 2 }))
    const snapshot = consumer.getSnapshot()
    expect(snapshot.effects).toEqual([])
    expect(snapshot.bindings).toEqual([])
    expect(snapshot.sources).toEqual([])
  })

  it('retires descendant owners when their root owner is disposed', () => {
    const consumer = createDevtoolsConsumer(undefined, { historyLimit: 2 })
    consumer.consume(event('owner:create', { ownerId: 1 }))
    for (let rootId = 10; rootId < 30; rootId += 2) {
      consumer.consume(event('owner:create', { ownerId: rootId }))
      consumer.consume(
        event('owner:create', {
          ownerId: rootId + 1,
          payload: { parentId: rootId },
        }),
      )
      consumer.consume(event('owner:dispose', { ownerId: rootId }))
    }

    expect(consumer.getSnapshot().owners).toEqual([
      { id: 1, childIds: [], disposed: false },
      { id: 28, childIds: [29], disposed: true },
      { id: 29, parentId: 28, childIds: [], disposed: true },
    ])
  })

  it('does not infer a missing binding duration from an effect event', () => {
    const consumer = createDevtoolsConsumer()
    consumer.consume(
      event('effect:run', { effectId: 1, payload: { duration: 10 } }),
    )
    consumer.consume(event('binding:commit', { bindingId: 2, effectId: 1 }))

    expect(consumer.getSnapshot().bindings[0]).toMatchObject({
      id: 2,
      totalDuration: 0,
    })
    expect(consumer.getSnapshot().bindings[0]?.lastDuration).toBeUndefined()
  })

  it('isolates initial subscription errors and continues delivering updates', async () => {
    const consumer = createDevtoolsConsumer()
    const failing = vi.fn(() => {
      throw new Error('panel failed')
    })
    let unsubscribe!: () => void
    expect(() => {
      unsubscribe = consumer.subscribe(failing)
    }).not.toThrow()

    consumer.consume(event('owner:create', { ownerId: 1 }))
    await Promise.resolve()
    expect(failing).toHaveBeenCalledTimes(2)
    unsubscribe()
  })

  it('keeps failed hook connections retryable', () => {
    dom = new JSDOM('<!doctype html><html><body /></html>')
    const previousHook = { emit: vi.fn() }
    Object.defineProperty(dom.window, '__ZEUS_DEVTOOLS_HOOK__', {
      configurable: false,
      get: () => previousHook,
    })
    const consumer = createDevtoolsConsumer(dom.window)
    expect(() => consumer.connect()).toThrow('non-configurable hook accessor')
    expect(() => consumer.connect()).toThrow('non-configurable hook accessor')
    expect(() => consumer.disconnect()).not.toThrow()
    expect(dom.window.__ZEUS_DEVTOOLS_HOOK__).toBe(previousHook)
  })

  it('restores the hook if registering the click listener fails', () => {
    dom = new JSDOM('<!doctype html><html><body /></html>')
    const previousHook = { emit: vi.fn() }
    Object.defineProperty(dom.window, '__ZEUS_DEVTOOLS_HOOK__', {
      configurable: true,
      value: previousHook,
    })
    const consumer = createDevtoolsConsumer(dom.window)
    const register = vi.spyOn(dom.window.document, 'addEventListener')
    register.mockImplementationOnce(() => {
      throw new Error('listener registration failed')
    })
    expect(() => consumer.connect()).toThrow('listener registration failed')
    expect(dom.window.__ZEUS_DEVTOOLS_HOOK__).toBe(previousHook)
    register.mockRestore()

    consumer.connect()
    dom.window.__ZEUS_DEVTOOLS_HOOK__!.emit(
      event('owner:create', { ownerId: 1 }),
    )
    expect(consumer.getSnapshot().owners).toMatchObject([{ id: 1 }])
    consumer.disconnect()
    expect(dom.window.__ZEUS_DEVTOOLS_HOOK__).toBe(previousHook)
  })

  it('follows composedPath to select bindings inside an open shadow root', () => {
    dom = new JSDOM(
      '<!doctype html><html><body><div id="host" /></body></html>',
    )
    const host = dom.window.document.querySelector('#host')!
    const shadow = host.attachShadow({ mode: 'open' })
    const button = dom.window.document.createElement('button')
    const text = dom.window.document.createTextNode('count')
    button.append(text)
    shadow.append(button)
    const consumer = createDevtoolsConsumer(dom.window)
    consumer.connect()
    consumer.consume(
      event('binding:commit', {
        bindingId: 10,
        effectId: 11,
        target: button,
        targetId: 12,
        payload: { kind: 'attr:data-state', once: false },
      }),
    )
    consumer.consume(
      event('binding:commit', {
        bindingId: 13,
        effectId: 14,
        target: text,
        targetId: 15,
        payload: { kind: 'text', once: false },
      }),
    )

    button.dispatchEvent(
      new dom.window.MouseEvent('click', {
        bubbles: true,
        composed: true,
      }),
    )

    expect(consumer.getSnapshot().selected).toMatchObject({
      bindingIds: [10, 13],
      effectIds: [11, 14],
    })
    consumer.disconnect()
  })

  it('chains and restores an existing runtime hook', () => {
    dom = new JSDOM('<!doctype html><html><body /></html>')
    const previousEvents: ZeusDevtoolsEvent[] = []
    const previousHook = {
      emit: (next: ZeusDevtoolsEvent) => previousEvents.push(next),
    }
    Object.defineProperty(dom.window, '__ZEUS_DEVTOOLS_HOOK__', {
      configurable: true,
      value: previousHook,
    })
    const consumer = createDevtoolsConsumer(dom.window)
    consumer.connect()

    const next = event('render')
    dom.window.__ZEUS_DEVTOOLS_HOOK__!.emit(next)
    expect(previousEvents).toEqual([next])
    expect(consumer.getSnapshot().eventCount).toBe(1)

    consumer.disconnect()
    expect(dom.window.__ZEUS_DEVTOOLS_HOOK__).toBe(previousHook)
  })

  it('preserves an accessor descriptor around the consumer hook', () => {
    dom = new JSDOM('<!doctype html><html><body /></html>')
    const previousHook = {
      emit: vi.fn(),
    }
    Object.defineProperty(dom.window, '__ZEUS_DEVTOOLS_HOOK__', {
      configurable: true,
      enumerable: true,
      get: () => previousHook,
    })

    const consumer = createDevtoolsConsumer(dom.window)
    expect(() => consumer.connect()).not.toThrow()
    dom.window.__ZEUS_DEVTOOLS_HOOK__!.emit(event('render'))
    expect(previousHook.emit).toHaveBeenCalledOnce()

    consumer.disconnect()
    const descriptor = Object.getOwnPropertyDescriptor(
      dom.window,
      '__ZEUS_DEVTOOLS_HOOK__',
    )
    expect(descriptor?.get).toBeDefined()
    expect(dom.window.__ZEUS_DEVTOOLS_HOOK__).toBe(previousHook)
  })
})
