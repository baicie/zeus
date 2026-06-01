import { effect } from '@zeus-js/zeus'

export function setOptionalAttr(
  el: Element,
  name: string,
  value: string | number | boolean | null | undefined,
): void {
  if (value == null || value === false) {
    el.removeAttribute(name)
    return
  }

  el.setAttribute(name, value === true ? '' : String(value))
}

export function bindOptionalAttr(
  el: Element,
  name: string,
  value: () => string | number | boolean | null | undefined,
): void {
  effect(() => {
    setOptionalAttr(el, name, value())
  })
}

export function bindDomProp<T extends HTMLElement, K extends keyof T>(
  el: T,
  key: K,
  value: () => T[K],
): void {
  effect(() => {
    el[key] = value()
  })
}

export function bindBooleanProp<T extends HTMLElement, K extends keyof T>(
  el: T,
  key: K,
  value: () => boolean,
): void {
  bindDomProp(el, key, () => value() as T[K])
}
