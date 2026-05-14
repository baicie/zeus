export {
  signal,
  computed,
  effect,
  effectScope,
  trigger,
  batch,
  startBatch,
  endBatch,
  getActiveSub,
  setActiveSub,
  getBatchDepth,
  isSignal,
  isComputed,
  isEffect,
  isEffectScope,
  ReactiveFlags as AlienReactiveFlags,
  type ReactiveNode,
} from './system'

export * from './reactivity'
