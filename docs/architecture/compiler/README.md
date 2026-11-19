# Zeus Compiler Architecture

The compiler lives in `crates/zeus_compiler` and has two hosts: a napi binding
for Node (`packages/core/compiler-native`) and a WASM build
(`packages/core/compiler-wasm`). Both call the same `transform_module`.

## Documents

| Document                                                   | What it answers                                                                     |
| ---------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| [current-pipeline.md](./current-pipeline.md)               | What the compiler does today, with a call graph                                     |
| [module-ownership.md](./module-ownership.md)               | Which stage owns which function, and what the split must not reintroduce            |
| [ir-contract.md](./ir-contract.md)                         | Rust IR vs the TypeScript `compiler-shared` IR, and why one is stale                |
| [dependency-upgrade-plan.md](./dependency-upgrade-plan.md) | Every dependency version, verified against the registry, with what was held and why |
| [performance-baseline.md](./performance-baseline.md)       | Throughput before/after the split, and what was not measured                        |
| [migration-report.md](./migration-report.md)               | What moved, what stayed, and the remaining debt                                     |
| [validation-matrix.md](./validation-matrix.md)             | Which behaviour is verified by which test, and what only CI can verify              |

## The pipeline

```
input
  → nesting guard          support/nesting.rs      reject input that would exhaust the parser stack
  → parse + semantic       lower.rs               Oxc parser and SemanticBuilder
  → lower                  lower.rs               JSX semantics → ModuleIr
  → validate               ssr.rs                 target-specific rejection
  → analyse                codegen/analysis.rs    which events delegate, which names collide
  → emit                   codegen/{dom,ssr}.rs   ModuleIr + facts → JavaScript
  → source map, plans      codegen, support       map, hydration plan, HMR plan
```

Each stage has one job. The rule that keeps it that way: **a stage may compute
facts and record them; it may not reach into a later stage to re-derive them.**

## Changing the compiler

- **A new JSX semantic** goes in `lower.rs` as a `lower_*` method producing an
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
