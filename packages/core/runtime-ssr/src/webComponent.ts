import { ssrElement } from './element'
import { createSSRFragment } from './serialize'

import type {
  SSRAttributeEntry,
  SSRCustomElementOptions,
  SSRFragment,
  SSRNode,
  SSRShadowRootOptions,
} from './types'

const HYDRATION_MARKER_PREFIX = 'zeus:hydrate:'

/** Emits a stable, comment-only marker consumed by the opt-in DOM hydrator. */
export function ssrHydrationMarker(id: string): SSRFragment {
  if (!/^[A-Za-z0-9._:-]+$/.test(id)) {
    throw new TypeError(`Invalid hydration marker id: ${JSON.stringify(id)}.`)
  }
  return createSSRFragment(`<!--${HYDRATION_MARKER_PREFIX}${id}-->`)
}

/**
 * Serializes a custom-element host and, when requested, a Declarative Shadow
 * DOM template. The runtime never registers a custom element during SSR.
 */
export function ssrCustomElement(
  tag: string,
  options: SSRCustomElementOptions = {},
): SSRFragment {
  const attributes: readonly SSRAttributeEntry[] = options.attributes ?? []
  const children: SSRNode[] = []

  if (options.shadowRoot !== undefined) {
    const shadowOptions = options.shadowRootOptions ?? { mode: 'open' }
    children.push(shadowRootTemplate(options.shadowRoot, shadowOptions))
  }

  if (options.children !== undefined) children.push(options.children)
  return ssrElement(tag, attributes, children)
}

function shadowRootTemplate(
  content: SSRNode,
  options: SSRShadowRootOptions,
): SSRFragment {
  const attributes: SSRAttributeEntry[] = [
    { name: 'shadowrootmode', value: options.mode },
  ]
  if (options.delegatesFocus) {
    attributes.push({ name: 'shadowrootdelegatesfocus', value: true })
  }
  if (options.serializable) {
    attributes.push({ name: 'shadowrootserializable', value: true })
  }
  return ssrElement('template', attributes, content)
}
