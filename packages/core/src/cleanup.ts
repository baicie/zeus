import type { Owner, CleanupFn } from './owner'

export function onCleanup(fn: CleanupFn): void {
  const owner = getOwner()
  if (!owner) throw new Error('onCleanup must be called under an owner')
  owner.cleanups!.push(fn)
}

export function disposeOwner(owner: Owner): void {
  if (owner.disposed) return
  owner.disposed = true

  for (const child of owner.children || []) disposeOwner(child)
  for (const cleanup of owner.cleanups || []) cleanup()

  owner.children = []
  owner.cleanups = []
}
