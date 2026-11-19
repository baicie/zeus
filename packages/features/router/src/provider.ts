import { createComponent, provide } from '@zeus-js/runtime-dom'

import { RouterContext } from './context'
import { Outlet } from './outlet'

import type { ZeusRouter } from './types'
import type { JSXValue } from '@zeus-js/runtime-dom'

export interface RouterProviderProps {
  /** Router created by `createRouter()`. */
  router: ZeusRouter
  /** Router tree. Defaults to the root `<Outlet />` when omitted. */
  children?: JSXValue | (() => JSXValue)
}

/**
 * Provides the router to the component subtree and renders its children.
 * The provider initializes once; state changes only update bindings below it.
 */
export function RouterProvider(props: RouterProviderProps): JSXValue {
  provide(RouterContext, props.router)

  if (props.children === undefined) {
    return createComponent(Outlet, {})
  }

  return typeof props.children === 'function'
    ? props.children()
    : props.children
}
