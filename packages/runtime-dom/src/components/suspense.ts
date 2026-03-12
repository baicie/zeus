/**
 * Suspense Component
 *
 * Shows fallback content while content is loading
 *
 * Usage:
 *   <Suspense fallback={<div>Loading...</div>}>
 *     <AsyncComponent />
 *   </Suspense>
 *
 * Note: This is a basic implementation. For full Suspense support,
 * you would need to integrate with a resource/suspense mechanism.
 */

import { effect } from '@zeus-js/signal'

export interface SuspenseProps {
  children?: any
  fallback?: any
}

export function Suspense(props: SuspenseProps): any {
  const { children, fallback } = props

  const container = document.createElement('div')
  container.setAttribute('data-suspense', 'true')

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

  if (typeof children === 'function') {
    let currentPromise: Promise<any> | null = null

    const handlePromise = function (promise: Promise<any>) {
      container.innerHTML = ''
      if (fallback != null) {
        const fallbackNodes = resolveChild(fallback)
        fallbackNodes.forEach(node => container.appendChild(node))
      }

      promise
        .then(function (resolvedValue: any) {
          container.innerHTML = ''
          const renderFn =
            typeof resolvedValue === 'function'
              ? resolvedValue
              : function () {
                  return resolvedValue
                }
          const nodes = resolveChild(renderFn())
          nodes.forEach(node => container.appendChild(node))
        })
        .catch(function (error) {
          console.error('[Suspense] Error loading:', error)
        })
    }

    effect(function () {
      const value = children()

      if (
        value &&
        typeof value === 'object' &&
        typeof value.then === 'function'
      ) {
        if (currentPromise !== value) {
          currentPromise = value
          handlePromise(value)
        }
        return
      }

      currentPromise = null
      container.innerHTML = ''
      const resolvedNodes = resolveChild(value)
      resolvedNodes.forEach(node => container.appendChild(node))
    })

    return container
  }

  const staticNodes = resolveChild(children)
  staticNodes.forEach(node => container.appendChild(node))
  return container
}
