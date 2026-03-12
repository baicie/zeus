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

interface ErrorBoundaryState {
  hasError: boolean
  error: Error | null
}

export function ErrorBoundary(props: ErrorBoundaryProps): any {
  const version = signal(0)

  let state: ErrorBoundaryState = {
    hasError: false,
    error: null,
  }

  const container = document.createElement('div')
  container.setAttribute('data-error-boundary', 'true')

  const reset = function () {
    state = { hasError: false, error: null }
    const newVersion = version() + 1
    version(newVersion)
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

  try {
    const children = props.children
    if (children == null) {
      return null
    }

    if (typeof children === 'function') {
      effect(function () {
        void version()

        container.innerHTML = ''

        try {
          const value = children()

          if (state.hasError) {
            state = { hasError: false, error: null }
          }

          if (value == null || typeof value === 'boolean') {
            return
          }

          const nodes = resolveChild(value)
          for (const node of nodes) {
            container.appendChild(node)
          }
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e))
          state = { hasError: true, error }

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

    return children
  } catch (e) {
    const error = e instanceof Error ? e : new Error(String(e))
    state = { hasError: true, error }

    if (props.onError) {
      props.onError(error, { componentStack: '' })
    }

    if (props.fallback) {
      return props.fallback(error, reset)
    }

    return null
  }
}

export type { ErrorBoundaryState }
