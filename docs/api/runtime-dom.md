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
function bindText(el: Text, getValue: () => string): void
```

Binds a reactive text node.

## bindEvent

```ts
function bindEvent(el: Element, name: string, handler: EventListener): void
```

Binds an event handler. Handlers are stored on the element for event delegation.

## bindAttr

```ts
function bindAttr(el: Element, name: string, getValue: () => string): void
```

Binds a reactive HTML attribute.

## bindProp

```ts
function bindProp(el: Element, name: string, getValue: () => unknown): void
```

Binds a reactive DOM property.

## delegateEvents

```ts
function delegateEvents(events: readonly string[]): void
```

Registers event types for delegation at the document level.

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
