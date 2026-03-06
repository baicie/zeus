import { computed, signal } from '@zeus-js/signal'
import type {
  NavigationFailure,
  NavigationGuard,
  NavigationGuardNext,
  NavigationGuardReturn,
  PostNavigationGuard,
  RouteLocationNormalized,
  RouteLocationRaw,
  RouteRecordNormalized,
  RouteRecordRaw,
  Router,
  RouterOptions,
} from './types'
import { createRouterMatcher } from './matcher'

type ErrorHandler = (
  error: any,
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
) => any

const START_ROUTE: RouteLocationNormalized = {
  path: '/',
  fullPath: '/',
  hash: '',
  query: {},
  params: {},
  matched: [],
  meta: {},
}

function createNavigationFailure(
  type: NavigationFailure['type'],
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
  message?: string,
): NavigationFailure {
  const error = new Error(
    message || 'Navigation ' + type + ': ' + to.fullPath,
  ) as NavigationFailure
  error.type = type
  error.to = to
  error.from = from
  return error
}

function isNavigationFailure(value: any): value is NavigationFailure {
  return (
    value instanceof Error &&
    'type' in value &&
    'to' in value &&
    'from' in value
  )
}

/**
 * Run a series of navigation guards sequentially, passing `next` to each.
 * Resolves with the final navigation guard return value.
 */
function runGuardsSequentially(
  guards: NavigationGuard[],
  to: RouteLocationNormalized,
  from: RouteLocationNormalized,
): Promise<NavigationGuardReturn> {
  let index = 0

  function runNext(): Promise<NavigationGuardReturn> {
    if (index >= guards.length) {
      return Promise.resolve()
    }

    const guard = guards[index++]
    return new Promise<NavigationGuardReturn>(function (resolve, reject) {
      const next: NavigationGuardNext = function (
        validOrError?: boolean | null | Error | RouteLocationRaw,
      ) {
        if (validOrError === false) {
          resolve(false)
        } else if (validOrError instanceof Error) {
          reject(validOrError)
        } else if (
          validOrError !== undefined &&
          validOrError !== null &&
          typeof validOrError === 'object'
        ) {
          resolve(validOrError as RouteLocationRaw)
        } else {
          resolve()
        }
      } as NavigationGuardNext

      const result = guard(to, from, next)

      // Support both callback and return value styles
      if (result !== undefined) {
        if (result instanceof Promise) {
          result.then(function (val) {
            if (val !== undefined) resolve(val)
          }, reject)
        } else {
          if (result instanceof Error) {
            reject(result)
          } else if (result === false) {
            resolve(false)
          } else if (
            result !== true &&
            result !== undefined &&
            result !== null
          ) {
            resolve(result as NavigationGuardReturn)
          } else {
            resolve()
          }
        }
      }
    }).then(function (result) {
      if (result !== undefined) {
        return result
      }
      return runNext()
    })
  }

  return runNext()
}

