import { hasChanged, hasOwn, isMap, isObject } from '@zeus-js/shared'

import {
  ITERATE_KEY,
  MAP_KEY_ITERATE_KEY,
  ReactiveFlags,
  TrackOpTypes,
  TriggerOpTypes,
} from './constants'
import { track, trigger } from './dep'
import { reactive, readonly, toRaw } from './reactive'

type Collection = Map<unknown, unknown> | Set<unknown>
type CollectionProto = Map<unknown, unknown> | Set<unknown>
type ObjectKey = string | symbol

type CollectionForEach = (
  this: Collection,
  callback: (value: unknown, key: unknown, collection: unknown) => void,
  thisArg?: unknown,
) => void

type CollectionMethod = (this: Collection, ...args: unknown[]) => unknown

type CollectionInstrumentation = {
  get?: (this: Map<unknown, unknown>, key: unknown) => unknown
  has?: (this: Collection, key: unknown) => boolean
  forEach?: CollectionForEach
  add?: (this: Set<unknown>, value: unknown) => Collection
  set?: (
    this: Map<unknown, unknown>,
    key: unknown,
    value: unknown,
  ) => Collection
  delete?: (this: Collection, key: unknown) => boolean
  clear?: (this: Collection) => boolean | void
  keys?: CollectionMethod
  values?: CollectionMethod
  entries?: CollectionMethod
  [Symbol.iterator]?: CollectionMethod
}

function hasOwnKey(target: object, key: PropertyKey): boolean {
  return hasOwn(target, key as ObjectKey)
}

function toReactive<T>(value: T): T {
  return isObject(value) ? (reactive(value) as T) : value
}

function toReadonly<T>(value: T): T {
  return isObject(value) ? (readonly(value) as T) : value
}

function toShallow<T>(value: T): T {
  return value
}

function getProto(target: Collection): CollectionProto {
  return Reflect.getPrototypeOf(target) as CollectionProto
}

function createIterableMethod(
  method: 'keys' | 'values' | 'entries' | typeof Symbol.iterator,
  isReadonly: boolean,
  shallow: boolean,
): CollectionMethod {
  return function iterator(this: Collection) {
    const target = toRaw(this) as Collection
    const targetIsMap = isMap(target)
    const isPair =
      method === 'entries' || (method === Symbol.iterator && targetIsMap)
    const isKeyOnly = method === 'keys' && targetIsMap
    const proto = getProto(target)
    const innerIterator = Reflect.get(proto, method, proto).call(
      target,
    ) as IterableIterator<unknown>

    const wrap = shallow ? toShallow : isReadonly ? toReadonly : toReactive

    if (!isReadonly) {
      track(
        target,
        TrackOpTypes.ITERATE,
        isKeyOnly ? MAP_KEY_ITERATE_KEY : ITERATE_KEY,
      )
    }

    return {
      next() {
        const { value, done } = innerIterator.next()

        if (done) {
          return { value, done }
        }

        return {
          value: isPair
            ? [
                wrap((value as [unknown, unknown])[0]),
                wrap((value as [unknown, unknown])[1]),
              ]
            : wrap(value),
          done,
        }
      },

      [Symbol.iterator]() {
        return this
      },
    }
  }
}

function createReadonlyMethod(type: TriggerOpTypes): CollectionMethod {
  return function readonlyMethod(this: Collection, ...args: unknown[]) {
    const key = args[0]

    console.warn(
      `${type} operation${key !== undefined ? ` on key "${String(key)}"` : ''} failed: target is readonly.`,
      toRaw(this),
    )

    return type === TriggerOpTypes.DELETE ? false : this
  }
}

