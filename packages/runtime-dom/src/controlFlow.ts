// packages/runtime-dom/src/controlFlow.ts

import { mountDynamic } from './insert'
import { mountFor as mountForRuntime } from './list'

import type { JSXValue } from './types'

export type ShowProps = {
  when: unknown
  fallback?: JSXValue | (() => JSXValue)
  children?: JSXValue | (() => JSXValue)
}

export function Show(props: ShowProps): JSXValue {
  const value = props.when ? props.children : props.fallback
  return resolveValue(value)
}

export function resolveValue(
  value: JSXValue | (() => JSXValue) | undefined,
): JSXValue {
  if (typeof value === 'function') return value()
  return value ?? null
}

export function mountShow(
  parent: Node,
  marker: Node,
  when: () => unknown,
  children: () => JSXValue,
  fallback?: () => JSXValue,
): void {
  mountDynamic(parent, marker, () =>
    when() ? children() : fallback ? fallback() : null,
  )
}

export type ForProps<T, K = unknown> = {
  each: readonly T[] | null | undefined
  by?: (item: T, index: number) => K
  children: (item: T, index: number) => JSXValue
}

export function For<T, K = unknown>(props: ForProps<T, K>): JSXValue {
  return props.each?.map((item, index) => props.children(item, index)) ?? null
}

export function mountFor<T, K = unknown>(
  parent: Node,
  marker: Node,
  each: () => readonly T[] | null | undefined,
  key: ((item: T, index: number) => K) | undefined,
  render: (item: T, index: number) => JSXValue,
): void {
  mountForRuntime(parent, marker, each, key, render)
}
