import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Host, Slot, defineElement } from '../src'
import { insert, insertTracked } from '../src'

let uid = 0

function createTag(name: string): string {
  uid += 1
  return `z-host-${name}-${uid}`
}

async function nextFrame() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('Host', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLSlotElement', dom.window.HTMLSlotElement)
    vi.stubGlobal('customElements', dom.window.customElements)
    vi.stubGlobal('MouseEvent', dom.window.MouseEvent)
    vi.stubGlobal('Event', dom.window.Event)
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  // ===== existing transparent wrapper tests =====

  it('renders children as transparent wrapper outside custom element', () => {
    const container = document.createElement('div')

    const span = document.createElement('span')
    span.textContent = 'host child'
    const result = Host({ children: span })

    container.appendChild(result as Node)

    expect(container.innerHTML).toContain('<span>host child</span>')
  })

  it('renders static text children', () => {
    const container = document.createElement('div')
    const result = Host({ children: 'plain text' })
    insert(container, result)
    expect(container.textContent).toBe('plain text')
  })

  it('renders array of elements', () => {
    const container = document.createElement('div')

    const items = [
      (() => {
        const el = document.createElement('li')
        el.textContent = 'item 1'
        return el
      })(),
      (() => {
        const el = document.createElement('li')
        el.textContent = 'item 2'
        return el
      })(),
    ]
    const result = Host({ children: items })
    insert(container, result)

    expect(container.querySelectorAll('li').length).toBe(2)
    expect(container.textContent).toBe('item 1item 2')
  })

  it('renders null children', () => {
    const container = document.createElement('div')
    const result = Host({ children: null })
    insert(container, result)
    expect(container.textContent).toBe('')
  })

  it('renders function children', () => {
    const container = document.createElement('div')
    const result = Host({
      children: () => {
        const el = document.createElement('span')
        el.textContent = 'lazy child'
        return el
      },
    })
    container.appendChild(result as Node)
    expect(container.textContent).toBe('lazy child')
  })

  it('renders nested structure', () => {
    const container = document.createElement('div')
    const header = document.createElement('h1')
    header.textContent = 'Title'
    const body = document.createElement('p')
    body.textContent = 'Paragraph'
    const frag = document.createDocumentFragment()
    frag.appendChild(header)
    frag.appendChild(body)
    const result = Host({ children: frag })
    container.appendChild(result as Node)

    expect(container.querySelector('h1')!.textContent).toBe('Title')
    expect(container.querySelector('p')!.textContent).toBe('Paragraph')
  })

  it('Host is transparent and passes through DOM nodes', () => {
    const container = document.createElement('div')
    const outer = document.createElement('div')
    outer.className = 'outer'
    const inner = document.createElement('span')
    inner.textContent = 'inner'
    outer.appendChild(inner)
    const result = Host({ children: outer })
    container.appendChild(result as Node)

    expect(container.querySelector('div.outer')).toBeTruthy()
    expect(container.querySelector('div.outer span')!.textContent).toBe('inner')
  })

  // ===== Phase 1: Host props binding tests =====

  it('binds data attributes to current custom element host', async () => {
    const tag = createTag('data-attrs')

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        const section = document.createElement('section')
        const slotEl = Slot({})
        insertTracked(section, slotEl)

        Host({
          'data-state': 'open',
          'data-slot': 'button',
          children: section,
        })

        return section
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    expect(el.getAttribute('data-state')).toBe('open')
    expect(el.getAttribute('data-slot')).toBe('button')
    expect(el.innerHTML).toContain('<section>')
  })

  it('updates host data-state when prop changes', async () => {
    const tag = createTag('dynamic-state')

    defineElement<{ open?: boolean }>(
      tag,
      {
        shadow: false,
        props: {
          open: {
            type: Boolean,
            default: false,
            reflect: true,
          },
        },
      },
      props => {
        const div = document.createElement('div')
        const slotEl = Slot({})
        insertTracked(div, slotEl)

        Host({
          'data-state': () => (props.open ? 'open' : 'closed'),
          children: div,
        })

        return div
      },
    )

    const el = document.createElement(tag) as HTMLElement & {
      open?: boolean
    }

    document.body.appendChild(el)

    await nextFrame()

    expect(el.getAttribute('data-state')).toBe('closed')

    el.open = true

    await nextFrame()

    expect(el.getAttribute('data-state')).toBe('open')
  })

  it('removes host attribute when value is false/null/undefined', async () => {
    const tag = createTag('remove-attrs')

    defineElement<{ disabled?: boolean }>(
      tag,
      {
        shadow: false,
        props: {
          disabled: {
            type: Boolean,
            default: true,
          },
        },
      },
      props => {
        const button = document.createElement('button')
        button.textContent = 'button'

        Host({
          'data-disabled': () => (props.disabled ? '' : undefined),
          'aria-disabled': () => (props.disabled ? 'true' : undefined),
          children: button,
        })

        return button
      },
    )

    const el = document.createElement(tag) as HTMLElement & {
      disabled?: boolean
    }
    el.setAttribute('disabled', '')

    document.body.appendChild(el)

    await nextFrame()

    expect(el.hasAttribute('data-disabled')).toBe(true)
    expect(el.getAttribute('aria-disabled')).toBe('true')

    el.disabled = false

    await nextFrame()

    expect(el.hasAttribute('data-disabled')).toBe(false)
    expect(el.hasAttribute('aria-disabled')).toBe(false)
  })

  it('sets empty attribute when value is true', async () => {
    const tag = createTag('true-attr')

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        const span = document.createElement('span')
        span.textContent = 'hidden'

        Host({
          hidden: true,
          children: span,
        })

        return span
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    expect(el.hasAttribute('hidden')).toBe(true)
    expect(el.getAttribute('hidden')).toBe('')
  })

  it('binds class to host class attribute', async () => {
    const tag = createTag('class')

    defineElement<{ active?: boolean }>(
      tag,
      {
        shadow: false,
        props: {
          active: {
            type: Boolean,
            default: false,
          },
        },
      },
      props => {
        const button = document.createElement('button')
        button.textContent = 'button'

        Host({
          class: () => [
            'z-button',
            {
              'is-active': props.active,
            },
          ],
          children: button,
        })

        return button
      },
    )

    const el = document.createElement(tag) as HTMLElement & {
      active?: boolean
    }

    document.body.appendChild(el)

    await nextFrame()

    expect(el.getAttribute('class')).toBe('z-button')

    el.active = true

    await nextFrame()

    expect(el.getAttribute('class')).toBe('z-button is-active')
  })

  it('prefers className over class when both exist', async () => {
    const tag = createTag('class-name')

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        const span = document.createElement('span')
        span.textContent = 'content'

        Host({
          class: 'from-class',
          className: 'from-class-name',
          children: span,
        })

        return span
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    expect(el.getAttribute('class')).toBe('from-class-name')
  })

  it('binds style to host element', async () => {
    const tag = createTag('style')

    defineElement<{ gap?: number }>(
      tag,
      {
        shadow: false,
        props: {
          gap: {
            type: Number,
            default: 4,
          },
        },
      },
      props => {
        const span = document.createElement('span')
        span.textContent = 'styled'

        Host({
          style: () => ({
            display: 'inline-flex',
            gap: props.gap,
            opacity: 1,
          }),
          children: span,
        })

        return span
      },
    )

    const el = document.createElement(tag) as HTMLElement & {
      gap?: number
    }

    document.body.appendChild(el)

    await nextFrame()

    expect(el.style.display).toBe('inline-flex')
    expect(el.style.gap).toBe('4px')
    expect(el.style.opacity).toBe('1')

    el.gap = 8

    await nextFrame()

    expect(el.style.gap).toBe('8px')
  })

  it('binds ref to host element', async () => {
    const tag = createTag('ref')
    const ref = vi.fn()

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        const span = document.createElement('span')
        span.textContent = 'content'

        Host({
          ref,
          children: span,
        })

        return span
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    expect(ref).toHaveBeenCalledWith(el)
  })

  it('ignores event-like props in phase 1', async () => {
    const tag = createTag('event-like')
    const onClick = vi.fn()

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        const button = document.createElement('button')
        button.textContent = 'button'

        Host({
          onClick,
          children: button,
        })

        return button
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    expect(el.hasAttribute('onClick')).toBe(false)
    expect(el.hasAttribute('on-click')).toBe(false)
  })

  it('does not create extra DOM node', async () => {
    const tag = createTag('no-extra-node')

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        const outer = document.createElement('div')

        Host({
          'data-state': 'ready',
          children: outer,
        })

        const span1 = document.createElement('span')
        span1.textContent = 'one'
        const span2 = document.createElement('span')
        span2.textContent = 'two'
        outer.appendChild(span1)
        outer.appendChild(span2)

        return outer
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    expect(el.querySelectorAll('span').length).toBe(2)
    expect(el.querySelector('span:nth-child(1)')!.textContent).toBe('one')
    expect(el.querySelector('span:nth-child(2)')!.textContent).toBe('two')
  })

  it('binds aria attributes to host element', async () => {
    const tag = createTag('aria')

    defineElement<{ disabled?: boolean }>(
      tag,
      {
        shadow: false,
        props: {
          disabled: {
            type: Boolean,
            default: false,
          },
        },
      },
      props => {
        const span = document.createElement('span')
        span.textContent = 'content'

        Host({
          role: 'button',
          'aria-disabled': () => (props.disabled ? 'true' : 'false'),
          'aria-label': 'test button',
          children: span,
        })

        return span
      },
    )

    const el = document.createElement(tag) as HTMLElement & {
      disabled?: boolean
    }

    document.body.appendChild(el)

    await nextFrame()

    expect(el.getAttribute('role')).toBe('button')
    expect(el.getAttribute('aria-disabled')).toBe('false')
    expect(el.getAttribute('aria-label')).toBe('test button')

    el.disabled = true

    await nextFrame()

    expect(el.getAttribute('aria-disabled')).toBe('true')
  })

  it('binds id, title, and tabIndex to host element', async () => {
    const tag = createTag('common-attrs')

    defineElement<{ tabindex?: number | null }>(
      tag,
      {
        shadow: false,
        props: {
          tabindex: {
            type: Number,
            attr: 'tabindex',
          },
        },
      },
      props => {
        const span = document.createElement('span')
        span.textContent = 'content'

        Host({
          id: 'my-element',
          title: 'My Element',
          tabIndex: () => props.tabindex ?? 0,
          children: span,
        })

        return span
      },
    )

    const el = document.createElement(tag) as HTMLElement & {
      tabindex?: number | null
    }

    document.body.appendChild(el)

    await nextFrame()

    expect(el.getAttribute('id')).toBe('my-element')
    expect(el.getAttribute('title')).toBe('My Element')
    expect(el.getAttribute('tabindex')).toBe('0')
  })
})
