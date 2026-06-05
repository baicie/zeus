// User-facing public API — stable, minimal surface area.
// Do NOT export runtime-dom internal helpers here.

/// <reference path="./jsx.d.ts" />

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
  event,
  prop,
} from '@zeus-js/runtime-dom'

export type {
  JSXValue,
  Component,
  ShowProps,
  ForProps,
  HostProps,
  SlotProps,
  DefineElementOptions,
  DefineElementMeta,
  DefineElementContext,
  DefineElementSetup,
  EmitApi,
  EmitFunction,
  EmitsOptions,
  EventDefinition,
  EventOptions,
  PropDefinition,
  PropDefinitionOptions,
  ValuePropDefinition,
} from '@zeus-js/runtime-dom'

// context — main user-facing APIs
export {
  createContext,
  useContext,
  provide,
  inject,
} from '@zeus-js/runtime-dom'

export type {
  Context,
  ContextProviderProps,
  ContextBridgeProps,
} from '@zeus-js/runtime-dom'

// TS jsx runtime fallback
export { Fragment, jsx, jsxs, jsxDEV } from './jsx-runtime'
