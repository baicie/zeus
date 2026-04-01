const __vite__mapDeps = (
  i,
  m = __vite__mapDeps,
  d = m.f ||
    (m.f = [
      'assets/HomeView-CuQYAh5P.js',
      'assets/zeus.runtime.esm-bundler-CPcLlFIZ.js',
      'assets/CounterView-CfSmfPWg.js',
      'assets/ConditionalView-BR5WNv8v.js',
      'assets/ListView-C7S-6o0N.js',
      'assets/BindingView-8vrQCfGd.js',
      'assets/ComputedView-BxAsAs2W.js',
      'assets/LifecycleView-BPWafzrx.js',
      'assets/RefView-BNtxRhni.js',
      'assets/BuiltinView-DpkKdMbe.js',
      'assets/BuiltinView-BVcGrIoI.css',
    ]),
) => i.map(i => d[i])
import {
  _ as effect,
  f as template,
  g as computed,
  l as insert,
  t as createApp,
  v as setActiveSub,
  y as signal,
} from './dist/assets/zeus.runtime.esm-bundler-CPcLlFIZ.js'
//#region \0vite/modulepreload-polyfill.js
;(function polyfill() {
  const relList = document.createElement('link').relList
  if (relList && relList.supports && relList.supports('modulepreload')) return
  for (const link of document.querySelectorAll('link[rel="modulepreload"]'))
    processPreload(link)
  new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (mutation.type !== 'childList') continue
      for (const node of mutation.addedNodes)
        if (node.tagName === 'LINK' && node.rel === 'modulepreload')
          processPreload(node)
    }
  }).observe(document, {
    childList: true,
    subtree: true,
  })
  function getFetchOpts(link) {
    const fetchOpts = {}
    if (link.integrity) fetchOpts.integrity = link.integrity
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy
    if (link.crossOrigin === 'use-credentials')
      fetchOpts.credentials = 'include'
    else if (link.crossOrigin === 'anonymous') fetchOpts.credentials = 'omit'
    else fetchOpts.credentials = 'same-origin'
    return fetchOpts
  }
  function processPreload(link) {
    if (link.ep) return
    link.ep = true
    const fetchOpts = getFetchOpts(link)
    fetch(link.href, fetchOpts)
  }
})()
//#endregion
//#region ../../addons/router/dist/router.mjs
/**
 * @zeus-js/router vundefined
 * (c) 2026 baicie
 * Released under the MIT License.
 **/
