import { createComponent, insert, type JSXValue } from '@zeus-js/runtime-dom'

const Fragment = Symbol.for('zeus.fragment')

export { Fragment }

export function jsx(
  type:
    | string
    | typeof Fragment
    | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue {
  return createJSXNode(type, props)
}

export function jsxs(
  type:
    | string
    | typeof Fragment
    | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue {
  return createJSXNode(type, props)
}

export function jsxDEV(
  type:
    | string
    | typeof Fragment
    | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue {
  return createJSXNode(type, props)
}

function createJSXNode(
  type:
    | string
    | typeof Fragment
    | ((props: Record<string, unknown>) => JSXValue),
  props: Record<string, unknown> | null,
): JSXValue {
  if (type === Fragment) {
    return props?.children as JSXValue
  }

  if (typeof type === 'function') {
    return createComponent(
      type as (props: Record<string, unknown>) => JSXValue,
      props ?? {},
    )
  }

  if (typeof type !== 'string') {
    return null
  }

  const el = document.createElement(type)

  if (props) {
    const children = props.children as JSXValue | undefined

    for (const key of Object.keys(props)) {
      if (key === 'children') continue

      const value = props[key]

      if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value as EventListener)
      } else if (key === 'ref') {
        setFallbackRef(value, el)
      } else if (value != null && value !== false) {
        el.setAttribute(key === 'className' ? 'class' : key, String(value))
      }
    }

    if (children !== undefined) {
      insert(el, children)
    }
  }

  return el as unknown as JSXValue
}

function setFallbackRef(target: unknown, el: Element): void {
  if (target == null) return

  if (typeof target === 'function') {
    ;(target as (value: Element | null) => void)(el)
    return
  }

  if (typeof target === 'object') {
    if ('value' in target) {
      ;(target as { value: Element | null }).value = el as never
      return
    }

    if ('current' in target) {
      ;(target as { current: Element | null }).current = el as never
    }
  }
}
