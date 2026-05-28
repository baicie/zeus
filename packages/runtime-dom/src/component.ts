import { createOwner, setCurrentOwner } from './context'

import type { JSXValue } from './types'

export function createComponent<
  P extends Record<string, unknown>,
  R extends JSXValue,
>(component: (props: P) => R, props: P): R {
  const owner = createOwner()

  // Push the new owner so any useContext() calls within this component (including
  // plain function children that are called synchronously during render) can
  // access the context chain starting from this owner.
  setCurrentOwner(owner)

  try {
    return component(props)
  } finally {
    // Restore after this component's synchronous execution finishes.
    // This prevents a top-level component from permanently leaking its owner
    // into sibling/sequential calls.
    setCurrentOwner(owner.parent)
  }
}
