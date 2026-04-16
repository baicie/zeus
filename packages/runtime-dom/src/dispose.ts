import { createRoot, onCleanup } from '@zeusjs/core'

export function dispose(node: Node): void {
  // Placeholder for future disposal logic
}

export function markDisposed(node: Node): void {
  (node as any).__zeus_disposed = true
}

export function isDisposed(node: Node): boolean {
  return !!(node as any).__zeus_disposed
}

export function runWithCleanup(fn: () => void, cleanup: () => void): void {
  onCleanup(cleanup)
  fn()
}
