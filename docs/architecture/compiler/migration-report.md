# R17.0 Migration Report

What the compiler pipeline modernization actually changed, what it did not, and
what is still owed.

Baseline: `649e2f60`. Branch: `refactor/r17-compiler-pipeline`.

---

## What moved

### New structure

```
crates/zeus_compiler/src/
├── lib.rs                    entry point, unchanged shape
├── lower.rs                  3,564 lines — NOT split (see debt)
├── ir.rs                     unchanged
├── ssr.rs                    unchanged
├── support/                  leaf helpers, no stage dependencies
│   ├── diagnostic.rs
│   ├── hmr.rs
│   ├── html.rs
│   ├── hydration.rs
│   ├── nesting.rs
│   └── span.rs
└── codegen/
    ├── mod.rs                3,957 lines (was 5,057)
    ├── analysis.rs           405 lines — IR facts, no output
    └── ssr.rs                768 lines — SSR target emitter
```

### File moves

| From                | To                          | Lines         | Behaviour |
| ------------------- | --------------------------- | ------------- | --------- |
| `src/span.rs`       | `src/support/span.rs`       | 195           | identical |
| `src/diagnostic.rs` | `src/support/diagnostic.rs` | 46            | identical |
| `src/html.rs`       | `src/support/html.rs`       | 159           | identical |
| `src/hydration.rs`  | `src/support/hydration.rs`  | 348           | identical |
| `src/hmr.rs`        | `src/support/hmr.rs`        | 186           | identical |
| `src/nesting.rs`    | `src/support/nesting.rs`    | 1,491         | identical |
| `src/codegen.rs`    | `src/codegen/mod.rs`        | 5,057 → 3,957 | identical |
| (extracted)         | `src/codegen/ssr.rs`        | 768           | identical |
| (extracted)         | `src/codegen/analysis.rs`   | 405           | identical |

`codegen.rs` became `codegen/mod.rs` so the submodules can share `CodeWriter`,
`NameAllocator` and the mapping types without making them public. Those stay
`pub(super)`: the crate's public API is unchanged.

The public re-exports in `lib.rs` keep `zeus_compiler::{diagnostic, span, hmr,
hydration, nesting}` resolving, so no downstream import needed to change.

### Function ownership after the split

- `collect_delegated_events` and its nine helpers → `codegen/analysis.rs`
- `collect_*_attribute_names` (7 functions) → `codegen/analysis.rs`
- `allocate_locator_attribute` → `codegen/analysis.rs`
- `collect_error_boundary_helper_usage` → `codegen/analysis.rs`
- all 14 `emit_ssr_*` functions, `SsrSourceEmitter`, `SsrModuleOptions` → `codegen/ssr.rs`

Full mapping: [module-ownership.md](./module-ownership.md).

---

## Public API

Unchanged.

- `transform_module(TransformModuleOptions) -> TransformModuleResult` — same
  signature, same fields.
- `TransformModuleOptions` / `TransformModuleResult` / `RawSourceMap` /
  `TransformTarget` / `PureDefineElementMode` — same shape, same serde
  representation.
- The napi binding (`packages/compiler/compiler-native`) and the WASM host
  (`packages/compiler/compiler-wasm`) both compile against the new tree without
  changes.

The internal visibility changes (`pub(super)` on writer and allocator types)
are inside the crate and do not reach the hosts.

---

## Dependencies

Upgraded: Oxc 0.144.0 → 0.146.0 (all eight crates), napi 3.12.1 → 3.16.2,
napi-derive 3.6.3 → 3.7.1, napi-build 2.4.1 → 2.6.0.

Held with reasons: `oxc_sourcemap` (independent version line), Rust toolchain
1.95.0 (it is Oxc 0.146's MSRV), `@napi-rs/cli`, TypeScript 7, Vitest 5,
Rolldown 1.3 (all need their own verification).

Full detail: [dependency-upgrade-plan.md](./dependency-upgrade-plan.md).

---

## Verification

| Check                                                   | Result                             |
| ------------------------------------------------------- | ---------------------------------- |
| 45 golden fixtures                                      | byte-identical across every commit |
| `cargo test --workspace --locked`                       | all suites pass                    |
| `cargo fmt --all -- --check`                            | clean                              |
| `cargo clippy --workspace --all-targets -- -D warnings` | clean                              |
| napi host compiles                                      | yes                                |
| WASM host compiles                                      | yes                                |
| Throughput                                              | within ±3% of baseline             |

Detail: [validation-matrix.md](./validation-matrix.md),
[performance-baseline.md](./performance-baseline.md).

---

## Remaining debt

### 1. `lower.rs` is still one file (3,564 lines)

This is the largest remaining piece and the split was **not** attempted. The
reason is not time: `Lowerer` is a single struct with 90+ methods that holds the
IR being built, the diagnostics, the symbol table, the builtin bindings and the
NodeId counter, and every `lower_*` method both decides semantics and records
them.

Separating it needs a context refactor first — what lowering _knows_ versus
what it _does_ — and doing that without the golden fixtures in place would have
been the exact mistake the fixtures exist to catch. The ownership table in
[module-ownership.md](./module-ownership.md) is the plan for that next step,
with each of the 90 methods assigned to a target module.

**Risk if it stays:** a new JSX semantic still lands in a 3,564-line file, and
the `Show`/`For`/`Transition`/`ErrorBoundary` rules remain interleaved with the
attribute and child lowering rules they call.

### 2. `codegen/mod.rs` is still 3,957 lines

The SSR emitter and analysis came out; DOM emission, template rendering,
hydration emission and HMR emission remain. Those are the next three
extractions, and they are harder than SSR because they share
`ComponentEmitter` state.

### 3. The TypeScript IR is stale

`packages/compiler/compiler-shared` has no source consumer, and its `HostIR`,
`SlotIR` and `DomPath` describe a compiler that no longer exists. Deliberately
not deleted (it is in the 32-package release group and R16.0 moves it).
Analysis and the recommended next step:
[ir-contract.md](./ir-contract.md).

### 4. No `pipeline.rs`

The task's target tree has `pipeline.rs` making stage order explicit.
`transform_module` in `lib.rs` still holds the sequence as 233 lines of
interleaved early exits. Extracting it is worth doing, but it is a pure move
with no effect on the split's safety, so it belongs with the lowering work
where the stages actually gain separate identities — moving the function now
would produce a `pipeline.rs` that calls one `lower_module` and one
`emit_module`, which is a rename rather than a pipeline.

### 5. No per-stage timing

Deliberately not added. See [performance-baseline.md](./performance-baseline.md)
for the reasoning.

---

## What this change is worth

The compiler now has:

- a byte-exact behavioural baseline that makes any further split verifiable
- a clear boundary between "read the IR for facts" and "emit code from facts"
- SSR emission separable from DOM emission
- leaf helpers that cannot accidentally depend on a stage
- six dependencies upgraded with registry-verified versions and a documented
  reason for every held one

The compiler does **not** yet have the target structure from the task brief.
It has the safety net, two of the extractions, and a documented plan for the
rest. Calling this "pipeline modernization complete" would overstate it;
`COMPILER_MODERNIZATION_PARTIAL` is the accurate verdict.
