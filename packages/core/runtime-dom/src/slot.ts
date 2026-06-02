// packages/runtime-dom/src/slot.ts

import { getCurrentHostContext } from './hostContext'
import { insert } from './insert'

import type { JSXValue } from './types'

export function createSlot(name?: string, fallback?: () => JSXValue): JSXValue {
  const context = getCurrentHostContext()

  if (!context) {
    return createNativeSlot(name, fallback)
  }

  if (context.mode === 'shadow') {
    return createNativeSlot(name, fallback)
  }

  const assigned = findLightSlotNodes(context.lightChildren, name)

  if (assigned.length > 0) {
    return Array.from(assigned)
  }

  return fallback ? fallback() : null
}

function createNativeSlot(
  name?: string,
  fallback?: () => JSXValue,
): HTMLSlotElement {
  const slot = document.createElement('slot')

  if (name) {
    slot.setAttribute('name', name)
  }

  const fallbackValue = fallback?.()

  if (fallbackValue != null) {
    insert(slot, fallbackValue)
  }

  return slot
}

function findLightSlotNodes(nodes: readonly Node[], name?: string): Node[] {
  if (name) {
    return nodes.filter(node => {
      if (node.nodeType !== Node.ELEMENT_NODE) return false
      return (node as Element).getAttribute('slot') === name
    })
  }

  return nodes.filter(node => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      return !(node as Element).hasAttribute('slot')
    }

    return isMeaningfulTextNode(node)
  })
}

function isMeaningfulTextNode(node: Node): boolean {
  if (node.nodeType !== Node.TEXT_NODE) return false
  return Boolean(node.textContent?.trim())
}
