import type {
  NavigationGuard,
  RouteComponent,
  RouteLocationNormalized,
  RouteLocationRaw,
  RouteParams,
  RouteParamsRaw,
  RouteQuery,
  RouteRecordNormalized,
  RouteRecordRaw,
  RouteRecordSingleView,
} from './types'

export interface RouterMatcher {
  resolve(
    location: string | RouteLocationRaw,
    currentRoute: RouteLocationNormalized,
  ): RouteLocationNormalized
  addRoute(record: RouteRecordRaw, parentPath?: string): () => void
  removeRoute(name: string | symbol): void
  hasRoute(name: string | symbol): boolean
  getRoutes(): RouteRecordNormalized[]
}

interface PathToken {
  type: 'static' | 'param' | 'wildcard'
  value: string
}

function tokenizePath(path: string): PathToken[] {
  const tokens: PathToken[] = []
  const segments = path.split('/')

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i]
    if (!segment) continue

    if (segment.charAt(0) === ':') {
      tokens.push({ type: 'param', value: segment.slice(1) })
    } else if (segment === '*') {
      tokens.push({ type: 'wildcard', value: '*' })
    } else {
      tokens.push({ type: 'static', value: segment })
    }
  }

  return tokens
}

function pathToRegex(
  path: string,
  strict: boolean,
  sensitive: boolean,
): { regex: RegExp; keys: string[] } {
  const keys: string[] = []
  const tokens = tokenizePath(path)
  let pattern = '^'

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    pattern += '\\/'

    if (token.type === 'static') {
      pattern += token.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    } else if (token.type === 'param') {
      keys.push(token.value)
      pattern += '([^/]+)'
    } else if (token.type === 'wildcard') {
      keys.push('*')
      pattern += '(.*)'
    }
  }

  // Root path special case
  if (pattern === '^') {
    pattern += '\\/'
  }

  pattern += strict ? '$' : '\\/?$'

  const flags = sensitive ? '' : 'i'
  return { regex: new RegExp(pattern, flags), keys }
}

function normalizeGuards(
  guard?: NavigationGuard | NavigationGuard[],
): NavigationGuard[] {
  if (!guard) return []
  return Array.isArray(guard) ? guard : [guard]
}

function normalizeComponents(
  record: RouteRecordRaw,
): Record<string, RouteComponent> {
  if ('component' in record && record.component) {
    return { default: record.component as RouteComponent }
  }
  if ('components' in record && record.components) {
    return record.components as Record<string, RouteComponent>
  }
  // Redirect records have no components
  return {}
}

function normalizeRecord(
  record: RouteRecordRaw,
  parentPath: string,
  strict: boolean,
  sensitive: boolean,
): RouteRecordNormalized {
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

export function parseQuery(search: string): RouteQuery {
  const query: RouteQuery = {}
  if (!search || search === '?') return query

  const str = search.charAt(0) === '?' ? search.slice(1) : search
  const pairs = str.split('&')

  for (let i = 0; i < pairs.length; i++) {
    const pair = pairs[i]
    if (!pair) continue

    const eqIdx = pair.indexOf('=')
    const key = decodeURIComponent(eqIdx < 0 ? pair : pair.slice(0, eqIdx))
    const value = eqIdx < 0 ? null : decodeURIComponent(pair.slice(eqIdx + 1))

    const existing = query[key]
    if (existing !== undefined) {
      if (Array.isArray(existing)) {
        ;(existing as string[]).push(value as string)
      } else {
        query[key] = [existing as string, value as string]
      }
    } else {
      query[key] = value
    }
  }

  return query
}

export function stringifyQuery(query: RouteQuery): string {
  let search = ''
  const keys = Object.keys(query)

  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const value = query[key]
    const encodedKey = encodeURIComponent(key)
    const sep = search ? '&' : '?'

    if (value === null) {
      search += sep + encodedKey
    } else if (Array.isArray(value)) {
      for (let j = 0; j < value.length; j++) {
        search += sep + encodedKey + '=' + encodeURIComponent(value[j] || '')
      }
    } else if (value !== undefined) {
      search += sep + encodedKey + '=' + encodeURIComponent(value)
    }
  }

  return search
}

function parsePath(fullPath: string): {
  path: string
  query: RouteQuery
  hash: string
} {
  let path = fullPath
  let query: RouteQuery = {}
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

  return { path, query, hash }
}

