// packages/web-c-runtime/src/lazy-element.ts

import { isWithinRuntimeDomMove } from '@zeus-js/runtime-dom'

import { invokeFormCallback } from './form-callbacks'
import { registerHost, requireHostRef } from './host-ref'
import {
  cancelAncestorWait,
  initializeComponent,
  rejectComponentReady,
  waitForComponentReady,
} from './lifecycle'
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
      hostRef.readinessError = undefined

      void initializeComponent(hostRef).catch(error => {
        reportInitializationError(meta.tagName, error)
      })
    }

    disconnectedCallback(): void {
      const hostRef = requireHostRef(this)

      cancelAncestorWait(hostRef)
      if (isWithinRuntimeDomMove(this)) return

      hostRef.connected = false

      if (!hostRef.loaded || hostRef.loading) {
        rejectComponentReady(
          hostRef,
          new Error(
            `[ZEUS_WC_DISCONNECTED_BEFORE_READY] <${meta.tagName}> disconnected before initialization completed.`,
          ),
        )
      }

      if (hostRef.loaded) {
        try {
          hostRef.instance?.disconnected?.()
        } finally {
          for (const name of Object.keys(hostRef.exposedMethods)) {
            delete hostRef.exposedMethods[name]
          }
        }
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
    meta.tagName,
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
  tagName: string,
): void {
  if (!methods) return

  const reservedNames = new Set(Object.getOwnPropertyNames(proto))

  for (const name of methods) {
    if (reservedNames.has(name)) {
      throw new Error(
        `[ZEUS_WC_RESERVED_METHOD] Method "${name}" conflicts with a lazy element lifecycle/API method on <${tagName}>.`,
      )
    }

    Object.defineProperty(proto, name, {
      configurable: true,
      value: function (): Promise<unknown> {
        const host = this as HTMLElement
        const args = Array.prototype.slice.call(arguments) as unknown[]
        const hostRef = requireHostRef(host)

        return waitForComponentReady(hostRef).then(readyHost => {
          if (!hostRef.connected) {
            throw new Error(
              `[ZEUS_WC_DISCONNECTED_BEFORE_READY] <${hostRef.meta.tagName}> is disconnected.`,
            )
          }

          const method = hostRef.exposedMethods[name]

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
