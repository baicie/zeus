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

describe('z-switch', () => {
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
    vi.stubGlobal('KeyboardEvent', dom.window.KeyboardEvent)

    await import('../src/switch/switch')
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  afterAll(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('toggles checked state and emits checked-change', async () => {
    document.body.innerHTML = '<z-switch>Enable</z-switch>'
    const el = document.querySelector('z-switch') as HTMLElement & {
      checked?: boolean
    }
    const listener = vi.fn()
    el.addEventListener('checked-change', listener)

    await nextFrame()

    const button = el.querySelector('button')!
    expect(el.getAttribute('data-state')).toBe('unchecked')
    expect(button.getAttribute('aria-checked')).toBe('false')

    button.click()
    await nextFrame()

    expect(el.checked).toBe(true)
    expect(el.getAttribute('data-state')).toBe('checked')
    expect(button.getAttribute('aria-checked')).toBe('true')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].detail).toEqual({ checked: true })
  })

  it('reacts to external checked property updates', async () => {
    document.body.innerHTML = '<z-switch></z-switch>'
    const el = document.querySelector('z-switch') as HTMLElement & {
      checked?: boolean
    }

    await nextFrame()
    el.checked = true
    await nextFrame()

    expect(el.getAttribute('data-state')).toBe('checked')
    expect(el.querySelector('button')?.getAttribute('aria-checked')).toBe(
      'true',
    )
  })

  it('blocks interaction while disabled', async () => {
    document.body.innerHTML = '<z-switch disabled></z-switch>'
    const el = document.querySelector('z-switch') as HTMLElement & {
      checked?: boolean
    }
    const listener = vi.fn()
    el.addEventListener('checked-change', listener)

    await nextFrame()

    const button = el.querySelector('button')!
    button.click()
    await nextFrame()

    expect(el.checked).toBe(false)
    expect(button.disabled).toBe(true)
    expect(listener).not.toHaveBeenCalled()
  })
})
