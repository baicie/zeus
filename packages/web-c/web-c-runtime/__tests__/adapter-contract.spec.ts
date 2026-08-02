import {
  createCustomElementMountLifecycle,
  defineElement,
  insertTracked,
  mountElementDefinition,
  Slot,
} from '@zeus-js/runtime-dom'
import { createEffect, onCleanup } from '@zeus-js/signal'
import { JSDOM } from 'jsdom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { bootstrapLazy } from '../src'

import type {
  HostRef,
  ZeusComponentInstance,
  ZeusComponentModule,
} from '../src'

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
        propertyChanged(name, oldValue, newValue) {
          lifecycle.current()?.propertyChanged(name, oldValue, newValue)
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
