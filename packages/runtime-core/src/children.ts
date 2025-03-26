import { type Accessor, createMemo, untrack } from '@zeusjs/reactivity'
import { IS_DEV } from './constants'
import type { JSX } from './jsx'

export interface ChildrenReturn extends Accessor<ResolvedChildren> {
  toArray: () => ResolvedJSXElement[]
}

export type ResolvedJSXElement = Exclude<JSX.Element, JSX.ArrayElement>
export type ResolvedChildren = ResolvedJSXElement | ResolvedJSXElement[]

export function children(fn: Accessor<JSX.Element>): ChildrenReturn {
  const childrenFn = createMemo(fn)
  const memo = IS_DEV
    ? createMemo(() => resolveChildren(childrenFn()), undefined, {
        name: 'children',
      })
    : createMemo(() => resolveChildren(childrenFn()))

  ;(memo as ChildrenReturn).toArray = () => {
    const c = memo()
    return Array.isArray(c) ? c : c != null ? [c] : []
  }

  return memo as ChildrenReturn
}

function resolveChildren(
  children: JSX.Element | Accessor<any>
): ResolvedChildren {
  if (typeof children === 'function' && !children.length)
    return resolveChildren(children())

  if (Array.isArray(children)) {
    const results: any[] = []
    for (let i = 0; i < children.length; i++) {
      const result = resolveChildren(children[i])
      Array.isArray(result)
        ? results.push.apply(results, result)
        : results.push(result)
    }
    return results
  }

  return children as ResolvedChildren
}
