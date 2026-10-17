# @zeus-js/runtime-dom

DOM runtime helpers. These are primarily used by the compiler — application code should use `@zeus-js/zeus` instead.

These helpers are stable to use directly, but are not considered the primary framework API.

## render

```ts
function render(code: () => JSXValue, element: Element): void
```

Mounts the component tree into the element.

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
