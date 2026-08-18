# Performance

## Benchmarks

Run benchmarks:

```bash
pnpm test:benchs
```

## Keyed For

Use `by` when items have stable identities:

```tsx
// Good: reuses DOM on reorder
<For each={items()} by={item => item.id}>
  {(item, index) => <li data-index={index}>{item.title}</li>}
</For>

// Immutable records: replace the list subtree when records change
<For each={items()}>
  {item => <li>{item.title}</li>}
</For>
```

A keyed record preserves its existing DOM and owner scope when it moves. A new
plain object with the same key updates bindings and event handlers to the
latest item and index without rerunning the item setup callback. Keys must be
unique within one list snapshot.

## @once static marker

Mark DOM values that never change to skip reactive tracking:

```tsx
<div title={/* @once */ getTitle()}>{/* @once */ expensiveComputation()}</div>
```

The compiler still emits the normal binding helper with `once: true`, so text,
attribute, property, class, and style values use the same initial normalization
as reactive bindings. The getter runs untracked exactly once and the runtime
does not create a reactive effect. Later signal updates do not update that DOM
value.

`@once` is an explicit author promise. Use it only inside a JSX expression
container for a DOM value that is stable for the lifetime of that node. Events,
refs, component props, and control-flow inputs reject the marker with a compiler
diagnostic instead of silently ignoring it.

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
