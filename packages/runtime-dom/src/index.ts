// Core compilation helpers (called by compiler-generated code)
export {
  template,
  insert,
  delegateEvents,
  addEventListener,
  setAttribute,
  setProperty,
  setStyleProperty,
  className,
  style,
  spread,
  ref,
  reconcileArray,
  keyed,
  renderList, // renderList is the compiler-preferred name
  createComponent,
  memo,
  use,
} from './client'

// Low-level DOM utilities
export * from './dom'
export * from './events'
export * from './directives'

// Built-in components
export * from './components'

// SolidJS-style DOM types and JSX support
export * from './jsx'
export * from './h'

// Re-export everything from runtime-core (including slots)
export * from '@zeus-js/runtime-core'

// Re-export signal functions needed by compiled code (except effect, which we override)
export {
  signal,
  computed,
  isSignal,
  isComputed,
  isEffect,
  effect,
} from '@zeus-js/signal'

// Re-export component types
export type { ComponentFunction, App, Plugin } from '@zeus-js/runtime-core'

// createApp for direct-DOM components
export { createApp } from './create-app'
