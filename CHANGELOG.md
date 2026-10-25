# Changelog

## create-zeus 0.1.5 (2026-10-25)

### Fixes

- Pin all four templates to the same published Zeus 0.1.1-beta.19 framework and Vite plugin 0.0.5 toolchain so new projects use the current Native compiler and one signal engine.
- Gate CLI publication on isolated registry installs, checks, builds, tests and dev/production browser interactions for all templates, preserving the report in CI.

## vite-plugin 0.0.5 (2026-10-25)

### Fixes

- Publish the current Rust Native compiler integration, runtime resolution, dependency deduplication and scoped HMR support.
- Prebundle the compiler-injected DOM runtime before the first development render, preventing duplicate signal engines during cold startup.

## 0.1.1-beta.19 (2026-10-25)

### Fixes

- Preserve optional event detail fields from source through Analyzer metadata, Native/JSX/React/Vue declarations, CEM and component API documentation. Required fields and their precise types remain enforced.
- Align native HTML/SVG JSX attribute declarations with the compiler's scalar expression semantics; signal accessor calls remain supported while attribute getter functions are rejected.
- Verify namespaced ordinary components with real Native Vite execution, including signal updates, single initialization, DOM identity and disposal.
- Stop blocking releases on deletion of the historical native npm `latest` tag, while retaining target dist-tag, provenance and compiler-install verification.
- Preserve Admin grid rows across query status and staleness updates so a pointer press retains its target and selection completes in WebKit.

## 0.1.1-beta.18 (2026-10-22)

### Fixes

- Ignore stale lazy custom-element connection reactions while a light-DOM projection is temporarily detached, preserving DOM context and cleanup across reconnects.

## 0.1.1-beta.17 (2026-10-22)

### Fixes

- Initialize lazy Web Component ancestors before descendants across Light and Shadow DOM, including moves, failed ancestors, and reconnects; keep module loading parallel and readiness/method proxies pending until the current scope is mounted.
- Verify published Golden Component Manifests against the canonical `schemaVersion: 1` field and their frozen SHA256 hashes.

## 0.1.1-beta.16 (2026-10-21)

### Fixes

- Release v0.1.1-beta.16.

## 0.1.1-beta.15 (2026-10-20)

### Features

- Add a signal-based adapter for the framework-agnostic Remix Router core, with nested route state, history navigation, loader preloading, and owner cleanup.
- Replace the JavaScript and Babel JSX compiler implementation with the Rust and Oxc native backend, including owned Zeus IR, DOM, SSR, and Web Components lowering, structured diagnostics, source maps, platform packages, and native release verification.
- 增加细粒度 Resource 原语和基于 `@tanstack/query-core` 的 Query adapter，覆盖请求取消、 并发结果保护、stale cache、查询重试、无限分页、mutation 与 owner disposal。

### Fixes

- Raise Vite, PostCSS, Sass, and Less dependency floors to patched releases and enforce zero high or critical production advisories in CI, Canary, and tagged release prechecks.
- Resolve lazy Web Components runtime imports from the output plugin package while keeping generated bundles free of machine-specific installation paths.
- Skip redundant `style` attribute removals when a style binding is already empty, while still repairing styles added by external DOM mutations.

## 0.1.1-beta.14 (2026-10-20)

### Fixes

- Avoid allocating an updater closure when keyed `For` reuses a slot for an ordinary item value.
- Preserve Web Component property identity and decode attributes once across eager and lazy initialization, including pre-upgrade writes, deferred codecs, defaults, disconnect/reconnect, and queued methods.
- Correct delegated events across open and closed Shadow Roots, React 19 custom event names, Light DOM projection moves, form lifecycle fallbacks, and style cleanup/reinsertion with CSP nonces.
- Isolate per-component lazy registration and implementation chunks; resolve generated runtime imports without embedding installation paths.
- Skip redundant style removals while repairing externally changed styles, and strengthen owner cleanup, reactive engine interoperability, and invalid JSX value diagnostics.
- Prevent duplicate hydration event delivery on pages using delegated events, reject duplicate markers and mismatched tags, and release bindings and DevTools owners across setup failures and parent scope disposal while preserving the initial error.
- Preserve Vite HMR state only for parser-identified ordinary comment edits; template/JSX content, ASI line terminators, compiler directives, and unsupported syntax take the normal compilation path.

### Features

