export type PropType = StringConstructor | NumberConstructor | BooleanConstructor

export function coerceAttribute(
  raw: string | null,
  type?: PropType,
): string | number | boolean | undefined {
  if (type === Boolean) return raw !== null
  if (type === Number) return raw == null ? undefined : Number(raw)
  if (type === String) return raw ?? undefined
  return raw
}

export function coerceProperty(
  value: any,
  type?: PropType,
): string | number | boolean | undefined {
  if (type === Boolean) return Boolean(value)
  if (type === Number) return Number(value)
  if (type === String) return String(value)
  return value
}

export function reflectAttribute(
  el: HTMLElement,
  attrName: string,
  value: any,
): void {
  if (value == null || value === false) {
    el.removeAttribute(attrName)
  } else {
    el.setAttribute(attrName, String(value))
  }
}