export function createRouter(options: RouterOptions): Router {
  const { history, routes, strict = false, sensitive = false } = options
  const matcher = createRouterMatcher(routes, strict, sensitive)

  const currentRouteSignal = signal<RouteLocationNormalized>(START_ROUTE)

  const beforeGuards: NavigationGuard[] = []
  const resolveGuards: NavigationGuard[] = []
  const afterGuards: PostNavigationGuard[] = []
  const errorHandlers: ErrorHandler[] = []

  let pendingNavigationAbort: (() => void) | null = null
  let ready = false
  let readyHandlers: Array<() => void> = []

  function removeFromList<T>(list: T[], item: T): () => void {
    return function () {
      const idx = list.indexOf(item)
      if (idx > -1) list.splice(idx, 1)
    }
  }

  function triggerError(
    err: any,
    to: RouteLocationNormalized,
    from: RouteLocationNormalized,
  ): void {
    for (let i = 0; i < errorHandlers.length; i++) {
      errorHandlers[i](err, to, from)
    }
    if (!errorHandlers.length) {
      throw err
    }
  }

  function finalizeNavigation(
    to: RouteLocationNormalized,
    from: RouteLocationNormalized,
    replace: boolean,
  ): void {
    const toPath = to.fullPath

    if (replace || from === START_ROUTE) {
      history.replace(toPath)
    } else {
      history.push(toPath)
    }

    currentRouteSignal(to)

    if (!ready) {
      ready = true
      for (let i = 0; i < readyHandlers.length; i++) {
        readyHandlers[i]()
      }
      readyHandlers = []
    }
  }

  function navigate(
    to: RouteLocationNormalized,
    from: RouteLocationNormalized,
  ): Promise<NavigationFailure | void> {
    // Collect guards from matched records
    const leaveGuards: NavigationGuard[] = []
    const enterGuards: NavigationGuard[] = []

    const fromMatched = from.matched
    const toMatched = to.matched

    for (let i = 0; i < fromMatched.length; i++) {
      const record = fromMatched[i]
      // Only add leave guards for records not in the "to" route
      let isLeaving = true
      for (let j = 0; j < toMatched.length; j++) {
        if (toMatched[j] === record) {
          isLeaving = false
          break
        }
      }
      if (isLeaving && record.beforeEnter) {
        for (let k = 0; k < record.beforeEnter.length; k++) {
          leaveGuards.push(record.beforeEnter[k])
        }
      }
    }

    for (let i = 0; i < toMatched.length; i++) {
      const record = toMatched[i]
      for (let j = 0; j < record.beforeEnter.length; j++) {
        enterGuards.push(record.beforeEnter[j])
      }
    }

    const allGuards = (beforeGuards as NavigationGuard[])
      .concat(leaveGuards)
      .concat(enterGuards)
      .concat(resolveGuards as NavigationGuard[])

    return runGuardsSequentially(allGuards, to, from).then(function (result) {
      if (result === false) {
        return createNavigationFailure('aborted', to, from)
      }

      if (
        result !== undefined &&
        result !== null &&
        typeof result === 'object' &&
        !isNavigationFailure(result)
      ) {
        return push(result as RouteLocationRaw).then(function () {
          return createNavigationFailure('redirected', to, from)
        })
      }

      return undefined
    })
  }

  function pushWithRedirect(
    to: RouteLocationNormalized,
    replace: boolean,
  ): Promise<NavigationFailure | void> {
    const from = currentRouteSignal()

    // Handle redirect on the matched record
    if (to.matched.length > 0) {
      const record = to.matched[0]
      if (record.redirect) {
        let redirectTarget = record.redirect
        if (typeof redirectTarget === 'function') {
          redirectTarget = redirectTarget(to)
        }
        return push(redirectTarget)
      }
    }

    // Duplicated navigation
    if (
      to.fullPath === from.fullPath &&
      to.hash === from.hash &&
      to.matched.length === from.matched.length
    ) {
      return Promise.resolve(createNavigationFailure('duplicated', to, from))
    }

    // Cancel any previous pending navigation
    if (pendingNavigationAbort) {
      pendingNavigationAbort()
      pendingNavigationAbort = null
    }

    let aborted = false
    pendingNavigationAbort = function () {
      aborted = true
    }

    return navigate(to, from)
      .then(function (failure) {
        if (aborted) {
          return createNavigationFailure('cancelled', to, from)
        }

        pendingNavigationAbort = null

        if (failure) {
          if (!isNavigationFailure(failure) || failure.type !== 'redirected') {
            // Push to history only if not a redirect (redirect handles its own push)
            finalizeNavigation(to, from, replace)
          }
          return failure
        }

        finalizeNavigation(to, from, replace)

        // Run after guards
        for (let i = 0; i < afterGuards.length; i++) {
          afterGuards[i](to, from, undefined)
        }

        return undefined
      })
      .catch(function (err) {
        triggerError(err, to, from)
        throw err
      })
  }

  function push(
    location: RouteLocationRaw | string,
  ): Promise<NavigationFailure | void> {
    const from = currentRouteSignal()
    const to = matcher.resolve(location, from)
    const replace = typeof location === 'object' && location.replace === true
    return pushWithRedirect(to, replace)
  }

  function replace(
    location: RouteLocationRaw | string,
  ): Promise<NavigationFailure | void> {
    if (typeof location === 'string') {
      return pushWithRedirect(
        matcher.resolve(location, currentRouteSignal()),
        true,
      )
    }
    const withReplace = Object.assign({}, location, { replace: true })
    return push(withReplace)
  }

  // Listen to history changes (browser back/forward buttons)
  history.listen(function (to: string) {
    const from = currentRouteSignal()
    const toRoute = matcher.resolve(to, from)

    navigate(toRoute, from).then(function (failure) {
      if (!failure) {
        currentRouteSignal(toRoute)
        for (let i = 0; i < afterGuards.length; i++) {
          afterGuards[i](toRoute, from, undefined)
        }
      }
    })
  })

  const router: Router = {
    get currentRoute() {
      return currentRouteSignal()
    },

    get options() {
      return options
    },

    push,
    replace,

    go(delta: number): void {
      history.go(delta)
    },

    back(): void {
      history.go(-1)
    },

    forward(): void {
      history.go(1)
    },

    beforeEach(guard: NavigationGuard): () => void {
      beforeGuards.push(guard)
      return removeFromList(beforeGuards, guard)
    },

    afterEach(guard: PostNavigationGuard): () => void {
      afterGuards.push(guard)
      return removeFromList(afterGuards, guard)
    },

    beforeResolve(guard: NavigationGuard): () => void {
      resolveGuards.push(guard)
      return removeFromList(resolveGuards, guard)
    },

    onError(handler: ErrorHandler): () => void {
      errorHandlers.push(handler)
      return removeFromList(errorHandlers, handler)
    },

    resolve(location: RouteLocationRaw | string): RouteLocationNormalized {
      return matcher.resolve(location, currentRouteSignal())
    },

    addRoute(record: RouteRecordRaw): () => void {
      return matcher.addRoute(record)
    },

    removeRoute(name: string | symbol): void {
      matcher.removeRoute(name)
    },

    hasRoute(name: string | symbol): boolean {
      return matcher.hasRoute(name)
    },

    getRoutes(): RouteRecordNormalized[] {
      return matcher.getRoutes()
    },

    install(_app: any): void {
      setCurrentRouter(router)

      // Perform initial navigation
      const initialLocation = history.location
      const initialRoute = matcher.resolve(initialLocation, START_ROUTE)
      pushWithRedirect(initialRoute, true)
    },
  }

  // Export a computed for reading current route reactively
  ;(router as any)._currentRouteComputed = computed(function () {
    return currentRouteSignal()
  })

  return router
}

// Module-level active router for useRouter/useRoute
let _currentRouter: Router | null = null

export function setCurrentRouter(router: Router): void {
  _currentRouter = router
}

export function getCurrentRouter(): Router | null {
  return _currentRouter
}