- Extend the Rust/Oxc compiler with conditional, logical, array, and `map()` JSX regions, ordered native/component spreads, source-spanned builtin validation, and DOM/SSR lowering. Components still initialize once and update their individual bindings.
- Add the compile-time `once(expression)` intrinsic for native DOM scalar text, attribute, and property initialization without effects; deduplicate static templates and enforce compiler output budgets.
- Add `Portal`, explicit child-factory `ErrorBoundary`, and `Transition` APIs with owner cleanup. Boundaries handle initialization, insertion, and subsequent binding failures; resource failures can be forwarded explicitly. Transition supports cancellation, class/hook phases, and compiler lowering with an initial-branch SSR result.
- Introduce `@zeus-js/router` over `@remix-run/router`, `@zeus-js/resource` for cancellable asynchronous resources, `@zeus-js/query` over `@tanstack/query-core`, and `@zeus-js/testing` for render lifecycle, events, effect flushing, and role queries.
- Extend Web Component manifests, declarations, and React/Vue outputs with explicit event, method, slot, form, style, and property contracts; emit VS Code HTML Custom Data and define renderer-adapter boundaries for framework-owned slot content.
- Add application and component-library starter templates, guarded scaffold destination handling, a router-based Admin example, and a compiler-output playground. Preserve existing roots for comment-only Vite HMR edits; executable changes dispose and remount.
- Add a production Next.js Server/Client boundary example that distinguishes static custom-element hosts from interactive `"use client"` wrappers and verifies upgrade behavior in three browsers.
- Add development binding/dependency diagnostics and an internal DevTools consumer/panel model, including serializable MessagePort transport and bounded disposal history.
- Add low-level Declarative Shadow DOM serialization and explicit marker-plan hydration helpers. They require an application-supplied binding plan; compiled automatic hydration, streaming, and asynchronous SSR are not delivered by this release. React/Vue wrapper SSR remains host-tag-only and mounts a fresh client tree.

### Beta contract changes

- JSX expressions are values: use `title={label()}`, `when={visible()}`, and `each={items()}`. Functions remain function values for properties, component props, events, and refs; they are not implicitly called as getters. Invalid text/attribute/child values fail explicitly.
- Replace the old `/* @once */` annotation with `once(expression)`. Web Component props are shallow by default; opt into `reactivity: 'deep'` when nested proxy tracking is required. The main `@zeus-js/zeus` entry no longer re-exports the JSX runtime helpers.
- Zeus beta follows one current contract: repository consumers, generated artifacts, types, tests, and documentation change together. Removed Zeus APIs have no aliases, legacy modes, or deprecation window; supported React 18/19, Vue 3, Node, browser, ESM, and CommonJS contracts continue to be verified.

### Build and release validation

- Expand independent tarball consumer coverage to Native, React 18/19, and Vue 3 across Chromium, Firefox, and WebKit; add Admin navigation checks, SSR-safe imports, API snapshots, native platform install smoke tests, and component-host/compiler performance budgets.
- Measure the playground's complete production runtime bundles, include their transitive module manifest and compression sizes, and verify all views, real clipboard copy/paste, shared-URL reloads, retries, keyboard navigation, and clipboard denial in three browsers.
- Separate local npm login checks from CI bypass-token policy checks, allow first-publication packages through auth preflight, and retain tagged-source, published-version, dist-tag, signed provenance, and registry compiler smoke gates. Native `latest` pollution remains separately guarded for Canary and non-beta tagged releases; a beta publication does not repair those tags.

## 0.1.1-beta.13 (2026-10-14)

### Performance

- Skip redundant DOM text writes so pooled virtual lists stop reshaping unchanged strings on every scroll commit.

## 0.1.1-beta.12 (2026-10-13)

### Features

- Add opt-in runtime allocation diagnostics for effects, proxies, scopes, refs, and computed values.

### Fixes

- Avoid reading the live DOM before writing a changed reactive attribute value.

## 0.1.1-beta.9 (2026-10-13)

### Performance

- Fast-path plain signal effects during batch flushes when no scheduler, pause state, or computed dependency requires the dirty-check path.

## 0.1.1-beta.8 (2026-10-12)

### Fixes

- Release v0.1.1-beta.8.

## 0.1.1-beta.7 (2026-10-11)

### Fixes

- Release v0.1.1-beta.7.

## 0.1.1-beta.6 (2026-10-10)

### Fixes

- Release v0.1.1-beta.6.

## 0.1.1-beta.5 (2026-10-10)

### Fixes

- Reduce the production JSX runtime bundle by sharing the `jsx`, `jsxs`, and `jsxDEV` implementation while preserving their public callable API.
- Avoid redundant CSSOM reads for stable reactive style bindings.

## 0.1.1-beta.3 (2026-10-09)

### Fixes

- perf(runtime-dom): fast-path stable keyed list updates without rebuilding reconciliation maps or moving unchanged DOM ranges; correct the list benchmark to use one reactive runtime.

## 0.1.1-beta.2 (2026-08-21)

### Features

- Add opt-in runtime allocation diagnostics for effects, proxies, scopes, refs, and computed values.

### Fixes

- Generate self-contained component declarations for portable local prop types and fail closed when source-bound or unsupported TypeScript types cannot be emitted safely for downstream consumers.

## 0.1.1-beta.1 (2026-08-19)

### Features

- Add explicit `@once` DOM bindings. Once-marked values use normal binding normalization but initialize untracked without creating a reactive effect.
- Add opt-in shallow reactivity for `defineElement` props. Shallow props track top-level reference replacement while preserving the original object or array identity and leaving nested mutations untracked.

### Fixes

- Keep keyed `For` DOM and owner scopes stable while same-key replacements update compiled item/index bindings and event handlers. Reject duplicate keys before mutation, roll back failed record mounts, drain reentrant list updates, and preserve custom-element mounts and deep focus while ranges move. Record precise semantic `For` accessor dependencies in compiler IR so escaped, shadowed, and non-reference identifier spellings compile correctly.

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
