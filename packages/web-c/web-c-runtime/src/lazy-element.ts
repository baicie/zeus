// packages/web-c-runtime/src/lazy-element.ts

import { registerHost, requireHostRef } from './host-ref'
import { initializeComponent, waitForComponentReady } from './lifecycle'
import {
  getObservedAttributes,
  installPropertyAccessors,
  syncAttributeToProperty,
  upgradePreDefinedProperties,
} from './props'

import type { ZeusLazyComponentMeta } from './types'

function reportInitializationError(tagName: string, error: unknown): void {
  console.error(`[zeus:web-c] Failed to initialize <${tagName}>.`, error)
}

export function createLazyElementClass(
  meta: ZeusLazyComponentMeta,
): CustomElementConstructor {
  const observedAttributes = getObservedAttributes(meta.props)

  class ZeusLazyElement extends HTMLElement {
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

  return ZeusLazyElement
}
