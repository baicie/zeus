import { getCurrentScope } from '@zeus-js/signal/internal'

export type ErrorBoundaryPhase =
  | 'render'
  | 'binding'
  | 'event'
  | 'request'
  | 'runtime'

export interface ErrorBoundaryInfo {
  readonly phase: ErrorBoundaryPhase
  readonly fatal: boolean
}

export type ErrorBoundaryHandler = (
  error: unknown,
  phase?: ErrorBoundaryPhase,
) => void

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

export function isFatalError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false
  const candidate = error as {
    name?: unknown
    code?: unknown
    fatal?: unknown
  }
  return (
    candidate.fatal === true ||
    candidate.name === 'SecurityError' ||
    (typeof candidate.code === 'string' &&
      /^(?:ZEUS_FATAL_|ZEUS_SECURITY_)/.test(candidate.code))
  )
}

export function captureErrorBoundary(): ErrorBoundaryHandler | undefined {
  return (
    getCurrentErrorBoundaryHandler() ??
    getScopeErrorBoundaryHandler(getCurrentScope())
  )
}

export function reportError(
  error: unknown,
  phase: ErrorBoundaryPhase = 'runtime',
): void {
  const handler = captureErrorBoundary()
  if (!handler) throw error
  handler(error, phase)
}
