// User-facing public API — stable, minimal surface area.
// Do NOT export runtime-dom internal helpers here.
// Advanced / internal APIs are available from '@zeus-js/zeus/advanced' and '@zeus-js/zeus/internal'.

// reactivity
export {
  state,
  computed,
  effect,
  watch,
  scope,
  batch,
  untrack,
  nextTick,
  onCleanup,
  type State,
  type ValueState,
  type ComputedRef,
  type WatchOptions,
  type WatchHandle,
  type Scope,
} from '@zeus-js/signal'

// runtime
export {
  render,
  Show,
  For,
  Host,
  Slot,
  defineElement,
} from '@zeus-js/runtime-dom'

export type {
  JSXValue,
  Component,
  ShowProps,
  ForProps,
  HostProps,
  SlotProps,
  DefineElementOptions,
  DefineElementContext,
  DefineElementSetup,
} from '@zeus-js/runtime-dom'

// context — main user-facing APIs
export { createContext, provide } from '@zeus-js/runtime-dom'
export { inject } from '@zeus-js/runtime-dom'

export type {
  Context,
  ContextProviderProps,
  ContextBridgeProps,
} from '@zeus-js/runtime-dom'

// TS jsx runtime fallback
export { Fragment, jsx, jsxs, jsxDEV } from './jsx-runtime'
