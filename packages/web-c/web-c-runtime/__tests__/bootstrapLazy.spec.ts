// packages/web-c/web-c-runtime/__tests__/bootstrapLazy.spec.ts

import { beforeEach, describe, expect, it, vi } from 'vitest'

import { bootstrapLazy } from '../src/bootstrapLazy'

import type { HostRef, ZeusComponentInstance } from '../src/types'

interface ZeusLazyElement extends HTMLElement {
  componentOnReady(): Promise<HTMLElement>
}

function clearCustomElements(): void {
  ;(customElements as CustomElementRegistry & { clear(): void }).clear()
}

describe('bootstrapLazy', () => {
  beforeEach(() => {
    clearCustomElements()
  })

  it('defines lazy proxy elements without loading entries', () => {
    const load = vi.fn()

    bootstrapLazy([
      {
        tagName: 'zw-test',
        shadow: true,
        load,
        props: [],
      },
    ])

    expect(customElements.get('zw-test')).toBeTruthy()
    expect(load).not.toHaveBeenCalled()
  })

  it('skips already defined tags', () => {
    const load = vi.fn()

    bootstrapLazy([
      {
        tagName: 'zw-skip',
        shadow: true,
        load,
        props: [],
      },
    ])

    bootstrapLazy([
      {
        tagName: 'zw-skip',
        shadow: true,
        load,
        props: [],
      },
    ])

    expect(customElements.get('zw-skip')).toBeTruthy()
    expect(load).not.toHaveBeenCalled()
  })

  it('does not throw when customElements is unavailable and no registry is passed', () => {
    const original = globalThis.customElements

    try {
      Reflect.deleteProperty(globalThis, 'customElements')

      expect(() => {
        bootstrapLazy([
          {
            tagName: 'zw-ssr-test',
            shadow: true,
            load: vi.fn(),
            props: [],
          },
        ])
      }).not.toThrow()
    } finally {
      Object.defineProperty(globalThis, 'customElements', {
        value: original,
        configurable: true,
        writable: true,
      })
    }
  })
})

