# @zeus-js/runtime-dom

DOM runtime helpers. These are primarily used by the compiler — application code should use `@zeus-js/zeus` instead.

These helpers are stable to use directly, but are not considered the primary framework API.

## render

```ts
function render(
  value: JSXValue | (() => JSXValue),
  container: Element | DocumentFragment,
  options?: RenderOptions,
): () => void
```

Mounts the component tree into the container and returns a disposer that stops
the render scope, clears the container and disposes the render's own owner.
The disposer is idempotent and reports the first cleanup error after it has
released everything, so a throwing cleanup cannot leave the subtree mounted.

`options.owner` is borrowed, not consumed: the caller keeps owning it, so
disposing one render that shares an owner does not invalidate sibling renders
that use the same owner and its provided context values. Only an owner created
inside `render` is disposed by it. When setup throws before the disposer is
returned, `render` releases the bindings and owner it created and clears the
container, then rethrows the setup error.

### Experimental automatic hydration

```ts
interface RenderOptions {
  owner?: Owner
  hydrate?: boolean
  onHydrationError?: (error: Error) => void
}
```

When `hydrate: true` is paired with a module compiled using
`autoHydrate: true`, `render` keeps the server DOM, adopts component, element,
text, event, and property markers, and preserves node identity. A live form
`value`, `checked`, or `selected` state that differs from the server markup is
preserved on the first binding write. A second live takeover of the same
container throws `ZEUS_HYDRATION_DUPLICATE_OWNER`.

An adoption mismatch is reported through `onHydrationError` with a scoped
`ZEUS_HYDRATION_*` code. Zeus clears and rebuilds only the failing component
range, marks the rebuilt root with `data-zeus-hydration-fallback`, and leaves
nodes outside that range in place. `Show`, `For`, `Transition`, and dynamic
regions are experimental rebuild boundaries: their server branch is cleared
and mounted again under the current owner. This mode is separate from the
explicit `hydrate`/`hydratePlan` APIs below and is disabled unless the
compiler option is enabled.

## hydrate and hydratePlan

```ts
function hydrate(
  container: Element | DocumentFragment,
  setup: (context: HydrationContext) => void,
): () => void

function hydratePlan(
  container: Element | DocumentFragment,
  plan: HydrationPlan,
  handlers: Readonly<Record<number, HydrationBindingHandler>>,
): () => void
```

`hydrate()` reuses DOM nodes located by `<!--zeus:hydrate:id-->` markers and
attaches explicit text, attribute, property and event bindings. A
`<!--zeus:hydrate:/-->` marker closes a dynamic text value; when it directly
follows the text's own marker, the server rendered an empty string and
`hydrate()` inserts an empty text node there to bind. `hydratePlan()`
iterates the compiler's stable binding plan and invokes one handler for every
planned binding. Missing handlers throw `ZEUS_HYDRATION_HANDLER_MISSING`; setup
failures release effects and listeners already attached. The returned disposer
removes bindings without discarding the server DOM. Plan nodes marked
`optional: true` may be absent when their conditional or list branch did not
render; a present optional marker with a missing target is still diagnosed.

`HydrationContext.nodes()` returns every target for a repeated template marker,
and the optional `occurrence` argument on `node()`, `text()`, `attr()`,
`prop()`, and `event()` selects one without clearing the container. The plain
`hydrate()` API still rejects duplicate ids so hand-written plans cannot
silently select the wrong node.

## bindText

```ts
function bindText(el: Text, getValue: () => JSXValue, once?: boolean): void
```

Binds a text node. With `once: true`, the getter is evaluated untracked once and
no reactive effect is created.

## bindEvent

```ts
function bindEvent(
  el: Element,
  name: string,
  handler: EventListener,
  delegated?: boolean,
): void
```

Binds an event handler. By default the handler is stored on the element and
dispatched by the document listener registered through `delegateEvents`. With
`delegated: false` the handler is attached to the element as a native listener;
the compiler emits this for events that do not bubble (such as `mouseenter`,
`scroll` or media events) and for every event when `delegateEvents` is disabled.
A native handler is never dispatched a second time by the document delegate.

## bindAttr

```ts
function bindAttr(
  el: Element,
  name: string,
  getValue: () => AttrValue,
  once?: boolean,
): void
```

Binds an HTML attribute. With `once: true`, only the normalized initial value is
written.

## bindProp

```ts
function bindProp(
  el: Element,
  name: string,
  getValue: () => unknown,
  once?: boolean,
): void
```

Binds a DOM property. `bindTextContent`, `bindClass`, and `bindStyle` accept the
same trailing `once` flag and preserve their normal initial-value semantics.

## delegateEvents

```ts
function delegateEvents(events: readonly string[]): void
```

Registers event types for delegation at the document level. Each event type
gets one shared `document` listener for the lifetime of the page. It is not
released with any render scope, so runtime diagnostics sessions do not count it
in `listenersCreated` or `listenersDisposed`.

## defineElement prop reactivity

`defineElement` 的 props 默认使用浅响应式，只追踪整个值的替换，并保持传入对象、
数组和函数的 identity。确实需要嵌套代理时，可显式指定 `reactivity: 'deep'`：

