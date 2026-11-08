import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bootstrapLazy } from '../src/bootstrapLazy'

import type { ZeusComponentInstance } from '../src/types'

interface ZeusLazyElement extends HTMLElement {
  componentOnReady(): Promise<HTMLElement>
}

describe('lazy component rendered output', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('customElements', dom.window.customElements)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  function bootstrapStringComponent(
    tagName: string,
    render: () => string | Node | Node[],
  ): void {
    const load = vi.fn().mockResolvedValue({
      createComponent(): ZeusComponentInstance {
        return {
          connected() {},
          render,
        }
      },
    })

    bootstrapLazy([{ tagName, shadow: true, load, props: [] }])
  }

  it('treats a render string as untrusted text, never as HTML', async () => {
    const payload = '<img src=x onerror="window.__zeusTrustedHtmlXss = true">'
    bootstrapStringComponent('zw-trusted-html-text', () => payload)

    const el = document.createElement('zw-trusted-html-text') as ZeusLazyElement
    document.body.appendChild(el)
    await el.componentOnReady()

    const root = el.shadowRoot!

    expect(root.querySelector('img')).toBeNull()
    expect(root.textContent).toBe(payload)
    expect(
      (dom.window as unknown as { __zeusTrustedHtmlXss?: boolean })
        .__zeusTrustedHtmlXss,
    ).toBeUndefined()
  })

  it('keeps Node output as the trusted markup channel', async () => {
    bootstrapStringComponent('zw-trusted-html-node', () => {
      const span = document.createElement('span')
      span.textContent = 'safe markup'
      return span
    })

    const el = document.createElement('zw-trusted-html-node') as ZeusLazyElement
    document.body.appendChild(el)
    await el.componentOnReady()

    expect(el.shadowRoot!.querySelector('span')!.textContent).toBe(
      'safe markup',
    )
  })
})
