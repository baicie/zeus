export const ReactiveFlags = {
  SKIP: '__v_skip',
  IS_REACTIVE: '__v_isReactive',
  IS_READONLY: '__v_isReadonly',
  IS_SHALLOW: '__v_isShallow',
  RAW: '__v_raw',
} as const

export type ReactiveFlags = (typeof ReactiveFlags)[keyof typeof ReactiveFlags]

export const ITERATE_KEY = Symbol('iterate')
export const MAP_KEY_ITERATE_KEY = Symbol('Map key iterate')

export const TrackOpTypes = {
  GET: 'get',
  HAS: 'has',
  ITERATE: 'iterate',
} as const

export type TrackOpTypes = (typeof TrackOpTypes)[keyof typeof TrackOpTypes]

export const TriggerOpTypes = {
  SET: 'set',
  ADD: 'add',
  DELETE: 'delete',
  CLEAR: 'clear',
} as const

export type TriggerOpTypes =
  (typeof TriggerOpTypes)[keyof typeof TriggerOpTypes]
