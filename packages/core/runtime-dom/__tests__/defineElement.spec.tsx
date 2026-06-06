import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  Slot,
  defineElement,
  event,
  mountElementDefinition,
  prop,
} from '../src'
import { insertTracked } from '../src'

let uid = 0

function createTag(name: string) {
  uid += 1
  return `z-test-${name}-${uid}`
}

async function nextFrame() {
  await Promise.resolve()
  await Promise.resolve()
}

describe('defineElement', () => {
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
    Reflect.deleteProperty(dom.window.HTMLElement.prototype, 'attachInternals')
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('renders with default props when no attributes set', async () => {
    const tag = createTag('default-props')

    defineElement<{ label?: string }>(
      tag,
      {
        shadow: false,
        props: {
          label: {
            type: String,
            default: 'Hello',
          },
        },
      },
      props => {
        const el = document.createElement('span')
        el.textContent = String(props.label ?? '')
        return el
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    expect(el.textContent).toBe('Hello')
  })

  it('syncs attribute to props', async () => {
    const tag = createTag('attr-to-prop')

    defineElement<{ count?: number }>(
      tag,
      {
        shadow: false,
        props: {
          count: Number,
        },
      },
      props => {
        const el = document.createElement('span')
        el.textContent = String(props.count ?? '')
        return el
      },
    )

    const el = document.createElement(tag)
    el.setAttribute('count', '3')
    document.body.appendChild(el)

    await nextFrame()

    expect((el as unknown as { count: number }).count).toBe(3)
    expect(el.textContent).toBe('3')
  })

  it('syncs property to props', async () => {
    const tag = createTag('property-to-prop')

    defineElement<{ count?: number }>(
      tag,
      {
        shadow: false,
        props: {
          count: Number,
        },
      },
      props => {
        const el = document.createElement('span')
        el.textContent = String(props.count ?? '')
        return el
      },
    )

    const el = document.createElement(tag) as HTMLElement & {
      count?: number
    }

    el.count = 10

    document.body.appendChild(el)

    await nextFrame()

    expect(el.count).toBe(10)
    expect(el.textContent).toBe('10')
  })

  it('handles boolean attributes correctly', async () => {
    const tag = createTag('boolean')

    defineElement<{ disabled?: boolean }>(
      tag,
      {
        shadow: false,
        props: {
          disabled: Boolean,
        },
      },
      props => {
        const el = document.createElement('button')
        el.disabled = Boolean(props.disabled)
        return el
      },
    )

    const el = document.createElement(tag)
    el.setAttribute('disabled', '')
    document.body.appendChild(el)

    await nextFrame()

    const button = el.querySelector('button') as HTMLButtonElement

    expect((el as unknown as { disabled: boolean }).disabled).toBe(true)
    expect(button.disabled).toBe(true)
  })

  it('reflects property changes to attributes', async () => {
    const tag = createTag('reflect')

    defineElement<{ active?: boolean; value?: string }>(
      tag,
      {
        shadow: false,
        props: {
          active: {
            type: Boolean,
            default: false,
            reflect: true,
          },
          value: {
            type: String,
            default: 'a',
            reflect: true,
          },
        },
      },
      props => {
        const el = document.createElement('span')
        el.textContent = String(props.value ?? '')
        return el
      },
    )

    const el = document.createElement(tag) as HTMLElement & {
      active?: boolean
      value?: string
    }

    document.body.appendChild(el)

    el.active = true
    el.value = 'b'

    await nextFrame()

    expect(el.hasAttribute('active')).toBe(true)
    expect(el.getAttribute('value')).toBe('b')

    el.active = false

    await nextFrame()

    expect(el.hasAttribute('active')).toBe(false)
  })

  it('passes ElementInternals to form-associated element setup', async () => {
    const tag = createTag('form-associated')
    const internals = {
      setFormValue: vi.fn(),
    } as unknown as ElementInternals
    const attachInternals = vi.fn(() => internals)
    let captured: ElementInternals | undefined

    Object.defineProperty(dom.window.HTMLElement.prototype, 'attachInternals', {
      configurable: true,
      value: attachInternals,
    })

    const ctor = defineElement(
      tag,
      {
        shadow: false,
        formAssociated: true,
      },
      (_props, context) => {
        captured = context.internals
        const el = document.createElement('span')
        el.textContent = context.internals ? 'associated' : 'missing'
        return el
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    expect(
      (ctor as unknown as { formAssociated: boolean }).formAssociated,
    ).toBe(true)
    expect(attachInternals).toHaveBeenCalledTimes(1)
    expect(captured).toBe(internals)
    expect(el.textContent).toBe('associated')
  })

  it('synchronizes form value and forwards form lifecycle callbacks', async () => {
    const tag = createTag('form-lifecycle')
    const setFormValue = vi.fn()
    const internals = {
      setFormValue,
    } as unknown as ElementInternals
    const associated = vi.fn()
    const disabled = vi.fn()
    const reset = vi.fn()
    const stateRestore = vi.fn()

    Object.defineProperty(dom.window.HTMLElement.prototype, 'attachInternals', {
      configurable: true,
      value: vi.fn(() => internals),
    })

    defineElement<{ value?: string; state?: string }>(
      tag,
      {
        shadow: false,
        formAssociated: true,
        props: {
          value: {
            type: String,
            default: '',
          },
          state: {
            type: String,
            default: 'initial',
          },
        },
        form: {
          value: 'value',
          state: props => props.state ?? null,
          associated,
          disabled,
          reset,
          stateRestore,
        },
      },
      () => document.createElement('input'),
    )

    const el = document.createElement(tag) as HTMLElement & {
      value?: string
      formAssociatedCallback(form: HTMLFormElement | null): void
      formDisabledCallback(disabled: boolean): void
      formResetCallback(): void
      formStateRestoreCallback(
        state: File | FormData | string | null,
        mode: 'restore' | 'autocomplete',
      ): void
    }
    document.body.appendChild(el)

    await nextFrame()

    expect(setFormValue).toHaveBeenLastCalledWith('', 'initial')

    el.value = 'next'
    await nextFrame()

    expect(setFormValue).toHaveBeenLastCalledWith('next', 'initial')

    const form = document.createElement('form')
    el.formAssociatedCallback(form)
    el.formDisabledCallback(true)
    el.formResetCallback()
    el.formStateRestoreCallback('restored', 'restore')

    expect(associated).toHaveBeenCalledWith(
      form,
      expect.any(Object),
      expect.objectContaining({ host: el, internals }),
    )
    expect(disabled).toHaveBeenCalledWith(
      true,
      expect.any(Object),
      expect.objectContaining({ host: el, internals }),
    )
    expect(reset).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ host: el, internals }),
    )
    expect(stateRestore).toHaveBeenCalledWith(
      'restored',
      'restore',
      expect.any(Object),
      expect.objectContaining({ host: el, internals }),
    )
  })

  it('supports custom prop serialization and deserialization', async () => {
    const tag = createTag('prop-serialization')

    defineElement<{ items?: string[] }>(
      tag,
      {
        shadow: false,
        props: {
          items: {
            type: Array,
            attr: 'items',
            reflect: true,
            default: () => [],
            serialize: value => (value?.length ? value.join('|') : null),
            deserialize: value => (value ? value.split('|') : []),
          },
        },
      },
      props => {
        const el = document.createElement('span')
        el.textContent = props.items?.join(',') ?? ''
        return el
      },
    )

    const el = document.createElement(tag) as HTMLElement & {
      items?: string[]
    }
    el.setAttribute('items', 'a|b')
    document.body.appendChild(el)

    await nextFrame()

    expect(el.items).toEqual(['a', 'b'])
    expect(el.textContent).toBe('a,b')

    el.items = ['c', 'd']

    await nextFrame()

    expect(el.getAttribute('items')).toBe('c|d')

    el.items = []

    await nextFrame()

    expect(el.hasAttribute('items')).toBe(false)
  })

  it('applies custom serialization when mounted through a lazy proxy', async () => {
    const tag = createTag('lazy-prop-serialization')
    let capturedProps: Readonly<{ items?: string[] }> | undefined
    const ctor = defineElement<{ items?: string[] }>(
      tag,
      {
        shadow: false,
        props: {
          items: {
            type: Array,
            attr: 'items',
            reflect: true,
            default: () => [],
            serialize: value => (value?.length ? value.join('|') : null),
            deserialize: value => (value ? value.split('|') : []),
          },
        },
      },
      props => {
        capturedProps = props
        const el = document.createElement('span')
        el.textContent = props.items?.join(',') ?? ''
        return el
      },
    )
    const host = document.createElement('div')
    host.setAttribute('items', 'a|b')
    const values = new Map<string, unknown>([['items', 'a|b']])

    const attributeProps = new Set(['items'])
    const mounted = mountElementDefinition(ctor, host, values, {
      attributeProps,
    })

    await nextFrame()

    expect(host.textContent).toBe('a,b')
    expect(capturedProps?.items).toEqual(['a', 'b'])

    attributeProps.delete('items')
    mounted.propertyChanged('items', ['a', 'b'], ['c', 'd'])
    await nextFrame()

    expect(host.getAttribute('items')).toBe('c|d')

    attributeProps.add('items')
    host.setAttribute('items', 'e|f')
    mounted.propertyChanged('items', ['c', 'd'], 'e|f')
    await nextFrame()

    expect(capturedProps?.items).toEqual(['e', 'f'])
    expect(host.getAttribute('items')).toBe('e|f')

    attributeProps.add('items')
    host.removeAttribute('items')
    mounted.propertyChanged('items', ['e', 'f'], null)
    await nextFrame()

    expect(capturedProps?.items).toEqual([])
    expect(host.hasAttribute('items')).toBe(false)
  })

  it('supports object and array props through properties', async () => {
    const tag = createTag('object-array')

    defineElement<{
      data?: { name: string }
      list?: string[]
    }>(
      tag,
      {
        shadow: false,
        props: {
          data: {
            type: Object,
            attr: false,
          },
          list: {
            type: Array,
            attr: false,
          },
        },
      },
      props => {
        const el = document.createElement('span')
        el.textContent = `${props.data?.name}:${props.list?.join(',')}`
        return el
      },
    )

    const el = document.createElement(tag) as HTMLElement & {
      data?: { name: string }
      list?: string[]
    }

    el.data = { name: 'zeus' }
    el.list = ['a', 'b']

    document.body.appendChild(el)

    await nextFrame()

    expect(el.textContent).toBe('zeus:a,b')
  })

  it('emits CustomEvent with detail', async () => {
    const tag = createTag('emit')

    defineElement<{ value?: string }>(
      tag,
      {
        shadow: false,
        emits: {
          change: event<{ value: string }>(),
        },
        props: {
          value: {
            type: String,
            default: 'ok',
          },
        },
      },
      (props, { emit }) => {
        const button = document.createElement('button')
        button.textContent = 'click'
        button.addEventListener('click', () => {
          emit.change({
            value: props.value,
          })
        })
        return button
      },
    )

    const onChange = vi.fn()

    const el = document.createElement(tag)
    el.addEventListener('change', onChange)
    document.body.appendChild(el)

    await nextFrame()

    el.querySelector('button')!.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
      }),
    )

    expect(onChange).toHaveBeenCalledTimes(1)

    const dispatchedEvent = onChange.mock.calls[0][0] as CustomEvent<{
      value: string
    }>

    expect(dispatchedEvent.detail).toEqual({
      value: 'ok',
    })
    expect(dispatchedEvent.bubbles).toBe(true)
    expect(dispatchedEvent.composed).toBe(true)
    expect(dispatchedEvent.cancelable).toBe(false)
  })

  it('dispatches declared events and exposes host methods', async () => {
    const tag = createTag('primitive-events')

    defineElement(
      tag,
      {
        shadow: false,
        emits: {
          valueChange: event<{ value: string }>(),
          customChange: event<{ value: string }>('custom-change'),
        },
        props: {
          variant: prop(['primary', 'secondary'], {
            default: 'primary',
          }),
          formatter: Function,
        },
      },
      (props, { emit, expose }) => {
        expose({
          focus() {
            return props.variant
          },
        })

        const button = document.createElement('button')
        button.addEventListener('click', () => {
          emit.valueChange({ value: 'a' })
          emit.customChange({ value: 'b' })
        })
        return button
      },
    )

    const valueChange = vi.fn()
    const customChange = vi.fn()

    const el = document.createElement(tag) as HTMLElement & {
      focus(): string
    }
    el.setAttribute('formatter', 'ignored')
    el.addEventListener('value-change', valueChange)
    el.addEventListener('custom-change', customChange)
    document.body.appendChild(el)

    await nextFrame()

    el.querySelector('button')!.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
      }),
    )

    expect(valueChange).toHaveBeenCalledTimes(1)
    expect(customChange).toHaveBeenCalledTimes(1)
    expect(valueChange.mock.calls[0][0].detail).toEqual({ value: 'a' })
    expect(customChange.mock.calls[0][0].detail).toEqual({ value: 'b' })
    expect(valueChange.mock.calls[0][0].cancelable).toBe(false)
    expect(el.focus()).toBe('primary')
    expect('formatter' in el).toBe(true)
    expect((el as unknown as { formatter?: unknown }).formatter).toBeUndefined()
  })

  it('supports reflected boolean prop shorthand', async () => {
    const tag = createTag('boolean-prop-shorthand')

    defineElement<{ disabled?: boolean }>(
      tag,
      {
        shadow: false,
        props: {
          disabled: prop(Boolean),
        },
      },
      props => {
        const button = document.createElement('button')
        button.textContent = String(props.disabled)
        return button
      },
    )

    const el = document.createElement(tag) as HTMLElement & {
      disabled?: boolean
    }
    document.body.appendChild(el)

    await nextFrame()

    expect(el.disabled).toBe(false)
    expect(el.hasAttribute('disabled')).toBe(false)

    el.disabled = true

    await nextFrame()

    expect(el.hasAttribute('disabled')).toBe(true)
  })

  it('renders into shadow root when shadow is true', async () => {
    const tag = createTag('shadow')

    defineElement(
      tag,
      {
        shadow: true,
      },
      () => {
        const el = document.createElement('span')
        el.textContent = 'shadow content'
        return el
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    expect(el.shadowRoot).toBeTruthy()
    expect(el.shadowRoot!.textContent).toBe('shadow content')
    expect(el.textContent).toBe('')
  })

  it('mounts styles into render target', async () => {
    const tag = createTag('styles')

    defineElement(
      tag,
      {
        shadow: true,
        styles: `
          :host {
            display: block;
          }
        `,
      },
      () => {
        const el = document.createElement('span')
        el.textContent = 'styled'
        return el
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)

    await nextFrame()

    const style = el.shadowRoot!.querySelector('style')

    expect(style).toBeTruthy()
    expect(style!.textContent).toContain('display: block')
  })

  it('does not throw when defineElement is called twice with same tag', () => {
    const tag = createTag('duplicate')

    const setup = () => document.createElement('span')

    expect(() => {
      defineElement(tag, {}, setup)
      defineElement(tag, {}, setup)
    }).not.toThrow()
  })

  it('supports default slot in light DOM mode', async () => {
    const tag = createTag('light-slot')

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        const div = document.createElement('div')
        const slotEl = Slot({})
        insertTracked(div, slotEl)
        return div
      },
    )

    const el = document.createElement(tag)
    el.textContent = 'slot content'

    document.body.appendChild(el)

    await nextFrame()

    expect(el.textContent).toContain('slot content')
  })

  it('reconnects and re-renders after disconnect', async () => {
    const tag = createTag('reconnect')
    let renderCount = 0

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        renderCount++
        const el = document.createElement('span')
        el.textContent = `rendered-${renderCount}`
        return el
      },
    )

    const el = document.createElement(tag)
    document.body.appendChild(el)
    await nextFrame()
    expect(renderCount).toBe(1)
    expect(el.textContent).toBe('rendered-1')

    el.remove()
    await nextFrame()
    document.body.appendChild(el)
    await nextFrame()
    expect(renderCount).toBe(2)
    expect(el.textContent).toBe('rendered-2')
  })

  it('registers observedAttributes from props', async () => {
    const tag = createTag('attrs')

    defineElement(
      tag,
      {
        shadow: false,
        props: {
          userName: String,
          count: Number,
          active: Boolean,
        },
      },
      () => document.createElement('div'),
    )

    const ctor = customElements.get(tag) as CustomElementConstructor & {
      observedAttributes: string[]
    }

    expect(ctor.observedAttributes).toContain('user-name')
    expect(ctor.observedAttributes).toContain('count')
    expect(ctor.observedAttributes).toContain('active')
    expect(ctor.observedAttributes).not.toContain('userName')
  })

  it('allows custom attr name via attr option', async () => {
    const tag = createTag('custom-attr')

    defineElement(
      tag,
      {
        shadow: false,
        props: {
          userName: {
            type: String,
            attr: 'user-name',
          },
        },
      },
      () => document.createElement('div'),
    )

    const ctor = customElements.get(tag) as CustomElementConstructor & {
      observedAttributes: string[]
    }

    expect(ctor.observedAttributes).toContain('user-name')
    expect(ctor.observedAttributes).not.toContain('userName')
  })

  it('skips attribute when attr is false', async () => {
    const tag = createTag('no-attr')

    defineElement(
      tag,
      {
        shadow: false,
        props: {
          data: {
            type: Object,
            attr: false,
          },
        },
      },
      () => document.createElement('div'),
    )

    const ctor = customElements.get(tag) as CustomElementConstructor & {
      observedAttributes: string[]
    }

    expect(ctor.observedAttributes).not.toContain('data')
    expect(ctor.observedAttributes).toHaveLength(0)
  })

  it('defers render until connected', async () => {
    const tag = createTag('defer')
    let connected = false

    defineElement(
      tag,
      {
        shadow: false,
      },
      () => {
        connected = true
        return document.createElement('span')
      },
    )

    const el = document.createElement(tag)
    expect(connected).toBe(false)

    document.body.appendChild(el)

    await nextFrame()
    expect(connected).toBe(true)
  })
})
