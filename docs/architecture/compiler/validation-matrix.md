# Compiler Validation Matrix

Which compiler behaviour is verified, by what, and which can only be verified in
CI. A "verified" row means a test exists and passed locally. Anything requiring
the seven-platform matrix or a real browser is named as unverified rather than
assumed.

Last run: 2026-11-19, `refactor/r17-compiler-pipeline`, Apple silicon.

---

## Local verification

| Behaviour                                        | Verified by                                          | Result               |
| ------------------------------------------------ | ---------------------------------------------------- | -------------------- |
| Static template generation                       | `tests/golden.rs` (45 fixtures)                      | pass                 |
| Dynamic text bindings                            | golden                                               | pass                 |
| Attribute / property / class / style bindings    | golden                                               | pass                 |
| Spread                                           | golden                                               | pass                 |
| Event delegation on                              | golden                                               | pass                 |
| Event delegation off                             | golden                                               | pass                 |
| Non-delegatable events                           | golden                                               | pass                 |
| Ref bindings                                     | golden                                               | pass                 |
| Components with props and children               | golden                                               | pass                 |
| `Show` with fallback                             | golden                                               | pass                 |
| `For` with item and index accessors              | golden                                               | pass                 |
| Nested `Show` in `For`                           | golden                                               | pass                 |
| `ErrorBoundary`                                  | golden                                               | pass                 |
| `Transition` with options                        | golden                                               | pass                 |
| Fragments                                        | golden                                               | pass                 |
| SVG namespace                                    | golden                                               | pass                 |
| Raw text elements                                | golden                                               | pass                 |
| Dynamic regions (expression, ternary, array-map) | golden                                               | pass                 |
| Pure `defineElement`                             | golden                                               | pass                 |
| HMR plan and manual-boundary skip                | golden                                               | pass                 |
| Auto hydration                                   | golden                                               | pass                 |
| SSR rendering, escaping, void elements, Show/For | golden (5 cases)                                     | pass                 |
| SSR rejects `ErrorBoundary`                      | golden                                               | pass                 |
| SSR rejects properties with no HTML equivalent   | golden                                               | pass                 |
| Non-JSX pass-through                             | golden                                               | pass                 |
| Unsupported source type diagnostic               | golden                                               | pass                 |
| Input-too-deep diagnostic                        | golden                                               | pass                 |
| Async component rejection                        | golden                                               | pass                 |
| Source map unicode / multiline                   | golden                                               | pass                 |
| Source map absent when not requested             | golden                                               | pass                 |
| TypeScript erasure                               | golden                                               | pass                 |
| Plain JS with JSX                                | golden                                               | pass                 |
| IR attribute union round-trip (TS fixture)       | `tests/ir.rs`                                        | pass                 |
| Lowering rules in isolation                      | `tests/lower.rs` (54 tests)                          | pass                 |
| Transform options and targets                    | `tests/transform.rs` (62 tests)                      | pass                 |
| HMR behaviour                                    | `tests/hmr.rs`                                       | pass                 |
| Playground IR snapshot                           | `tests/playground.rs`                                | pass                 |
| napi host compiles                               | `cargo check -p zeus_compiler_node`                  | pass                 |
| WASM host compiles                               | `cargo check -p zeus_compiler_wasm`                  | pass                 |
| Formatting                                       | `cargo fmt --all -- --check`                         | clean                |
| Lints                                            | `cargo clippy --workspace --all-targets -D warnings` | clean                |
| Throughput                                       | `examples/perf-protocol.rs`                          | report only, no gate |

Total local: 261 Rust tests, of which 45 are golden fixtures.

---

## What the golden fixtures prove

Each fixture records input source, options, and the complete output: generated
code, source map, diagnostics, hydration plan, HMR plan. Byte-identical across
the split and the Oxc upgrade means:

- generated JavaScript is exactly the same
- every source map mapping is at the same position
- every diagnostic has the same code, message, severity and span
- hydration markers and node ids are unchanged
- HMR signatures are unchanged

That is a stronger guarantee than "tests pass": it is the whole observable
output, not selected assertions.

## What they do not prove

- **Runtime behaviour.** The fixtures pin generated code, not what that code
  does in a browser. A bug where the emitter writes correct-looking code that
  the runtime misinterprets would not appear.
- **Hydration correctness end-to-end.** The plan is pinned; applying it against
  real server markup is not exercised here.
- **Native/WASM parity at runtime.** Both compile; neither was run for this
  change.

---

## CI-only verification

These need GitHub Actions or a browser and were **not run** on this branch:

| Check                         | Workflow              | Why it matters                                                                                       |
| ----------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------- |
| Seven-platform native matrix  | `compiler-native.yml` | Each `.node` is built on its own runner. Compiling on darwin-arm64 says nothing about linux-x64-musl |
| `pnpm test:compiler-native`   | CI                    | Exercises the napi binding through Node, including error mapping                                     |
| `pnpm test:compiler-wasm`     | CI                    | WASM parity with native, 4 tests over 234 transforms                                                 |
| `check:compiler-wasm-browser` | CI                    | Runs the WASM compiler in Chromium, Firefox and WebKit                                               |
| Packed consumers              | CI                    | Installs the published tarballs into example projects                                                |
| Release canary dry run        | CI                    | Validates the 32-package release contract                                                            |

The dependency upgrade touches what the matrix builds, so the matrix is the
check that matters most for it — and it has not run.

---

## Claimed status

`COMPILER_MODERNIZATION_PARTIAL`

Complete: golden baseline, support/analysis/SSR split, dependency upgrade,
performance comparison, audit documentation.

Not complete: `lower.rs` split, DOM emitter split, `pipeline.rs`,
`compiler-shared` resolution.

Not verified: native matrix, WASM runtime parity, browser gates, packed
consumers, release canary — all require CI.

---

## Reproducing

```bash
cargo test -p zeus_compiler
cargo test --workspace --locked
cargo fmt --all -- --check
cargo clippy --workspace --all-targets -- -D warnings
cargo run -p zeus_compiler --example perf-protocol --release
```
