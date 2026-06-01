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

function renderDialog() {
  document.body.innerHTML = `
    <z-dialog>
      <z-dialog-trigger>Open</z-dialog-trigger>
      <z-dialog-content>
        <z-dialog-title>Title</z-dialog-title>
        <z-dialog-description>Description</z-dialog-description>
        Content
      </z-dialog-content>
    </z-dialog>
  `
}

describe('z-dialog', () => {
  let dom: JSDOM

  beforeAll(async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('HTMLButtonElement', dom.window.HTMLButtonElement)
    vi.stubGlobal('HTMLDivElement', dom.window.HTMLDivElement)
    vi.stubGlobal('HTMLHeadingElement', dom.window.HTMLHeadingElement)
    vi.stubGlobal('HTMLParagraphElement', dom.window.HTMLParagraphElement)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLSlotElement', dom.window.HTMLSlotElement)
    vi.stubGlobal('customElements', dom.window.customElements)
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent)
    vi.stubGlobal('Event', dom.window.Event)
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent)
    vi.stubGlobal('KeyboardEvent', dom.window.KeyboardEvent)

    await import('../src/dialog/dialog')
    await import('../src/dialog/dialog-trigger')
    await import('../src/dialog/dialog-content')
    await import('../src/dialog/dialog-title')
    await import('../src/dialog/dialog-description')
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  afterAll(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('opens from trigger and emits open-change', async () => {
    renderDialog()
    const dialog = document.querySelector('z-dialog') as HTMLElement & {
      open?: boolean
    }
    const listener = vi.fn()
    dialog.addEventListener('open-change', listener)

    await nextFrame()

    const content = document.querySelector('z-dialog-content')!
    expect(dialog.getAttribute('data-state')).toBe('closed')
    expect(content.querySelector('[part="root"]')?.hasAttribute('hidden')).toBe(
      true,
    )

    document.querySelector<HTMLElement>('z-dialog-trigger button')!.click()
    await nextFrame()

    expect(dialog.open).toBe(true)
    expect(dialog.getAttribute('data-state')).toBe('open')
    expect(content.getAttribute('data-state')).toBe('open')
    expect(content.querySelector<HTMLDivElement>('[part="root"]')?.hidden).toBe(
      false,
    )
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].detail).toEqual({ open: true })
  })

  it('closes from overlay and Escape', async () => {
    renderDialog()
    const dialog = document.querySelector('z-dialog') as HTMLElement & {
      open?: boolean
    }

    await nextFrame()
    dialog.open = true
    await nextFrame()

    document.querySelector<HTMLElement>('[part="overlay"]')!.click()
    await nextFrame()

    expect(dialog.open).toBe(false)

    dialog.open = true
    await nextFrame()

    document
      .querySelector<HTMLElement>('z-dialog-content [part="root"]')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    await nextFrame()

    expect(dialog.open).toBe(false)
  })
})
