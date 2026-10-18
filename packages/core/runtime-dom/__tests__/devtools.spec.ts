import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { bindAttr, bindText, render } from '../src'

describe('runtime DevTools event bridge', () => {
  let dom: JSDOM
  type TestEvent = {
    type: string
    id: number
    timestamp: number
    targetId?: number
    payload?: { kind?: string }
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

  it('enriches binding events with stable ids and timing metadata', async () => {
    const { state } = await import('@zeus-js/signal/internal')
    const value = state('one')
    const container = document.createElement('div')
    const text = document.createTextNode('')

    const dispose = render(() => {
      bindText(text, () => value.value)
      bindAttr(container, 'data-value', () => value.value)
      return text
    }, container)

    value.value = 'two'
    dispose()

    expect(events.map(event => event.type)).toEqual([
      'owner:create',
      'effect:run',
      'binding:commit',
      'effect:run',
      'binding:commit',
      'render',
      'effect:run',
      'binding:commit',
      'effect:run',
      'binding:commit',
      'binding:cleanup',
      'binding:cleanup',
      'owner:dispose',
    ])

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
    const textCleanup = events.find(
      event =>
        event.type === 'binding:cleanup' && event.payload?.kind === 'text',
    )
    expect(textCommit?.targetId).toBe(textCleanup?.targetId)
  })

  it('does not let a diagnostic hook failure break reactive updates', async () => {
    const { state } = await import('@zeus-js/signal/internal')
    const value = state('one')
    const text = document.createTextNode('')
    const container = document.createElement('div')

    const hook = dom.window.__ZEUS_DEVTOOLS_HOOK__
    hook!.emit = () => {
      throw new Error('panel closed')
    }

    bindText(text, () => value.value)
    container.append(text)
    value.value = 'two'
    expect(text.data).toBe('two')
  })
})
