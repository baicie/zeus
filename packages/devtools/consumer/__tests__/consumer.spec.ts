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
