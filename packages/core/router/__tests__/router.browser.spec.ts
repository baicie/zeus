import { createBrowserHistory } from '@remix-run/router'
import { JSDOM } from 'jsdom'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { createRouter } from '../src'

describe('@zeus-js/router browser history', () => {
  let dom: JSDOM

  afterEach(() => {
    vi.unstubAllGlobals()
    dom?.window.close()
  })

  it('keeps accessors synchronized with browser URLs and history traversal', async () => {
    const JSDOMWithOptions = JSDOM as unknown as new (
      html: string,
      options: { url: string },
    ) => JSDOM
    dom = new JSDOMWithOptions('<!doctype html><html><body></body></html>', {
      url: 'http://localhost/',
    })
    vi.stubGlobal('window', dom.window)
    vi.stubGlobal('document', dom.window.document)

    const router = createRouter({
      history: createBrowserHistory({
        window: dom.window as unknown as Window,
      }),
      routes: [
        {
          id: 'root',
          path: '/',
          children: [
            { id: 'home', index: true },
            { id: 'item', path: 'items/:id' },
          ],
        },
      ],
    })

    await router.navigate('/items/5?view=full#details')
    expect(dom.window.location.pathname).toBe('/items/5')
    expect(router.pathname()).toBe('/items/5')
    expect(router.search()).toBe('?view=full')
    expect(router.hash()).toBe('#details')

    await router.navigate('/')
    await router.navigate(-1)
    for (let i = 0; i < 50 && router.pathname() !== '/items/5'; i += 1) {
      await new Promise(resolve => setTimeout(resolve, 0))
    }
    expect(router.pathname()).toBe('/items/5')

    router.dispose()
  })
})
