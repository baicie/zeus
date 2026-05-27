import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSlot, defineElement } from '../src'

describe('createSlot', () => {
  beforeEach(() => {
    const dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('HTMLSlotElement', dom.window.HTMLSlotElement)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('returns native slot element when no host context', () => {
    const result = createSlot()
    expect(result).toBeInstanceOf(HTMLSlotElement)
    expect((result as HTMLSlotElement).name).toBe('')
  })

  it('returns named native slot when no host context', () => {
    const result = createSlot('header')
    expect(result).toBeInstanceOf(HTMLSlotElement)
    expect((result as HTMLSlotElement).name).toBe('header')
  })

  it('returns native slot with fallback content', () => {
    const result = createSlot(undefined, () => {
      const span = document.createElement('span')
      span.textContent = 'fallback'
      return span
    })

    expect(result).toBeInstanceOf(HTMLSlotElement)
    const slot = result as HTMLSlotElement
    expect(slot.querySelector('span')!.textContent).toBe('fallback')
  })

  it('returns named slot with fallback', () => {
    const result = createSlot('footer', () => {
      const span = document.createElement('span')
      span.textContent = 'fallback footer'
      return span
    })

    const slot = result as HTMLSlotElement
    expect(slot.name).toBe('footer')
    expect(slot.querySelector('span')!.textContent).toBe('fallback footer')
  })
})

describe('defineElement', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('HTMLSlotElement', dom.window.HTMLSlotElement)
    vi.stubGlobal('customElements', dom.window.customElements)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('defines custom element and renders initial content', () => {
    defineElement(
      'z-test-basic',
      {
        shadow: false,
        props: {
          label: String,
        },
      },
      props => {
        const el = document.createElement('p')
        el.textContent = String(props.label ?? '')
        return el
      },
    )

    const el = document.createElement('z-test-basic')
    el.setAttribute('label', 'Hello')

    document.body.appendChild(el)

    expect(el.textContent).toBe('Hello')
    expect(el.getAttribute('label')).toBe('Hello')
    expect(el.shadowRoot).toBeNull()

    el.remove()
  })

  it('renders into light DOM when shadow is false', () => {
    defineElement(
      'z-test-light-dom',
      {
        shadow: false,
      },
      () => {
        const el = document.createElement('span')
        el.textContent = 'light'
        return el
      },
    )

    const el = document.createElement('z-test-light-dom')
    document.body.appendChild(el)

    expect(el.shadowRoot).toBeNull()
    expect(el.querySelector('span')?.textContent).toBe('light')
    expect(el.textContent).toBe('light')

    el.remove()
  })

  it('converts boolean attribute', () => {
    defineElement(
      'z-test-boolean',
      {
        shadow: false,
        props: {
          active: Boolean,
        },
      },
      _props => {
        const el = document.createElement('div')
        return el
      },
    )

    const el = document.createElement('z-test-boolean')
    el.setAttribute('active', '')

    document.body.appendChild(el)

    expect((el as unknown as { active: boolean }).active).toBe(true)

    el.remove()
  })

  it('converts number attribute', () => {
    defineElement(
      'z-test-number',
      {
        shadow: false,
        props: {
          count: Number,
        },
      },
      _props => {
        const el = document.createElement('div')
        return el
      },
    )

    const el = document.createElement('z-test-number')
    el.setAttribute('count', '42')

    document.body.appendChild(el)

    expect((el as unknown as { count: number }).count).toBe(42)

    el.remove()
  })

  it('ctx.emit is available on the context object', () => {
    let capturedEmit: unknown = null

    defineElement('z-test-event', {}, (_props, ctx) => {
      capturedEmit = ctx.emit
      return document.createElement('div')
    })

    const el = document.createElement('z-test-event')
    document.body.appendChild(el)

    expect(typeof capturedEmit).toBe('function')

    el.remove()
  })

  it('uses shadow DOM and creates shadow root', () => {
    defineElement(
      'z-test-shadow',
      {
        shadow: true,
        props: {
          label: String,
        },
      },
      props => {
        const frag = document.createDocumentFragment()
        const span = document.createElement('span')
        span.textContent = String(props.label ?? '')
        const slot = document.createElement('slot')
        frag.appendChild(span)
        frag.appendChild(slot)
        return frag
      },
    )

    const el = document.createElement('z-test-shadow')
    el.setAttribute('label', 'shadow label')

    document.body.appendChild(el)

    const shadowRoot = el.shadowRoot
    expect(shadowRoot).toBeTruthy()
    expect(shadowRoot!.querySelector('span')!.textContent).toContain(
      'shadow label',
    )

    el.remove()
  })

  it('sets observedAttributes from props', () => {
    defineElement(
      'z-test-attrs',
      {
        shadow: false,
        props: {
          fooBar: String,
          count: Number,
          flag: Boolean,
        },
      },
      _props => document.createElement('div'),
    )

    const ctor = customElements.get(
      'z-test-attrs',
    ) as CustomElementConstructor & { observedAttributes: string[] }
    expect(ctor.observedAttributes).toContain('foo-bar')
    expect(ctor.observedAttributes).toContain('count')
    expect(ctor.observedAttributes).toContain('flag')
  })

  it('injects styles into shadow root', () => {
    defineElement(
      'z-test-styles',
      {
        shadow: true,
        styles: 'div { color: red; }',
      },
      _props => document.createElement('div'),
    )

    const el = document.createElement('z-test-styles')
    document.body.appendChild(el)

    expect(el.shadowRoot?.querySelector('style')?.textContent).toBe(
      'div { color: red; }',
    )
    expect(el.shadowRoot?.querySelector('div')).toBeTruthy()

    el.remove()
  })

  it('injects array styles into shadow root', () => {
    defineElement(
      'z-test-styles-array',
      {
        shadow: true,
        styles: ['h1 { font-size: 24px; }', 'p { margin: 8px; }'],
      },
      _props => {
        const el = document.createElement('div')
        const h = document.createElement('h1')
        const p = document.createElement('p')
        el.appendChild(h)
        el.appendChild(p)
        return el
      },
    )

    const el = document.createElement('z-test-styles-array')
    document.body.appendChild(el)

    const styles = Array.from(el.shadowRoot!.querySelectorAll('style')).map(
      style => style.textContent,
    )

    expect(styles).toEqual(['h1 { font-size: 24px; }', 'p { margin: 8px; }'])
    expect(el.shadowRoot?.querySelector('h1')).toBeTruthy()
    expect(el.shadowRoot?.querySelector('p')).toBeTruthy()

    el.remove()
  })

  it('injects styles into light DOM after render clears the host', () => {
    defineElement(
      'z-test-light-styles',
      {
        shadow: false,
        styles: '.box { color: blue; }',
      },
      _props => {
        const el = document.createElement('div')
        el.className = 'box'
        el.textContent = 'light'
        return el
      },
    )

    const el = document.createElement('z-test-light-styles')
    document.body.appendChild(el)

    expect(el.querySelector('style')?.textContent).toBe('.box { color: blue; }')
    expect(el.querySelector('.box')?.textContent).toBe('light')

    el.remove()
  })

  it('supports custom attr name', () => {
    defineElement(
      'z-test-custom-attr',
      {
        shadow: false,
        props: {
          userName: {
            type: String,
            attr: 'user-name',
          },
        },
      },
      _props => document.createElement('div'),
    )

    const ctor = customElements.get(
      'z-test-custom-attr',
    ) as CustomElementConstructor & { observedAttributes: string[] }
    expect(ctor.observedAttributes).toContain('user-name')
    expect(ctor.observedAttributes).not.toContain('userName')
  })

  it('skips attribute when attr is false', () => {
    defineElement(
      'z-test-no-attr',
      {
        shadow: false,
        props: {
          data: {
            type: Object,
            attr: false,
          },
        },
      },
      _props => document.createElement('div'),
    )

    const ctor = customElements.get(
      'z-test-no-attr',
    ) as CustomElementConstructor & { observedAttributes: string[] }
    expect(ctor.observedAttributes).not.toContain('data')
    expect(ctor.observedAttributes).toHaveLength(0)
  })
})
