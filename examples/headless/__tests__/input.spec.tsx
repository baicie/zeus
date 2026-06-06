import { JSDOM } from 'jsdom'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

async function nextFrame() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('z-input', () => {
  let dom: JSDOM

  beforeAll(async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('HTMLInputElement', dom.window.HTMLInputElement)
    vi.stubGlobal('HTMLLabelElement', dom.window.HTMLLabelElement)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLSlotElement', dom.window.HTMLSlotElement)
    vi.stubGlobal('customElements', dom.window.customElements)
    vi.stubGlobal('Event', dom.window.Event)
    vi.stubGlobal('FocusEvent', dom.window.FocusEvent)
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent)

    await import('../src/input/input')
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  afterAll(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('renders props, host state attributes, slots and parts', async () => {
    document.body.innerHTML = `
      <z-input
        value="hello"
        placeholder="Email"
        type="email"
        size="lg"
        invalid
      >
        <span slot="prefix">@</span>
        <button slot="suffix" type="button">clear</button>
        <small slot="message">Required</small>
      </z-input>
    `

    const el = document.querySelector('z-input') as HTMLElement & {
      value?: string
    }

    await nextFrame()

    const input = el.querySelector('input')!

    expect(el.getAttribute('data-slot')).toBe('input')
    expect(el.getAttribute('data-size')).toBe('lg')
    expect(el.hasAttribute('data-invalid')).toBe(true)
    expect(el.hasAttribute('data-disabled')).toBe(false)
    expect(input.type).toBe('email')
    expect(input.value).toBe('hello')
    expect(input.placeholder).toBe('Email')
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(el.querySelector('[part="prefix"]')?.textContent).toContain('@')
    expect(el.querySelector('[part="control"]')).toBe(input)
    expect(el.querySelector('[part="suffix"]')?.textContent).toContain('clear')
    expect(el.querySelector('[part="message"]')?.textContent).toContain(
      'Required',
    )
  })

  it('updates native bindings when host props change', async () => {
    document.body.innerHTML = '<z-input></z-input>'
    const el = document.querySelector('z-input') as HTMLElement & {
      value?: string
      disabled?: boolean
      required?: boolean
      invalid?: boolean
    }

    await nextFrame()

    el.value = 'next'
    el.disabled = true
    el.required = true
    el.invalid = true
    await nextFrame()

    const input = el.querySelector('input')!

    expect(input.value).toBe('next')
    expect(input.disabled).toBe(true)
    expect(input.required).toBe(true)
    expect(input.getAttribute('aria-invalid')).toBe('true')
    expect(el.hasAttribute('data-disabled')).toBe(true)
    expect(el.hasAttribute('data-invalid')).toBe(true)
  })

  it('emits value-change, supports formatter function props, and exposes methods', async () => {
    document.body.innerHTML = '<z-input></z-input>'
    const el = document.querySelector('z-input') as HTMLElement & {
      value?: string
      formatter?: (value: string) => string
      focus(): void
      select(): void
    }
    const listener = vi.fn()
    el.addEventListener('value-change', listener)
    el.formatter = value => value.trim().toUpperCase()

    await nextFrame()

    const input = el.querySelector('input')!
    input.value = ' zeus '
    input.dispatchEvent(new Event('input', { bubbles: true }))
    await nextFrame()

    expect(input.value).toBe('ZEUS')
    expect(el.value).toBe('ZEUS')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].detail.value).toBe('ZEUS')
    expect(el.hasAttribute('formatter')).toBe(false)

    expect(() => el.focus()).not.toThrow()
    expect(() => el.select()).not.toThrow()
  })

  it('emits focus-change events', async () => {
    document.body.innerHTML = '<z-input></z-input>'
    const el = document.querySelector('z-input')!
    const listener = vi.fn()
    el.addEventListener('focus-change', listener)

    await nextFrame()

    const input = el.querySelector('input')!
    input.dispatchEvent(new FocusEvent('focus'))
    input.dispatchEvent(new FocusEvent('blur'))

    expect(listener).toHaveBeenCalledTimes(2)
    expect(listener.mock.calls[0][0].detail.focused).toBe(true)
    expect(listener.mock.calls[1][0].detail.focused).toBe(false)
  })
})
