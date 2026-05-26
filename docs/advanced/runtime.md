# Runtime Internals

## How rendering works

1. `render()` creates a root effect
2. The component function runs once, creating reactive dependencies
3. Reactive state changes trigger targeted DOM updates
4. No Virtual DOM diffing occurs

## DynamicRange

`DynamicRange` manages a segment of dynamic DOM:

```ts
const range = new DynamicRange(parent, marker)
range.replace(value)  // Clear old, insert new
range.clear()         // Remove all nodes
```

Used by `mountDynamic` for Show and dynamic children.

## Keyed For Diff

When `by` is provided, `mountFor` maintains a `Map` of keyed records:

- Matching keys reuse existing DOM
- Disappearing keys remove DOM
- Reordering moves DOM via `insertBefore`

## Event Delegation

Instead of `addEventListener` per element:

1. `bindEvent` stores the handler on `element.__zeusEvents`
2. `delegateEvents` registers one listener per event type at `document`
3. On event, the listener walks up from `event.target` to find handlers

## Cleanup

All reactive state is tied to `effectScope`. Calling `scope.stop()`:

- Stops all effects
- Removes DOM listeners
- Cleans up event handlers
- Removes mounted DOM nodes