function createInstrumentations(
  isReadonly: boolean,
  shallow: boolean,
): CollectionInstrumentation {
  const wrap = shallow ? toShallow : isReadonly ? toReadonly : toReactive

  const instrumentations: CollectionInstrumentation = {
    get(this: Map<unknown, unknown>, key: unknown) {
      const target = toRaw(this) as Map<unknown, unknown>
      const rawKey = toRaw(key)

      if (!isReadonly) {
        track(target, TrackOpTypes.GET, key as PropertyKey)

        if (rawKey !== key) {
          track(target, TrackOpTypes.GET, rawKey as PropertyKey)
        }
      }

      const proto = getProto(target)
      const has = Reflect.get(proto, 'has', proto) as Map<
        unknown,
        unknown
      >['has']
      const get = Reflect.get(proto, 'get', proto) as Map<
        unknown,
        unknown
      >['get']

      if (has.call(target, key)) {
        return wrap(get.call(target, key))
      }

      if (has.call(target, rawKey)) {
        return wrap(get.call(target, rawKey))
      }

      return undefined
    },

    has(this: Collection, key: unknown) {
      const target = toRaw(this) as Collection
      const rawKey = toRaw(key)

      if (!isReadonly) {
        track(target, TrackOpTypes.HAS, key as PropertyKey)

        if (rawKey !== key) {
          track(target, TrackOpTypes.HAS, rawKey as PropertyKey)
        }
      }

      const proto = getProto(target)
      const has = Reflect.get(proto, 'has', proto) as Collection['has']

      return has.call(target, key) || has.call(target, rawKey)
    },

    forEach(
      this: Collection,
      callback: (value: unknown, key: unknown, collection: unknown) => void,
      thisArg?: unknown,
    ) {
      const target = toRaw(this) as Collection

      if (!isReadonly) {
        track(target, TrackOpTypes.ITERATE, ITERATE_KEY)
      }

      const wrapped = this
      const proto = getProto(target)
      const forEach = Reflect.get(
        proto,
        'forEach',
        proto,
      ) as Collection['forEach']

      return forEach.call(target, (value: unknown, key: unknown) => {
        callback.call(thisArg, wrap(value), wrap(key), wrapped)
      })
    },
  }

  Object.defineProperty(instrumentations, 'size', {
    get(this: Collection) {
      const target = toRaw(this) as Collection

      if (!isReadonly) {
        track(target, TrackOpTypes.ITERATE, ITERATE_KEY)
      }

      return Reflect.get(target, 'size', target) as number
    },
  })

  if (isReadonly) {
    instrumentations.add = createReadonlyMethod(TriggerOpTypes.ADD) as (
      this: Set<unknown>,
      value: unknown,
    ) => Collection

    instrumentations.set = createReadonlyMethod(TriggerOpTypes.SET) as (
      this: Map<unknown, unknown>,
      key: unknown,
      value: unknown,
    ) => Collection

    instrumentations.delete = createReadonlyMethod(TriggerOpTypes.DELETE) as (
      this: Collection,
      key: unknown,
    ) => boolean

    instrumentations.clear = createReadonlyMethod(TriggerOpTypes.CLEAR) as (
      this: Collection,
    ) => boolean | void
  } else {
    instrumentations.add = function add(this: Set<unknown>, value: unknown) {
      const target = toRaw(this) as Set<unknown>
      const rawValue = shallow ? value : toRaw(value)
      const hadKey = target.has(rawValue)

      if (!hadKey) {
        target.add(rawValue)
        trigger(target, TriggerOpTypes.ADD, rawValue as PropertyKey, rawValue)
      }

      return this
    }

    instrumentations.set = function set(
      this: Map<unknown, unknown>,
      key: unknown,
      value: unknown,
    ) {
      const target = toRaw(this) as Map<unknown, unknown>
      const rawKey = toRaw(key)
      const rawValue = shallow ? value : toRaw(value)
      const hadKey = target.has(key) || target.has(rawKey)
      const oldValue = target.get(rawKey)

      target.set(rawKey, rawValue)

      if (!hadKey) {
        trigger(target, TriggerOpTypes.ADD, rawKey as PropertyKey, rawValue)
      } else if (hasChanged(rawValue, oldValue)) {
        trigger(target, TriggerOpTypes.SET, rawKey as PropertyKey, rawValue)
      }

      return this
    }

    instrumentations.delete = function deleteEntry(
      this: Collection,
      key: unknown,
    ) {
      const target = toRaw(this) as Collection
      const rawKey = toRaw(key)
      const proto = getProto(target)
      const has = Reflect.get(proto, 'has', proto) as Collection['has']
      const deleteFn = Reflect.get(
        proto,
        'delete',
        proto,
      ) as Collection['delete']

      const hadKey =
        hasOwnKey(target, key as PropertyKey) ||
        has.call(target, key) ||
        has.call(target, rawKey)

      const result = deleteFn.call(target, rawKey)

      if (hadKey && result) {
        trigger(target, TriggerOpTypes.DELETE, rawKey as PropertyKey)
      }

      return result
    }

    instrumentations.clear = function clear(this: Collection) {
      const target = toRaw(this) as Collection
      const hadItems = target.size !== 0
      const proto = getProto(target)
      const clearFn = Reflect.get(proto, 'clear', proto) as Collection['clear']
      const result = clearFn.call(target)

      if (hadItems) {
        trigger(target, TriggerOpTypes.CLEAR)
      }

      return result
    }
  }

  instrumentations.keys = createIterableMethod('keys', isReadonly, shallow)
  instrumentations.values = createIterableMethod('values', isReadonly, shallow)
  instrumentations.entries = createIterableMethod(
    'entries',
    isReadonly,
    shallow,
  )
  instrumentations[Symbol.iterator] = createIterableMethod(
    Symbol.iterator,
    isReadonly,
    shallow,
  )

  return instrumentations
}

const mutableInstrumentations = createInstrumentations(false, false)
const shallowInstrumentations = createInstrumentations(false, true)
const readonlyInstrumentations = createInstrumentations(true, false)
const shallowReadonlyInstrumentations = createInstrumentations(true, true)

function createInstrumentationGetter(isReadonly: boolean, shallow: boolean) {
  const instrumentations = shallow
    ? isReadonly
      ? shallowReadonlyInstrumentations
      : shallowInstrumentations
    : isReadonly
      ? readonlyInstrumentations
      : mutableInstrumentations

  return function get(target: object, key: PropertyKey, receiver: object) {
    if (key === ReactiveFlags.IS_REACTIVE) return !isReadonly
    if (key === ReactiveFlags.IS_READONLY) return isReadonly
    if (key === ReactiveFlags.IS_SHALLOW) return shallow
    if (key === ReactiveFlags.RAW) return target

    return Reflect.get(
      hasOwnKey(instrumentations, key) ? instrumentations : target,
      key,
      receiver,
    )
  }
}

export const mutableCollectionHandlers: ProxyHandler<object> = {
  get: createInstrumentationGetter(false, false),
}

export const shallowCollectionHandlers: ProxyHandler<object> = {
  get: createInstrumentationGetter(false, true),
}

export const readonlyCollectionHandlers: ProxyHandler<object> = {
  get: createInstrumentationGetter(true, false),
}

export const shallowReadonlyCollectionHandlers: ProxyHandler<object> = {
  get: createInstrumentationGetter(true, true),
}
