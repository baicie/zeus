// packages/web-c-runtime/src/lazy-element.ts

import { invokeFormCallback } from './form-callbacks'
import { registerHost, requireHostRef } from './host-ref'
import { initializeComponent, waitForComponentReady } from './lifecycle'
import {
  getObservedAttributes,
  installPropertyAccessors,
  syncAttributeToProperty,
  upgradePreDefinedProperties,
} from './props'

import type { ZeusLazyComponentMeta } from './types'
import type { HostRef, ZeusFormCallback } from './types'

function reportInitializationError(tagName: string, error: unknown): void {
  console.error(`[zeus:web-c] Failed to initialize <${tagName}>.`, error)
}

export function createLazyElementClass(
  meta: ZeusLazyComponentMeta,
): CustomElementConstructor {
  const observedAttributes = getObservedAttributes(meta.props)

  class ZeusLazyElement extends HTMLElement {
    static formAssociated = Boolean(meta.formAssociated)

    static get observedAttributes(): string[] {
      return observedAttributes
    }

    constructor() {
      super()

      const hostRef = registerHost(this, meta)

      upgradePreDefinedProperties(this, hostRef)
    }

    connectedCallback(): void {
      const hostRef = requireHostRef(this)

      hostRef.connected = true

      void initializeComponent(hostRef).catch(error => {
        reportInitializationError(meta.tagName, error)
      })
    }

    disconnectedCallback(): void {
      const hostRef = requireHostRef(this)

      hostRef.connected = false

      if (hostRef.loaded) {
        hostRef.instance?.disconnected?.()
      }
    }

    attributeChangedCallback(
      name: string,
      oldValue: string | null,
      newValue: string | null,
    ): void {
      if (oldValue === newValue) {
        return
      }

      const hostRef = requireHostRef(this)

      syncAttributeToProperty(hostRef, name, oldValue, newValue)
    }

    formAssociatedCallback(form: HTMLFormElement | null): void {
      dispatchFormCallback(requireHostRef(this), {
        type: 'associated',
        form,
      })
    }

    formDisabledCallback(disabled: boolean): void {
      dispatchFormCallback(requireHostRef(this), {
        type: 'disabled',
        disabled,
      })
    }

    formResetCallback(): void {
      dispatchFormCallback(requireHostRef(this), {
        type: 'reset',
      })
    }

    formStateRestoreCallback(
      state: File | FormData | string | null,
      mode: 'restore' | 'autocomplete',
    ): void {
      dispatchFormCallback(requireHostRef(this), {
        type: 'stateRestore',
        state,
        mode,
      })
    }

    componentOnReady(): Promise<HTMLElement> {
      const hostRef = requireHostRef(this)

      if (hostRef.connected && !hostRef.loaded && !hostRef.loading) {
        void initializeComponent(hostRef).catch(error => {
          reportInitializationError(meta.tagName, error)
        })
      }

      return waitForComponentReady(hostRef)
    }
  }

  installPropertyAccessors(
    ZeusLazyElement.prototype as unknown as HTMLElement,
    meta.props,
  )
  installMethodProxies(
    ZeusLazyElement.prototype as unknown as HTMLElement,
    meta.methods,
  )

  return ZeusLazyElement
}

function dispatchFormCallback(
  hostRef: HostRef,
  callback: ZeusFormCallback,
): void {
  if (!hostRef.instance || !hostRef.connected) {
    hostRef.pendingFormCallbacks.push(callback)
    return
  }

  invokeFormCallback(hostRef, callback)
}

function installMethodProxies(
  proto: HTMLElement,
  methods: readonly string[] | undefined,
): void {
  if (!methods) return

  for (const name of methods) {
    if (name in proto) continue

    Object.defineProperty(proto, name, {
      configurable: true,
      value: function (): Promise<unknown> {
        const host = this as HTMLElement
        const args = Array.prototype.slice.call(arguments) as unknown[]
        const hostRef = requireHostRef(host)

        return waitForComponentReady(hostRef).then(readyHost => {
          const method = (readyHost as HTMLElement & Record<string, unknown>)[
            name
          ]

          if (typeof method !== 'function') {
            throw new Error(
              `[zeus:web-c] Method "${name}" is not exposed on <${hostRef.meta.tagName}>.`,
            )
          }

          return method.apply(readyHost, args)
        })
      },
    })
  }
}
