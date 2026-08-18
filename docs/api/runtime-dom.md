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

`defineElement` props use deep reactivity by default. Large immutable values can
opt into shallow reactivity so Zeus tracks only top-level replacement and keeps
the original object or array identity:

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

For a shallow prop, assigning `element.rows = nextRows` triggers dependents.
Mutating `element.rows[index]` or a nested row does not trigger an update. Use
replace-on-write for shallow props. Props without `reactivity: 'shallow'`
retain the existing deep reactive behavior.

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
  render: (item: T, index: number) => JSXValue,
): void
```

Mounts a For component with optional keyed diff.

## bindRef

```ts
function bindRef(el: Element, ref: { value: unknown }): void
```

Binds a DOM element to a reactive ref.
