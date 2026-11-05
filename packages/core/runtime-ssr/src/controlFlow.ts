import { assertSyncSSRValue } from './serialize'

import type { SSRNode } from './types'

export type SSRResolvable<T> = T | (() => T)

export interface ShowProps {
  when: unknown
  fallback?: SSRResolvable<SSRNode>
  children?: SSRResolvable<SSRNode>
}

export function ssrShow(
  when: SSRResolvable<unknown>,
  children: SSRResolvable<SSRNode>,
  fallback?: SSRResolvable<SSRNode>,
): SSRNode {
  const condition = resolve(when)
  assertControlValue(condition, 'Show `when`')
  // The remaining serialization steps reject thenables, but the branch
  // decision must not be made from a Promise's truthiness first.
  assertSyncSSRValue(condition)
  const value = condition ? resolve(children) : resolve(fallback)
  assertSyncSSRValue(value)
  return value ?? null
}

export function Show(props: ShowProps): SSRNode {
  assertControlValue(props.when, 'Show `when`')
  assertSyncSSRValue(props.when)
  const value = props.when ? props.children : props.fallback
  const resolved = resolve(value)
  assertSyncSSRValue(resolved)
  return resolved ?? null
}

export interface ForProps<T, K = unknown> {
  each: readonly T[] | null | undefined
  by?: (item: T, index: number) => K
  children: (item: T, index: number) => SSRNode
}

export function ssrFor<T>(
  each: SSRResolvable<readonly T[] | null | undefined>,
  render: (item: T, index: number) => SSRNode,
): SSRNode {
  const items = resolve(each)
  assertSyncSSRValue(items)
  if (items != null && !Array.isArray(items)) {
    throw new TypeError('[Zeus SSR] <For> `each` must resolve to an array.')
  }
  return items?.map((item, index) => render(item, index)) ?? null
}

export function For<T, K = unknown>(props: ForProps<T, K>): SSRNode {
  // The public component takes values, not accessors. Lower-level `ssrFor`
  // accepts a factory because that is how compiled JSX passes expressions.
  if (typeof props.each === 'function') {
    throw new TypeError('[Zeus SSR] <For> `each` must resolve to an array.')
  }
  return ssrFor(props.each, props.children)
}

function resolve<T>(value: SSRResolvable<T> | undefined): T | undefined {
  return typeof value === 'function' ? (value as () => T)() : value
}

function assertControlValue(value: unknown, label: string): void {
  if (typeof value === 'function') {
    throw new TypeError(
      `[Zeus SSR] ${label} must be a value; call the function explicitly when reading a signal.`,
    )
  }
}
