import {
  createComponent,
  insert,
} from '@zeus-js/runtime-dom/dist/runtime-dom.esm-bundler.js'

const Fragment = Symbol.for('zeus.fragment')

function jsx(type, props) {
  return createJSXNode(type, props)
}

function jsxs(type, props) {
  return createJSXNode(type, props)
}

function jsxDEV(type, props) {
  return createJSXNode(type, props)
}

function createJSXNode(type, props) {
  if (type === Fragment) {
    return props?.children
  }

  if (typeof type === 'function') {
    return createComponent(type, props ?? {})
  }

  if (typeof type !== 'string') {
    return null
  }

  const el = document.createElement(type)

  if (props) {
    const children = props.children

    for (const key of Object.keys(props)) {
      if (key === 'children') continue

      const value = props[key]

      if (key.startsWith('on') && typeof value === 'function') {
        el.addEventListener(key.slice(2).toLowerCase(), value)
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

  return el
}

function setFallbackRef(target, el) {
  if (target == null) return

  if (typeof target === 'function') {
    target(el)
    return
  }

  if (typeof target === 'object') {
    if ('value' in target) {
      target.value = el
      return
    }

    if ('current' in target) {
      target.current = el
    }
  }
}

export { Fragment, jsx, jsxs, jsxDEV }
