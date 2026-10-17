export function assertRenderableJSXValue(value: unknown): void {
  if (typeof value === 'symbol') {
    throw new TypeError(
      'JSX children cannot contain Symbols; render a string or number explicitly.',
    )
  }

  if (isPromiseLike(value)) {
    void Promise.resolve(value).catch(() => {})
    throw new TypeError(
      'JSX children cannot contain Promises; resolve the value before rendering.',
    )
  }

  if (
    value !== null &&
    typeof value === 'object' &&
    !(typeof Node !== 'undefined' && value instanceof Node)
  ) {
    throw new TypeError(
      'JSX children must be primitives, DOM Nodes, or arrays of JSX children.',
    )
  }
}

export function assertRenderableJSXTree(value: unknown): void {
  if (typeof value === 'function') {
    throw new TypeError(
      '[Zeus runtime] JSX children cannot contain functions; call the function explicitly or pass it through a property/event binding.',
    )
  }
  if (Array.isArray(value)) {
    for (const child of value) assertRenderableJSXTree(child)
    return
  }
  assertRenderableJSXValue(value)
}

function isPromiseLike(value: unknown): value is PromiseLike<unknown> {
  return (
    (typeof value === 'object' || typeof value === 'function') &&
    value !== null &&
    typeof (value as { then?: unknown }).then === 'function'
  )
}
