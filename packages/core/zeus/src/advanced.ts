// Advanced APIs for power users.
// Stable enough for tools and debugging, but not recommended for general app code.

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
  queueJob,
  flushJobs,
  TrackOpTypes,
  TriggerOpTypes,
  ReactiveFlags,
  type ReactiveEffectRunner,
  type ReactiveEffectOptions,
  type Scope,
} from '@zeus-js/signal'
