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

describe('z-icon', () => {
  let dom: JSDOM

  beforeAll(async () => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('SVGSVGElement', dom.window.SVGSVGElement)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLSlotElement', dom.window.HTMLSlotElement)
    vi.stubGlobal('customElements', dom.window.customElements)
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent)

    await import('../src/icon/icon')
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  afterAll(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('renders the default icon as decorative', async () => {
    document.body.innerHTML = '<z-icon></z-icon>'
    const el = document.querySelector('z-icon')!

    await nextFrame()

    const svg = el.querySelector('svg')!
    expect(el.getAttribute('data-slot')).toBe('icon')
    expect(svg.getAttribute('aria-hidden')).toBe('true')
    expect(svg.querySelectorAll('path')).toHaveLength(1)
  })

  it('updates icon and label from external props', async () => {
    document.body.innerHTML = '<z-icon></z-icon>'
    const el = document.querySelector('z-icon') as HTMLElement & {
      name?: string
      label?: string
      size?: string
    }

    await nextFrame()
    el.name = 'x'
    el.label = 'Close'
    el.size = '24'
    await nextFrame()

    const svg = el.querySelector('svg')!
    expect(el.getAttribute('data-name')).toBe('x')
    expect(svg.getAttribute('aria-label')).toBe('Close')
    expect(svg.hasAttribute('aria-hidden')).toBe(false)
    expect(svg.getAttribute('width')).toBe('24')
    expect(svg.querySelectorAll('path')).toHaveLength(2)
  })
})
