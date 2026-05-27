// User-facing public API — stable, minimal surface area.
// Internal runtime helpers are exported from '@zeus-js/runtime-dom' directly.
export {
  state,
  isValueState,
  type State,
  type ValueState,
} from '@zeus-js/signal'

export { computed } from '@zeus-js/signal'

export {
  effect,
  stop,
  pauseTracking,
  enableTracking,
  resetTracking,
  onEffectCleanup,
  batch,
  untrack,
  getCurrentEffect,
} from '@zeus-js/signal'

export {
  effectScope,
  scope,
  getCurrentScope,
  onScopeDispose,
} from '@zeus-js/signal'

export { watch, onWatcherCleanup, getCurrentWatcher } from '@zeus-js/signal'

export { onCleanup } from '@zeus-js/signal'

export { TrackOpTypes, TriggerOpTypes, ReactiveFlags } from '@zeus-js/signal'

export {
  render,
  Show,
  For,
  Host,
  Slot,
  defineElement,
} from '@zeus-js/runtime-dom'

export type {
  Component,
  ShowProps,
  ForProps,
  DefineElementOptions,
  DefineElementContext,
  DefineElementSetup,
  HostProps,
  SlotProps,
} from '@zeus-js/runtime-dom'

export { Fragment, jsx, jsxs, jsxDEV } from './jsx-runtime'
