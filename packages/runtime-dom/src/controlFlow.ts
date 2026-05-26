import { mountDynamic } from './insert'

import type { JSXValue } from './types'

export type ShowProps = {
  when: unknown
  fallback?: JSXValue | (() => JSXValue)
  children?: JSXValue | (() => JSXValue)
}

export function Show(props: ShowProps): JSXValue {
  return props.when
    ? resolveValue(props.children)
    : resolveValue(props.fallback)
}

export function resolveValue(
  value: JSXValue | (() => JSXValue) | undefined,
): JSXValue {
  return typeof value === 'function' ? value() : (value ?? null)
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

export type ForProps<T> = {
  each: readonly T[] | null | undefined
  children: (item: T, index: number) => JSXValue
}

export function For<T>(props: ForProps<T>): JSXValue {
  return props.each?.map((item, index) => props.children(item, index)) ?? null
}

export function mountFor<T>(
  parent: Node,
  marker: Node,
  each: () => readonly T[] | null | undefined,
  render: (item: T, index: number) => JSXValue,
): void {
  mountDynamic(
    parent,
    marker,
    () => each()?.map((item, index) => render(item, index)) ?? null,
  )
}
