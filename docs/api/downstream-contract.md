# Zeus Downstream Contract

This document defines how downstream packages such as zeus-ui should consume Zeus.

## Allowed Imports

Downstream packages may import from:

- `@zeus-js/zeus` — stable user-facing API
- `@zeus-js/zeus/advanced` — advanced APIs (stable, but not recommended for general app code)
- `@zeus-js/zeus/capabilities` — machine-readable capability manifest
- `@zeus-js/output-wc` — Web Component output plugin
- `@zeus-js/output-wc/capabilities` — machine-readable WC output capability manifest
- `@zeus-js/preset-component-library`

## Disallowed Imports

Downstream packages must not import from:

- `@zeus-js/*/src/*` — internal source files
- `@zeus-js/*/dist/*` — internal dist files
- `@zeus-js/runtime-dom` internal helper modules (e.g., `template`, `insert`, `bindAttr`)
- `@zeus-js/signal` — internal signal implementation
- `@zeus-js/compiler` — compiler internals
- any undocumented subpath

## Stability

- `@zeus-js/zeus` follows semver.
- `@zeus-js/zeus/advanced` may change during beta.
- internal runtime/compiler helpers are private.
- capability manifests are additive whenever possible.

## Canary Flow

Every merge into Zeus main publishes `@zeus-js/*@canary`.

Downstream projects must run compatibility checks against canary:

1. CI installs latest `@zeus-js/*@canary`
2. CI runs `typecheck`, `build`, `unit tests`, and `examples`
3. Failure indicates Zeus broke downstream compatibility

## API Snapshots

Zeus maintains machine-readable API snapshots at `docs/api/snapshots/*.api.md`.

These snapshots are:

- Generated from published declaration files
- Checked in to git
- Verified by CI on every PR

When a snapshot changes, it must be explicitly committed. This ensures downstream consumers can audit API drift.
