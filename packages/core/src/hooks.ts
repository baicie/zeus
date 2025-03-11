interface Ref<T extends Element> {
  current: T | null
  __ref: string
}

export function useRef<T extends Element>(name: string): Ref<T> {
  return {
    current: null as T | null,
    __ref: name,
  }
}

interface EventHandler<T extends Event> {
  __event: string
  handler: (e: T) => void
}

export function useEvent<T extends Event>(
  name: string,
  handler: (e: T) => void
): EventHandler<T> {
  return {
    __event: name,
    handler,
  }
}
