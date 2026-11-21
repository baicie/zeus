# Zeus Compiler Architecture

The compiler lives in `crates/zeus_compiler` and has two hosts: a napi binding
for Node (`packages/compiler/compiler-native`) and a WASM build
(`packages/compiler/compiler-wasm`). Both call the same `transform_module`.

## Documents

| Document                                                   | What it answers                                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [pipeline.md](./pipeline.md)                               | **The current structure**: module layout, stage order, enforced layering            |
| [current-pipeline.md](./current-pipeline.md)               | **Historical snapshot** of the pipeline before R17.0 — line numbers no longer apply |
| [module-ownership.md](./module-ownership.md)               | Which stage owns which function, and what the split must not reintroduce            |
| [ir-contract.md](./ir-contract.md)                         | Rust IR vs the TypeScript `compiler-shared` IR, and why one is stale                |
| [dependency-upgrade-plan.md](./dependency-upgrade-plan.md) | Every dependency version, verified against the registry, with what was held and why |
| [performance-baseline.md](./performance-baseline.md)       | Throughput before/after the split, and what was not measured                        |
| [migration-report.md](./migration-report.md)               | What moved, what stayed, and the remaining debt                                     |
| [validation-matrix.md](./validation-matrix.md)             | Which behaviour is verified by which test, and what only CI can verify              |

## The pipeline

```
input
  → nesting guard          support/nesting.rs     reject input that would exhaust the parser stack
  → parse + semantic       lower/mod.rs            Oxc parser and SemanticBuilder
  → lower                  lower/mod.rs            JSX semantics → ModuleIr
  → validate               ssr.rs                  target-specific rejection
  → analyse                analysis/, codegen/analysis.rs   facts the emitter needs
  → emit                   codegen/dom/, ssr.rs    ModuleIr + facts → JavaScript
  → plans                  analysis/hydration.rs, passes/hmr.rs   hydration plan, HMR slots
```

`passes/` rewrites the IR without changing its meaning; `analysis/` reads the IR
and produces plans. Details, including which layer may import which, are in
[pipeline.md](./pipeline.md).

Each stage has one job. The rule that keeps it that way: **a stage may compute
facts and record them; it may not reach into a later stage to re-derive them.**

## Changing the compiler

- **A new JSX semantic** goes in `lower/mod.rs` as a `lower_*` method producing an
  IR node, plus an emitter for each target. Add a golden fixture first.
- **A new diagnostic** is a `CompilerDiagnostic::error(code, message, file,
span)` pushed through the lowering context. Codes are `ZEUS_*` and stable.
- **A new optimisation** is a function over `ModuleIr` that runs before
  emission, not a change inside an emitter.
- **An Oxc upgrade** starts with `cargo check`; if it reports `JSStr` or
  `Option<&str>` errors, the MSRV has moved too and the whole toolchain plus
  native matrix has to move with it. See the dependency plan.

## The safety net

`crates/zeus_compiler/tests/golden.rs` snapshots the compiler's entire
observable output — generated code, source map, diagnostics, hydration plan,
HMR plan — for 45 inputs. A refactor that changes any of it fails with the
field name. Regenerate deliberately:

```bash
ZEUS_UPDATE_GOLDEN=1 cargo test -p zeus_compiler --test golden
```

A snapshot refreshed to make a refactor pass proves nothing. Every
regeneration needs a reason in the commit.
