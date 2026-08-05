# Changelog

## 0.1.1-beta.0 (2026-08-05)

### Features

- Add synchronous server-side string rendering with a dedicated runtime, compiler target, and `@zeus-js/zeus/server` application entry.

## 0.1.0 (2026-08-03)

### Features

- Expose serializable compiler diagnostics with source spans and enforce `Host` and `Slot` placement at trusted `defineElement` boundaries.

### Fixes

- Publish Node-compatible CommonJS entry points with unambiguous `.cjs` filenames and verify every public `require` export in development and production modes.

## 0.1.0-beta.9 (2026-08-02)

### Features

- Establish the compiler-first semantic foundations: explicit fine-grained reactive primitives, scoped DOM cleanup, unified eager and lazy custom element lifecycles, dynamic light DOM projection, and a Babel-independent compiler IR package.

## 0.1.0-beta.8 (2026-07-26)

### Fixes

- Dispose each keyed `For` record's reactive scope when the record leaves the list, preventing detached DOM bindings and event handlers from accumulating during virtualized scrolling.

## 0.1.0-beta.7 (2026-07-26)

### Fixes

- Fix generated Web Component declarations so React, custom element, and lazy loader outputs are self-contained TypeScript consumers. - Resolve relative imported props types through NodeNext specifiers and named, default, or star barrels, including local interface inheritance and intersections. - Preserve native `HTMLElement` member contracts while retaining custom props, methods, and typed events. - Normalize source-bound method and event types to portable declaration types. - Watch imported type dependencies during component builds and report dependency failures as structured diagnostics.

## 0.1.0-beta.6 (2026-06-21)

### Fixes

- Release v0.1.0-beta.6.

## 0.1.0-beta.4 (2026-06-06)

### Features

- (`curly-w`)

## 0.1.0-beta.3 (2026-06-05)

### Features

- (`lazy-pr`)

## 0.1.0-beta.2 (2026-06-04)

### Features

- Add Rollup and Rolldown bundler entry points with low-configuration TS/TSX handling, config helpers, Rolldown support, component plugin external merging, and updated TypeScript transpilation semantics. Update generated React wrappers to use named React imports and direct `forwardRef`. (`smart-b`)
