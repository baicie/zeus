import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it } from 'vitest'
import { beforeEach, vi } from 'vitest'

import { fireEvent, flushEffects, queryByRole, render } from '../src'

let dom: JSDOM
const disposers: Array<() => void> = []

beforeEach(() => {
  dom = new JSDOM('<!doctype html><html><body></body></html>')
  vi.stubGlobal('document', dom.window.document)
  vi.stubGlobal('window', dom.window)
  vi.stubGlobal('Node', dom.window.Node)
  vi.stubGlobal('Element', dom.window.Element)
  vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
  vi.stubGlobal('Event', dom.window.Event)
})

afterEach(() => {
  while (disposers.length) disposers.pop()?.()
  vi.unstubAllGlobals()
  dom.window.close()
})

describe('@zeus-js/testing', () => {
  it('renders into an isolated container and disposes its DOM', () => {
    const result = render(() => {
      const button = document.createElement('button')
      button.textContent = 'Save'
      return button
    })
    disposers.push(result.dispose)

    expect(result.container.querySelector('button')?.textContent).toBe('Save')
    expect(result.baseElement).toBe(document.body)

    result.dispose()

    expect(result.container.childNodes).toHaveLength(0)
  })

  it('rerenders and exposes the same lifecycle through unmount', () => {
    const result = render('first')

    result.rerender('second')
    expect(result.container.textContent).toBe('second')

    result.unmount()
    expect(result.container.childNodes).toHaveLength(0)
  })

  it('dispatches convenience and custom events with init fields', () => {
    const button = document.createElement('button')
    const received: Event[] = []
    button.addEventListener('click', event => received.push(event))
    document.body.appendChild(button)

    expect(fireEvent.click(button, { detail: { source: 'test' } })).toBe(true)
    expect(received).toHaveLength(1)
    expect((received[0] as Event & { detail?: unknown }).detail).toEqual({
      source: 'test',
    })

    const input = document.createElement('input')
    let inputValue = ''
    input.addEventListener('input', event => {
      inputValue = (event.target as HTMLInputElement).value
    })
    input.value = 'updated'
    fireEvent(input, new Event('input', { bubbles: true }))
    expect(inputValue).toBe('updated')
  })

  it('finds implicit and explicit roles by accessible name', () => {
    const container = document.createElement('div')
    container.innerHTML = `
      <h2>Settings</h2>
      <button aria-label="Save changes"></button>
      <div role="status">Ready</div>
    `

    expect(
      queryByRole(container, 'heading', { name: 'Settings' }),
    ).not.toBeNull()
    expect(
      queryByRole(container, 'button', { name: 'Save changes' }),
    ).not.toBeNull()
    expect(queryByRole(container, 'status')?.textContent).toBe('Ready')
  })

  it('flushes at least one queued microtask before resolving', async () => {
    const order: string[] = []
    queueMicrotask(() => order.push('effect'))

    await flushEffects()

    expect(order).toEqual(['effect'])
  })
})
