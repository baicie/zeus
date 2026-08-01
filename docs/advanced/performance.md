# Performance

## Benchmarks

Run benchmarks:

```bash
pnpm test:benchs
```

## Keyed For

Use `by` when items have stable identities and changing fields are explicit
accessors:

```tsx
// Good: reuses DOM on reorder
<For each={items()} by={item => item.id}>
  {item => <li>{item.title()}</li>}
</For>

// Immutable records: replace the list subtree when records change
<For each={items()}>
  {item => <li>{item.title}</li>}
</For>
```

A keyed record preserves its existing DOM and owner scope when it moves. A new
plain object with the same key does not rerun the item callback.

## @once static marker

Mark expressions that never change to skip reactivity:

```tsx
<div>{/* @once */ expensiveComputation()}</div>
```

The value is computed once, no `bindText` is created.

## Event delegation

`bindEvent` + `delegateEvents` reduces event listeners. One listener per event type handles all elements.

## Static template cloning

Static subtrees are cloned from cached templates, not created from scratch.

## Size reporting

Check bundle sizes:

```bash
pnpm size
```

## Memory cleanup

Keep the disposer returned by `render()` when the application needs to unmount
the tree:

```ts
const dispose = render(() => <App />, container)
dispose()
```

Dynamic `Show` and `For` subtrees, and disconnected custom elements, dispose
their child scopes automatically.
