export type CleanupFn = () => void

export interface Owner {
  parent: Owner | null
  cleanups: CleanupFn[] | null
  children: Owner[] | null
  disposed: boolean
}

let CurrentOwner: Owner | null = null

export function getOwner(): Owner | null {
  return CurrentOwner
}

export function runWithOwner<T>(owner: Owner | null, fn: () => T): T {
  const prev = CurrentOwner
  CurrentOwner = owner
  try {
    return fn()
  } finally {
    CurrentOwner = prev
  }
}

export function createOwner(parent: Owner | null): Owner {
  const owner: Owner = {
    parent,
    cleanups: [],
    children: [],
    disposed: false,
  }
  if (parent) parent.children!.push(owner)
  return owner
}
