import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Slot, defineElement, mountElementDefinition } from '../src'
import { insertTracked } from '../src'
import { takeSSRLightDomChildren } from '../src/lightDomSsr'

let uid = 0

function createTag(name: string) {
  uid += 1
  return `z-ssr-${name}-${uid}`
}

async function nextFrame() {
  await Promise.resolve()
  await Promise.resolve()
}

/**
 * A Light DOM host whose server output separates internal structure from
 * consumer children with `zeus:light:*` comment markers. Projected consumer
 * nodes sit at their slot position, inside the root block.
 */
function lightMarkup(): string {
  return (
    '<!--zeus:light:root-->' +
    '<style>z-old { color: old }</style>' +
    '<p class="internal">internal</p>' +
    '<!--zeus:light:child--><b slot="title">Named</b><!--/zeus:light:child-->' +
    '<!--zeus:light:child--><i>Body</i><!--/zeus:light:child-->' +
    '<!--/zeus:light:root-->'
  )
}

function mountLightComponent(tag: string) {
  defineElement(
    tag,
    { shadow: false, styles: ['z-new { color: new }'], styleNonce: 'nonce-1' },
    () => {
      const container = document.createElement('div')
      container.className = 'internal'
      insertTracked(
        container,
        Slot({ name: 'title', children: 'default title' }),
      )
      insertTracked(container, Slot({}))
      return container
    },
  )
}

