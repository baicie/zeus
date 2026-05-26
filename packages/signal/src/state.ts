import { reactive } from './reactive'
import { ref } from './ref'

export interface ValueState<T = unknown> {
  get value(): T
  set value(value: T)
}

type ProxyableInput = Record<PropertyKey, any> | readonly any[]

export type State<T> = T extends ValueStateInput
  ? ValueState<T>
  : T extends ProxyableInput
    ? Reactive<T>
    : ValueState<T>

type ValueStateInput =
  | null
  | undefined
  | Date
  | RegExp
  | Error
  | Promise<any>
  | Function
  | Node

type Reactive<T extends object> = T

export function state<T extends ValueStateInput>(value: T): ValueState<T>
export function state<T extends ProxyableInput>(value: T): Reactive<T>
export function state<T>(value: T): ValueState<T>
export function state<T = undefined>(): ValueState<T | undefined>
export function state(value?: unknown): unknown {
  if (arguments.length === 0) {
    return ref()
  }
  return isProxyable(value) ? reactive(value as object) : ref(value)
}

export function isValueState<T = unknown>(
  value: unknown,
): value is ValueState<T> {
  if (!value || typeof value !== 'object') {
    return false
  }
  const obj = value as object
  if (
    Object.getOwnPropertyDescriptor(obj, 'get') ||
    Object.getOwnPropertyDescriptor(obj, 'has')
  ) {
    return false
  }
  return 'value' in obj
}

function isProxyable(value: unknown): boolean {
  if (value === null || typeof value !== 'object') {
    return false
  }
  if (Array.isArray(value)) {
    return true
  }
  if (
    value instanceof Map ||
    value instanceof Set ||
    value instanceof WeakMap ||
    value instanceof WeakSet
  ) {
    return true
  }
  return isPlainObject(value as object)
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}
