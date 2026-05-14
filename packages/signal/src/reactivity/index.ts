export {
  reactive,
  shallowReactive,
  readonly,
  shallowReadonly,
  isReactive,
  isReadonly,
  isShallow,
  isProxy,
  toRaw,
  markRaw,
} from './reactive'

export {
  ReactiveFlags,
  TrackOpTypes,
  TriggerOpTypes,
  ITERATE_KEY,
  MAP_KEY_ITERATE_KEY,
} from './constants'
export type { DeepReactive, DeepReadonly, ShallowReactive, Raw } from './types'
