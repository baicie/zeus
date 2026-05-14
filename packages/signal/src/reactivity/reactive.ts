import { isMap, isObject, isSet, toRawType } from '@zeus-js/shared'

import {
  mutableHandlers,
  readonlyHandlers,
  shallowReactiveHandlers,
  shallowReadonlyHandlers,
} from './baseHandlers'
import {
  mutableCollectionHandlers,
  readonlyCollectionHandlers,
  shallowCollectionHandlers,
  shallowReadonlyCollectionHandlers,
} from './collectionHandlers'
import { ReactiveFlags } from './constants'

import type { DeepReactive, DeepReadonly, ShallowReactive } from './types'

export interface Target {
  [ReactiveFlags.SKIP]?: boolean
  [ReactiveFlags.IS_REACTIVE]?: boolean
  [ReactiveFlags.IS_READONLY]?: boolean
  [ReactiveFlags.IS_SHALLOW]?: boolean
  [ReactiveFlags.RAW]?: unknown
}

const reactiveMap = new WeakMap<object, unknown>()
const shallowReactiveMap = new WeakMap<object, unknown>()
const readonlyMap = new WeakMap<object, unknown>()
const shallowReadonlyMap = new WeakMap<object, unknown>()

export function reactive<T extends object>(target: T): DeepReactive<T> {
  return createReactiveObject(
    target,
    false,
    mutableHandlers,
    mutableCollectionHandlers,
    reactiveMap,
  ) as DeepReactive<T>
}

export function shallowReactive<T extends object>(
  target: T,
): ShallowReactive<T> {
  return createReactiveObject(
    target,
    false,
    shallowReactiveHandlers,
    shallowCollectionHandlers,
    shallowReactiveMap,
  ) as ShallowReactive<T>
}

export function readonly<T extends object>(target: T): DeepReadonly<T> {
  return createReactiveObject(
    target,
    true,
    readonlyHandlers,
    readonlyCollectionHandlers,
    readonlyMap,
  ) as DeepReadonly<T>
}

export function shallowReadonly<T extends object>(target: T): Readonly<T> {
  return createReactiveObject(
    target,
    true,
    shallowReadonlyHandlers,
    shallowReadonlyCollectionHandlers,
    shallowReadonlyMap,
  ) as Readonly<T>
}

export function isReactive(value: unknown): boolean {
  if (isReadonly(value)) return isReactive((value as Target)[ReactiveFlags.RAW])
  return !!(value && (value as Target)[ReactiveFlags.IS_REACTIVE])
}

export function isReadonly(value: unknown): boolean {
  return !!(value && (value as Target)[ReactiveFlags.IS_READONLY])
}

export function isShallow(value: unknown): boolean {
  return !!(value && (value as Target)[ReactiveFlags.IS_SHALLOW])
}

export function isProxy(value: unknown): boolean {
  return isReactive(value) || isReadonly(value)
}

export function toRaw<T>(observed: T): T {
  const raw = observed && (observed as Target)[ReactiveFlags.RAW]
  return raw ? toRaw(raw as T) : observed
}

export function markRaw<T extends object>(value: T): T {
  Object.defineProperty(value, ReactiveFlags.SKIP, {
    configurable: true,
    enumerable: false,
    value: true,
  })
  return value
}

function getTargetType(value: Target): 'common' | 'collection' | 'invalid' {
  if (value[ReactiveFlags.SKIP] || !Object.isExtensible(value)) return 'invalid'
  const rawType = toRawType(value)
  if (rawType === 'Object' || rawType === 'Array') return 'common'
  if (isMap(value) || isSet(value)) return 'collection'
  return 'invalid'
}

function createReactiveObject(
  target: object,
  isReadonly: boolean,
  baseHandlers: ProxyHandler<object>,
  collectionHandlers: ProxyHandler<object>,
  proxyMap: WeakMap<object, unknown>,
): unknown {
  if (!isObject(target)) return target

  const raw = (target as Target)[ReactiveFlags.RAW]
  if (raw && !(isReadonly && (target as Target)[ReactiveFlags.IS_REACTIVE]))
    return target

  const existingProxy = proxyMap.get(target)
  if (existingProxy) return existingProxy

  const targetType = getTargetType(target as Target)
  if (targetType === 'invalid') return target

  const proxy = new Proxy(
    target,
    targetType === 'collection' ? collectionHandlers : baseHandlers,
  )
  proxyMap.set(target, proxy)
  return proxy
}
