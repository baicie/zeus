export const Fragment = Symbol.for('zeus.fragment')

export function jsxDEV(tag: any, props: any) {
  if (tag === Fragment || (typeof tag === 'symbol' && tag === Fragment)) {
    return props.children
  }
  return tag(props)
}

export const jsx = jsxDEV
export const jsxs = jsxDEV
export const jsxDEV as FragmentFn = jsxDEV
