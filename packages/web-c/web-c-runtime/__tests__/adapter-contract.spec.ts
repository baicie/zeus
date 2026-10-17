import {
  createCustomElementMountLifecycle,
  defineElement,
  getElementDefinition,
  insertTracked,
  mountElementDefinition,
  Slot,
} from '@zeus-js/runtime-dom'
import { createEffect, onCleanup } from '@zeus-js/signal'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { moveNodeBefore } from '../../../core/runtime-dom/src/domMove'
import { bootstrapLazy, resolveHostProperties } from '../src'

import type {
  HostRef,
  ZeusComponentInstance,
  ZeusComponentModule,
} from '../src'
import type { DefineElementContext } from '@zeus-js/runtime-dom'

interface AdapterElement extends HTMLElement {
  label: string
  count: number
  componentOnReady?: () => Promise<HTMLElement>
}

interface LifecycleCounts {
  mounts: number
  cleanups: number
}

let uid = 0

function createTag(kind: string): string {
  uid += 1
  return `z-adapter-${kind}-${uid}`
}

async function nextFrame(): Promise<void> {
  await Promise.resolve()
  await Promise.resolve()
}

function createLazyModule(
  Definition: CustomElementConstructor,
): ZeusComponentModule {
  return {
    createComponent(hostRef: HostRef): ZeusComponentInstance {
      resolveHostProperties(hostRef, getElementDefinition(Definition).propDefs)
      const mountState = {
        attributeProps: hostRef.attributeProps,
        internals: hostRef.internals,
        reflectingAttrs: hostRef.reflectingAttrs,
      }
      const lifecycle = createCustomElementMountLifecycle(() =>
        mountElementDefinition(
          Definition,
          hostRef.host,
          hostRef.values,
          mountState,
        ),
      )

      return {
        connected() {
          lifecycle.connect()
        },
        disconnected() {
          lifecycle.disconnect()
        },
        propertyChanged(change) {
          lifecycle.current()?.propertyChanged(change)
        },
        formAssociated(form) {
          lifecycle.current()?.formAssociated(form)
        },
        formDisabled(disabled) {
          lifecycle.current()?.formDisabled(disabled)
        },
        formReset() {
          lifecycle.current()?.formReset()
        },
        formStateRestore(state, mode) {
          lifecycle.current()?.formStateRestore(state, mode)
        },
      }
    },
  }
}

