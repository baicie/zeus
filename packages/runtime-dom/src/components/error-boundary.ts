/**
 * ErrorBoundary Component
 *
 * Catches JavaScript errors in child components
 *
 * Usage:
 *   <ErrorBoundary fallback={(error, reset) => <div>Error: {error.message}</div>}>
 *     <ChildComponent />
 *   </ErrorBoundary>
 */

import { effect, signal } from '@zeus-js/signal'

export interface ErrorBoundaryProps {
  children?: any
  fallback?: (error: Error, reset: () => void) => any
  onError?: (error: Error, errorInfo: { componentStack: string }) => void
}

const errorBoundaryRegistry: Set<
  () => { hasError: boolean; error: Error | null }
> = new Set()

let currentErrorBoundary:
  | (() => { hasError: boolean; error: Error | null })
  | null = null

export function getCurrentErrorBoundary():
  | (() => { hasError: boolean; error: Error | null })
  | null {
  return currentErrorBoundary
}

export function setCurrentErrorBoundary(
  boundary: (() => { hasError: boolean; error: Error | null }) | null,
): void {
  currentErrorBoundary = boundary
}

export function registerErrorBoundary(
  getState: () => { hasError: boolean; error: Error | null },
): () => void {
  errorBoundaryRegistry.add(getState)
  return () => {
    errorBoundaryRegistry.delete(getState)
  }
}

export function ErrorBoundary(props: ErrorBoundaryProps): any {
  const errorState = signal<{ hasError: boolean; error: Error | null }>({
    hasError: false,
    error: null,
  })

  const reset = function () {
    errorState({ hasError: false, error: null })
  }

  const resolveChild = function (child: any): Node[] {
    if (child == null || typeof child === 'boolean') {
      return []
    }
    if (child instanceof Node) {
      return [child]
    }
    if (Array.isArray(child)) {
      return child.reduce<Node[]>((acc, c) => acc.concat(resolveChild(c)), [])
    }
    if (typeof child === 'string' || typeof child === 'number') {
      return [document.createTextNode(String(child))]
    }
    return []
  }

  const container = document.createElement('div')
  container.setAttribute('data-error-boundary', 'true')

  const getState = function () {
    return errorState()
  }

  effect(function () {
    const state = errorState()

    if (state.hasError && state.error) {
      container.innerHTML = ''
      if (props.fallback) {
        const fallbackResult = props.fallback(state.error, reset)
        if (fallbackResult != null) {
          const fallbackNodes = resolveChild(fallbackResult)
          for (const node of fallbackNodes) {
            container.appendChild(node)
          }
        }
      }
      return
    }

    container.innerHTML = ''

    const prevBoundary = currentErrorBoundary
    currentErrorBoundary = getState

    try {
      const children = props.children
      if (children == null) {
        currentErrorBoundary = prevBoundary
        return
      }

      let value: any
      if (typeof children === 'function') {
        value = children()
      } else {
        value = children
      }

      if (value == null || typeof value === 'boolean') {
        currentErrorBoundary = prevBoundary
        return
      }

      const nodes = resolveChild(value)
      for (const node of nodes) {
        container.appendChild(node)
      }

      currentErrorBoundary = prevBoundary
    } catch (e) {
      currentErrorBoundary = prevBoundary
      const error = e instanceof Error ? e : new Error(String(e))
      errorState({ hasError: true, error })

      if (props.onError) {
        props.onError(error, { componentStack: '' })
      }

      if (props.fallback) {
        const fallbackResult = props.fallback(error, reset)
        if (fallbackResult != null) {
          const fallbackNodes = resolveChild(fallbackResult)
          for (const node of fallbackNodes) {
            container.appendChild(node)
          }
        }
      }
    }
  })

  return container
}

export function withErrorBoundary(
  children: any,
  fallback: (error: Error, reset: () => void) => any,
  onError?: (error: Error, errorInfo: { componentStack: string }) => void,
): any {
  return ErrorBoundary({
    children,
    fallback,
    onError,
  })
}
