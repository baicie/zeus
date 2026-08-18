import { JSDOM } from 'jsdom'
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  type Mock,
  vi,
} from 'vitest'

import {
  defineElement,
  getElementDefinition,
  mountElementDefinition,
  prop,
} from '../src'
import { bindAttr } from '../src/bindings'

let id = 0

function tag(name: string) {
  id++
  return `z-prop-${name}-${id}`
}

async function nextFrame() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('defineElement props tracking', () => {
  let dom: JSDOM

  beforeAll(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('HTMLButtonElement', dom.window.HTMLButtonElement)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('HTMLSlotElement', dom.window.HTMLSlotElement)
    vi.stubGlobal('customElements', dom.window.customElements)
    vi.stubGlobal('Event', dom.window.Event)
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent)
  })

  afterEach(() => {
    document.body.innerHTML = ''
  })

  afterAll(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('reruns bindAttr getter when host property changes', async () => {
    interface Props {
      disabled?: boolean
    }

    const name = tag('prop-tracking')

    defineElement<Props>(
      name,
      {
        shadow: false,
        props: {
          disabled: {
            type: Boolean,
            default: false,
            reflect: true,
          },
        },
      },
      props => {
        const host = document.createElement('div')
        const button = document.createElement('button')
        bindAttr(button, 'disabled', () => Boolean(props.disabled))
        bindAttr(button, 'aria-disabled', () =>
          props.disabled ? 'true' : null,
        )
        host.appendChild(button)
        return host
      },
    )

    document.body.innerHTML = `<${name}></${name}>`

    const el = document.querySelector(name) as HTMLElement & {
      disabled?: boolean
    }

    await nextFrame()

    const button = el.querySelector('button')!

    expect(button.disabled).toBe(false)

    el.disabled = true
    await nextFrame()

    expect(button.disabled).toBe(true)
    expect(button.getAttribute('aria-disabled')).toBe('true')
    expect(el.hasAttribute('disabled')).toBe(true)

    el.disabled = false
    await nextFrame()

    expect(button.disabled).toBe(false)
    expect(button.hasAttribute('aria-disabled')).toBe(false)
    expect(el.hasAttribute('disabled')).toBe(false)
  })

  it('reruns bindAttr getter when reflected attribute changes', async () => {
    interface Props {
      disabled?: boolean
    }

    const name = tag('attr-tracking')

    defineElement<Props>(
      name,
      {
        shadow: false,
        props: {
          disabled: {
            type: Boolean,
            default: false,
            reflect: true,
          },
        },
      },
      props => {
        const host = document.createElement('div')
        const button = document.createElement('button')
        bindAttr(button, 'disabled', () => Boolean(props.disabled))
        host.appendChild(button)
        return host
      },
    )

    document.body.innerHTML = `<${name}></${name}>`

    const el = document.querySelector(name)!

    await nextFrame()

    const button = el.querySelector('button')!

    el.setAttribute('disabled', '')
    await nextFrame()

    expect(button.disabled).toBe(true)

    el.removeAttribute('disabled')
    await nextFrame()

    expect(button.disabled).toBe(false)
  })

  it('does not skip native HTMLElement property names', async () => {
    interface Props {
      hidden?: boolean
    }

    const name = tag('native-hidden')

    defineElement<Props>(
      name,
      {
        shadow: false,
        props: {
          hidden: {
            type: Boolean,
            default: false,
          },
        },
      },
      props => {
        const host = document.createElement('div')
        const section = document.createElement('section')
        bindAttr(section, 'hidden', () => Boolean(props.hidden))
        host.appendChild(section)
        return host
      },
    )

    document.body.innerHTML = `<${name}></${name}>`

    const el = document.querySelector(name) as HTMLElement

    await nextFrame()

    const section = el.querySelector('section')!

    expect(section.hidden).toBe(false)
    ;(el as HTMLElement & { hidden?: boolean }).hidden = true
    await nextFrame()

    expect(section.hidden).toBe(true)
  })

  it('preserves pre-upgrade property values', async () => {
    interface Props {
      disabled?: boolean
    }

    const name = tag('pre-upgrade')

    const el = document.createElement(name) as HTMLElement & {
      disabled?: boolean
    }

    el.disabled = true
    document.body.appendChild(el)

    defineElement<Props>(
      name,
      {
        shadow: false,
        props: {
          disabled: {
            type: Boolean,
            default: false,
            reflect: true,
          },
        },
      },
      props => {
        const host = document.createElement('div')
        const button = document.createElement('button')
        bindAttr(button, 'disabled', () => Boolean(props.disabled))
        host.appendChild(button)
        return host
      },
    )

    await customElements.whenDefined(name)
    await nextFrame()

    const button = el.querySelector('button')!

    expect(button.disabled).toBe(true)
    expect(el.hasAttribute('disabled')).toBe(true)
  })

  it('tracks string props for attribute updates', async () => {
    interface Props {
      title?: string
    }

    const name = tag('string-prop')

    defineElement<Props>(
      name,
      {
        shadow: false,
        props: {
          title: {
            type: String,
            default: 'default',
          },
        },
      },
      props => {
        const host = document.createElement('div')
        const span = document.createElement('span')
        bindAttr(span, 'title', () => String(props.title ?? ''))
        host.appendChild(span)
        return host
      },
    )

    document.body.innerHTML = `<${name}></${name}>`

    const el = document.querySelector(name) as HTMLElement & {
      title?: string
    }

    await nextFrame()

    const span = el.querySelector('span')!

    expect(span.getAttribute('title')).toBe('default')

    el.title = 'updated'
    await nextFrame()

    expect(span.getAttribute('title')).toBe('updated')
  })

  it('supports opt-in shallow props while keeping deep props reactive', async () => {
    interface Row {
      id: string
    }

    interface Config {
      nested: {
        label: string
      }
    }

    interface Props {
      rows?: Row[]
      config?: Config
    }

    const name = tag('shallow-prop')
    let capturedProps: Readonly<Props> | undefined
    let readRow: Mock<() => string> | undefined
    let readConfig: Mock<() => string> | undefined

    defineElement<Props>(
      name,
      {
        shadow: false,
        props: {
          rows: prop<Row[]>(Array, { reactivity: 'shallow' }),
          config: Object,
        },
      },
      props => {
        capturedProps = props
        const host = document.createElement('div')
        const row = document.createElement('span')
        const config = document.createElement('span')
        readRow = vi.fn(() => props.rows?.[0]?.id ?? '')
        readConfig = vi.fn(() => props.config?.nested.label ?? '')
        bindAttr(row, 'data-row-id', readRow)
        bindAttr(config, 'data-config-label', readConfig)
        host.append(row, config)
        return host
      },
    )

    const el = document.createElement(name) as HTMLElement & Props
    document.body.appendChild(el)
    await nextFrame()

    const firstRow = { id: 'row-1' }
    const firstRows = [firstRow]
    el.rows = firstRows
    await nextFrame()

    expect(el.rows).toBe(firstRows)
    expect(el.rows?.[0]).toBe(firstRow)
    expect(capturedProps?.rows).toBe(firstRows)
    expect(readRow).toHaveBeenCalledTimes(2)

    firstRow.id = 'mutated'
    await nextFrame()

    expect(readRow).toHaveBeenCalledTimes(2)
    expect(el.querySelector('[data-row-id]')?.getAttribute('data-row-id')).toBe(
      'row-1',
    )

    const nextRows = [{ id: 'row-2' }]
    el.rows = nextRows
    await nextFrame()

    expect(readRow).toHaveBeenCalledTimes(3)
    expect(el.querySelector('[data-row-id]')?.getAttribute('data-row-id')).toBe(
      'row-2',
    )

    const rawConfig: Config = { nested: { label: 'first' } }
    el.config = rawConfig
    await nextFrame()

    expect(el.config).not.toBe(rawConfig)
    expect(el.config?.nested).not.toBe(rawConfig.nested)
    expect(readConfig).toHaveBeenCalledTimes(2)

    if (!el.config) throw new Error('Expected config prop to be initialized.')
    el.config.nested.label = 'updated'
    await nextFrame()

    expect(readConfig).toHaveBeenCalledTimes(3)
    expect(
      el
        .querySelector('[data-config-label]')
        ?.getAttribute('data-config-label'),
    ).toBe('updated')
  })

  it('normalizes prop reactivity metadata with deep as the default', () => {
    interface Props {
      rows?: unknown[]
      title?: string
    }

    const name = tag('prop-reactivity-metadata')
    const ctor = defineElement<Props>(
      name,
      {
        props: {
          rows: prop<unknown[]>(Array, { reactivity: 'shallow' }),
          title: String,
        },
      },
      () => document.createElement('span'),
    )

    expect(getElementDefinition(ctor).propDefs).toEqual([
      expect.objectContaining({
        name: 'rows',
        type: 'array',
        reactivity: 'shallow',
      }),
      expect.objectContaining({
        name: 'title',
        type: 'string',
        reactivity: 'deep',
      }),
    ])
  })

  it('preserves shallow prop semantics through lazy definition mounts', async () => {
    interface Row {
      id: string
    }

    interface Props {
      rows?: Row[]
    }

    const name = tag('lazy-shallow-prop')
    let capturedProps: Readonly<Props> | undefined
    let readRow: Mock<() => string> | undefined
    const ctor = defineElement<Props>(
      name,
      {
        props: {
          rows: prop<Row[]>(Array, { reactivity: 'shallow' }),
        },
      },
      props => {
        capturedProps = props
        const row = document.createElement('span')
        readRow = vi.fn(() => props.rows?.[0]?.id ?? '')
        bindAttr(row, 'data-row-id', readRow)
        return row
      },
    )
    const firstRow = { id: 'row-1' }
    const firstRows = [firstRow]
    const host = document.createElement('div')
    const mounted = mountElementDefinition(
      ctor,
      host,
      new Map([['rows', firstRows]]),
    )
    await nextFrame()

    expect(capturedProps?.rows).toBe(firstRows)
    expect(capturedProps?.rows?.[0]).toBe(firstRow)
    expect(readRow).toHaveBeenCalledTimes(1)

    firstRow.id = 'mutated'
    await nextFrame()

    expect(readRow).toHaveBeenCalledTimes(1)
    expect(host.firstElementChild?.getAttribute('data-row-id')).toBe('row-1')

    const nextRows = [{ id: 'row-2' }]
    mounted.propertyChanged('rows', firstRows, nextRows)
    await nextFrame()

    expect(capturedProps?.rows).toBe(nextRows)
    expect(readRow).toHaveBeenCalledTimes(2)
    expect(host.firstElementChild?.getAttribute('data-row-id')).toBe('row-2')

    mounted.dispose()
  })
})