describe('eager and lazy custom element adapters', () => {
  let dom: JSDOM

  beforeEach(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>')
    vi.stubGlobal('document', dom.window.document)
    vi.stubGlobal('HTMLElement', dom.window.HTMLElement)
    vi.stubGlobal('Node', dom.window.Node)
    vi.stubGlobal('NodeFilter', dom.window.NodeFilter)
    vi.stubGlobal('customElements', dom.window.customElements)
    vi.stubGlobal('CustomEvent', dom.window.CustomEvent)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    dom.window.close()
  })

  it('preserves the same prop and lifecycle contract for one definition', async () => {
    const eagerTag = createTag('eager')
    const lazyTag = createTag('lazy')
    const counts = new WeakMap<HTMLElement, LifecycleCounts>()

    const Definition = defineElement<{ label: string; count: number }>(
      eagerTag,
      {
        shadow: false,
        props: {
          label: {
            type: String,
            default: 'ready',
            reflect: true,
          },
          count: Number,
        },
      },
      (props, { host }) => {
        const current = counts.get(host) ?? { mounts: 0, cleanups: 0 }
        current.mounts += 1
        counts.set(host, current)

        onCleanup(() => {
          current.cleanups += 1
        })

        const output = document.createElement('span')
        createEffect(() => {
          output.textContent = `${String(props.label)}:${props.count}`
        })
        return output
      },
    )

    bootstrapLazy([
      {
        tagName: lazyTag,
        shadow: false,
        props: [
          {
            name: 'label',
            type: 'string',
            reflect: true,
          },
          {
            name: 'count',
            type: 'number',
          },
        ],
        load: async () => createLazyModule(Definition),
      },
    ])

    const eager = document.createElement(eagerTag) as AdapterElement
    const lazy = document.createElement(lazyTag) as AdapterElement

    eager.setAttribute('label', 'initial')
    eager.setAttribute('count', '')
    lazy.setAttribute('label', 'initial')
    lazy.setAttribute('count', '')

    document.body.append(eager, lazy)
    await lazy.componentOnReady?.()
    await nextFrame()

    expect(eager.textContent).toBe('initial:0')
    expect(lazy.textContent).toBe('initial:0')
    expect(
      (
        customElements.get(eagerTag) as typeof HTMLElement & {
          observedAttributes: string[]
        }
      ).observedAttributes,
    ).toEqual(
      (
        customElements.get(lazyTag) as typeof HTMLElement & {
          observedAttributes: string[]
        }
      ).observedAttributes,
    )

    eager.label = false as unknown as string
    lazy.label = false as unknown as string
    eager.count = 2
    lazy.count = 2
    await nextFrame()

    expect(eager.getAttribute('label')).toBe('false')
    expect(lazy.getAttribute('label')).toBe('false')
    expect(eager.textContent).toBe('false:2')
    expect(lazy.textContent).toBe('false:2')

    eager.remove()
    lazy.remove()
    await nextFrame()

    expect(counts.get(eager)).toEqual({ mounts: 1, cleanups: 1 })
    expect(counts.get(lazy)).toEqual({ mounts: 1, cleanups: 1 })

    document.body.append(eager, lazy)
    await lazy.componentOnReady?.()
    await nextFrame()

    expect(eager.textContent).toBe('false:2')
    expect(lazy.textContent).toBe('false:2')
    expect(counts.get(eager)).toEqual({ mounts: 2, cleanups: 1 })
    expect(counts.get(lazy)).toEqual({ mounts: 2, cleanups: 1 })
  })

  it('keeps eager and lazy form callbacks working without ElementInternals', async () => {
    const eagerTag = createTag('form-fallback-eager')
    const lazyTag = createTag('form-fallback-lazy')
    const contexts: Array<DefineElementContext<HTMLElement> | undefined> = []
    const disabled = vi.fn(
      (
        _value: boolean,
        _props: Readonly<{ value?: string }>,
        context: DefineElementContext<HTMLElement>,
      ) => contexts.push(context),
    )
    const reset = vi.fn(
      (
        _props: Readonly<{ value?: string }>,
        context: DefineElementContext<HTMLElement>,
      ) => contexts.push(context),
    )

    Reflect.deleteProperty(dom.window.HTMLElement.prototype, 'attachInternals')

    const Definition = defineElement<{ value?: string }>(
      eagerTag,
      {
        shadow: false,
        formAssociated: true,
        props: { value: { type: String, default: 'initial' } },
        form: { value: 'value', disabled, reset },
      },
      props => props.value ?? '',
    )

    bootstrapLazy([
      {
        tagName: lazyTag,
        shadow: false,
        formAssociated: true,
        props: [{ name: 'value', type: 'string', default: 'initial' }],
        load: async () => createLazyModule(Definition),
      },
    ])

    const eager = document.createElement(eagerTag) as HTMLElement & {
      formDisabledCallback(disabled: boolean): void
      formResetCallback(): void
    }
    const lazy = document.createElement(lazyTag) as AdapterElement & {
      formDisabledCallback(disabled: boolean): void
      formResetCallback(): void
    }

    document.body.append(eager, lazy)
    await lazy.componentOnReady?.()

    expect(eager.textContent).toBe('initial')
    expect(lazy.textContent).toBe('initial')

    eager.formDisabledCallback(true)
    lazy.formDisabledCallback(true)
    eager.formResetCallback()
    lazy.formResetCallback()

    expect(disabled).toHaveBeenCalledTimes(2)
    expect(reset).toHaveBeenCalledTimes(2)
    expect(contexts).toHaveLength(4)
    expect(contexts.every(context => context?.internals === undefined)).toBe(
      true,
    )
    expect(
      contexts.every(
        context => context?.host === eager || context?.host === lazy,
      ),
    ).toBe(true)
  })

  it('uses the last pre-connect attribute or property write in both adapters', async () => {
    const eagerTag = createTag('eager-prop-owner')
    const lazyTag = createTag('lazy-prop-owner')
    const Definition = defineElement<{ value?: string }>(
      eagerTag,
      {
        shadow: false,
        props: {
          value: String,
        },
      },
      props => String(props.value),
    )

    bootstrapLazy([
      {
        tagName: lazyTag,
        shadow: false,
        props: [{ name: 'value', type: 'string' }],
        load: async () => createLazyModule(Definition),
      },
    ])

    const eagerPropertyLast = document.createElement(
      eagerTag,
    ) as HTMLElement & {
      value: string
    }
    const lazyPropertyLast = document.createElement(lazyTag) as HTMLElement & {
      value: string
      componentOnReady(): Promise<HTMLElement>
    }
    eagerPropertyLast.setAttribute('value', 'attribute')
    lazyPropertyLast.setAttribute('value', 'attribute')
    eagerPropertyLast.value = 'property'
    lazyPropertyLast.value = 'property'

    const eagerAttributeLast = document.createElement(
      eagerTag,
    ) as HTMLElement & {
      value: string
    }
    const lazyAttributeLast = document.createElement(lazyTag) as HTMLElement & {
      value: string
      componentOnReady(): Promise<HTMLElement>
    }
    eagerAttributeLast.value = 'property'
    lazyAttributeLast.value = 'property'
    eagerAttributeLast.setAttribute('value', 'attribute')
    lazyAttributeLast.setAttribute('value', 'attribute')

    document.body.append(
      eagerPropertyLast,
      lazyPropertyLast,
      eagerAttributeLast,
      lazyAttributeLast,
    )
    await Promise.all([
      lazyPropertyLast.componentOnReady(),
      lazyAttributeLast.componentOnReady(),
    ])
    await nextFrame()

    expect(eagerPropertyLast.textContent).toBe('property')
    expect(lazyPropertyLast.textContent).toBe('property')
    expect(eagerAttributeLast.textContent).toBe('attribute')
    expect(lazyAttributeLast.textContent).toBe('attribute')
  })

  it('normalizes primitive attributes exactly once after ready', async () => {
    const eagerTag = createTag('primitive-eager')
    const lazyTag = createTag('primitive-lazy')
    const Definition = defineElement<{
      disabled?: boolean
      count?: number
      label?: string
    }>(
      eagerTag,
      { props: { disabled: Boolean, count: Number, label: String } },
      props => {
        const output = document.createElement('span')
        createEffect(() => {
          output.textContent = JSON.stringify([
            props.disabled,
            props.count,
            props.label,
          ])
        })
        return output
      },
    )
    bootstrapLazy([
      {
        tagName: lazyTag,
        props: [
          { name: 'disabled', type: 'boolean' },
          { name: 'count', type: 'number' },
          { name: 'label', type: 'string' },
        ],
        load: async () => createLazyModule(Definition),
      },
    ])
    const eager = document.createElement(eagerTag)
    const lazy = document.createElement(lazyTag) as AdapterElement
    document.body.append(eager, lazy)
    await lazy.componentOnReady?.()
    for (const [name, value] of [
      ['disabled', 'false'],
      ['count', '7'],
      ['label', 'text'],
    ] as const) {
      eager.setAttribute(name, value)
      lazy.setAttribute(name, value)
      expect(lazy.textContent).toBe(eager.textContent)
    }
    expect(lazy.textContent).toBe('[true,7,"text"]')
    for (const name of ['disabled', 'count', 'label']) {
      eager.removeAttribute(name)
      lazy.removeAttribute(name)
      expect(lazy.textContent).toBe(eager.textContent)
    }
  })

  it('decodes each custom attribute once and preserves property identity', async () => {
    const eagerTag = createTag('codec-eager')
    const lazyTag = createTag('codec-lazy')
    const deserialize = vi.fn((value: string | null) =>
      value ? value.split('|') : [],
    )
    const serialize = vi.fn(
      (value: string[] | undefined) => value?.join('|') ?? null,
    )
    const seen = new WeakMap<HTMLElement, Readonly<{ rows?: string[] }>>()
    const Definition = defineElement<{ rows?: string[] }>(
      eagerTag,
      {
        props: {
          rows: {
            type: Array,
            attr: 'rows',
            deserialize,
            serialize,
            reflect: true,
          },
        },
      },
      (props, { host }) => {
        seen.set(host, props)
        return ''
      },
    )
    bootstrapLazy([
      {
        tagName: lazyTag,
        props: [
          {
            name: 'rows',
            type: 'array',
            attrName: 'rows',
            deserialize: true,
            serialize: true,
            reflect: true,
          },
        ],
        load: async () => createLazyModule(Definition),
      },
    ])
    const lazy = document.createElement(lazyTag) as AdapterElement & {
      rows: string[]
    }
    lazy.setAttribute('rows', 'a|b')
    expect(lazy.rows).toBeUndefined()
    document.body.append(lazy)
    await lazy.componentOnReady?.()
    expect(deserialize).toHaveBeenCalledTimes(1)
    lazy.setAttribute('rows', 'c|d')
    expect(deserialize).toHaveBeenCalledTimes(2)
    expect(lazy.rows).toEqual(['c', 'd'])
    expect(seen.get(lazy)?.rows).toBe(lazy.rows)
    serialize.mockClear()
    const rows = ['property']
    lazy.rows = rows
    expect(lazy.rows).toBe(rows)
    expect(seen.get(lazy)?.rows).toBe(rows)
    expect(lazy.getAttribute('rows')).toBe('property')
    expect(serialize).toHaveBeenCalledTimes(1)
    expect(deserialize).toHaveBeenCalledTimes(2)
  })

  it('exposes static defaults before connect and defers per-instance factories until ready', async () => {
    const eagerTag = createTag('defaults-eager')
    const lazyTag = createTag('defaults-lazy')
    const factory = vi.fn(() => [] as string[])
    const Definition = defineElement<{ label?: string; rows?: string[] }>(
      eagerTag,
      {
        props: {
          label: { type: String, default: 'ready' },
          rows: { type: Array, default: factory },
        },
      },
      () => '',
    )
    let completeLoad!: (module: ZeusComponentModule) => void
    const pending = new Promise<ZeusComponentModule>(resolve => {
      completeLoad = resolve
    })
    const beforeDefine = document.createElement(lazyTag) as AdapterElement & {
      rows?: string[]
    }
    document.body.append(beforeDefine)
    expect(beforeDefine.label).toBeUndefined()
    bootstrapLazy([
      {
        tagName: lazyTag,
        props: [
          { name: 'label', type: 'string', default: 'ready' },
          { name: 'rows', type: 'array' },
        ],
        load: () => pending,
      },
    ])
    const detached = document.createElement(lazyTag) as AdapterElement & {
      rows?: string[]
    }
    expect(detached.label).toBe('ready')
    expect(detached.rows).toBeUndefined()
    expect(beforeDefine.label).toBe('ready')
    expect(beforeDefine.rows).toBeUndefined()
    expect(factory).not.toHaveBeenCalled()
    document.body.append(detached)
    const ready = Promise.all([
      beforeDefine.componentOnReady?.(),
      detached.componentOnReady?.(),
    ])
    completeLoad(createLazyModule(Definition))
    await ready
    expect(beforeDefine.rows).toEqual([])
    expect(detached.rows).toEqual([])
    expect(beforeDefine.rows).not.toBe(detached.rows)
    expect(factory).toHaveBeenCalledTimes(2)
    detached.remove()
    document.body.append(detached)
    await detached.componentOnReady?.()
    expect(factory).toHaveBeenCalledTimes(2)
  })

  it('replays pre-upgrade own properties above initial attributes in both adapters', async () => {
    const eagerTag = createTag('upgrade-eager')
    const lazyTag = createTag('upgrade-lazy')
    const eager = document.createElement(eagerTag) as AdapterElement
    const lazy = document.createElement(lazyTag) as AdapterElement
    for (const host of [eager, lazy]) {
      host.setAttribute('count', '3')
      host.count = 8
      document.body.append(host)
    }
    const Definition = defineElement<{ count?: number }>(
      eagerTag,
      { props: { count: Number } },
      props => String(props.count),
    )
    bootstrapLazy([
      {
        tagName: lazyTag,
        props: [{ name: 'count', type: 'number' }],
        load: async () => createLazyModule(Definition),
      },
    ])
    await lazy.componentOnReady?.()
    expect(eager.count).toBe(8)
    expect(lazy.count).toBe(8)
    expect(eager.textContent).toBe('8')
    expect(lazy.textContent).toBe('8')
    eager.setAttribute('count', '9')
    lazy.setAttribute('count', '9')
    expect(eager.count).toBe(9)
    expect(lazy.count).toBe(9)
  })

  it('keeps pre-upgrade reflected object identity through browser upgrade callbacks', async () => {
    const eagerTag = createTag('upgrade-codec-eager')
    const lazyTag = createTag('upgrade-codec-lazy')
    const rows = ['property']
    const eager = document.createElement(eagerTag) as AdapterElement & {
      rows?: string[]
    }
    const lazy = document.createElement(lazyTag) as AdapterElement & {
      rows?: string[]
    }
    for (const host of [eager, lazy]) {
      host.setAttribute('rows', 'attribute')
      host.rows = rows
      document.body.append(host)
    }
    const deserialize = vi.fn((value: string | null) => value?.split('|') ?? [])
    const Definition = defineElement<{ rows?: string[] }>(
      eagerTag,
      {
        props: {
          rows: {
            type: Array,
            attr: 'rows',
            reflect: true,
            deserialize,
            serialize: value => value?.join('|') ?? null,
          },
        },
      },
      () => '',
    )
    bootstrapLazy([
      {
        tagName: lazyTag,
        props: [
          {
            name: 'rows',
            type: 'array',
            attrName: 'rows',
            reflect: true,
            serialize: true,
            deserialize: true,
          },
        ],
        load: async () => createLazyModule(Definition),
      },
    ])
    await lazy.componentOnReady?.()
    expect(eager.rows).toBe(rows)
    expect(lazy.rows).toBe(rows)
    expect(eager.getAttribute('rows')).toBe('property')
    expect(lazy.getAttribute('rows')).toBe('property')
    expect(deserialize).not.toHaveBeenCalled()
  })

  it('does not mount detached pending hosts and mounts once on rapid reconnect', async () => {
    const eagerTag = createTag('race-definition')
    const lazyTag = createTag('race-lazy')
    const setup = vi.fn(() => '')
    const cleanup = vi.fn()
    const Definition = defineElement(eagerTag, {}, () => {
      onCleanup(cleanup)
      return setup()
    })
    let completeLoad!: (module: ZeusComponentModule) => void
    const pending = new Promise<ZeusComponentModule>(resolve => {
      completeLoad = resolve
    })
    const load = vi.fn(() => pending)
    bootstrapLazy([{ tagName: lazyTag, props: [], load }])
    const lazy = document.createElement(lazyTag) as AdapterElement
    document.body.append(lazy)
    const ready = lazy.componentOnReady?.()
    lazy.remove()
    await expect(ready).rejects.toThrow('[ZEUS_WC_DISCONNECTED_BEFORE_READY]')
    completeLoad(createLazyModule(Definition))
    await nextFrame()
    await nextFrame()
    expect(setup).not.toHaveBeenCalled()
    document.body.append(lazy)
    lazy.remove()
    document.body.append(lazy)
    await lazy.componentOnReady?.()
    expect(setup).toHaveBeenCalledTimes(1)
    expect(load).toHaveBeenCalledTimes(1)
    lazy.remove()
    expect(cleanup).toHaveBeenCalledTimes(1)
    document.body.append(lazy)
    await lazy.componentOnReady?.()
    expect(setup).toHaveBeenCalledTimes(2)
  })

  it('matches a seeded last-explicit-write model across eager and lazy hosts', async () => {
    const eagerTag = createTag('model-eager')
    const lazyTag = createTag('model-lazy')
    const Definition = defineElement<{ count?: number; disabled?: boolean }>(
      eagerTag,
      {
        props: {
          count: { type: Number, reflect: true },
          disabled: { type: Boolean, reflect: true },
        },
      },
      props => {
        const output = document.createElement('span')
        createEffect(() => {
          output.textContent = JSON.stringify([props.count, props.disabled])
        })
        return output
      },
    )
    bootstrapLazy([
      {
        tagName: lazyTag,
        props: [
          { name: 'count', type: 'number', reflect: true },
          { name: 'disabled', type: 'boolean', reflect: true },
        ],
        load: async () => createLazyModule(Definition),
      },
    ])
    const eager = document.createElement(eagerTag) as AdapterElement & {
      disabled?: boolean
    }
    const lazy = document.createElement(lazyTag) as AdapterElement & {
      disabled?: boolean
    }
    document.body.append(eager, lazy)
    await lazy.componentOnReady?.()
    let seed = 0x5eed
    let count: number | undefined
    let disabled: boolean | undefined
    const random = () => {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0
      return seed
    }
    for (let step = 0; step < 150; step++) {
      const operation = random() % 6
      const value = random() % 12
      switch (operation) {
        case 0:
          count = value
          eager.count = value
          lazy.count = value
          break
        case 1:
          count = value
          eager.setAttribute('count', String(value))
          lazy.setAttribute('count', String(value))
          break
        case 2:
          if (eager.hasAttribute('count')) count = undefined
          eager.removeAttribute('count')
          lazy.removeAttribute('count')
          break
        case 3:
          disabled = Boolean(value % 2)
          eager.disabled = disabled
          lazy.disabled = disabled
          break
        case 4:
          disabled = true
          eager.setAttribute('disabled', 'false')
          lazy.setAttribute('disabled', 'false')
          break
        case 5:
          if (eager.hasAttribute('disabled')) disabled = false
          eager.removeAttribute('disabled')
          lazy.removeAttribute('disabled')
          break
      }
      expect([eager.count, eager.disabled], `eager step ${step}`).toEqual([
        count,
        disabled,
      ])
      expect([lazy.count, lazy.disabled], `lazy step ${step}`).toEqual([
        count,
        disabled,
      ])
      expect(lazy.textContent, `DOM step ${step}`).toBe(
        JSON.stringify([count, disabled]),
      )
      expect(lazy.getAttribute('count')).toBe(eager.getAttribute('count'))
      expect(lazy.getAttribute('disabled')).toBe(eager.getAttribute('disabled'))
    }
  })

  it('preserves both adapters owners while runtime moves existing nodes', async () => {
    const eagerTag = createTag('move-eager')
    const lazyTag = createTag('move-lazy')
    const mounts = vi.fn()
    const cleanup = vi.fn()
    const Definition = defineElement(eagerTag, {}, () => {
      mounts()
      onCleanup(cleanup)
      return ''
    })
    bootstrapLazy([
      {
        tagName: lazyTag,
        props: [],
        load: async () => createLazyModule(Definition),
      },
    ])
    const eager = document.createElement(eagerTag)
    const lazy = document.createElement(lazyTag) as AdapterElement
    const other = document.createElement('section')
    document.body.append(eager, lazy, other)
    await lazy.componentOnReady?.()
    moveNodeBefore(other, eager, null)
    moveNodeBefore(other, lazy, null)
    expect(mounts).toHaveBeenCalledTimes(2)
    expect(cleanup).not.toHaveBeenCalled()
    eager.remove()
    lazy.remove()
    expect(cleanup).toHaveBeenCalledTimes(2)
  })

  it('projects dynamic light DOM through both adapters', async () => {
    const eagerTag = createTag('eager-slot')
    const lazyTag = createTag('lazy-slot')
    const Definition = defineElement(eagerTag, { shadow: false }, () => {
      const main = document.createElement('main')
      insertTracked(main, Slot({}))
      return main
    })

    bootstrapLazy([
      {
        tagName: lazyTag,
        shadow: false,
        props: [],
        load: async () => createLazyModule(Definition),
      },
    ])

    const eager = document.createElement(eagerTag) as AdapterElement
    const lazy = document.createElement(lazyTag) as AdapterElement
    const eagerFirst = document.createElement('span')
    const lazyFirst = document.createElement('span')
    eagerFirst.textContent = 'first'
    lazyFirst.textContent = 'first'
    eager.appendChild(eagerFirst)
    lazy.appendChild(lazyFirst)

    document.body.append(eager, lazy)
    await lazy.componentOnReady?.()
    await nextFrame()

    const eagerSecond = document.createElement('span')
    const lazySecond = document.createElement('span')
    eagerSecond.textContent = 'second'
    lazySecond.textContent = 'second'
    eager.appendChild(eagerSecond)
    lazy.appendChild(lazySecond)
    await nextFrame()

    expect(Array.from(eager.querySelectorAll('main span'))).toEqual([
      eagerFirst,
      eagerSecond,
    ])
    expect(Array.from(lazy.querySelectorAll('main span'))).toEqual([
      lazyFirst,
      lazySecond,
    ])
  })
})
