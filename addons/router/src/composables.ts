import type { RouteLocationNormalized, Router } from './types'
import { getCurrentRouter } from './router'

/**
 * Returns the router instance.
 * Must be called within a component or after router installation.
 */
export function useRouter(): Router {
  const router = getCurrentRouter()
  if (!router) {
    throw new Error(
      'useRouter() was called without an active router. ' +
        'Make sure to call router.install() or createApp() with the router.',
    )
  }
  return router
}

/**
 * Returns the current route location.
 * The returned object is reactive - accessing it inside an effect will
 * track changes and re-run when the route changes.
 */
export function useRoute(): RouteLocationNormalized {
  const router = useRouter()
  return router.currentRoute
}