function tokenizePath(path) {
  const tokens = []
  const segments = path.split('/')
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (!segment) continue
    if (segment.charAt(0) === ':')
      tokens.push({
        type: 'param',
        value: segment.slice(1),
      })
    else if (segment === '*')
      tokens.push({
        type: 'wildcard',
        value: '*',
      })
    else
      tokens.push({
        type: 'static',
        value: segment,
      })
  }
  return tokens
}
function pathToRegex(path, strict, sensitive) {
  const keys = []
  const tokens = tokenizePath(path)
  let pattern = '^'
  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    pattern += '\\/'
    if (token.type === 'static')
      pattern += token.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    else if (token.type === 'param') {
      keys.push(token.value)
      pattern += '([^/]+)'
    } else if (token.type === 'wildcard') {
      keys.push('*')
      pattern += '(.*)'
    }
  }
  if (pattern === '^') pattern += '\\/'
  pattern += strict ? '$' : '\\/?$'
  const flags = sensitive ? '' : 'i'
  return {
    regex: new RegExp(pattern, flags),
    keys,
  }
}
function normalizeGuards(guard) {
  if (!guard) return []
  return Array.isArray(guard) ? guard : [guard]
}
function normalizeComponents(record) {
  if ('component' in record && record.component)
    return { default: record.component }
  if ('components' in record && record.components) return record.components
  return {}
}
function normalizeRecord(record, parentPath, strict, sensitive) {
  const fullPath = parentPath
    ? parentPath.replace(/\/$/, '') + '/' + record.path.replace(/^\//, '')
    : record.path
  const { regex, keys } = pathToRegex(fullPath, strict, sensitive)
  return {
    path: fullPath,
    name: record.name,
    meta: record.meta || {},
    components: normalizeComponents(record),
    beforeEnter: normalizeGuards(record.beforeEnter),
    regex,
    keys,
    children: [],
    redirect: record.redirect,
  }
}
function parseQuery(search) {
  const query = {}
  if (!search || search === '?') return query
  const pairs = (search.charAt(0) === '?' ? search.slice(1) : search).split('&')
  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]
    if (!pair) continue
    const eqIdx = pair.indexOf('=')
    const key = decodeURIComponent(eqIdx < 0 ? pair : pair.slice(0, eqIdx))
    const value = eqIdx < 0 ? null : decodeURIComponent(pair.slice(eqIdx + 1))
    const existing = query[key]
    if (existing !== void 0)
      if (Array.isArray(existing)) existing.push(value)
      else query[key] = [existing, value]
    else query[key] = value
  }
  return query
}
function stringifyQuery(query) {
  let search = ''
  const keys = Object.keys(query)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const value = query[key]
    const encodedKey = encodeURIComponent(key)
    const sep = search ? '&' : '?'
    if (value === null) search += sep + encodedKey
    else if (Array.isArray(value))
      for (let j = 0; j < value.length; j++)
        search += sep + encodedKey + '=' + encodeURIComponent(value[j] || '')
    else if (value !== void 0)
      search += sep + encodedKey + '=' + encodeURIComponent(value)
  }
  return search
}
function parsePath(fullPath) {
  let path = fullPath
  let query = {}
  let hash = ''
  const hashIdx = fullPath.indexOf('#')
  if (hashIdx > -1) {
    hash = fullPath.slice(hashIdx)
    path = fullPath.slice(0, hashIdx)
  }
  const queryIdx = path.indexOf('?')
  if (queryIdx > -1) {
    query = parseQuery(path.slice(queryIdx))
    path = path.slice(0, queryIdx)
  }
  return {
    path,
    query,
    hash,
  }
}
function buildPathFromParams(recordPath, rawParams) {
  const params = {}
  let path = recordPath
  const keys = Object.keys(rawParams)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const val = rawParams[key]
    const strVal = Array.isArray(val) ? val.map(String).join('/') : String(val)
    params[key] = strVal
    path = path.replace(':' + key, encodeURIComponent(strVal))
  }
  return {
    path,
    params,
  }
}
var EMPTY_ROUTE = {
  path: '/',
  fullPath: '/',
  hash: '',
  query: {},
  params: {},
  matched: [],
  meta: {},
}
function createRouterMatcher(routes, strict = false, sensitive = false) {
  const matchers = []
  const namedMap = /* @__PURE__ */ new Map()
  function insertMatcher(record) {
    matchers.push(record)
    if (record.name) namedMap.set(record.name, record)
  }
  function addRoute(record, parentPath = '') {
    const normalized = normalizeRecord(record, parentPath, strict, sensitive)
    insertMatcher(normalized)
    const children = record.children
    if (children)
      for (let i = 0; i < children.length; i++)
        addRoute(children[i], normalized.path)
    return function () {
      if (normalized.name) removeRoute(normalized.name)
      else {
        const idx = matchers.indexOf(normalized)
        if (idx > -1) matchers.splice(idx, 1)
      }
    }
  }
  function removeRoute(name) {
    const record = namedMap.get(name)
    if (!record) return
    namedMap.delete(name)
    const idx = matchers.indexOf(record)
    if (idx > -1) matchers.splice(idx, 1)
  }
  function hasRoute(name) {
    return namedMap.has(name)
  }
  function matchByPath(path) {
    for (let i = 0; i < matchers.length; i++) {
      const record = matchers[i]
      const match = path.match(record.regex)
      if (match) {
        const params = {}
        for (let j = 0; j < record.keys.length; j++) {
          const raw = match[j + 1]
          params[record.keys[j]] = raw ? decodeURIComponent(raw) : ''
        }
        return {
          record,
          params,
        }
      }
    }
    return null
  }
  function resolveByPath(rawPath) {
    const { path, query, hash } = parsePath(rawPath)
    const matchResult = matchByPath(path)
    if (!matchResult)
      return {
        path,
        fullPath: rawPath,
        hash,
        query,
        params: {},
        matched: [],
        meta: {},
      }
    const { record, params } = matchResult
    return {
      path,
      fullPath: rawPath,
      hash,
      query,
      params,
      name: record.name,
      matched: [record],
      meta: record.meta,
    }
  }
  function resolveByName(name, rawParams, rawQuery, hash) {
    const record = namedMap.get(name)
    if (!record)
      throw new Error(
        'Router: No match found for route with name "' + String(name) + '"',
      )
    const { path, params } = buildPathFromParams(record.path, rawParams)
    return {
      path,
      fullPath: path + stringifyQuery(rawQuery) + hash,
      hash,
      query: rawQuery,
      params,
      name: record.name,
      matched: [record],
      meta: record.meta,
    }
  }
  function resolve(location, _currentRoute) {
    if (typeof location === 'string') return resolveByPath(location)
    if (location.name)
      return resolveByName(
        location.name,
        location.params || {},
        location.query || {},
        location.hash || '',
      )
    if (location.path) {
      const qs = stringifyQuery(location.query || {})
      const hash = location.hash || ''
      return resolveByPath(location.path + qs + hash)
    }
    return EMPTY_ROUTE
  }
  for (let i = 0; i < routes.length; i++) addRoute(routes[i])
  return {
    resolve,
    addRoute,
    removeRoute,
    hasRoute,
    getRoutes: function () {
      return matchers.slice()
    },
  }
}
var START_ROUTE = {
  path: '/',
  fullPath: '/',
  hash: '',
  query: {},
  params: {},
  matched: [],
  meta: {},
}
function createNavigationFailure(type, to, from, message) {
  const error = new Error(message || 'Navigation ' + type + ': ' + to.fullPath)
  error.type = type
  error.to = to
  error.from = from
  return error
}
function isNavigationFailure(value) {
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
function runGuardsSequentially(guards, to, from) {
  let index = 0
  function runNext() {
    if (index >= guards.length) return Promise.resolve()
    const guard = guards[index++]
    return new Promise(function (resolve, reject) {
      const next = function (validOrError) {
        if (validOrError === false) resolve(false)
        else if (validOrError instanceof Error) reject(validOrError)
        else if (
          validOrError !== void 0 &&
          validOrError !== null &&
          typeof validOrError === 'object'
        )
          resolve(validOrError)
        else resolve()
      }
      const result = guard(to, from, next)
      if (result !== void 0)
        if (result instanceof Promise)
          result.then(function (val) {
            if (val !== void 0) resolve(val)
          }, reject)
        else if (result instanceof Error) reject(result)
        else if (result === false) resolve(false)
        else if (result !== true && result !== void 0 && result !== null)
          resolve(result)
        else resolve()
    }).then(function (result) {
      if (result !== void 0) return result
      return runNext()
    })
  }
  return runNext()
}
function createRouter(options) {
  const { history, routes, strict = false, sensitive = false } = options
  const matcher = createRouterMatcher(routes, strict, sensitive)
  const currentRouteSignal = signal(START_ROUTE)
  const beforeGuards = []
  const resolveGuards = []
  const afterGuards = []
  const errorHandlers = []
  let pendingNavigationAbort = null
  let ready = false
  let readyHandlers = []
  function removeFromList(list, item) {
    return function () {
      const idx = list.indexOf(item)
      if (idx > -1) list.splice(idx, 1)
    }
  }
  function triggerError(err, to, from) {
    for (let i = 0; i < errorHandlers.length; i++)
      errorHandlers[i](err, to, from)
    if (!errorHandlers.length) throw err
  }
  function finalizeNavigation(to, from, replace) {
    const toPath = to.fullPath
    if (replace || from === START_ROUTE) history.replace(toPath)
    else history.push(toPath)
    currentRouteSignal(to)
    if (!ready) {
      ready = true
      for (let i = 0; i < readyHandlers.length; i++) readyHandlers[i]()
      readyHandlers = []
    }
  }
  function navigate(to, from) {
    const leaveGuards = []
    const enterGuards = []
    const fromMatched = from.matched
    const toMatched = to.matched
    for (let i = 0; i < fromMatched.length; i++) {
      const record = fromMatched[i]
      let isLeaving = true
      for (let j = 0; j < toMatched.length; j++)
        if (toMatched[j] === record) {
          isLeaving = false
          break
        }
      if (isLeaving && record.beforeEnter)
        for (let k = 0; k < record.beforeEnter.length; k++)
          leaveGuards.push(record.beforeEnter[k])
    }
    for (let i = 0; i < toMatched.length; i++) {
      const record = toMatched[i]
      for (let j = 0; j < record.beforeEnter.length; j++)
        enterGuards.push(record.beforeEnter[j])
    }
    return runGuardsSequentially(
      beforeGuards
        .concat(leaveGuards)
        .concat(enterGuards)
        .concat(resolveGuards),
      to,
      from,
    ).then(function (result) {
      if (result === false) return createNavigationFailure('aborted', to, from)
      if (
        result !== void 0 &&
        result !== null &&
        typeof result === 'object' &&
        !isNavigationFailure(result)
      )
        return push(result).then(function () {
          return createNavigationFailure('redirected', to, from)
        })
    })
  }
  function pushWithRedirect(to, replace) {
    const from = currentRouteSignal()
    if (to.matched.length > 0) {
      const record = to.matched[0]
      if (record.redirect) {
        let redirectTarget = record.redirect
        if (typeof redirectTarget === 'function')
          redirectTarget = redirectTarget(to)
        return push(redirectTarget)
      }
    }
    if (
      to.fullPath === from.fullPath &&
      to.hash === from.hash &&
      to.matched.length === from.matched.length
    )
      return Promise.resolve(createNavigationFailure('duplicated', to, from))
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
        if (aborted) return createNavigationFailure('cancelled', to, from)
        pendingNavigationAbort = null
        if (failure) {
          if (!isNavigationFailure(failure) || failure.type !== 'redirected')
            finalizeNavigation(to, from, replace)
          return failure
        }
        finalizeNavigation(to, from, replace)
        for (let i = 0; i < afterGuards.length; i++)
          afterGuards[i](to, from, void 0)
      })
      .catch(function (err) {
        triggerError(err, to, from)
        throw err
      })
  }
  function push(location) {
    const from = currentRouteSignal()
    return pushWithRedirect(
      matcher.resolve(location, from),
      typeof location === 'object' && location.replace === true,
    )
  }
  function replace(location) {
    if (typeof location === 'string')
      return pushWithRedirect(
        matcher.resolve(location, currentRouteSignal()),
        true,
      )
    return push(Object.assign({}, location, { replace: true }))
  }
  history.listen(function (to) {
    const from = currentRouteSignal()
    const toRoute = matcher.resolve(to, from)
    navigate(toRoute, from).then(function (failure) {
      if (!failure) {
        currentRouteSignal(toRoute)
        for (let i = 0; i < afterGuards.length; i++)
          afterGuards[i](toRoute, from, void 0)
      }
    })
  })
  const router = {
    get currentRoute() {
      return currentRouteSignal()
    },
    get options() {
      return options
    },
    push,
    replace,
    go(delta) {
      history.go(delta)
    },
    back() {
      history.go(-1)
    },
    forward() {
      history.go(1)
    },
    beforeEach(guard) {
      beforeGuards.push(guard)
      return removeFromList(beforeGuards, guard)
    },
    afterEach(guard) {
      afterGuards.push(guard)
      return removeFromList(afterGuards, guard)
    },
    beforeResolve(guard) {
      resolveGuards.push(guard)
      return removeFromList(resolveGuards, guard)
    },
    onError(handler) {
      errorHandlers.push(handler)
      return removeFromList(errorHandlers, handler)
    },
    resolve(location) {
      return matcher.resolve(location, currentRouteSignal())
    },
    addRoute(record) {
      return matcher.addRoute(record)
    },
    removeRoute(name) {
      matcher.removeRoute(name)
    },
    hasRoute(name) {
      return matcher.hasRoute(name)
    },
    getRoutes() {
      return matcher.getRoutes()
    },
    install(_app) {
      setCurrentRouter(router)
      const initialLocation = history.location
      pushWithRedirect(matcher.resolve(initialLocation, START_ROUTE), true)
    },
  }
  router._currentRouteComputed = computed(function () {
    return currentRouteSignal()
  })
  return router
}
var _currentRouter = null
function setCurrentRouter(router) {
  _currentRouter = router
}
function getCurrentRouter() {
  return _currentRouter
}
function normalizeBase(base) {
  if (!base) return ''
  const normalized =
    base.charAt(base.length - 1) === '/' ? base.slice(0, -1) : base
  return normalized === '/' ? '' : normalized
}
function removeListeners(listeners, callback) {
  const idx = listeners.indexOf(callback)
  if (idx > -1) listeners.splice(idx, 1)
}
/**
 * Hash-based router history.
 * Uses window.location.hash and listens to hashchange events.
 */
