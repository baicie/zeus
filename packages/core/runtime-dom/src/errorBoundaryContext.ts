export type ErrorBoundaryHandler = (error: unknown) => void

const activeHandlers: ErrorBoundaryHandler[] = []
const scopeHandlers = new WeakMap<object, ErrorBoundaryHandler>()

export function withErrorBoundaryHandler<T>(
  handler: ErrorBoundaryHandler,
  run: () => T,
): T {
  activeHandlers.push(handler)
  try {
    return run()
  } finally {
    activeHandlers.pop()
  }
}

export function getCurrentErrorBoundaryHandler():
  | ErrorBoundaryHandler
  | undefined {
  return activeHandlers[activeHandlers.length - 1]
}

export function setScopeErrorBoundaryHandler(
  scope: object | undefined,
  handler: ErrorBoundaryHandler | undefined,
): void {
  if (!scope) return
  if (handler) scopeHandlers.set(scope, handler)
  else scopeHandlers.delete(scope)
}

export function getScopeErrorBoundaryHandler(
  scope: object | undefined,
): ErrorBoundaryHandler | undefined {
  let current = scope as { parent?: object } | undefined
  while (current) {
    const handler = scopeHandlers.get(current)
    if (handler) return handler
    current = current.parent as { parent?: object } | undefined
  }
  return undefined
}
