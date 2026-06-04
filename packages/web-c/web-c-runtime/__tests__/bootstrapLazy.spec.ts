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

  it('calls attributeChanged when attribute changes', async () => {
    let instance: ZeusComponentInstance

    const load = vi.fn().mockResolvedValue({
      createComponent() {
        instance = {
          connected() {},
          attributeChanged: vi.fn(),
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

    expect(instance!.attributeChanged).toHaveBeenCalledWith('size', null, 'lg')
  })

  it('queues attribute changes before loaded', async () => {
    let receivedValue: unknown = undefined

    const load = vi.fn().mockResolvedValue({
      createComponent(hostRef: HostRef) {
        return {
          connected() {},
          attributeChanged(name: string) {
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
})
