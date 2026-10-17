// packages/runtime-dom/src/controlFlow.ts

import { mountDynamic } from './insert'
import { mountFor as mountForRuntime } from './list'

import type { JSXValue } from './types'
import type { Accessor } from '@zeus-js/signal'

export type ShowProps = {
  when: unknown
  fallback?: JSXValue | (() => JSXValue)
  children?: JSXValue | (() => JSXValue)
}

export function Show(props: ShowProps): JSXValue {
  assertValue(props.when, 'Show `when`')
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
  mountDynamic(parent, marker, () => {
    const condition = when()
    assertValue(condition, 'Show `when`')
    return condition ? children() : fallback ? fallback() : null
  })
}

export type ForProps<T, K = unknown> = {
  each: readonly T[] | null | undefined
  by?: (item: T, index: number) => K
  children: (item: T, index: number) => JSXValue
}

export function For<T, K = unknown>(props: ForProps<T, K>): JSXValue {
  return (
    readItems(props.each)?.map((item, index) => props.children(item, index)) ??
    null
  )
}

export function mountFor<T, K = unknown>(
  parent: Node,
  marker: Node,
  each: () => readonly T[] | null | undefined,
  key: ((item: T, index: number) => K) | undefined,
  render: (item: Accessor<T>, index: Accessor<number>) => JSXValue,
): void {
  const readEach = () => readItems(each())
  mountForRuntime(parent, marker, readEach, key, render)
}

function readItems<T>(
  value: readonly T[] | null | undefined,
): readonly T[] | null {
  if (value == null) return null
  if (!Array.isArray(value)) {
    throw new TypeError('[Zeus runtime] <For> `each` must resolve to an array.')
  }
  return value
}

function assertValue(value: unknown, label: string): void {
  if (typeof value === 'function') {
    throw new TypeError(
      `[Zeus runtime] ${label} must be a value; call the function explicitly when reading a signal.`,
    )
  }
}
