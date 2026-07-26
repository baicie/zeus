# Changelog

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
