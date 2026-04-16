import { createOwner, runWithOwner, getOwner } from './owner'
import { disposeOwner } from './cleanup'

export function createRoot<T>(fn: (dispose: () => void) => T): T {
  const owner = createOwner(getOwner())
  return runWithOwner(owner, () => fn(() => disposeOwner(owner)))
}
