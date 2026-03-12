// Core compilation helpers (called by compiler-generated code)
export {
  template,
  insert,
  delegateEvents,
  addEventListener,
  setAttribute,
  setProperty,
  className,
  style,
  spread,
  ref,
  reconcileArray,
  keyed,
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

// Re-export component types
export type { ComponentFunction, App, Plugin } from '@zeus-js/runtime-core'

// createApp for direct-DOM components
export { createApp } from './create-app'