function createWebHashHistory(base = '') {
  const normalizedBase = normalizeBase(base)
  const listeners = []
  function getHashLocation() {
    return window.location.hash.slice(1) || '/'
  }
  let currentLocation = getHashLocation()
  function handleHashChange() {
    const to = getHashLocation()
    const from = currentLocation
    currentLocation = to
    for (let i = 0; i < listeners.length; i++)
      listeners[i](to, from, {
        direction: '',
        delta: 0,
      })
  }
  window.addEventListener('hashchange', handleHashChange)
  return {
    get base() {
      return normalizedBase
    },
    get location() {
      return currentLocation
    },
    push(to) {
      window.location.hash = to
      currentLocation = to
    },
    replace(to) {
      const url = window.location.href.replace(/#.*$/, '') + '#' + to
      window.history.replaceState(null, '', url)
      currentLocation = to
    },
    go(delta) {
      window.history.go(delta)
    },
    listen(callback) {
      listeners.push(callback)
      return function () {
        removeListeners(listeners, callback)
      }
    },
    createHref(location) {
      return '#' + location
    },
    destroy() {
      window.removeEventListener('hashchange', handleHashChange)
    },
  }
}
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
function RouterView(props) {
  const name = props && props.name ? props.name : 'default'
  const container = document.createDocumentFragment()
  const anchor = document.createComment('router-view')
  container.appendChild(anchor)
  let currentNode = null
  let disposeEffect = null
  let pendingComponent = null
  const lazyContainer = document.createElement('div')
  lazyContainer.setAttribute('data-router-lazy', 'true')
  function renderComponent(component, routeParams) {
    if (currentNode && currentNode.parentNode) {
      currentNode.parentNode.removeChild(currentNode)
      currentNode = null
    }
    const prevSub = setActiveSub(void 0)
    let rendered
    try {
      rendered = component(routeParams)
    } finally {
      setActiveSub(prevSub)
    }
    if (!rendered) return
    currentNode = rendered
    if (anchor.parentNode) anchor.parentNode.insertBefore(rendered, anchor)
  }
  disposeEffect = effect(function () {
    try {
      const router = getCurrentRouter()
      if (!router) return
      const route = router.currentRoute
      const matched = route.matched
      let component = null
      for (let i = matched.length - 1; i >= 0; i--) {
        const components = matched[i].components
        if (components && components[name]) {
          component = components[name]
          break
        }
      }
      if (!component) return
      if (typeof component === 'function' && component.length === 0) {
        const lazyLoader = component
        if (pendingComponent === lazyLoader) return
        pendingComponent = lazyLoader
        if (currentNode && currentNode.parentNode) {
          currentNode.parentNode.removeChild(currentNode)
          currentNode = null
        }
        if (anchor.parentNode)
          anchor.parentNode.insertBefore(lazyContainer, anchor)
        lazyLoader()
          .then(function (loadedComponent) {
            const componentFn =
              loadedComponent && loadedComponent.default
                ? loadedComponent.default
                : loadedComponent
            const currentRoute = getCurrentRouter()
            if (currentRoute && currentRoute.currentRoute === route) {
              if (lazyContainer.parentNode)
                lazyContainer.parentNode.removeChild(lazyContainer)
            }
            return componentFn
          })
          .catch(function (error) {
            console.error('[RouterView] Failed to load lazy component:', error)
            if (lazyContainer.parentNode)
              lazyContainer.parentNode.removeChild(lazyContainer)
            return null
          })
          .then(function (componentFn) {
            if (componentFn) renderComponent(componentFn, route.params)
          })
      } else {
        pendingComponent = null
        if (lazyContainer.parentNode)
          lazyContainer.parentNode.removeChild(lazyContainer)
        renderComponent(component, route.params)
      }
    } catch (e) {
      console.error('[RouterView] Error in route effect:', e)
    }
  })
  const wrapper = document.createElement('div')
  wrapper.setAttribute('data-router-view', name)
  wrapper.appendChild(anchor)
  const observer = new MutationObserver(function (mutations) {
    for (let i = 0; i < mutations.length; i++) {
      const removedNodes = mutations[i].removedNodes
      for (let j = 0; j < removedNodes.length; j++)
        if (removedNodes[j] === wrapper) {
          if (disposeEffect) {
            disposeEffect()
            disposeEffect = null
          }
          observer.disconnect()
        }
    }
  })
  if (document.body)
    observer.observe(document.body, {
      childList: true,
      subtree: true,
    })
  return wrapper
}
//#endregion
//#region \0vite/preload-helper.js
var scriptRel = 'modulepreload'
var assetsURL = function (dep) {
  return '/' + dep
}
var seen = {}
var __vitePreload = function preload(baseModule, deps, importerUrl) {
  let promise = Promise.resolve()
  if (deps && deps.length > 0) {
    const links = document.getElementsByTagName('link')
    const cspNonceMeta = document.querySelector('meta[property=csp-nonce]')
    const cspNonce = cspNonceMeta?.nonce || cspNonceMeta?.getAttribute('nonce')
    function allSettled(promises) {
      return Promise.all(
        promises.map(p =>
          Promise.resolve(p).then(
            value => ({
              status: 'fulfilled',
              value,
            }),
            reason => ({
              status: 'rejected',
              reason,
            }),
          ),
        ),
      )
    }
    promise = allSettled(
      deps.map(dep => {
        dep = assetsURL(dep, importerUrl)
        if (dep in seen) return
        seen[dep] = true
        const isCss = dep.endsWith('.css')
        const cssSelector = isCss ? '[rel="stylesheet"]' : ''
        if (!!importerUrl)
          for (let i = links.length - 1; i >= 0; i--) {
            const link = links[i]
            if (link.href === dep && (!isCss || link.rel === 'stylesheet'))
              return
          }
        else if (document.querySelector(`link[href="${dep}"]${cssSelector}`))
          return
        const link = document.createElement('link')
        link.rel = isCss ? 'stylesheet' : scriptRel
        if (!isCss) link.as = 'script'
        link.crossOrigin = ''
        link.href = dep
        if (cspNonce) link.setAttribute('nonce', cspNonce)
        document.head.appendChild(link)
        if (isCss)
          return new Promise((res, rej) => {
            link.addEventListener('load', res)
            link.addEventListener('error', () =>
              rej(
                /* @__PURE__ */ new Error(`Unable to preload CSS for ${dep}`),
              ),
            )
          })
      }),
    )
  }
  function handlePreloadError(err) {
    const e = new Event('vite:preloadError', { cancelable: true })
    e.payload = err
    window.dispatchEvent(e)
    if (!e.defaultPrevented) throw err
  }
  return promise.then(res => {
    for (const item of res || []) {
      if (item.status !== 'rejected') continue
      handlePreloadError(item.reason)
    }
    return baseModule().catch(handlePreloadError)
  })
}
//#endregion
//#region src/router.ts
var HomeView = function () {
  return __vitePreload(
    () => import('./dist/assets/HomeView-CuQYAh5P.js'),
    __vite__mapDeps([0, 1]),
  )
}
var CounterView = function () {
  return __vitePreload(
    () => import('./dist/assets/CounterView-CfSmfPWg.js'),
    __vite__mapDeps([2, 1]),
  )
}
var ConditionalView = function () {
  return __vitePreload(
    () => import('./dist/assets/ConditionalView-BR5WNv8v.js'),
    __vite__mapDeps([3, 1]),
  )
}
var ListView = function () {
  return __vitePreload(
    () => import('./dist/assets/ListView-C7S-6o0N.js'),
    __vite__mapDeps([4, 1]),
  )
}
var BindingView = function () {
  return __vitePreload(
    () => import('./dist/assets/BindingView-8vrQCfGd.js'),
    __vite__mapDeps([5, 1]),
  )
}
var ComputedView = function () {
  return __vitePreload(
    () => import('./dist/assets/ComputedView-BxAsAs2W.js'),
    __vite__mapDeps([6, 1]),
  )
}
var LifecycleView = function () {
  return __vitePreload(
    () => import('./dist/assets/LifecycleView-BPWafzrx.js'),
    __vite__mapDeps([7, 1]),
  )
}
var RefView = function () {
  return __vitePreload(
    () => import('./dist/assets/RefView-BNtxRhni.js'),
    __vite__mapDeps([8, 1]),
  )
}
var BuiltinView = function () {
  return __vitePreload(
    () => import('./dist/assets/BuiltinView-DpkKdMbe.js'),
    __vite__mapDeps([9, 1, 10]),
  )
}
var router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/',
      component: HomeView,
    },
    {
      path: '/counter',
      component: CounterView,
    },
    {
      path: '/conditional',
      component: ConditionalView,
    },
    {
      path: '/list',
      component: ListView,
    },
    {
      path: '/binding',
      component: BindingView,
    },
    {
      path: '/computed',
      component: ComputedView,
    },
    {
      path: '/lifecycle',
      component: LifecycleView,
    },
    {
      path: '/ref',
      component: RefView,
    },
    {
      path: '/builtin',
      component: BuiltinView,
    },
  ],
})
//#endregion
//#region src/App.tsx
var _tmpl$1 = template(
  '<div class="layout"><aside class="sidebar"><div class="sidebar-brand"><h1>⚡ Zeus</h1><p>Framework Demo</p></div><div class="nav-section">Navigation</div><!></aside><main class="content"><!></main></div>',
)
var NAV_ITEMS = [
  {
    path: '/',
    icon: '🏠',
    label: 'Home',
    desc: 'Overview',
  },
  {
    path: '/counter',
    icon: '🔢',
    label: 'Counter',
    desc: 'signal()',
  },
  {
    path: '/conditional',
    icon: '🔀',
    label: 'Conditional',
    desc: 'branch rendering',
  },
  {
    path: '/list',
    icon: '📋',
    label: 'List Render',
    desc: 'array mapping',
  },
  {
    path: '/binding',
    icon: '✏️',
    label: 'Two-way Bind',
    desc: 'reactive input',
  },
  {
    path: '/computed',
    icon: '⚡',
    label: 'Computed',
    desc: 'derived state',
  },
  {
    path: '/lifecycle',
    icon: '🔄',
    label: 'Lifecycle',
    desc: 'hooks demo',
  },
  {
    path: '/ref',
    icon: '🔗',
    label: 'Ref',
    desc: 'DOM reference',
  },
  {
    path: '/builtin',
    icon: '🔧',
    label: 'Built-in',
    desc: 'Fragment, Portal...',
  },
]
function NavLink(props) {
  const a = document.createElement('a')
  a.href = '#' + props.path
  a.className = 'nav-link'
  a.innerHTML = '<span class="nav-icon">' + props.icon + '</span>' + props.label
  effect(function () {
    if (router.currentRoute.path === props.path) a.classList.add('active')
    else a.classList.remove('active')
  })
  return a
}
function App() {
  return (() => {
    const _el$ = _tmpl$1()
    const _el$1 = _el$.firstChild
    const _el$2 = _el$1.firstChild
    const _el$3 = _el$1.nextSibling
    const _el$4 = _el$2.nextSibling
    const _el$5 = _el$3.firstChild
    const _el$6 = _el$4.nextSibling
    insert(
      _el$1,
      NAV_ITEMS.map(item => NavLink(item)),
      _el$6,
    )
    insert(_el$3, RouterView, _el$5)
    return _el$
  })()
}
//#endregion
//#region src/main.ts
var app = createApp(App)
app.use(router)
app.mount('#app')
//#endregion
export { router as t }
