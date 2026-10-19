import { createSignal } from '@zeus-js/signal'
import { JSDOM } from 'jsdom'
import { describe, expect, it } from 'vitest'

import { hydrate } from '../src'

describe('hydrate', () => {
  it('reuses marked DOM nodes for text, props, attrs and events', () => {
    const dom = new JSDOM(
      '<main><!--zeus:hydrate:title--><h1><!--zeus:hydrate:title-text-->Server title</h1><!--zeus:hydrate:button--><button>go</button></main>',
    )
    const main = dom.window.document.querySelector('main')!
    const title = main.querySelector('h1')!
    const button = main.querySelector('button')!
    const [value, setValue] = createSignal('Client title')
    const clicks: number[] = []

    const dispose = hydrate(main, context => {
      context.text('title-text', value)
      context.attr('title', 'data-hydrated', () => 'yes')
      context.prop('button', 'disabled', () => false)
      context.event('button', 'click', () => clicks.push(1))
    })

    expect(main.querySelector('h1')).toBe(title)
    expect(title.textContent).toBe('Client title')
    expect(title.getAttribute('data-hydrated')).toBe('yes')
    expect(button.disabled).toBe(false)
    button.dispatchEvent(new dom.window.Event('click', { bubbles: true }))
    expect(clicks).toEqual([1])

    setValue('Updated')
    expect(title.textContent).toBe('Updated')
    dispose()
    button.dispatchEvent(new dom.window.Event('click', { bubbles: true }))
    expect(clicks).toEqual([1])
  })

  it('reports missing or mismatched hydration targets', () => {
    const dom = new JSDOM('<main><!--zeus:hydrate:title--><div></div></main>')
    const main = dom.window.document.querySelector('main')!
    expect(() =>
      hydrate(main, context => context.text('missing', () => 'x')),
    ).toThrow('ZEUS_HYDRATION_MARKER_MISSING: missing')
    expect(() =>
      hydrate(main, context => context.text('title', () => 'x')),
    ).toThrow('ZEUS_HYDRATION_TEXT_TARGET: title')
  })
})
