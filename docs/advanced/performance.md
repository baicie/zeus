# Performance

## Benchmarks

Run benchmarks:

```bash
pnpm test:benchs
```

## Keyed For

Always use `by` when items have stable identities:

```tsx
// Good: reuses DOM on reorder
<For each={items} by={item => item.id}>
  {item => <li>{item.title}</li>}
</For>

// Bad: full replacement on any change
<For each={items}>
  {item => <li>{item.title}</li>}
</For>
```

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

Call `scope.stop()` when disposing components to prevent memory leaks.