```ts
import { defineElement, prop } from '@zeus-js/runtime-dom'

interface GridProps<Row> {
  rows: readonly Row[]
}

defineElement<GridProps<unknown>>(
  'z-grid',
  {
    props: {
      rows: prop<readonly unknown[]>(Array, { reactivity: 'shallow' }),
    },
  },
  props => {
    const output = document.createElement('span')
    output.textContent = String(props.rows.length)
    return output
  },
)
```

赋值 `element.rows = nextRows` 会触发依赖更新；原地修改数组元素或嵌套对象不会触发
更新，应通过新引用替换。显式使用 `reactivity: 'deep'` 时，对象会被代理，因而不再
承诺保留原始 identity。完整 eager/lazy 属性契约见 [RFC-007](../rfcs/RFC-007-wc-prop-contract.md)。

## mountShow

```ts
function mountShow(
  parent: Node,
  marker: Node,
  when: () => unknown,
  children: () => JSXValue,
  fallback?: () => JSXValue,
): void
```

Mounts a Show component.

## mountFor

```ts
function mountFor<T, K>(
  parent: Node,
  marker: Node,
  each: () => readonly T[] | null | undefined,
  key: ((item: T, index: number) => K) | undefined,
  render: (item: () => T, index: () => number) => JSXValue,
): void
```

Mounts a For region with optional keyed reconciliation. The low-level runtime
helper passes item and index accessors to `render`; keyed records update those
accessors when a same-key item is replaced or moved. JSX authors continue to
write ordinary `item` and `index` references inside `<For>` because the
compiler emits the accessor reads.

## bindRef

```ts
function bindRef(el: Element, ref: { value: unknown }): void
```

Binds a DOM element to a reactive ref.

## ErrorBoundary

```ts
interface ErrorBoundaryProps {
  children: () => JSXValue
  fallback: (
    error: unknown,
    reset: () => void,
    info?: ErrorBoundaryInfo,
  ) => JSXValue
  onError?: (error: unknown, info?: ErrorBoundaryInfo) => void
}

interface ErrorBoundaryInfo {
  phase: 'render' | 'binding' | 'event' | 'request' | 'runtime'
  fatal: boolean
}

function ErrorBoundary(props: ErrorBoundaryProps): DocumentFragment
```

`ErrorBoundary` requires an explicit child factory and an active render scope.
It catches synchronous initialization, binding and event errors, reports their
phase, disposes the failed owner, and mounts the fallback in a separate scope.
`reset()` disposes that branch before retrying the child. Security errors
(`SecurityError`, `ZEUS_SECURITY_*`, `ZEUS_FATAL_*`, or errors marked
`fatal: true`) are rethrown after the failed branch is released.

Use `captureErrorBoundary()` in a child to retain the boundary for an async
request, then call `reportError(error, 'request')` from the request callback.
Without a boundary, `reportError` rethrows. Resource errors remain explicit:
read `resource.error()` and throw it from a binding when
`resource.status() === 'error'`.

## Native Form

```ts
const form = createForm({
  initialValues: { email: '' },
  schema: fromSafeParse(schema),
  onSubmit: (values, { signal }) => {
    void signal
    return mutation.mutateAsync(values)
  },
})

const release = form.bind(formElement)
form.field('email').set('user@zeus.dev')
await form.submit()
form.reset()
release()
```

`createForm` reads native `FormData`, composes repeated names as arrays, preserves
form-associated custom-element values supplied through `ElementInternals`, and
supports controlled overrides through `setValue` or a field controller. Native
constraint failures and schema errors are exposed through `errors()` and focus
the first invalid control. `fromSafeParse` adapts a Zod/Valibot-shaped
`safeParse` result without adding a schema dependency. Submit failures are
stored in `submitError()` and returned as a structured `FormSubmitResult`; the
controller does not swallow mutation errors.

## Transition

```ts
function transition(
  nodes: Node | readonly Node[],
  phase: 'enter' | 'leave',
  options?: TransitionOptions,
): TransitionHandle

function mountTransition(
  parent: Node,
  marker: Node,
  when: () => unknown,
  children: () => JSXValue,
  options?: TransitionOptions,
): void
```

`transition()` drives an existing node range. `enter` and `leave` accept a class
name (or `{ from, active, to }`) or a callback. A callback may return a cleanup
function, return a Promise, or use `(nodes, done)` and call `done()` explicitly.
`duration` accepts a number, Promise, function, or `{ enter, leave }`; `0` is
synchronous, a positive number is a timeout fallback, and an async duration is
resolved before the timeout starts. `cancel()`/`dispose()` remove classes and run
cleanup exactly once.

`mountTransition()` retains a leaving range until its transition completes, and
re-entry cancels the leave while preserving node identity. The native compiler
lowers an imported `<Transition when={...}>` intrinsic to this helper, passing
the explicit transition options through as a runtime object. The main
`@zeus-js/zeus` entry exports the explicit APIs, while SSR emits the initial
visible branch and does not start browser transitions.
