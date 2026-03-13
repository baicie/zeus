// Ref type for DOM elements and signal values
// Supports three types of refs:
// 1. Signal ref: { value: T | null }
// 2. DOM ref (direct variable): T
// 3. Callback ref: (value: T) => void
export type Ref<T> =
  | { value: T | null } // signal ref
  | T // DOM ref (direct variable like let el)
  | ((value: T) => void) // callback ref
  | null

// Check if a value is a Ref object
export function isRef<T>(value: any): value is { value: T } {
  return value !== null && typeof value === 'object' && 'value' in value
}