describe('lazy element lifecycle', () => {
  beforeEach(() => {
    clearCustomElements()
  })

  it('loads component module when connected', async () => {
    const load = vi.fn().mockResolvedValue({
      createComponent() {
        return {
          connected: vi.fn(),
          render: vi.fn(),
        }
      },
    })

    bootstrapLazy([
      {
        tagName: 'zw-lazy-load-test',
        shadow: true,
        load,
        props: [],
      },
    ])

    const el = document.createElement('zw-lazy-load-test')
    document.body.appendChild(el)

    await Promise.resolve()
    await Promise.resolve()

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('dedupes component module loading', async () => {
    const load = vi.fn().mockResolvedValue({
      createComponent() {
        return {
          render() {
            return document.createTextNode('ok')
          },
        }
      },
    })

    bootstrapLazy([
      {
        tagName: 'zw-dedupe-test',
        shadow: false,
        load,
        props: [],
      },
    ])

    document.body.appendChild(document.createElement('zw-dedupe-test'))
    document.body.appendChild(document.createElement('zw-dedupe-test'))

    await Promise.resolve()
    await Promise.resolve()

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('preserves properties assigned before module is loaded', async () => {
    let receivedValue: unknown

    const load = vi.fn().mockResolvedValue({
      createComponent(hostRef: HostRef) {
        return {
          connected() {
            receivedValue = (
              hostRef.host as unknown as Record<string, unknown>
            )['columns']
          },
        }
      },
    })

    bootstrapLazy([
      {
        tagName: 'zw-table-test',
        shadow: false,
        load,
        props: [
          {
            name: 'columns',
            type: 'array',
          },
        ],
      },
    ])

    const el = document.createElement('zw-table-test') as ZeusLazyElement & {
      columns: Array<{ key: string }>
    }
    el.columns = [{ key: 'name' }]

    document.body.appendChild(el)

    await (el as ZeusLazyElement).componentOnReady()

    expect(receivedValue).toEqual([{ key: 'name' }])
  })

  it('upgrades properties written before defineCustomElements is called', async () => {
    let receivedValue: unknown

    bootstrapLazy([
      {
        tagName: 'zw-pre-upgrade-table',
        shadow: false,
        load: vi.fn().mockResolvedValue({
          createComponent(hostRef: HostRef) {
            return {
              connected() {
                receivedValue = (
                  hostRef.host as unknown as Record<string, unknown>
                )['columns']
              },
            }
          },
        }),
        props: [
          {
            name: 'columns',
            type: 'array',
          },
        ],
      },
    ])

    const el = document.createElement(
      'zw-pre-upgrade-table',
    ) as ZeusLazyElement & {
      columns: Array<{ key: string }>
    }

    el.columns = [{ key: 'name' }]

    document.body.appendChild(el)

    await (el as ZeusLazyElement).componentOnReady()

    expect(receivedValue).toEqual([{ key: 'name' }])
  })

  it('disconnects component when element is removed', async () => {
    let instance: ZeusComponentInstance

    const load = vi.fn().mockResolvedValue({
      createComponent() {
        instance = {
          connected: vi.fn(),
          disconnected: vi.fn(),
          render: vi.fn(),
        }
        return instance
      },
    })

    bootstrapLazy([
      {
        tagName: 'zw-disconnect-test',
        shadow: false,
        load,
        props: [],
      },
    ])

    const el = document.createElement('zw-disconnect-test')
    document.body.appendChild(el)

    await (el as ZeusLazyElement).componentOnReady()

    expect(instance!.connected).toHaveBeenCalledTimes(1)
    expect(instance!.disconnected).not.toHaveBeenCalled()

    document.body.removeChild(el)

    expect(instance!.disconnected).toHaveBeenCalledTimes(1)
  })

  it('renders component output into shadow root', async () => {
    let instance: ZeusComponentInstance

    const load = vi.fn().mockResolvedValue({
      createComponent(hostRef: HostRef) {
        instance = {
          connected() {},
          render() {
            return 'Hello World'
          },
        }
        return instance
      },
    })

    bootstrapLazy([
      {
        tagName: 'zw-render-test',
        shadow: true,
        load,
        props: [],
      },
    ])

    const el = document.createElement('zw-render-test')
    document.body.appendChild(el)

    await (el as ZeusLazyElement).componentOnReady()

    expect(el.shadowRoot?.textContent).toBe('Hello World')
  })

  it('renders component output into light dom', async () => {
    let instance: ZeusComponentInstance

    const load = vi.fn().mockResolvedValue({
      createComponent(hostRef: HostRef) {
        instance = {
          connected() {},
          render() {
            return document.createTextNode('Light DOM')
          },
        }
        return instance
      },
    })

    bootstrapLazy([
      {
        tagName: 'zw-light-test',
        shadow: false,
        load,
        props: [],
      },
    ])

    const el = document.createElement('zw-light-test')
    document.body.appendChild(el)

    await (el as ZeusLazyElement).componentOnReady()

    expect(el.textContent).toBe('Light DOM')
  })

  it('maps prop attributes to propertyChanged only', async () => {
    let instance: ZeusComponentInstance

    const load = vi.fn().mockResolvedValue({
      createComponent() {
        instance = {
          connected() {},
          attributeChanged: vi.fn(),
          propertyChanged: vi.fn(),
          render: vi.fn(),
        }
        return instance
      },
    })

    bootstrapLazy([
      {
        tagName: 'zw-attr-test',
        shadow: false,
        load,
        props: [
          {
            name: 'size',
            type: 'string',
            reflect: false,
          },
        ],
      },
    ])

    const el = document.createElement('zw-attr-test')
    document.body.appendChild(el)

    await (el as ZeusLazyElement).componentOnReady()

    expect(instance!.attributeChanged).not.toHaveBeenCalled()

    el.setAttribute('size', 'lg')

    expect(instance!.propertyChanged).toHaveBeenCalledWith(
      'size',
      undefined,
      'lg',
    )
    expect(instance!.attributeChanged).not.toHaveBeenCalled()
  })

  it('applies initial attribute values before loaded', async () => {
    let receivedValue: unknown = undefined

    const load = vi.fn().mockResolvedValue({
      createComponent(hostRef: HostRef) {
        return {
          connected() {
            receivedValue = (
              hostRef.host as unknown as Record<string, unknown>
            )['size']
          },
          render: vi.fn(),
        }
      },
    })

    bootstrapLazy([
      {
        tagName: 'zw-queued-attr-test',
        shadow: false,
        load,
        props: [
          {
            name: 'size',
            attrName: 'size',
            type: 'string',
          },
        ],
      },
    ])

    const el = document.createElement('zw-queued-attr-test')
    el.setAttribute('size', 'md')
    document.body.appendChild(el)

    await (el as ZeusLazyElement).componentOnReady()

    expect(receivedValue).toBe('md')
  })

  it('parses object and array attributes from attribute string', async () => {
    let receivedValue: unknown

    const load = vi.fn().mockResolvedValue({
      createComponent(hostRef: HostRef) {
        return {
          connected() {
            receivedValue = hostRef.values.get('items')
          },
          render: vi.fn(),
        }
      },
    })

    bootstrapLazy([
      {
        tagName: 'zw-json-props',
        shadow: false,
        load,
        props: [
          {
            name: 'items',
            type: 'array',
          },
        ],
      },
    ])

    const el = document.createElement('zw-json-props') as ZeusLazyElement & {
      items: Array<{ id: number }>
    }
    el.setAttribute('items', '[{"id":1}]')
    document.body.appendChild(el)

    await (el as ZeusLazyElement).componentOnReady()

    expect(receivedValue).toEqual([{ id: 1 }])
  })

  it('reflects object and array properties back as JSON strings', () => {
    bootstrapLazy([
      {
        tagName: 'zw-reflect-object',
        shadow: false,
        load: vi.fn(),
        props: [
          {
            name: 'config',
            type: 'object',
            reflect: true,
          },
        ],
      },
    ])

    const el = document.createElement('zw-reflect-object') as HTMLElement & {
      config: Record<string, unknown>
    }
    el.config = { theme: 'dark' }

    expect(el.getAttribute('config')).toBe('{"theme":"dark"}')
  })

  it('does not observe property-only props', () => {
    bootstrapLazy([
      {
        tagName: 'zw-prop-only-test',
        shadow: false,
        load: vi.fn(),
        props: [
          {
            name: 'columns',
            attrName: false,
            type: 'array',
          },
        ],
      },
    ])

    const Ctor = customElements.get('zw-prop-only-test') as
      | CustomElementConstructor
      | undefined

    expect(Ctor).toBeTruthy()
    expect(
      (Ctor as CustomElementConstructor & { observedAttributes: string[] })
        .observedAttributes,
    ).toEqual([])
  })
})

describe('componentOnReady', () => {
  beforeEach(() => {
    clearCustomElements()
  })

  it('resolves when component is loaded', async () => {
    const load = vi.fn().mockResolvedValue({
      createComponent() {
        return {
          connected() {},
          render() {},
        }
      },
    })

    bootstrapLazy([
      {
        tagName: 'zw-ready-test',
        shadow: false,
        load,
        props: [],
      },
    ])

    const el = document.createElement('zw-ready-test')
    document.body.appendChild(el)

    const readyEl = await (el as ZeusLazyElement).componentOnReady()

    expect(readyEl).toBe(el)
    expect(load).toHaveBeenCalledTimes(1)
  })

  it('does not resolve componentOnReady before the element is connected', async () => {
    const load = vi.fn().mockResolvedValue({
      createComponent() {
        return {
          connected() {},
        }
      },
    })

    bootstrapLazy([
      {
        tagName: 'zw-ready-before-connect',
        shadow: false,
        load,
        props: [],
      },
    ])

    const el = document.createElement(
      'zw-ready-before-connect',
    ) as HTMLElement & { componentOnReady(): Promise<HTMLElement> }

    let resolved = false

    void el.componentOnReady().then(() => {
      resolved = true
    })

    await Promise.resolve()

    expect(resolved).toBe(false)

    document.body.appendChild(el)

    await el.componentOnReady()

    expect(resolved).toBe(true)
  })

  it('reports initialization errors to console.error', async () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {})

    const load = vi.fn().mockRejectedValue(new Error('module failed'))

    bootstrapLazy([
      {
        tagName: 'zw-init-error',
        shadow: false,
        load,
        props: [],
      },
    ])

    const el = document.createElement('zw-init-error')
    document.body.appendChild(el)

    await Promise.resolve()

    await new Promise(resolve => setTimeout(resolve, 50))

    expect(consoleError).toHaveBeenCalledWith(
      '[zeus:web-c] Failed to initialize <zw-init-error>.',
      expect.any(Error),
    )

    consoleError.mockRestore()
  })
})
