import { bindEvent, bindSpread, inject, insert } from '@zeus-js/runtime-dom'
import { onScopeDispose } from '@zeus-js/signal/internal'

import { RouteContext, RouterContext } from './context'
import { isAbsoluteHref, resolveAppPath, resolveHref } from './href'

import type { RouteContextValue } from './context'
import type { ZeusNavigateOptions, ZeusRouter, ZeusTo } from './types'
import type { JSXValue } from '@zeus-js/runtime-dom'

export interface LinkProps {
  /** Navigation target; resolved relative to the current route by default. */
  to: ZeusTo
  replace?: boolean
  state?: unknown
  relative?: 'route' | 'path'
  preventScrollReset?: boolean
  /** Preload the target route's loader while the link is hovered/focused. */
  preload?: 'intent' | false
  /** Defaults to `page` when the target matches the active location. */
  'aria-current'?:
    | 'page'
    | 'step'
    | 'location'
    | 'date'
    | 'time'
    | 'true'
    | 'false'
    | boolean
  [key: string]: unknown
}

const LINK_ONLY_PROPS = new Set([
  'to',
  'replace',
  'state',
  'relative',
  'preventScrollReset',
  'preload',
  'children',
])

/**
 * Renders a real anchor and drives client-side navigation for plain,
 * same-origin left clicks. All other props (class, style, data-*, events,
 * `ref`) are bound reactively through spread.
 */
export function Link(props: LinkProps): JSXValue {
  const router = inject(RouterContext, undefined)
  if (!router) {
    throw new Error(
      '[Zeus router] <Link> must be rendered inside <RouterProvider>.',
    )
  }

  const route = inject(RouteContext, undefined)
  const {
    to,
    replace,
    state,
    relative,
    preventScrollReset,
    preload,
    children,
  } = props
  const explicitCurrent = props['aria-current']

  const anchor = document.createElement('a')

  bindSpread(anchor, [
    () => {
      const attributes = passthrough(props)
      attributes.href = resolveHref(router, to, route, relative)
      attributes['aria-current'] =
        explicitCurrent ??
        (isCurrent(router, to, route, relative) ? 'page' : undefined)
      return attributes
    },
  ])

  bindEvent(
    anchor,
    'click',
    event =>
      handleClick(event as MouseEvent, router, to, {
        replace,
        state,
        relative,
        preventScrollReset,
      }),
    false,
  )

  if (preload === 'intent')
    bindIntentPreload(anchor, router, to, route, relative)

  insert(anchor, resolveChildren(children))

  return anchor
}

function passthrough(props: LinkProps): Record<string, unknown> {
  const attributes: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(props)) {
    if (!LINK_ONLY_PROPS.has(key)) attributes[key] = value
  }
  return attributes
}

function isCurrent(
  router: ZeusRouter,
  to: ZeusTo,
  route: RouteContextValue | undefined,
  relative: 'route' | 'path' | undefined,
): boolean {
  const href = resolveHref(router, to, route, relative)
  return href === `${router.pathname()}${router.search()}${router.hash()}`
}

function handleClick(
  event: MouseEvent,
  router: ZeusRouter,
  to: ZeusTo,
  options: Pick<
    ZeusNavigateOptions,
    'replace' | 'state' | 'relative' | 'preventScrollReset'
  >,
): void {
  if (event.defaultPrevented || event.button !== 0) return
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return

  const anchor = event.currentTarget as HTMLAnchorElement
  if (anchor.target && anchor.target !== '_self') return
  if (anchor.hasAttribute('download')) return
  if (isAbsoluteHref(anchor.getAttribute('href') ?? '')) return

  const target = new URL(anchor.href, window.location.href)
  if (target.origin !== window.location.origin) return

  event.preventDefault()
  void router.navigate(to, options)
}

function bindIntentPreload(
  anchor: HTMLAnchorElement,
  router: ZeusRouter,
  to: ZeusTo,
  route: RouteContextValue | undefined,
  relative: 'route' | 'path' | undefined,
): void {
  let requested = false
  const preload = (): void => {
    if (requested) return
    requested = true
    void router
      .preload(resolveAppPath(router, to, route, relative))
      .catch(() => {
        requested = false
      })
  }

  anchor.addEventListener('pointerenter', preload)
  anchor.addEventListener('focus', preload)
  onScopeDispose(() => {
    anchor.removeEventListener('pointerenter', preload)
    anchor.removeEventListener('focus', preload)
  }, true)
}

function resolveChildren(value: unknown): JSXValue {
  if (typeof value === 'function') return (value as () => JSXValue)()
  return (value ?? null) as JSXValue
}
