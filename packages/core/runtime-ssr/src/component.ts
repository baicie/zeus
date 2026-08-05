import type { SSRComponent, SSRNode } from './types'

export function ssrComponent<
  P extends Record<string, unknown>,
  R extends SSRNode,
>(component: (props: P) => R, props: P): R {
  return component(props)
}

export type { SSRComponent }
