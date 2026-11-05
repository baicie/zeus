# PR-29 Native Lab Evidence

Date: 2026-11-04

## Scope

Native Lab playground on `examples/playground-editor`:

- real WASM multi-file compilation through the shared playground engine;
- Router/Query Native application template;
- HMR classification against the previous successful build;
- runtime DevTools counters and HMR timeline from the sandbox;
- compile and sandbox-run timing plus DOM/SSR byte counts;
- three-engine editing, preview, diagnostics, security and export gates.

## Compiler fix found by the gate

The HMR statement wrapper was inserted as `(_zeusHmrDisposers.push(render(...)))`.
When the previous statement was a declaration without a semicolon, ASI did not
terminate it and JavaScript parsed the wrapper as a call on the declared value.
`createRouter({...})` therefore became `createRouter({...})(...)` and the preview
failed with `Cannot access 'router' before initialization`.

`crates/zeus_compiler/src/codegen.rs` now prefixes statement-level wrappers with
`;`. The regression is locked by
`crates/zeus_compiler/tests/hmr.rs::statement_wrapper_does_not_continue_a_previous_expression`.

## HMR and DevTools

`packages/devtools/playground-engine/src/hmr.ts` exposes the same narrow
state-retention classification used by the Vite plugin. Only comment-only edits
are `preserve-state`; JSX text edits are now `template-structure` instead of
falling through to `unknown`.

The sandbox installs the runtime DevTools hook for the preview realm and returns
a serializable snapshot after mounting. The Native Lab panel shows:

- owner, binding, effect, signal and custom-element counts;
- DOM and text node counts;
- HMR patch/invalidate/dispose timeline entries;
- the HMR classification and literal-binding plan for each compiled module;
- WASM compile time, sandbox run time, and DOM/SSR output bytes.

No DOM node crosses the realm boundary.

## Validation

| Command                                                              | Environment               | Result                   |
| -------------------------------------------------------------------- | ------------------------- | ------------------------ |
| `cargo test -p zeus_compiler --test hmr`                             | macOS arm64               | PASS, 5 tests            |
| `pnpm exec vitest run packages/devtools/playground-engine/__tests__` | Node 24.18.0              | PASS, 7 files / 26 tests |
| `pnpm check:playground-editor`                                       | Chromium, Firefox, WebKit | PASS                     |

The gate covers initial compile, Router/Query readiness, direct counter
interaction, HMR classification before and after an edit, runtime DevTools
counters, invalid-source recovery, loop-budget recovery, security probes, export
installation/build, and the exported browser interaction.

## Not done

- Online deployment URL and commit association: `NOT_RUN` (no deployment
  authorization).
- Windows/Linux browser matrix: `NOT_RUN`.
