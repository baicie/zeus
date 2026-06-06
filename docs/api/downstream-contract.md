# Zeus Downstream Contract

This document defines how downstream packages such as zeus-ui should consume Zeus.

## Allowed Imports

Downstream packages may import from:

- `@zeus-js/zeus` — stable user-facing API
- `@zeus-js/zeus/advanced` — advanced APIs for tooling/debugging
- `@zeus-js/zeus/capabilities` — machine-readable capability manifest
- `@zeus-js/output-wc` — Web Component output plugin
- `@zeus-js/output-wc/capabilities` — machine-readable WC output capability manifest
- `@zeus-js/web-c`
- `@zeus-js/bundler-plugin`
- `@zeus-js/bundler-plugin/vite`
- `@zeus-js/bundler-plugin/manifest`

## Disallowed Imports

Downstream packages must not import from:

- `@zeus-js/*/src/*` — internal source files
- `@zeus-js/*/dist/*` — internal dist files
- `@zeus-js/runtime-dom` internal helper modules (e.g., `template`, `insert`, `bindAttr`)
- `@zeus-js/signal` — internal signal implementation
- `@zeus-js/compiler` — compiler internals
- any undocumented subpath

## Stability

- Zeus is in beta and may make breaking changes without compatibility shims.
- `@zeus-js/zeus/advanced` may change at any time during beta.
- internal runtime/compiler helpers are private.
- capability manifests are additive whenever possible.

## Canary Flow

Every merge into Zeus main publishes `@zeus-js/*@canary`.

## Canary Publish Scope

Canary release intentionally publishes all non-private `@zeus-js/*` packages,
including packages ignored by the formal changeset release.

This is intentional because downstream compatibility checks may consume tooling
packages such as `@zeus-js/vite-plugin`, `@zeus-js/bundler-plugin`, and
Web Component output packages.

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
