// User-facing public API — stable, minimal surface area.
// Do NOT export runtime-dom internal helpers here.

/// <reference path="./jsx.d.ts" />

// reactivity
export {
  createSignal,
  createMemo,
  createEffect,
  createRoot,
  batch,
  onCleanup,
  type Accessor,
  type Setter,
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
  ElementModelDefinition,
  EmitApi,
  EmitsOptions,
  EventDefinition,
  EventOptions,
  FormAssociatedOptions,
  FormAssociatedValue,
  FormStateRestoreMode,
  PropDefinition,
  PropDefinitionOptions,
  PropDeserializer,
  PropSerializer,
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
