# API Stability

Zeus defines clear boundaries between public, advanced, and internal APIs.

## @zeus-js/zeus (main)

The primary entry point. Exports stable, user-facing APIs:

- `state`, `computed`, `effect`, `watch`, `scope`, `batch`, `untrack`, `nextTick`, `onCleanup`
- `render`, `Show`, `For`, `Host`, `Slot`, `defineElement`
- JSX runtime: `Fragment`, `jsx`, `jsxs`, `jsxDEV`

These APIs will not have breaking changes within a major version.

## @zeus-js/zeus/advanced

Advanced lifecycle and debugging APIs for power users:

- `stop`, `effectScope`, `getCurrentScope`, `onScopeDispose`
- `getCurrentEffect`, `onEffectCleanup`
- `pauseTracking`, `enableTracking`, `resetTracking`
- `getCurrentWatcher`, `onWatcherCleanup`
- `queueJob`, `flushJobs`
- Debug constants: `TrackOpTypes`, `TriggerOpTypes`, `ReactiveFlags`

These are stable but are not recommended for general application code.

## @zeus-js/zeus/internal

Runtime helpers used by the compiler. These are **not** part of the public API and have no stability guarantees.

## @zeus-js/signal (main)

Reactivity core. Exports the recommended `state`-based API plus lower-level primitives.

## @zeus-js/runtime-dom

DOM helpers. These are primarily used by the compiler. You may use them directly if needed, but prefer `@zeus-js/zeus` for application code.

## Versioning Policy

- Public APIs in `@zeus-js/zeus` and `@zeus-js/signal` follow semver.
- Breaking changes will increment the major version.
- Advanced APIs may change with minor versions during alpha/beta.
- Internal APIs (`@zeus-js/zeus/internal`) are never guaranteed stable.
