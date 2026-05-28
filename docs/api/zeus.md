# @zeus-js/zeus

Unified entry point for the Zeus framework.

## Public APIs

The main entry exports stable, user-facing APIs:

| Export          | Description                                                    |
| --------------- | -------------------------------------------------------------- |
| `state`         | Unified reactive state (primitives, objects, arrays, Map, Set) |
| `computed`      | Derived reactive value                                         |
| `effect`        | Reactive side effect                                           |
| `watch`         | Watcher with callback                                          |
| `scope`         | Isolated reactive scope                                        |
| `batch`         | Batch reactive updates                                         |
| `untrack`       | Read without tracking dependencies                             |
| `nextTick`      | Promise-based microtask scheduling                             |
| `onCleanup`     | Register cleanup callbacks                                     |
| `render`        | Mount component tree to DOM                                    |
| `Show`          | Conditional rendering                                          |
| `For`           | List rendering with keyed diff                                 |
| `Host`          | Web Component host boundary                                    |
| `Slot`          | Web Component slot projection                                  |
| `defineElement` | Define a custom element                                        |

## Advanced APIs

Advanced lifecycle and debugging APIs are available from the `/advanced` entry:

```ts
import { stop, getCurrentScope, onScopeDispose } from '@zeus-js/zeus/advanced'
```

Available from `advanced`:

- `stop` — stop an effect runner
- `effectScope` — create a detached effect scope
- `getCurrentScope` — get the current active scope
- `onScopeDispose` — register scope cleanup callback
- `getCurrentEffect` — get the current running effect
- `onEffectCleanup` — register effect cleanup callback
- `pauseTracking` / `enableTracking` / `resetTracking` — tracking control
- `getCurrentWatcher` — get the current watcher
- `onWatcherCleanup` — register watcher cleanup callback
- `isValueState` — check if a value is a `ValueState`
- `queueJob` / `flushJobs` — scheduler control
- `TrackOpTypes` / `TriggerOpTypes` / `ReactiveFlags` — debug constants

## Internal APIs

Runtime helpers are **not** exported from the main entry.

Use `@zeus-js/runtime-dom` or `@zeus-js/zeus/internal` only if you know what you are doing. These are not covered by stability guarantees.

## JSX Runtime

```ts
import { Fragment, jsx, jsxs, jsxDEV } from '@zeus-js/zeus'
```

## render

```ts
function render(code: () => JSX.Element, element: Element): void
```

Renders a component tree into a DOM element.

```tsx
import { render } from '@zeus-js/zeus'

render(() => <App />, document.getElementById('root')!)
```

## Show

See [Control Flow](/guide/control-flow) guide.

## For

See [Control Flow](/guide/control-flow) guide.

## defineElement

See [Web Components](/guide/web-components) guide.

## Host

See [Web Components](/guide/web-components) guide.

## Slot

See [Web Components](/guide/web-components) guide.
