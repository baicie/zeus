# @zeus-js/zeus API Snapshot

> This file is generated from the published declaration entry.
> Do not edit manually.
> Run `pnpm api:snapshot` to update.

```ts
export {
  ComputedRef,
  Scope,
  State,
  ValueState,
  WatchHandle,
  WatchOptions,
  batch,
  computed,
  effect,
  nextTick,
  onCleanup,
  scope,
  state,
  untrack,
  watch,
} from '@zeus-js/signal'
import { JSXValue } from '@zeus-js/runtime-dom'
export {
  Component,
  Context,
  ContextBridgeProps,
  ContextProviderProps,
  DefineElementContext,
  DefineElementMeta,
  DefineElementOptions,
  DefineElementSetup,
  For,
  ForProps,
  Host,
  HostProps,
  JSXValue,
  Show,
  ShowProps,
  Slot,
  SlotProps,
  createContext,
  defineElement,
  inject,
  provide,
  render,
  useContext,
} from '@zeus-js/runtime-dom'

export declare const Fragment: unique symbol

export declare function jsx(
  type:
    | string
    | typeof Fragment
    | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue
export declare function jsxs(
  type:
    | string
    | typeof Fragment
    | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue
export declare function jsxDEV(
  type:
    | string
    | typeof Fragment
    | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue
```
