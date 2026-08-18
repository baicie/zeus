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

`For` reuses DOM nodes by key when you provide the `by` prop. Replacing an item
with a new object that has the same key keeps its DOM and owner scope while
updating compiled bindings and event handlers to the latest item and index.

The item setup callback still runs only once per key. This keeps component
initialization stable while precise DOM bindings remain current:

```tsx
<For each={rows()} by={row => row.id}>
  {(row, index) => (
    <button onClick={() => select(row)}>
      {index}: {row.title}
    </button>
  )}
</For>
```

Duplicate keys are invalid and throw before Zeus mutates existing keyed
records. If a new record throws during setup, Zeus removes any records created
by that failed update. Reordering also preserves mounted Zeus custom elements
and the deepest focused descendant across Shadow DOM boundaries. Without `by`,
a collection change replaces the current list subtree.

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
