# Runtime Semantics

This document describes the runtime behavior boundaries of Zeus, so you know what to expect in production.

---

## Events

Zeus uses delegated events by default. All event handlers are stored on the element and dispatched from `document`.

```tsx
<input onInput={event => event.currentTarget.value} />
```

`event.currentTarget` always points to the element where the handler is declared.

### Focus and blur

`focus` and `blur` do not bubble. Zeus maps them to `focusin`/`focusout` under the hood, so delegation works:

```tsx
<input onFocus={...} onBlur={...} />
```

---

## Refs

Refs are cleared when their owner scope is disposed.

```tsx
let input: HTMLInputElement | null = null

<input ref={element => (input = element)} />
```

Callback refs are called with `null` when their owner subtree is disposed.

---

## Show

`Show` removes old nodes when the condition changes. There is no stale node accumulation across toggles.

---

## For

`For` reuses DOM nodes by key when you provide the `by` prop.

Keyed records preserve their existing DOM subtree and owner scope while moving. Put changing fields behind explicit accessors when a record must update in place:

```ts
const [done, setDone] = createSignal(false)
```

Replacing a plain object with the same key reuses the old subtree. Use an unkeyed `For` for immutable replacement semantics until keyed item accessors are available.

---

## render

`render()` returns a dispose function. Calling it:

1. Clears the container
2. Stops all effects created inside the render scope

```ts
const dispose = render(<App />, document.getElementById('app'))

dispose() // stops effects, clears container
dispose() // idempotent, safe to call twice
```

---

## Web Components

`defineElement()` disposes all effects on `disconnectedCallback`. After the element is removed from the DOM, reactive updates no longer affect the old DOM tree.

Light DOM slots are projected when the custom element is connected. When the element disconnects, slot content returns to its original position in the document tree.
