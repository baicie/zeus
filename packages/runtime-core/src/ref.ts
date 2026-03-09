export type Ref<T> = T | null

export function isRef<T>(value: any): value is Ref<T> {
  return value !== null
}

export function useRef<T = Element>(): Ref<T>
export function useRef<T = Element>(initialValue: T | null): Ref<T>
export function useRef<T>(initialValue?: T | null): Ref<T> {
  return initialValue ?? null
}
