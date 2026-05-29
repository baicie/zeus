// packages/runtime-dom/src/webComponents.ts

import { createSlot } from './slot'

import type { JSXValue } from './types'

export interface HostProps {
  children?: JSXValue | (() => JSXValue)
}

export interface SlotProps {
  name?: string
  children?: JSXValue | (() => JSXValue)
}

export function Host(props: HostProps): JSXValue {
  return resolveValue(props.children)
}

export function Slot(props: SlotProps): JSXValue {
  return createSlot(props.name, () => resolveValue(props.children))
}

function resolveValue(
  value: JSXValue | (() => JSXValue) | undefined,
): JSXValue {
  return typeof value === 'function' ? value() : value
}
