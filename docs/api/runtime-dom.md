# @zeus-js/runtime-dom

DOM runtime helpers. These are primarily used by the compiler — application code should use `@zeus-js/zeus` instead.

These helpers are stable to use directly, but are not considered the primary framework API.

## render

```ts
function render(code: () => JSXValue, element: Element): void
```

Mounts the component tree into the element.

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
attaches explicit text, attribute, property and event bindings. `hydratePlan()`
iterates the compiler's stable binding plan and invokes one handler for every
planned binding. Missing handlers throw `ZEUS_HYDRATION_HANDLER_MISSING`; setup
failures release effects and listeners already attached. The returned disposer
removes bindings without discarding the server DOM.

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
function bindEvent(el: Element, name: string, handler: EventListener): void
```

Binds an event handler. Handlers are stored on the element for event delegation.

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

Registers event types for delegation at the document level.

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
  fallback: (error: unknown, reset: () => void) => JSXValue
  onError?: (error: unknown) => void
}

function ErrorBoundary(props: ErrorBoundaryProps): DocumentFragment
```

`ErrorBoundary` currently requires an explicit child factory and an active
render scope so it can catch synchronous initialization and first-insertion
errors and release its subtree with the owner. Binding effects created in that
factory's subtree are also routed to the boundary after mount; a later binding
error calls `onError` and switches to the fallback. Its fallback owns a separate
scope, and `reset()` disposes that branch before retrying the child. Event
handlers, independent owners, and unobserved Promise rejections remain outside
the boundary. To integrate `@zeus-js/resource`, read the resource state from a
binding and explicitly throw `resource.error()` when `resource.status() === 'error'`. The boundary
then displays its fallback; call `resource.refetch()` and `reset()` after a
successful request to restore the child branch. Resource errors are not
automatically promoted to boundary errors. The compiler lowering accepts the
same explicit child factory contract; ordinary JSX children still do not gain
implicit initialization-error capture.

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