describe('SSR Light DOM upgrade', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLSlotElement', dom.window.HTMLSlotElement)
    vi.stubGlobal('MutationObserver', dom.window.MutationObserver)
    vi.stubGlobal('customElements', dom.window.customElements)
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent)
    vi.stubGlobal('Event', dom.window.Event)
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent)
    Reflect.deleteProperty(dom.window.HTMLElement.prototype, 'attachInternals')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('separates server internals from consumer children using explicit markers', async () => {
    const tag = createTag('upgrade')
    mountLightComponent(tag)

    const host = document.createElement(tag)
    host.innerHTML = lightMarkup()
    document.body.appendChild(host)
    await nextFrame()

    const internal = host.querySelector('div.internal')
    expect(internal).toBeTruthy()

    const named = host.querySelector('b[slot="title"]')
    const body = host.querySelector('i')
    expect(named?.textContent).toBe('Named')
    expect(body?.textContent).toBe('Body')
    expect(named?.parentNode).toBe(internal)
    expect(body?.parentNode).toBe(internal)

    // The server's internal paragraph is replaced by the client render.
    expect(host.querySelector('p.internal')).toBeNull()
    expect(host.textContent).not.toContain('internal')

    // No server marker survives the upgrade.
    const comments: string[] = []
    const walker = document.createTreeWalker(host, 128)
    let current = walker.nextNode()
    while (current) {
      comments.push((current as Comment).data)
      current = walker.nextNode()
    }
    expect(comments.filter(data => data.startsWith('zeus:light'))).toEqual([])
  })

  it('keeps client styles before component content and replaces the server style', async () => {
    const tag = createTag('upgrade-styles')
    mountLightComponent(tag)

    const host = document.createElement(tag)
    host.innerHTML = lightMarkup()
    document.body.appendChild(host)
    await nextFrame()

    const styles = host.querySelectorAll('style')
    expect(styles).toHaveLength(1)
    expect(styles[0]!.textContent).toContain('z-new')
    expect(styles[0]!.nonce).toBe('nonce-1')

    // Style is the first thing the client writes, matching the documented
    // server order `styles before component content`.
    const children = Array.from(host.childNodes)
    expect(children[0]).toBe(styles[0])
    expect(children[1]).toBe(host.querySelector('div.internal'))
  })

  it('captures consumer children before the client render clears the host', async () => {
    const tag = createTag('upgrade-order')
    mountLightComponent(tag)

    const host = document.createElement(tag)
    host.innerHTML = lightMarkup()
    document.body.appendChild(host)
    await nextFrame()

    expect(host.querySelector('[slot="title"]')?.textContent).toBe('Named')
    expect(host.querySelector('div.internal > i')?.textContent).toBe('Body')
  })

  it('mounts fresh when the host carries no SSR markers', async () => {
    const tag = createTag('no-markers')
    mountLightComponent(tag)

    const host = document.createElement(tag)
    host.innerHTML = '<b>existing</b>'
    document.body.appendChild(host)
    await nextFrame()

    // Without markers every existing child is a consumer child, exactly like
    // a brand new mount.
    const internal = host.querySelector('div.internal')
    expect(internal).toBeTruthy()
    expect(host.querySelector('b')?.textContent).toBe('existing')
    expect(host.querySelector('b')?.parentNode).toBe(internal)
  })

  it('does not duplicate styles or consumer children when the host reconnects', async () => {
    const tag = createTag('upgrade-reconnect')
    mountLightComponent(tag)

    const host = document.createElement(tag)
    host.innerHTML = lightMarkup()
    document.body.appendChild(host)
    await nextFrame()

    host.remove()
    await nextFrame()

    document.body.appendChild(host)
    await nextFrame()

    expect(host.querySelectorAll('style')).toHaveLength(1)
    expect(host.querySelectorAll('b')).toHaveLength(1)
    expect(host.querySelectorAll('i')).toHaveLength(1)
    expect(host.querySelector('b')?.textContent).toBe('Named')

    const comments: string[] = []
    const walker = document.createTreeWalker(host, 128)
    let current = walker.nextNode()
    while (current) {
      comments.push((current as Comment).data)
      current = walker.nextNode()
    }
    expect(comments.filter(data => data.startsWith('zeus:light'))).toEqual([])
  })

  it('applies the same upgrade through mountElementDefinition', () => {
    const tag = createTag('upgrade-external')
    const ctor = defineElement(
      tag,
      { shadow: false, styles: ['z-external { color: red }'] },
      () => {
        const container = document.createElement('div')
        container.className = 'internal'
        insertTracked(container, Slot({}))
        return container
      },
    )

    const host = document.createElement(tag)
    host.innerHTML = lightMarkup()

    // The manual mount path is exercised without connecting the host, so the
    // element's own connectedCallback does not mount a second time.
    const mount = mountElementDefinition(ctor, host)

    expect(host.querySelector('div.internal')).toBeTruthy()
    expect(host.querySelector('i')?.textContent).toBe('Body')
    expect(host.querySelector('p.internal')).toBeNull()
    expect(host.querySelectorAll('style')).toHaveLength(1)
    expect(Array.from(host.childNodes)[0]).toBe(host.querySelector('style'))

    mount.dispose()
    expect(host.querySelector('style')).toBeNull()
  })

  it('treats projected subtrees as opaque when they contain another SSR host', () => {
    const host = document.createElement('div')
    host.innerHTML =
      '<!--zeus:light:root-->' +
      '<p>outer internal</p>' +
      '<!--zeus:light:child-->' +
      '<span>' +
      '<!--zeus:light:root--><em>inner internal</em><!--/zeus:light:root-->' +
      '<!--zeus:light:child--><u>inner child</u><!--/zeus:light:child-->' +
      '</span>' +
      '<!--/zeus:light:child-->' +
      '<!--/zeus:light:root-->'

    const children = takeSSRLightDomChildren(host)

    expect(children).toHaveLength(1)
    const span = children![0] as HTMLElement
    expect(span.tagName).toBe('SPAN')
    // The nested host keeps its own markers so it can upgrade independently.
    expect(span.innerHTML).toContain('zeus:light:root')
    expect(span.querySelector('u')?.textContent).toBe('inner child')
    // The outer block and its internal content are gone.
    expect(host.childNodes).toHaveLength(0)
  })

  it('returns undefined when no root marker exists', () => {
    const host = document.createElement('div')
    host.innerHTML = '<!--zeus:light:child--><b>x</b><!--/zeus:light:child-->'

    expect(takeSSRLightDomChildren(host)).toBeUndefined()
    expect(host.querySelector('b')?.textContent).toBe('x')
  })

  it('ignores an unterminated root marker instead of eating host children', () => {
    const host = document.createElement('div')
    host.innerHTML = '<!--zeus:light:root--><p>internal</p><b>child</b>'

    expect(takeSSRLightDomChildren(host)).toBeUndefined()
    expect(host.querySelector('b')?.textContent).toBe('child')
  })
})
