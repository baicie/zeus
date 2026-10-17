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
  return condition ? resolve(children) : (resolve(fallback) ?? null)
}

export function Show(props: ShowProps): SSRNode {
  assertControlValue(props.when, 'Show `when`')
  const value = props.when ? props.children : props.fallback
  return resolve(value) ?? null
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
  if (items != null && !Array.isArray(items)) {
    throw new TypeError('[Zeus SSR] <For> `each` must resolve to an array.')
  }
  return items?.map((item, index) => render(item, index)) ?? null
}

export function For<T, K = unknown>(props: ForProps<T, K>): SSRNode {
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
