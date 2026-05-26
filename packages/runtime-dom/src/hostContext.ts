// packages/runtime-dom/src/hostContext.ts

export type HostRenderMode = 'light' | 'shadow'

export interface HostRenderContext {
  host: HTMLElement
  mode: HostRenderMode
  lightChildren: readonly Node[]
}

let currentHostContext: HostRenderContext | undefined

export function getCurrentHostContext(): HostRenderContext | undefined {
  return currentHostContext
}

export function withHostContext<T>(
  context: HostRenderContext | undefined,
  fn: () => T,
): T {
  const previous = currentHostContext
  currentHostContext = context

  try {
    return fn()
  } finally {
    currentHostContext = previous
  }
}

export function captureCurrentHostContext(): HostRenderContext | undefined {
  return currentHostContext
}

export function withCapturedHostContext<
  T extends (...args: never[]) => unknown,
>(fn: T): T {
  const context = captureCurrentHostContext()

  return ((...args: Parameters<T>): unknown => {
    return withHostContext(context, () => fn(...args))
  }) as T
}
