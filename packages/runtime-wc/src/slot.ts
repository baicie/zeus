import { createEffect, onCleanup } from '@zeusjs/core'

export interface SlotOptions {
  name?: string
}

export interface SlotMarker {
  name: string | null
  anchor: Comment
}

export function createSlotMarker(name: string | null): Comment {
  const marker = document.createComment(name ? `slot:${name}` : 'slot')
  return marker
}

export function collectSlotMarkers(host: HTMLElement): Map<string | null, Comment> {
  const markers = new Map<string | null, Comment>()
  const walker = document.createTreeWalker(
    host.shadowRoot || host,
    NodeFilter.SHOW_COMMENT,
  )

  let node: Comment | null
  while ((node = walker.nextNode() as Comment | null)) {
    const text = node.textContent || ''
    if (text.startsWith('slot:')) {
      const name = text.slice(5) || null
      markers.set(name, node)
    }
  }

  return markers
}
