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
  return resolve(when) ? resolve(children) : (resolve(fallback) ?? null)
}

export function Show(props: ShowProps): SSRNode {
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
  return items?.map((item, index) => render(item, index)) ?? null
}

export function For<T, K = unknown>(props: ForProps<T, K>): SSRNode {
  return ssrFor(props.each, props.children)
}

function resolve<T>(value: SSRResolvable<T> | undefined): T | undefined {
  return typeof value === 'function' ? (value as () => T)() : value
}
