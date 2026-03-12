import { effect, setActiveSub } from '@zeus-js/signal'
import type { Lazy, RouteComponent, RouterViewProps } from './types'
import { getCurrentRouter } from './router'

/**
 * RouterView renders the component matched by the current route.
 *
 * Since Zeus compiles JSX to direct DOM operations (no VNodes),
 * this component reactively replaces its DOM content when the route changes.
 *
 * Supports lazy-loaded components via Lazy<RouteComponent>
 *
 * Usage:
 *   const view = RouterView({}) // returns a DOM Node
 */
export function RouterView(props?: RouterViewProps): Node {
  const name = props && props.name ? props.name : 'default'
  const container = document.createDocumentFragment()
  const anchor = document.createComment('router-view')
  container.appendChild(anchor)

  let currentNode: Node | null = null
  let disposeEffect: (() => void) | null = null
  let pendingComponent: Lazy<RouteComponent> | RouteComponent | null = null

  // Container for lazy-loaded component placeholder
  const lazyContainer = document.createElement('div')
  lazyContainer.setAttribute('data-router-lazy', 'true')

  function renderComponent(
    component: RouteComponent,
    routeParams: Record<string, any>,
  ): void {
    // Remove previous rendered node
    if (currentNode && currentNode.parentNode) {
      currentNode.parentNode.removeChild(currentNode)
      currentNode = null
    }

    // Render the component in an untracked context so that any signal reads
    // that happen during component setup (e.g. non-reactive JSX expressions
    // compiled by Zeus) do not get tracked by this route-change effect.
    // Without this, updating a local signal inside a component would cause
    // the route effect to re-run, destroying and recreating the component.
    const prevSub = setActiveSub(undefined)
    let rendered: Node | null | undefined
    try {
      rendered = component(routeParams) as Node | null | undefined
    } finally {
      setActiveSub(prevSub)
    }

    if (!rendered) return

    currentNode = rendered

    // Insert before the anchor comment
    if (anchor.parentNode) {
      anchor.parentNode.insertBefore(rendered, anchor)
    }
  }

  disposeEffect = effect(function () {
    try {
      const router = getCurrentRouter()
      if (!router) return

      const route = router.currentRoute
      const matched = route.matched

      let component: RouteComponent | Lazy<RouteComponent> | null = null
      for (let i = matched.length - 1; i >= 0; i--) {
        const components = matched[i].components
        if (components && components[name]) {
          component = components[name]
          break
        }
      }

      if (!component) return

      // Check if component is a lazy loader (function that returns Promise)
      const isLazy =
        typeof component === 'function' && (component as any).length === 0

      if (isLazy) {
        // Handle lazy-loaded component
        const lazyLoader = component as unknown as Lazy<RouteComponent>

        // Skip if already loading or same component
        if (pendingComponent === lazyLoader) return

        // Show loading placeholder
        pendingComponent = lazyLoader

        // Render loading state
        if (currentNode && currentNode.parentNode) {
          currentNode.parentNode.removeChild(currentNode)
          currentNode = null
        }

        if (anchor.parentNode) {
          anchor.parentNode.insertBefore(lazyContainer, anchor)
        }

        // Load the component
        lazyLoader()
          .then(function (loadedComponent: any) {
            // Get default export if it exists (for ES modules)
            const componentFn =
              loadedComponent && loadedComponent.default
                ? loadedComponent.default
                : loadedComponent

            // Check if we're still on the same route
            const currentRoute = getCurrentRouter()
            if (currentRoute && currentRoute.currentRoute === route) {
              // Remove loading placeholder
              if (lazyContainer.parentNode) {
                lazyContainer.parentNode.removeChild(lazyContainer)
              }
            }
            return componentFn
          })
          .catch(function (error) {
            console.error('[RouterView] Failed to load lazy component:', error)
            if (lazyContainer.parentNode) {
              lazyContainer.parentNode.removeChild(lazyContainer)
            }
            return null
          })
          .then(function (componentFn) {
            if (componentFn) {
              renderComponent(componentFn, route.params)
            }
          })
      } else {
        // Direct component - render immediately
        pendingComponent = null
        // Remove loading placeholder if exists
        if (lazyContainer.parentNode) {
          lazyContainer.parentNode.removeChild(lazyContainer)
        }
        renderComponent(component as RouteComponent, route.params)
      }
    } catch (e) {
      // Prevent unhandled errors from crashing the router
      console.error('[RouterView] Error in route effect:', e)
    }
  })

  // Return a wrapper div since DocumentFragment loses its children when attached
  const wrapper = document.createElement('div')
  wrapper.setAttribute('data-router-view', name)

  // Append anchor to wrapper so the effect can find it
  wrapper.appendChild(anchor)

  // When the wrapper is disconnected, clean up the effect
  const observer = new MutationObserver(function (mutations) {
    for (let i = 0; i < mutations.length; i++) {
      const removedNodes = mutations[i].removedNodes
      for (let j = 0; j < removedNodes.length; j++) {
        if (removedNodes[j] === wrapper) {
          if (disposeEffect) {
            disposeEffect()
            disposeEffect = null
          }
          observer.disconnect()
        }
      }
    }
  })

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true })
  }

  return wrapper
}
