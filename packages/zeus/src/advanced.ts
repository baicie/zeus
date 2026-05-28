// Advanced / debug APIs for power users and framework internals.
// Not recommended for general use — stability not guaranteed.

export {
  stop,
  effectScope,
  getCurrentScope,
  onScopeDispose,
  getCurrentEffect,
  onEffectCleanup,
  pauseTracking,
  enableTracking,
  resetTracking,
  getCurrentWatcher,
  onWatcherCleanup,
  isValueState,
  queueJob,
  flushJobs,
  TrackOpTypes,
  TriggerOpTypes,
  ReactiveFlags,
  type ReactiveEffectRunner,
  type ReactiveEffectOptions,
  type EffectScheduler,
  type DebuggerOptions,
  type DebuggerEvent,
  type WatchStopHandle,
  type WatchScheduler,
} from '@zeus-js/signal'
