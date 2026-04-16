import alienSignals from 'alien-signals'
import { getOwner } from './owner'

export function batch<T>(fn: () => T): T {
  return alienSignals.batch(fn)
}
