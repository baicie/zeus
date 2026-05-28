import { createOwner, runWithOwner } from './context'

import type { JSXValue } from './types'

export function createComponent<
  P extends Record<string, unknown>,
  R extends JSXValue,
>(component: (props: P) => R, props: P): R {
  const owner = createOwner()

  return runWithOwner(owner, () => component(props))
}
