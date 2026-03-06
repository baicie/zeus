import { effect, setActiveSub } from '@zeus-js/signal'
import type { RouteComponent, RouterViewProps } from './types'
import { getCurrentRouter } from './router'

/**
 * RouterView renders the component matched by the current route.
 *
 * Since Zeus compiles JSX to direct DOM operations (no VNodes),
 * this component reactively replaces its DOM content when the route changes.
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

  disposeEffect = effect(function () {
    const router = getCurrentRouter()
    if (!router) return

    const route = router.currentRoute
    const matched = route.matched

    let component: RouteComponent | null = null
    for (let i = matched.length - 1; i >= 0; i--) {
      const components = matched[i].components
      if (components && components[name]) {
        component = components[name]
        break
      }
    }

    // Remove previous rendered node
    if (currentNode && currentNode.parentNode) {
      currentNode.parentNode.removeChild(currentNode)
      currentNode = null
    }

    if (!component) return

    // Render the component in an untracked context so that any signal reads
    // that happen during component setup (e.g. non-reactive JSX expressions
    // compiled by Zeus) do not get tracked by this route-change effect.
    // Without this, updating a local signal inside a component would cause
    // the route effect to re-run, destroying and recreating the component.
    const prevSub = setActiveSub(undefined)
    const rendered = component(route.params)
    setActiveSub(prevSub)

    if (!rendered) return

    currentNode = rendered

    // Insert before the anchor comment
    if (anchor.parentNode) {
      anchor.parentNode.insertBefore(rendered, anchor)
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
