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

describe('z-button', () => {
  let dom: JSDOM

  beforeAll(async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('HTMLButtonElement', dom.window.HTMLButtonElement)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLSlotElement', dom.window.HTMLSlotElement)
    vi.stubGlobal('customElements', dom.window.customElements)
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent)
    vi.stubGlobal('Event', dom.window.Event)
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent)

    await import('../src/button/button')
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  afterAll(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('renders data attributes from props', async () => {
    document.body.innerHTML =
      '<z-button variant="outline" size="lg">Save</z-button>'
    const el = document.querySelector('z-button')!

    await nextFrame()

    expect(el.getAttribute('data-slot')).toBe('button')
    expect(el.getAttribute('data-variant')).toBe('outline')
    expect(el.getAttribute('data-size')).toBe('lg')
    expect(el.hasAttribute('data-disabled')).toBe(false)
  })

  it('renders default variant and size data attributes', async () => {
    document.body.innerHTML = '<z-button>Default</z-button>'
    const el = document.querySelector('z-button')!

    await nextFrame()

    expect(el.getAttribute('data-slot')).toBe('button')
    expect(el.getAttribute('data-variant')).toBe('default')
    expect(el.getAttribute('data-size')).toBe('md')
    expect(el.hasAttribute('data-disabled')).toBe(false)
  })

  it('renders registry button variant and size attributes', async () => {
    document.body.innerHTML =
      '<z-button variant="destructive" size="icon">Delete</z-button>'
    const el = document.querySelector('z-button')!

    await nextFrame()

    expect(el.getAttribute('data-variant')).toBe('destructive')
    expect(el.getAttribute('data-size')).toBe('icon')
  })

  it('emits press event on click', async () => {
    document.body.innerHTML = '<z-button>Save</z-button>'
    const el = document.querySelector('z-button')!
    const listener = vi.fn()
    el.addEventListener('press', listener)

    await nextFrame()
    el.querySelector('button')!.click()
    await nextFrame()

    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].detail).toHaveProperty('nativeEvent')
  })

  it('blocks press while disabled and reacts to external updates', async () => {
    document.body.innerHTML = '<z-button>Save</z-button>'
    const el = document.querySelector('z-button') as HTMLElement & {
      disabled?: boolean
    }
    const listener = vi.fn()
    el.addEventListener('press', listener)

    await nextFrame()
    el.disabled = true
    await nextFrame()

    const button = el.querySelector('button')!
    button.click()

    expect(button.disabled).toBe(true)
    expect(el.hasAttribute('data-disabled')).toBe(true)
    expect(listener).not.toHaveBeenCalled()
  })
})
