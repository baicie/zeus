/* eslint-disable @typescript-eslint/no-explicit-any */
export const Fragment: unique symbol = Symbol.for('zeus.fragment')

export function jsxDEV(tag: any, props: any): any {
  if (tag === Fragment || (typeof tag === 'symbol' && tag === Fragment)) {
    return props.children
  }
  return tag(props)
}

export const jsx: typeof jsxDEV = jsxDEV
export const jsxs: typeof jsxDEV = jsxDEV
export const FragmentFn = jsxDEV as unknown as () => typeof Fragment
