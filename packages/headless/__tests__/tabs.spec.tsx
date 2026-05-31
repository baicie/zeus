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

function renderTabs() {
  document.body.innerHTML = `
    <z-tabs value="account">
      <z-tab-list>
        <z-tab-trigger value="account">Account</z-tab-trigger>
        <z-tab-trigger value="password">Password</z-tab-trigger>
      </z-tab-list>
      <z-tab-panel value="account">Account panel</z-tab-panel>
      <z-tab-panel value="password">Password panel</z-tab-panel>
    </z-tabs>
  `
}

describe('z-tabs', () => {
  let dom: JSDOM

  beforeAll(async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('HTMLButtonElement', dom.window.HTMLButtonElement)
    vi.stubGlobal('HTMLDivElement', dom.window.HTMLDivElement)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLSlotElement', dom.window.HTMLSlotElement)
    vi.stubGlobal('customElements', dom.window.customElements)
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent)
    vi.stubGlobal('Event', dom.window.Event)
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent)
    vi.stubGlobal('KeyboardEvent', dom.window.KeyboardEvent)

    await import('../src/tabs/tabs')
    await import('../src/tabs/tab-list')
    await import('../src/tabs/tab-trigger')
    await import('../src/tabs/tab-panel')
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  afterAll(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('renders initial active trigger and panel', async () => {
    renderTabs()
    await nextFrame()

    const triggers = document.querySelectorAll('z-tab-trigger')
    const panels = document.querySelectorAll('z-tab-panel')

    expect(document.querySelector('z-tabs')?.getAttribute('data-slot')).toBe(
      'tabs',
    )
    expect(triggers[0].getAttribute('data-state')).toBe('active')
    expect(
      triggers[0].querySelector('button')?.getAttribute('aria-selected'),
    ).toBe('true')
    expect(panels[0].getAttribute('data-state')).toBe('active')
    expect(panels[0].querySelector('div')?.hidden).toBe(false)
    expect(panels[1].querySelector('div')?.hidden).toBe(true)
  })

  it('clicking a trigger updates root value, triggers, panels, and event', async () => {
    renderTabs()
    const tabs = document.querySelector('z-tabs') as HTMLElement & {
      value?: string
    }
    const listener = vi.fn()
    tabs.addEventListener('value-change', listener)

    await nextFrame()

    const triggers = document.querySelectorAll('z-tab-trigger')
    triggers[1].querySelector('button')!.click()
    await nextFrame()

    const panels = document.querySelectorAll('z-tab-panel')
    expect(tabs.value).toBe('password')
    expect(listener).toHaveBeenCalledTimes(1)
    expect(listener.mock.calls[0][0].detail).toEqual({ value: 'password' })
    expect(triggers[0].getAttribute('data-state')).toBe('inactive')
    expect(triggers[1].getAttribute('data-state')).toBe('active')
    expect(panels[0].querySelector('div')?.hidden).toBe(true)
    expect(panels[1].querySelector('div')?.hidden).toBe(false)
  })
})
