import { createSignal } from '@zeus-js/signal'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bindAttr, bindText, mountDynamic, render } from '../src'

describe('runtime DevTools event bridge', () => {
  let dom: JSDOM
  type TestEvent = {
    type: string
    id: number
    timestamp: number
    target?: Node
    targetId?: number
    bindingId?: number
    effectId?: number
    sourceId?: number
    payload?: {
      key?: unknown
      kind?: string
      once?: boolean
      operation?: unknown
      duration?: number
    }
  }
  let events: TestEvent[]

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    events = []
    vi.stubGlobal('window', dom.window)
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('Node', dom.window.Node)
    Object.defineProperty(dom.window, '__ZEUS_DEVTOOLS_HOOK__', {
      configurable: true,
      value: { emit: (event: TestEvent) => events.push(event) },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('connects stable Signal, Effect and DOM Binding identities', () => {
    const [value, setValue] = createSignal('one')
    const container = document.createElement('div')
    const text = document.createTextNode('')

    const dispose = render(() => {
      bindText(text, value)
      bindAttr(container, 'data-value', value)
      return text
    }, container)

    setValue('two')
    dispose()

    const ids = events.map(event => event.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(
      [...ids].sort((left, right) => Number(left) - Number(right)),
    )
    expect(events.every(event => typeof event.timestamp === 'number')).toBe(
      true,
    )

    const textCommit = events.find(
      event =>
        event.type === 'binding:commit' && event.payload?.kind === 'text',
    )
    const textBindingEvents = events.filter(
      event => event.bindingId === textCommit?.bindingId,
    )
    const textCleanup = events.find(
      event =>
        event.type === 'binding:cleanup' && event.payload?.kind === 'text',
    )
    expect(textCommit?.targetId).toBe(textCleanup?.targetId)
    expect(textCleanup?.effectId).toBe(textCommit?.effectId)
    expect(textCommit?.payload?.duration).toEqual(expect.any(Number))
    expect(
      textBindingEvents.filter(event => event.type === 'effect:run'),
    ).toHaveLength(2)
    expect(
      textBindingEvents.filter(event => event.type === 'dependency:track'),
    ).toHaveLength(1)
    expect(
      textBindingEvents.filter(event => event.type === 'dependency:trigger'),
    ).toHaveLength(1)
    expect(
      new Set(
        events
          .filter(event => event.type === 'dependency:track')
          .map(event => event.sourceId),
      ).size,
    ).toBe(1)
    expect(
      textBindingEvents
        .filter(event => event.type === 'effect:run')
        .every(event => event.effectId === textCommit?.effectId),
    ).toBe(true)
  })

  it('traces compiled dynamic regions to their signal dependency', () => {
    const [value, setValue] = createSignal(0)
    const container = document.createElement('div')
    let button!: HTMLButtonElement
    const dispose = render(() => {
      button = document.createElement('button')
      const marker = document.createComment('dynamic')
      button.append(marker)
      container.append(button)
      mountDynamic(button, marker, value)
      return null
    }, container)

    setValue(1)
    dispose()

    const commit = events.find(
      event =>
        event.type === 'binding:commit' &&
        event.payload?.kind === 'dynamic-region',
    )
    const eventsForBinding = events.filter(
      event => event.bindingId === commit?.bindingId,
    )
    expect(commit?.target).toBe(button)
    expect(eventsForBinding).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ type: 'dependency:track' }),
        expect.objectContaining({ type: 'dependency:trigger' }),
        expect.objectContaining({ type: 'binding:cleanup' }),
      ]),
    )
    expect(
      eventsForBinding.filter(event => event.type === 'effect:run'),
    ).toHaveLength(2)
  })

  it('removes stale branch dependencies and stops observing after disposal', () => {
    const [condition, setCondition] = createSignal(true)
    const [left, setLeft] = createSignal('left')
    const [right, setRight] = createSignal('right')
    const text = document.createTextNode('')
    const container = document.createElement('div')
    const dispose = render(() => {
      bindText(text, () => (condition() ? left() : right()))
      return text
    }, container)

    const initialEdges = events.filter(
      event => event.type === 'dependency:track',
    )
    const leftSourceId = initialEdges[1]?.sourceId
    const bindingId = initialEdges[0]?.bindingId
    expect(initialEdges).toHaveLength(2)
    expect(text.data).toBe('left')

    setCondition(false)
    expect(text.data).toBe('right')
    expect(
      events.some(
        event =>
          event.type === 'dependency:untrack' &&
          event.bindingId === bindingId &&
          event.sourceId === leftSourceId,
      ),
    ).toBe(true)

    const commitsBeforeStaleWrite = events.filter(
      event => event.type === 'binding:commit',
    ).length
    setLeft('stale')
    expect(text.data).toBe('right')
    expect(
      events.filter(event => event.type === 'binding:commit'),
    ).toHaveLength(commitsBeforeStaleWrite)

    dispose()
    const commitsAfterDispose = events.filter(
      event => event.type === 'binding:commit',
    ).length
    expect(
      events.some(
        event =>
          event.type === 'dependency:untrack' &&
          event.bindingId === bindingId &&
          event.sourceId !== leftSourceId,
      ),
    ).toBe(true)
    setRight('disposed')
    expect(text.data).toBe('right')
    expect(
      events.filter(event => event.type === 'binding:commit'),
    ).toHaveLength(commitsAfterDispose)
  })

  it('cleans up once bindings with their original DOM identities on disposal', () => {
    const [value, setValue] = createSignal('initial')
    const container = document.createElement('div')
    const element = document.createElement('button')
    const text = document.createTextNode('')
    element.append(text)

    const dispose = render(() => {
      bindText(text, value, true)
      bindAttr(element, 'data-value', value, true)
      return element
    }, container)

    const commits = events.filter(event => event.type === 'binding:commit')
    expect(commits).toHaveLength(2)
    expect(commits.map(event => event.target)).toEqual([text, element])
    expect(commits.every(event => event.payload?.once === true)).toBe(true)
    expect(
      events.filter(event => event.type === 'binding:cleanup'),
    ).toHaveLength(0)

    setValue('updated')
    expect(text.data).toBe('initial')
    expect(element.getAttribute('data-value')).toBe('initial')
    expect(
      events.filter(event => event.type === 'binding:commit'),
    ).toHaveLength(2)

    dispose()
    const cleanups = events.filter(event => event.type === 'binding:cleanup')
    expect(cleanups).toHaveLength(2)
    for (const commit of commits) {
      const cleanup = cleanups.find(
        event => event.bindingId === commit.bindingId,
      )
      expect(commit.bindingId).toEqual(expect.any(Number))
      expect(commit.targetId).toEqual(expect.any(Number))
      expect(cleanup?.targetId).toBe(commit.targetId)
      expect(cleanup?.target).toBe(commit.target)
      expect(cleanup?.payload?.kind).toBe(commit.payload?.kind)
    }

    dispose()
    expect(
      events.filter(event => event.type === 'binding:cleanup'),
    ).toHaveLength(2)
  })

  it('keeps reactive updates working without a DevTools hook', () => {
    delete dom.window.__ZEUS_DEVTOOLS_HOOK__
    const [value, setValue] = createSignal('one')
    const text = document.createTextNode('')
    const container = document.createElement('div')

    const dispose = render(() => {
      bindText(text, value)
      return text
    }, container)
    setValue('two')
    expect(text.data).toBe('two')
    expect(events).toHaveLength(0)
    dispose()
  })

  it('starts collecting dependencies when a hook is installed later', () => {
    delete dom.window.__ZEUS_DEVTOOLS_HOOK__
    const [value, setValue] = createSignal('one')
    const text = document.createTextNode('')
    const container = document.createElement('div')
    const dispose = render(() => {
      bindText(text, value)
      return text
    }, container)

    Object.defineProperty(dom.window, '__ZEUS_DEVTOOLS_HOOK__', {
      configurable: true,
      value: { emit: (event: TestEvent) => events.push(event) },
    })
    setValue('two')

    expect(text.data).toBe('two')
    expect(events.some(event => event.type === 'dependency:track')).toBe(true)
    expect(
      events.find(event => event.type === 'binding:commit')?.effectId,
    ).toBeDefined()
    dispose()
  })

  it('does not let a diagnostic hook failure break reactive updates', () => {
    const [value, setValue] = createSignal('one')
    const text = document.createTextNode('')
    const container = document.createElement('div')

    const hook = dom.window.__ZEUS_DEVTOOLS_HOOK__
    hook!.emit = event => {
      if (event.type.startsWith('dependency:')) throw new Error('panel closed')
    }
    const dispose = render(() => {
      bindText(text, value)
      return text
    }, container)
    setValue('two')
    expect(text.data).toBe('two')
    dispose()
  })
})