function buildPathFromParams(
  recordPath: string,
  rawParams: RouteParamsRaw,
): { path: string; params: RouteParams } {
  const params: RouteParams = {}
  let path = recordPath

  const keys = Object.keys(rawParams)
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i]
    const val = rawParams[key]
    const strVal = Array.isArray(val) ? val.map(String).join('/') : String(val)
    params[key] = strVal
    path = path.replace(':' + key, encodeURIComponent(strVal))
  }

  return { path, params }
}

const EMPTY_ROUTE: RouteLocationNormalized = {
  path: '/',
  fullPath: '/',
  hash: '',
  query: {},
  params: {},
  matched: [],
  meta: {},
}

export function createRouterMatcher(
  routes: RouteRecordRaw[],
  strict: boolean = false,
  sensitive: boolean = false,
): RouterMatcher {
  const matchers: RouteRecordNormalized[] = []
  const namedMap = new Map<string | symbol, RouteRecordNormalized>()

  function insertMatcher(record: RouteRecordNormalized): void {
    matchers.push(record)
    if (record.name) {
      namedMap.set(record.name, record)
    }
  }

  function addRoute(
    record: RouteRecordRaw,
    parentPath: string = '',
  ): () => void {
    const normalized = normalizeRecord(record, parentPath, strict, sensitive)
    insertMatcher(normalized)

    const children = (record as RouteRecordSingleView).children
    if (children) {
      for (let i = 0; i < children.length; i++) {
        addRoute(children[i], normalized.path)
      }
    }

    return function () {
      if (normalized.name) {
        removeRoute(normalized.name)
      } else {
        const idx = matchers.indexOf(normalized)
        if (idx > -1) matchers.splice(idx, 1)
      }
    }
  }

  function removeRoute(name: string | symbol): void {
    const record = namedMap.get(name)
    if (!record) return
    namedMap.delete(name)
    const idx = matchers.indexOf(record)
    if (idx > -1) matchers.splice(idx, 1)
  }

  function hasRoute(name: string | symbol): boolean {
    return namedMap.has(name)
  }

  function matchByPath(path: string): {
    record: RouteRecordNormalized
    params: RouteParams
  } | null {
    for (let i = 0; i < matchers.length; i++) {
      const record = matchers[i]
      const match = path.match(record.regex)
      if (match) {
        const params: RouteParams = {}
        for (let j = 0; j < record.keys.length; j++) {
          const raw = match[j + 1]
          params[record.keys[j]] = raw ? decodeURIComponent(raw) : ''
        }
        return { record, params }
      }
    }
    return null
  }

  function resolveByPath(rawPath: string): RouteLocationNormalized {
    const { path, query, hash } = parsePath(rawPath)
    const matchResult = matchByPath(path)

    if (!matchResult) {
      return {
        path,
        fullPath: rawPath,
        hash,
        query,
        params: {},
        matched: [],
        meta: {},
      }
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

  function resolveByName(
    name: string | symbol,
    rawParams: RouteParamsRaw,
    rawQuery: RouteQuery,
    hash: string,
  ): RouteLocationNormalized {
    const record = namedMap.get(name)
    if (!record) {
      throw new Error(
        'Router: No match found for route with name "' + String(name) + '"',
      )
    }

    const { path, params } = buildPathFromParams(record.path, rawParams)
    const fullPath = path + stringifyQuery(rawQuery) + hash

    return {
      path,
      fullPath,
      hash,
      query: rawQuery,
      params,
      name: record.name,
      matched: [record],
      meta: record.meta,
    }
  }

  function resolve(
    location: string | RouteLocationRaw,
    _currentRoute: RouteLocationNormalized,
  ): RouteLocationNormalized {
    if (typeof location === 'string') {
      return resolveByPath(location)
    }

    if (location.name) {
      return resolveByName(
        location.name,
        location.params || {},
        location.query || {},
        location.hash || '',
      )
    }

    if (location.path) {
      const qs = stringifyQuery(location.query || {})
      const hash = location.hash || ''
      return resolveByPath(location.path + qs + hash)
    }

    return EMPTY_ROUTE
  }

  for (let i = 0; i < routes.length; i++) {
    addRoute(routes[i])
  }

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
