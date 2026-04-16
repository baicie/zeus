// Public type exports for Zeus

import type { Accessor, Setter, Signal, CleanupFn, Owner } from '@zeusjs/core'

// Re-export from core
export { type Accessor, type Setter, type Signal, type CleanupFn, type Owner }

// Reactive types
export interface Memo<T> {
  (): T
}

export interface Effect {
  dispose: () => void
}

// DOM types
export type DOMNode = Node | Element | Text | Comment | HTMLElement

// Component types
export interface Component<P = {}> {
  (props: P): Node
}

export interface ComponentFactory<P = {}> {
  (props: P): Node
}

// Web Component types
export interface CustomElementOptions {
  shadow?: boolean | 'open' | 'closed'
  delegatesFocus?: boolean
  props?: Record<string, PropType>
}

export type PropType = StringConstructor | NumberConstructor | BooleanConstructor

// Render types
export interface RenderOptions {
  container?: Element | string
}

// Slot types
export interface SlotProps {
  name?: string
}

// Show types
export interface ShowProps {
  when: unknown
  fallback?: Node
  children: Node | ((item: unknown) => Node)
}

// For types
export interface ForProps<T> {
  each: readonly T[] | Accessor<readonly T[]>
  children: (item: T, index: Accessor<number>) => Node
  fallback?: Node
}

// Event types
export type EventHandler<T = Event> = (event: T) => void

export interface EventTarget {
  addEventListener(type: string, handler: EventHandler): void
  removeEventListener(type: string, handler: EventHandler): void
}
