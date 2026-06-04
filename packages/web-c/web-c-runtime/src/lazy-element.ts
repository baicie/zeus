// packages/web-c-runtime/src/lazy-element.ts

import { registerHost, requireHostRef } from './host-ref'
import { initializeComponent } from './lifecycle'
import {
  getObservedAttributes,
  installPropertyAccessors,
  syncAttributeToProperty,
} from './props'

import type { ZeusLazyComponentMeta } from './types'

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
      registerHost(this, meta)
    }

    connectedCallback(): void {
      const hostRef = requireHostRef(this)

      hostRef.connected = true

      void initializeComponent(hostRef)
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

      const ready = hostRef.loaded
        ? Promise.resolve()
        : initializeComponent(hostRef)

      return ready.then(() => this)
    }
  }

  installPropertyAccessors(
    ZeusLazyElement.prototype as unknown as HTMLElement,
    meta.props,
  )

  return ZeusLazyElement
}
