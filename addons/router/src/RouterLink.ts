import { effect } from '@zeus-js/signal'
import type { RouteLocationNormalized, RouterLinkProps } from './types'
import { getCurrentRouter } from './router'

function isExactActive(
  route: RouteLocationNormalized,
  currentRoute: RouteLocationNormalized,
): boolean {
  return route.fullPath === currentRoute.fullPath
}

function isActive(
  route: RouteLocationNormalized,
  currentRoute: RouteLocationNormalized,
): boolean {
  if (route.matched.length === 0) return false
  const routePath = route.path
  const currentPath = currentRoute.path
  return currentPath === routePath || currentPath.indexOf(routePath + '/') === 0
}

/**
 * RouterLink renders a navigation link that uses the router to navigate
 * instead of triggering a full page reload.
 *
 * Usage:
 *   const link = RouterLink({ to: '/home', children: 'Home' })
 */
export function RouterLink(
  props: RouterLinkProps & { children?: Node | string | (Node | string)[] },
): HTMLAnchorElement {
  const router = getCurrentRouter()

  const anchor = document.createElement('a')

  // Render children
  const children = props.children
  if (children !== undefined && children !== null) {
    if (Array.isArray(children)) {
      for (let i = 0; i < children.length; i++) {
        const child = children[i]
        if (typeof child === 'string') {
          anchor.appendChild(document.createTextNode(child))
        } else if (child instanceof Node) {
          anchor.appendChild(child)
        }
      }
    } else if (typeof children === 'string') {
      anchor.textContent = children
    } else if (children instanceof Node) {
      anchor.appendChild(children)
    }
  }

  if (!router) {
    anchor.setAttribute('href', typeof props.to === 'string' ? props.to : '/')
    return anchor
  }

  const resolvedRoute = router.resolve(props.to)
  const href = router.options.history.createHref(resolvedRoute.fullPath)
  anchor.setAttribute('href', href)

  const activeClass =
    props.activeClass || router.options.linkActiveClass || 'router-link-active'
  const exactActiveClass =
    props.exactActiveClass ||
    router.options.linkExactActiveClass ||
    'router-link-exact-active'

  // Reactively update active classes
  const disposeEffect = effect(function () {
    const currentRoute = router.currentRoute

    if (isActive(resolvedRoute, currentRoute)) {
      anchor.classList.add(activeClass)
    } else {
      anchor.classList.remove(activeClass)
    }

    if (isExactActive(resolvedRoute, currentRoute)) {
      anchor.classList.add(exactActiveClass)
      anchor.setAttribute('aria-current', props.ariaCurrentValue || 'page')
    } else {
      anchor.classList.remove(exactActiveClass)
      anchor.removeAttribute('aria-current')
    }
  })

  anchor.addEventListener('click', function (event: MouseEvent) {
    // Let the browser handle external links, modified clicks, etc.
    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.altKey ||
      event.ctrlKey ||
      event.shiftKey
    ) {
      return
    }

    event.preventDefault()

    if (props.replace) {
      router.replace(props.to)
    } else {
      router.push(props.to)
    }
  })

  // Clean up effect when anchor is removed from DOM
  const observer = new MutationObserver(function (mutations) {
    for (let i = 0; i < mutations.length; i++) {
      const removedNodes = mutations[i].removedNodes
      for (let j = 0; j < removedNodes.length; j++) {
        if (
          removedNodes[j] === anchor ||
          (removedNodes[j] as Element).contains(anchor)
        ) {
          disposeEffect()
          observer.disconnect()
          return
        }
      }
    }
  })

  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true })
  }

  return anchor
}
