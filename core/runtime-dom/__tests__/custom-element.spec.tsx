import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Host, defineElement } from '../src'

describe('defineElement lifecycle', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLSlotElement', dom.window.HTMLSlotElement)
    vi.stubGlobal('customElements', dom.window.customElements)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('renders initial props from attributes', () => {
    const tag = `ze-test-init-${Date.now()}`
    defineElement(
      tag,
      {
        shadow: false,
        props: {
          title: String,
        },
      },
      props => {
        const el = document.createElement('p')
        el.textContent = String(props.title ?? '')
        return Host({ children: el })
      },
    )

    const el = document.createElement(tag)
    el.setAttribute('title', 'hello')

    document.body.appendChild(el)

    expect(el.textContent).toContain('hello')

    el.remove()
  })

  it('converts number and boolean attributes', () => {
    const tag = `ze-test-convert-${Date.now()}`
    defineElement(
      tag,
      {
        shadow: false,
        props: {
          count: Number,
          active: Boolean,
        },
      },
      props => {
        const el = document.createElement('p')
        el.textContent = `${props.count ?? 0}|${props.active}`
        return Host({ children: el })
      },
    )

    const el = document.createElement(tag)
    el.setAttribute('count', '42')

    document.body.appendChild(el)

    expect(el.textContent).toContain('42')
    expect(el.textContent).toContain('false')

    el.remove()
  })

  it('renders with shadow DOM', () => {
    const tag = `ze-test-shadow-${Date.now()}`
    defineElement(
      tag,
      {
        shadow: true,
        props: {
          title: String,
        },
      },
      props => {
        const frag = document.createDocumentFragment()
        const span = document.createElement('span')
        span.textContent = String(props.title ?? '')
        const slot = document.createElement('slot')
        frag.appendChild(span)
        frag.appendChild(slot)
        return Host({ children: frag })
      },
    )

    const el = document.createElement(tag)
    el.setAttribute('title', 'shadow hello')

    document.body.appendChild(el)

    expect(el.shadowRoot).not.toBeNull()
    expect(el.shadowRoot!.textContent).toContain('shadow hello')

    el.remove()
  })

  it('injects styles into shadow root', () => {
    const tag = `ze-test-styles-${Date.now()}`
    defineElement(
      tag,
      {
        shadow: true,
        styles: '.box { color: red; }',
      },
      () => {
        const el = document.createElement('div')
        el.className = 'box'
        el.textContent = 'styled'
        return Host({ children: el })
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    expect(el.shadowRoot!.querySelector('style')?.textContent).toBe(
      '.box { color: red; }',
    )
    expect(el.shadowRoot!.querySelector('.box')?.textContent).toBe('styled')

    el.remove()
  })

  it('sets props via property assignment', () => {
    const tag = `ze-test-prop-assign-${Date.now()}`
    defineElement(
      tag,
      {
        shadow: false,
        props: {
          value: Number,
        },
      },
      props => {
        const el = document.createElement('p')
        el.textContent = String(props.value ?? 'none')
        return Host({ children: el })
      },
    )

    const el = document.createElement(tag) as HTMLElement & { value?: number }
    ;(el as typeof el & { value?: number }).value = 42

    document.body.appendChild(el)

    expect(el.textContent).toContain('42')

    el.remove()
  })

  it('registers observedAttributes from props', () => {
    const tag = `ze-test-attrs-${Date.now()}`
    defineElement(
      tag,
      {
        shadow: false,
        props: {
          userName: String,
          count: Number,
          active: Boolean,
        },
      },
      () => Host({ children: document.createElement('div') }),
    )

    const ctor = customElements.get(tag) as CustomElementConstructor & {
      observedAttributes: string[]
    }

    expect(ctor.observedAttributes).toContain('user-name')
    expect(ctor.observedAttributes).toContain('count')
    expect(ctor.observedAttributes).toContain('active')
    expect(ctor.observedAttributes).not.toContain('userName')
  })

  it('allows custom attr name via attr option', () => {
    const tag = `ze-test-custom-attr-${Date.now()}`
    defineElement(
      tag,
      {
        shadow: false,
        props: {
          userName: {
            type: String,
            attr: 'user-name',
          },
        },
      },
      () => Host({ children: document.createElement('div') }),
    )

    const ctor = customElements.get(tag) as CustomElementConstructor & {
      observedAttributes: string[]
    }

    expect(ctor.observedAttributes).toContain('user-name')
    expect(ctor.observedAttributes).not.toContain('userName')
  })

  it('skips attribute when attr is false', () => {
    const tag = `ze-test-no-attr-${Date.now()}`
    defineElement(
      tag,
      {
        shadow: false,
        props: {
          data: {
            type: Object,
            attr: false,
          },
        },
      },
      () => Host({ children: document.createElement('div') }),
    )

    const ctor = customElements.get(tag) as CustomElementConstructor & {
      observedAttributes: string[]
    }

    expect(ctor.observedAttributes).not.toContain('data')
    expect(ctor.observedAttributes).toHaveLength(0)
  })

  it('defers render until connected', () => {
    const tag = `ze-test-defer-${Date.now()}`
    let connected = false

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        connected = true
        return Host({ children: document.createElement('span') })
      },
    )

    const el = document.createElement(tag)
    expect(connected).toBe(false)

    document.body.appendChild(el)
    expect(connected).toBe(true)

    el.remove()
  })

  it('re-renders when reconnected after disconnect', () => {
    const tag = `ze-test-reconnect-${Date.now()}`
    let renderCount = 0

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        renderCount++
        return Host({ children: document.createElement('span') })
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    expect(renderCount).toBe(1)

    el.remove()
    document.body.appendChild(el)

    expect(renderCount).toBe(2)

    el.remove()
  })
})
