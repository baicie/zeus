import alienSignals from 'alien-signals'
import { getOwner, runWithOwner } from './owner'
import type { Accessor } from './signal'

export function createMemo<T>(fn: () => T): Accessor<T> {
  const owner = getOwner()
  const memo = alienSignals.createMemo(fn, owner as any)

  return () => {
    return memo()
  }
}
