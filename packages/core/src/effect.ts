import alienSignals from 'alien-signals'
import { getOwner } from './owner'

export function createEffect(fn: () => void): void {
  const owner = getOwner()
  alienSignals.effect(fn, owner as any)
}
