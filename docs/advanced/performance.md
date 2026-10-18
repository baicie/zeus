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

## `once(expr)` initialization binding

Mark DOM values that never change to skip reactive tracking:

```tsx
<div title={once(getTitle())}>{once(expensiveComputation())}</div>
```

The compiler still emits the normal binding helper with `once: true`, so text,
attribute, property, class, and style values use the same initial normalization
as reactive bindings. The getter runs untracked exactly once and the runtime
does not create a reactive effect. Later signal updates do not update that DOM
value.

`once(expr)` is an explicit author promise. Use it only for a native DOM value that
is stable for the lifetime of that node. Events, refs, component props, and
control-flow inputs reject the intrinsic with a compiler diagnostic.

## Event delegation

`bindEvent` + `delegateEvents` reduces event listeners. One listener per event type handles all elements.

## Static template cloning

Static subtrees are cloned from cached templates, not created from scratch.

## Compiler optimization budget

The compiler fixture checks the code generation budget for the C-005 slice:

```bash
pnpm bench:compiler-optimization
```

The command fails when the two identical static components stop sharing one
template factory, when the fixture's two reactive binding effects or its event
binding/delegation setup are missing or duplicated.
The report is written to `temp/bench/compiler-optimization.json`; the same
budget assertions are covered by `scripts/bench/compiler-optimization.spec.ts`.

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
