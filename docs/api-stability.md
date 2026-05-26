# API Stability

Zeus is currently in 0.x stage. APIs may change between minor versions.

## Stable in 0.x

The following APIs are considered stable and will not have breaking changes without a major version bump:

- `state()`
- `computed()`
- `effect()`
- `watch()`
- `scope()`
- `batch()`
- `untrack()`
- `render()`
- `Show`
- `For`
- `defineElement()`
- `@zeus-js/vite-plugin`

## Experimental

The following features are experimental and may change:

- `Host`
- `Slot` (advanced usage)
- event delegation internals
- `@once` static marker
- `queueJob()` scheduler

## Internal APIs

Do not rely on these — they may change at any time:

- generated helper names (`_h`, `_clone`, etc.)
- compiler IR node shape
- runtime internal context
- `@zeus-js/signal/compat`
- `@zeus-js/signal/*` subpath exports (except named exports from the main entry)

## Version policy

- 0.x: breaking changes allowed between minor versions
- 1.0: API freeze, breaking changes only in major versions
- Patch versions: only bug fixes and documentation updates

## Deprecations

When an API is deprecated:

1. It will continue to work with a console warning
2. A deprecation notice will appear in the changelog
3. Removal will happen no sooner than the next minor version
