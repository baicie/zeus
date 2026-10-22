import {
  createCustomElementMountLifecycle,
  createContext,
  defineElement,
  getElementDefinition,
  insertTracked,
  mountElementDefinition,
  provideDOMContext,
  resolveDOMContext,
  Slot,
} from '@zeus-js/runtime-dom'
import { createEffect, onCleanup } from '@zeus-js/signal'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { moveNodeBefore } from '../../../core/runtime-dom/src/domMove'
import { bootstrapLazy, resolveHostProperties } from '../src'
import { requireHostRef } from '../src/host-ref'

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

  it.each([false, true])(
    'initializes ancestors before children across shadow=%s',
    async shadow => {
      const parentTag = createTag('parent')
      const childTag = createTag('child')
      let releaseParent!: (module: ZeusComponentModule) => void
      const parentModule = new Promise<ZeusComponentModule>(resolve => {
        releaseParent = resolve
      })
      const initialized: string[] = []
      bootstrapLazy([
        { tagName: parentTag, props: [], load: () => parentModule },
        {
          tagName: childTag,
          props: [],
          load: async () => ({
            createComponent() {
              initialized.push('child')
              return {}
            },
          }),
        },
      ])
      const parent = document.createElement(parentTag) as AdapterElement
      const child = document.createElement(childTag) as AdapterElement
      const root = shadow ? parent.attachShadow({ mode: 'open' }) : parent
      root.append(child)
      document.body.append(parent)
      await nextFrame()
      expect(initialized).toEqual([])

      releaseParent({
        createComponent() {
          initialized.push('parent')
          return {}
        },
      })
      await Promise.all([
        parent.componentOnReady?.(),
        child.componentOnReady?.(),
      ])
      expect(initialized).toEqual(['parent', 'child'])
    },
  )

  it.each([false, true])(
    'stops waiting for the old ancestor when moved to new-parent=%s',
    async useNewParent => {
      const parentTag = createTag('pending-parent')
      const nextParentTag = createTag('next-parent')
      const childTag = createTag('moving-child')
      let releaseParent!: (module: ZeusComponentModule) => void
      let releaseNextParent!: (module: ZeusComponentModule) => void
      const parentModule = new Promise<ZeusComponentModule>(resolve => {
        releaseParent = resolve
      })
      const nextParentModule = new Promise<ZeusComponentModule>(resolve => {
        releaseNextParent = resolve
      })
      const initialized: string[] = []
      const moduleFor = (name: string): ZeusComponentModule => ({
        createComponent() {
          initialized.push(name)
          return {}
        },
      })
      bootstrapLazy([
        { tagName: parentTag, props: [], load: () => parentModule },
        { tagName: nextParentTag, props: [], load: () => nextParentModule },
        {
          tagName: childTag,
          props: [],
          load: async () => moduleFor('child'),
        },
      ])
      const parent = document.createElement(parentTag) as AdapterElement
      const nextParent = document.createElement(nextParentTag) as AdapterElement
      const child = document.createElement(childTag) as AdapterElement
      parent.append(child)
      document.body.append(parent)
      await vi.waitFor(() => {
        expect(requireHostRef(parent).readyWaiters).toHaveLength(1)
      })

      try {
        if (useNewParent) document.body.append(nextParent)
        const target = useNewParent ? nextParent : document.body
        target.append(child)
        const ready = child.componentOnReady?.()
        await vi.waitFor(() => {
          expect(requireHostRef(parent).readyWaiters).toHaveLength(0)
          if (useNewParent) {
            expect(requireHostRef(nextParent).readyWaiters).toHaveLength(1)
          }
          expect(initialized).toEqual(useNewParent ? [] : ['child'])
        })
        releaseNextParent(moduleFor('next-parent'))
        await expect(ready).resolves.toBe(child)
        expect(initialized).toEqual(
          useNewParent ? ['next-parent', 'child'] : ['child'],
        )
      } finally {
        releaseParent(moduleFor('old-parent'))
        releaseNextParent(moduleFor('next-parent'))
        await parent.componentOnReady?.()
      }
    },
  )

  it('rejects descendants when their current ancestor fails to initialize', async () => {
    const parentTag = createTag('failed-parent')
    const childTag = createTag('failed-parent-child')
    const failure = new Error('parent chunk failed')
    let rejectParent!: (error: Error) => void
    const parentModule = new Promise<ZeusComponentModule>(
      (_resolve, reject) => {
        rejectParent = reject
      },
    )
    const setupChild = vi.fn(() => ({}))
    const report = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      bootstrapLazy([
        { tagName: parentTag, props: [], load: () => parentModule },
        {
          tagName: childTag,
          props: [],
          load: async () => ({ createComponent: setupChild }),
        },
      ])
      const parent = document.createElement(parentTag)
      const child = document.createElement(childTag) as AdapterElement
      parent.append(child)
      document.body.append(parent)
      await vi.waitFor(() => {
        expect(requireHostRef(parent).readyWaiters).toHaveLength(1)
      })
      const ready = expect(child.componentOnReady?.()).rejects.toBe(failure)
      rejectParent(failure)
      await ready
      expect(setupChild).not.toHaveBeenCalled()
      expect(requireHostRef(parent).readyWaiters).toHaveLength(0)
    } finally {
      report.mockRestore()
    }
  })

  it('retries ancestor readiness after a rapid subtree reconnect', async () => {
    const parentTag = createTag('reconnecting-parent')
    const childTag = createTag('reconnecting-child')
    let releaseParent!: (module: ZeusComponentModule) => void
    const parentModule = new Promise<ZeusComponentModule>(resolve => {
      releaseParent = resolve
    })
    const initialized: string[] = []
    bootstrapLazy([
      { tagName: parentTag, props: [], load: () => parentModule },
      {
        tagName: childTag,
        props: [],
        load: async () => ({
          createComponent() {
            initialized.push('child')
            return {}
          },
        }),
      },
    ])
    const parent = document.createElement(parentTag) as AdapterElement
    const child = document.createElement(childTag) as AdapterElement
    parent.append(child)
    document.body.append(parent)
    await vi.waitFor(() => {
      expect(requireHostRef(parent).readyWaiters).toHaveLength(1)
    })
    const firstReady = expect(child.componentOnReady?.()).rejects.toThrow(
      '[ZEUS_WC_DISCONNECTED_BEFORE_READY]',
    )
    parent.remove()
    document.body.append(parent)
    const ready = child.componentOnReady?.()
    releaseParent({
      createComponent() {
        initialized.push('parent')
        return {}
      },
    })
    await firstReady
    await expect(ready).resolves.toBe(child)
    expect(initialized).toEqual(['parent', 'child'])
  })

  it('waits for a new ancestor before reconnecting an initialized child', async () => {
    const parentTag = createTag('late-parent')
    const childTag = createTag('loaded-child')
    let releaseParent!: (module: ZeusComponentModule) => void
    const parentModule = new Promise<ZeusComponentModule>(resolve => {
      releaseParent = resolve
    })
    const connections: string[] = []
    bootstrapLazy([
      { tagName: parentTag, props: [], load: () => parentModule },
      {
        tagName: childTag,
        props: [],
        methods: ['refresh'],
        load: async () => ({
          createComponent(hostRef) {
            return {
              connected() {
                connections.push('child')
                hostRef.exposedMethods.refresh = () => 'refreshed'
              },
              disconnected() {
                connections.push('disconnect')
              },
            }
          },
        }),
      },
    ])
    const parent = document.createElement(parentTag) as AdapterElement
    const child = document.createElement(childTag) as AdapterElement & {
      refresh(): Promise<string>
    }
    document.body.append(child)
    await child.componentOnReady?.()
    document.body.append(parent)
    parent.append(child)

    let ready = false
    let refreshed = false
    const reconnectReady = child.componentOnReady?.().then(() => {
      ready = true
      return child.componentOnReady?.()
    })
    const refresh = child.refresh().then(value => {
      refreshed = true
      return value
    })
    await nextFrame()
    expect(connections).toEqual(['child', 'disconnect'])
    expect(ready).toBe(false)
    expect(refreshed).toBe(false)
    releaseParent({
      createComponent() {
        connections.push('parent')
        return {}
      },
    })
    await expect(reconnectReady).resolves.toBe(child)
    await expect(refresh).resolves.toBe('refreshed')
    expect(connections).toEqual(['child', 'disconnect', 'parent', 'child'])

    document.body.append(child)
    expect(connections).toEqual([
      'child',
      'disconnect',
      'parent',
      'child',
      'disconnect',
      'child',
    ])
  })

  it('reconnects a loaded subtree after its new ancestor becomes ready', async () => {
    const ancestorTag = createTag('subtree-ancestor')
    const parentTag = createTag('loaded-parent')
    const childTag = createTag('loaded-subtree-child')
    let releaseAncestor!: (module: ZeusComponentModule) => void
    const ancestorModule = new Promise<ZeusComponentModule>(resolve => {
      releaseAncestor = resolve
    })
    const connected: string[] = []
    const moduleFor = (name: string): ZeusComponentModule => ({
      createComponent() {
        return { connected: () => void connected.push(name) }
      },
    })
    bootstrapLazy([
      { tagName: ancestorTag, props: [], load: () => ancestorModule },
      { tagName: parentTag, props: [], load: async () => moduleFor('parent') },
      { tagName: childTag, props: [], load: async () => moduleFor('child') },
    ])
    const ancestor = document.createElement(ancestorTag)
    const parent = document.createElement(parentTag) as AdapterElement
    const child = document.createElement(childTag) as AdapterElement
    parent.append(child)
    document.body.append(parent)
    await child.componentOnReady?.()
    expect(connected).toEqual(['parent', 'child'])
    connected.length = 0

    document.body.append(ancestor)
    ancestor.append(parent)
    await nextFrame()
    expect(connected).toEqual([])
    const ready = child.componentOnReady?.()
    releaseAncestor(moduleFor('ancestor'))
    await expect(ready).resolves.toBe(child)
    expect(connected).toEqual(['ancestor', 'parent', 'child'])
  })

  it('cancels pending reconnect readiness when an initialized child detaches', async () => {
    const parentTag = createTag('cancel-reconnect-parent')
    const childTag = createTag('cancel-reconnect-child')
    let releaseParent!: (module: ZeusComponentModule) => void
    const parentModule = new Promise<ZeusComponentModule>(resolve => {
      releaseParent = resolve
    })
    const connected = vi.fn()
    bootstrapLazy([
      { tagName: parentTag, props: [], load: () => parentModule },
      {
        tagName: childTag,
        props: [],
        load: async () => ({ createComponent: () => ({ connected }) }),
      },
    ])
    const parent = document.createElement(parentTag) as AdapterElement
    const child = document.createElement(childTag) as AdapterElement
    document.body.append(child)
    await child.componentOnReady?.()
    document.body.append(parent)
    parent.append(child)
    const ready = expect(child.componentOnReady?.()).rejects.toThrow(
      '[ZEUS_WC_DISCONNECTED_BEFORE_READY]',
    )
    child.remove()
    await ready
    expect(requireHostRef(parent).readyWaiters).toHaveLength(0)
    document.body.append(child)
    await expect(child.componentOnReady?.()).resolves.toBe(child)
    expect(connected).toHaveBeenCalledTimes(2)
    releaseParent({ createComponent: () => ({}) })
    await parent.componentOnReady?.()
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

  it('restores descendant DOM context after reconnecting a projected light-DOM subtree', async () => {
    const parentTag = createTag('projected-context-parent')
    const childTag = createTag('projected-context-child')
    const context = createContext<number>()
    let parentMounts = 0
    let childCleanups = 0
    const childMounts: Array<{ connected: boolean; value?: number }> = []
    const Parent = defineElement(
      createTag('projected-context-parent-definition'),
      { shadow: false },
      (_props, { host }) => {
        provideDOMContext(host, context, ++parentMounts)
        return Slot({})
      },
    )
    const Child = defineElement(
      createTag('projected-context-child-definition'),
      { shadow: false },
      (_props, { host }) => {
        const result = resolveDOMContext(host, context)
        childMounts.push({ connected: host.isConnected, value: result.value })
        onCleanup(() => childCleanups++)
        const output = document.createElement('span')
        output.textContent = String(result.value)
        return output
      },
    )
    bootstrapLazy([
      {
        tagName: parentTag,
        shadow: false,
        props: [],
        load: async () => createLazyModule(Parent),
      },
      {
        tagName: childTag,
        shadow: false,
        props: [],
        load: async () => createLazyModule(Child),
      },
    ])
    const parent = document.createElement(parentTag) as AdapterElement
    const child = document.createElement(childTag) as AdapterElement
    parent.append(child)

    for (let mount = 1; mount <= 3; mount++) {
      const ready = child.componentOnReady?.()
      document.body.append(parent)
      await parent.componentOnReady?.()
      await ready
      expect(child.parentElement).toBe(parent)
      expect(child.textContent).toBe(String(mount))
      expect(childMounts).toHaveLength(mount)
      expect(childMounts[mount - 1]).toEqual({ connected: true, value: mount })

      parent.remove()
      await nextFrame()
      expect(childCleanups).toBe(mount)
    }
  })

  it('keeps nested lazy menu items connected while projecting a light-DOM host', async () => {
    const menuTag = createTag('dropdown-menu')
    const itemTag = createTag('dropdown-menu-item')
    const menuDefinitionTag = createTag('dropdown-menu-definition')
    const Menu = defineElement(menuDefinitionTag, { shadow: false }, () => {
      const menu = document.createElement('div')
      menu.setAttribute('data-slot', 'dropdown-menu')
      insertTracked(menu, Slot({}))
      return menu
    })

    let resolveItem!: (module: ZeusComponentModule) => void
    const pendingItemModule = new Promise<ZeusComponentModule>(resolve => {
      resolveItem = resolve
    })
    const itemLoad = vi.fn(() => pendingItemModule)

    bootstrapLazy([
      {
        tagName: menuTag,
        shadow: false,
        props: [],
        load: async () => createLazyModule(Menu),
      },
      {
        tagName: itemTag,
        shadow: false,
        props: [],
        load: itemLoad,
      },
    ])

    const menu = document.createElement(menuTag) as AdapterElement
    const item = document.createElement(itemTag) as AdapterElement
    menu.appendChild(item)
    const itemReady = item.componentOnReady?.()
    document.body.appendChild(menu)

    await menu.componentOnReady?.()
    resolveItem({ createComponent: () => ({ connected() {} }) })

    await expect(itemReady).resolves.toBe(item)
    expect(itemLoad).toHaveBeenCalledTimes(1)
    expect(
      menu.querySelector('[data-slot="dropdown-menu"]')?.firstElementChild,
    ).toBe(item)
  })
})
