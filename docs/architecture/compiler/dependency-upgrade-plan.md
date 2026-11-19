# Compiler Dependency Upgrade Plan

Versions verified against crates.io and the npm registry on 2026-11-19, not
from memory. Every version below was read from `cargo search --registry
crates-io`, `cargo info`, `rustup check` or `npm view`.

---

## Summary

| Dependency        | Before  | After       | Breaking changes | Tests                      | Verdict              |
| ----------------- | ------- | ----------- | ---------------- | -------------------------- | -------------------- |
| `oxc_parser`      | 0.144.0 | **0.146.0** | none             | 153 pass, golden identical | upgraded             |
| `oxc_ast`         | 0.144.0 | **0.146.0** | none             | same                       | upgraded             |
| `oxc_ast_visit`   | 0.144.0 | **0.146.0** | none             | same                       | upgraded             |
| `oxc_semantic`    | 0.144.0 | **0.146.0** | none             | same                       | upgraded             |
| `oxc_span`        | 0.144.0 | **0.146.0** | none             | same                       | upgraded             |
| `oxc_allocator`   | 0.144.0 | **0.146.0** | none             | same                       | upgraded             |
| `oxc_diagnostics` | 0.144.0 | **0.146.0** | none             | same                       | upgraded             |
| `oxc_syntax`      | 0.144.0 | **0.146.0** | none             | same                       | upgraded             |
| `oxc_sourcemap`   | 8.1.2   | 8.1.2       | —                | —                          | **held** (see below) |
| `napi`            | 3.12.1  | **3.16.2**  | none             | native host compiles       | upgraded             |
| `napi-derive`     | 3.6.3   | **3.7.1**   | none             | same                       | upgraded             |
| `napi-build`      | 2.4.1   | **2.6.0**   | none             | same                       | upgraded             |
| `serde`           | 1.0.228 | 1.0.229     | none             | transitive                 | follow-on            |
| Rust toolchain    | 1.95.0  | 1.95.0      | —                | —                          | **held** (see below) |
| `@napi-rs/cli`    | 3.6.2   | 3.10.12     | unknown          | not run                    | **deferred**         |
| TypeScript        | ^6.0.3  | 7.0.2       | major            | not run                    | **deferred**         |
| Vitest            | ^4.1.9  | 5.1.1       | major            | not run                    | **deferred**         |
| Rolldown          | 1.1.2   | 1.3.3       | minor-major      | not run                    | **deferred**         |

---

## The Oxc decision

Three candidates were evaluated by actually building against each:

| Oxc              | MSRV     | Compile errors against this tree |
| ---------------- | -------- | -------------------------------- |
| 0.144.0 (before) | 1.90     | 0                                |
| **0.146.0**      | **1.95** | **0**                            |
| 0.159.0 (latest) | 1.98     | not reached — toolchain rejects  |

`0.159.0` is the latest stable and requires rustc 1.98.0. This repository pins
1.95.0, and the newest toolchain available locally is 1.97.1, so the upgrade
would first require moving the whole repository — CI, the seven-platform
native matrix, the WASM build — to a newer compiler.

Even with a newer toolchain, 0.158 was tried (`0.158.0` also needs 1.97) and it
produced 20 compile errors, all of the same kind: `StringLiteral::value` became
`oxc_str::JSStr`, which no longer implements `Display`/`ToString`, and
`Program::source_text` became `Option<&str>`. Those are 14 minor releases of
accumulated breakage across 20 call sites in `lower.rs`, `support/hmr.rs` and
`codegen`. That is a real migration, not a version bump.

`0.146.0` is the newest Oxc that keeps the current MSRV and it compiles this
tree unchanged: 0 errors, 153 tests pass, and all 45 golden fixtures are
byte-identical. It is a genuine upgrade within the constraint, not a no-op —
the lockfile moves every Oxc crate from 0.144 to 0.146.

**Why not jump to 0.159 anyway:** the task says not to raise the MSRV without
stating why, and the only reason to raise it would be to chase the newest
number. There is no bug or feature being waited on. A toolchain-and-Oxc jump
belongs in its own change with its own CI evidence, which this machine cannot
produce (no 1.98 toolchain, and the seven-platform matrix runs only in GitHub
Actions).

**Recorded as a follow-up:** upgrading to Oxc 0.159 + Rust 1.98 requires the
`JSStr` migration. It is tracked, not silently skipped.

### Why `oxc_sourcemap` stays at 8.1.2

`oxc_sourcemap` has an independent version line (latest 10.0.0) and is not part
of the Oxc 0.146 family. Bumping it alone would be an untested change in the
source-map writer with no corresponding parser upgrade — the one place where
"the versions look inconsistent" is safer than "they match". It moves when the
Oxc family moves.

---

## The Rust toolchain decision

`rust-toolchain.toml` and `Cargo.toml` stay at **1.95.0**.

- It is the exact MSRV of Oxc 0.146, so the chosen dependency set builds on it.
- Latest stable is 1.100.0 (2026-11-09). Moving there gains nothing the
  compiler needs and would need a full native-matrix run to trust.
- These three must move together — `rust-toolchain.toml`, the CI `rustup`
  setup, and the cargo cache key — which is why it is one decision, not three.

CI runners should be checked for a matching toolchain: the repository pins it,
so a runner with only 1.95 will use 1.95 everywhere, which is what the local
verification also used.

---

## Deferred npm upgrades

These are not compiler-critical and were not run, so they cannot be marked
upgraded:

| Dependency     | Before | Latest  | Why deferred                                                                                                                        |
| -------------- | ------ | ------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `@napi-rs/cli` | 3.6.2  | 3.10.12 | Drives the seven-platform `.node` build and the loader's naming. Needs the native matrix to verify; a local pass would not cover it |
| TypeScript     | ^6.0.3 | 7.0.2   | Major version; affects every package's declaration output. Belongs in its own PR with `build-dts` and `check:exports` evidence      |
| Vitest         | ^4.1.9 | 5.1.1   | Major version; the suite has 200+ files. Same reasoning                                                                             |
| Rolldown       | 1.1.2  | 1.3.3   | Bundler output affects every published package's bytes                                                                              |

Each is a real upgrade with real risk. Grouping them under "done" because the
Rust side moved would be the kind of claim this document exists to prevent.

---

## Verification performed

| Check                                                        | Result          |
| ------------------------------------------------------------ | --------------- |
| `cargo check -p zeus_compiler`                               | pass            |
| `cargo check -p zeus_compiler_node` (napi host)              | pass            |
| `cargo check -p zeus_compiler_wasm`                          | pass            |
| `cargo test --workspace --locked`                            | all suites pass |
| 45 golden fixtures                                           | byte-identical  |
| `cargo fmt --all -- --check`                                 | clean           |
| `cargo clippy -p zeus_compiler --all-targets -- -D warnings` | clean           |

Native and WASM hosts were both compiled against the new dependency set. That
is a compile-level parity check, not a runtime parity check: `test:compiler-wasm`
and the seven-platform matrix need GitHub Actions and were not run here.
