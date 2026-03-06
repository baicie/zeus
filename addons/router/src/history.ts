import type { HistoryStateInfo, RouterHistory } from './types'

type HistoryListener = (
  to: string,
  from: string,
  info: HistoryStateInfo,
) => void

function normalizeBase(base: string): string {
  if (!base) return ''
  const normalized =
    base.charAt(base.length - 1) === '/' ? base.slice(0, -1) : base
  return normalized === '/' ? '' : normalized
}

function createCurrentLocation(base: string, location: Location): string {
  const { pathname, search, hash } = location
  const baseLen = base.length
  if (baseLen && pathname.toLowerCase().indexOf(base.toLowerCase()) === 0) {
    return (pathname.slice(baseLen) || '/') + search + hash
  }
  return pathname + search + hash
}

function removeListeners(
  listeners: HistoryListener[],
  callback: HistoryListener,
): void {
  const idx = listeners.indexOf(callback)
  if (idx > -1) {
    listeners.splice(idx, 1)
  }
}

/**
 * HTML5 History API based router history.
 * Uses pushState/replaceState and listens to popstate events.
 */
export function createWebHistory(base: string = ''): RouterHistory {
  const normalizedBase = normalizeBase(base)
  const listeners: HistoryListener[] = []

  let currentLocation = createCurrentLocation(normalizedBase, window.location)
  let currentPosition =
    window.history.state && window.history.state.position != null
      ? window.history.state.position
      : 0

  if (!window.history.state || window.history.state.position == null) {
    window.history.replaceState({ position: currentPosition, scroll: null }, '')
  }

  function handlePopState(event: PopStateEvent): void {
    const to = createCurrentLocation(normalizedBase, window.location)
    const from = currentLocation
    const newPosition = event.state ? event.state.position : currentPosition
    const delta = newPosition - currentPosition

    currentPosition = newPosition
    currentLocation = to

    for (let i = 0; i < listeners.length; i++) {
      listeners[i](to, from, {
        direction: delta < 0 ? 'back' : delta > 0 ? 'forward' : '',
        delta,
      })
    }
  }

  window.addEventListener('popstate', handlePopState)

  return {
    get base() {
      return normalizedBase
    },
    get location() {
      return currentLocation
    },

    push(to: string, data?: any): void {
      currentPosition++
      const state = Object.assign({}, data, {
        position: currentPosition,
        scroll: null,
      })
      window.history.pushState(state, '', normalizedBase + to)
      currentLocation = to
    },

    replace(to: string, data?: any): void {
      const state = Object.assign({}, data, {
        position: currentPosition,
        scroll: null,
      })
      window.history.replaceState(state, '', normalizedBase + to)
      currentLocation = to
    },

    go(delta: number): void {
      window.history.go(delta)
    },

    listen(callback: HistoryListener): () => void {
      listeners.push(callback)
      return function () {
        removeListeners(listeners, callback)
      }
    },

    createHref(location: string): string {
      return normalizedBase + location
    },

    destroy(): void {
      window.removeEventListener('popstate', handlePopState)
    },
  }
}

/**
 * Hash-based router history.
 * Uses window.location.hash and listens to hashchange events.
 */
export function createWebHashHistory(base: string = ''): RouterHistory {
  const normalizedBase = normalizeBase(base)
  const listeners: HistoryListener[] = []

  function getHashLocation(): string {
    const raw = window.location.hash.slice(1)
    return raw || '/'
  }

  let currentLocation = getHashLocation()

  function handleHashChange(): void {
    const to = getHashLocation()
    const from = currentLocation
    currentLocation = to

    for (let i = 0; i < listeners.length; i++) {
      listeners[i](to, from, { direction: '', delta: 0 })
    }
  }

  window.addEventListener('hashchange', handleHashChange)

  return {
    get base() {
      return normalizedBase
    },
    get location() {
      return currentLocation
    },

    push(to: string): void {
      window.location.hash = to
      currentLocation = to
    },

    replace(to: string): void {
      const url = window.location.href.replace(/#.*$/, '') + '#' + to
      window.history.replaceState(null, '', url)
      currentLocation = to
    },

    go(delta: number): void {
      window.history.go(delta)
    },

    listen(callback: HistoryListener): () => void {
      listeners.push(callback)
      return function () {
        removeListeners(listeners, callback)
      }
    },

    createHref(location: string): string {
      return '#' + location
    },

    destroy(): void {
      window.removeEventListener('hashchange', handleHashChange)
    },
  }
}

/**
 * In-memory router history for SSR or testing environments.
 */
export function createMemoryHistory(base: string = '/'): RouterHistory {
  const listeners: HistoryListener[] = []
  const queue: string[] = [base]
  let position = 0

  return {
    get base() {
      return base
    },
    get location() {
      return queue[position]
    },

    push(to: string): void {
      // Remove any forward history
      if (position < queue.length - 1) {
        queue.splice(position + 1)
      }
      queue.push(to)
      position++
    },

    replace(to: string): void {
      queue[position] = to
    },

    go(delta: number): void {
      const newPosition = position + delta
      if (newPosition < 0 || newPosition >= queue.length) return

      const from = queue[position]
      position = newPosition
      const to = queue[position]

      for (let i = 0; i < listeners.length; i++) {
        listeners[i](to, from, {
          direction: delta < 0 ? 'back' : 'forward',
          delta,
        })
      }
    },

    listen(callback: HistoryListener): () => void {
      listeners.push(callback)
      return function () {
        removeListeners(listeners, callback)
      }
    },

    createHref(location: string): string {
      return location
    },

    destroy(): void {
      // Nothing to clean up for memory history
    },
  }
}
