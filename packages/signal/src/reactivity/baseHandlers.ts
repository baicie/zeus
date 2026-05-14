import {
  hasChanged,
  hasOwn,
  isArray,
  isIntegerKey,
  isObject,
} from '@zeus-js/shared'

import {
  ITERATE_KEY,
  ReactiveFlags,
  TrackOpTypes,
  TriggerOpTypes,
} from './constants'
import { track, trigger } from './dep'
import { reactive, readonly, toRaw } from './reactive'

type HasOwnKey = string | symbol

function hasOwnKey(target: object, key: PropertyKey): boolean {
  return hasOwn(target, key as HasOwnKey)
}

function createGetter(isReadonly = false, shallow = false) {
  return function get(target: object, key: PropertyKey, receiver: object) {
    if (key === ReactiveFlags.IS_REACTIVE) return !isReadonly
    if (key === ReactiveFlags.IS_READONLY) return isReadonly
    if (key === ReactiveFlags.IS_SHALLOW) return shallow
    if (key === ReactiveFlags.RAW) return target

    const res = Reflect.get(target, key, receiver)

    if (!isReadonly) {
      track(target, TrackOpTypes.GET, key)
    }

    if (shallow) {
      return res
    }

    if (isObject(res)) {
      return isReadonly ? readonly(res) : reactive(res)
    }

    return res
  }
}

function createSetter(shallow = false) {
  return function set(
    target: object,
    key: PropertyKey,
    value: unknown,
    receiver: object,
  ) {
    const oldValue = (target as Record<PropertyKey, unknown>)[key]

    const hadKey =
      isArray(target) && isIntegerKey(key)
        ? Number(key) < target.length
        : hasOwnKey(target, key)

    const rawValue = shallow ? value : toRaw(value)
    const result = Reflect.set(target, key, rawValue, receiver)

    if (target === toRaw(receiver)) {
      if (!hadKey) {
        trigger(target, TriggerOpTypes.ADD, key, rawValue)
      } else if (hasChanged(rawValue, oldValue)) {
        trigger(target, TriggerOpTypes.SET, key, rawValue)
      }
    }

    return result
  }
}

function deleteProperty(target: object, key: PropertyKey): boolean {
  const hadKey = hasOwnKey(target, key)
  const result = Reflect.deleteProperty(target, key)

  if (result && hadKey) {
    trigger(target, TriggerOpTypes.DELETE, key)
  }

  return result
}

function has(target: object, key: PropertyKey): boolean {
  const result = Reflect.has(target, key)

  track(target, TrackOpTypes.HAS, key)

  return result
}

function ownKeys(target: object): ArrayLike<string | symbol> {
  track(target, TrackOpTypes.ITERATE, isArray(target) ? 'length' : ITERATE_KEY)

  return Reflect.ownKeys(target)
}

function readonlySet(target: object, key: PropertyKey): boolean {
  if (__DEV__) {
    console.warn(
      `Set operation on key "${String(key)}" failed: target is readonly.`,
      target,
    )
  }

  return true
}

function readonlyDelete(target: object, key: PropertyKey): boolean {
  if (__DEV__) {
    console.warn(
      `Delete operation on key "${String(key)}" failed: target is readonly.`,
      target,
    )
  }

  return true
}

export const mutableHandlers: ProxyHandler<object> = {
  get: createGetter(false, false),
  set: createSetter(false),
  deleteProperty,
  has,
  ownKeys,
}

export const shallowReactiveHandlers: ProxyHandler<object> = {
  get: createGetter(false, true),
  set: createSetter(true),
  deleteProperty,
  has,
  ownKeys,
}

export const readonlyHandlers: ProxyHandler<object> = {
  get: createGetter(true, false),
  set: readonlySet,
  deleteProperty: readonlyDelete,
}

export const shallowReadonlyHandlers: ProxyHandler<object> = {
  get: createGetter(true, true),
  set: readonlySet,
  deleteProperty: readonlyDelete,
}
