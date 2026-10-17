// packages/runtime-dom/src/webComponents.ts

import { getCurrentHostContext } from './hostContext'
import { createSlot } from './slot'
import { bindSpread } from './spread'

import type {
  AttrValue,
  ClassValue,
  JSXValue,
  RefTarget,
  StyleValue,
} from './types'

export interface HostProps extends Record<string, unknown> {
  children?: JSXValue

  /**
   * Ref to current custom element host.
   */
  ref?: RefTarget<HTMLElement>

  /**
   * class and className both map to host class attribute.
   */
  class?: ClassValue
  className?: ClassValue

  /**
   * Inline style for host element.
   */
  style?: StyleValue

  /**
   * Common host attributes.
   */
  id?: AttrValue
  role?: AttrValue
  part?: AttrValue
  title?: AttrValue
  slot?: AttrValue
  tabIndex?: number | null | undefined | false

  /**
   * data-* / aria-* are accepted through index signature.
   */
}

export interface SlotProps {
  name?: string
  children?: JSXValue
}

/** Runtime bridge used only by the compiler's Host boundary. */
export function Host(props: HostProps): JSXValue {
  const context = getCurrentHostContext()
  if (context) {
    bindSpread(context.host, [
      () => {
        const attributes: Record<string, unknown> = Object.create(null)
        for (const key of Object.keys(props)) {
          if (key !== 'children') attributes[key] = props[key]
        }
        return attributes
      },
    ])
  }
  return props.children
}

export function Slot(props: SlotProps): JSXValue {
  return createSlot(props.name, () => props.children)
}
