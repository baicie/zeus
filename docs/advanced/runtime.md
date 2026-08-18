# Runtime Internals

## How rendering works

1. `render()` creates a root owner and reactive scope
2. The component function runs once, creating DOM and precise bindings
3. Signal changes update only the bindings that read them
4. No component rerender or Virtual DOM diff occurs

## DynamicRange

`DynamicRange` manages a segment of dynamic DOM:

```ts
const range = new DynamicRange(parent, marker)
range.replace(value) // Clear old, insert new
range.clear() // Remove all nodes
```

Used by `mountDynamic` for Show and dynamic children.

The nodes and reactive scope for a mounted dynamic subtree are owned together.
Replacing the range disposes the old scope before removing its DOM.

## Keyed For Diff

When `by` is provided, `mountFor` maintains a `Map` of keyed records:

- Matching keys reuse existing DOM
- Same-key replacements update item and index bindings without rerunning setup
- Disappearing keys dispose their item scope and remove DOM
- Reordering moves only ranges that are not already adjacent
- Duplicate keys fail before any existing keyed record is mutated
- Failed record setup is rolled back before the error escapes
- Reentrant list writes are drained until the rendered range matches the source
- Range moves preserve Zeus custom-element mounts and composed-tree focus

## Event Delegation

Instead of `addEventListener` per element:

1. `bindEvent` stores the handler on `element.__zeusEvents`
2. `delegateEvents` registers one listener per event type at `document`
3. On event, the listener walks up from `event.target` to find handlers

## Cleanup

`render()` returns an idempotent dispose function. Calling it:

- Stops the render scope and all child scopes
- Runs registered cleanup callbacks
- Removes mounted DOM nodes from the container
