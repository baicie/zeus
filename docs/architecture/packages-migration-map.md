# R16.0 Package Migration Map

The physical reorganization of `packages/` into six domains. No npm package
name, version, `private` flag or public API changed — only where the package
lives in the repository.

---

## Migrated paths

21 packages moved. The other 17 (`core/{shared,signal,runtime-dom,runtime-ssr,zeus}`,
all of `web-c/`, `create/{zeus-ui,registry}`) already lived in the right domain
and kept their paths.

| #   | npm name                                    | Old path                                         | New path                                             |
| --- | ------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------- |
| 1   | `@zeus-js/router`                           | `packages/core/router`                           | `packages/features/router`                           |
| 2   | `@zeus-js/resource`                         | `packages/core/resource`                         | `packages/features/resource`                         |
| 3   | `@zeus-js/query`                            | `packages/core/query`                            | `packages/features/query`                            |
| 4   | `@zeus-js/i18n`                             | `packages/core/i18n`                             | `packages/features/i18n`                             |
| 5   | `@zeus-js/testing`                          | `packages/core/testing`                          | `packages/tooling/testing`                           |
| 6   | `@zeus-js/compiler`                         | `packages/core/compiler`                         | `packages/compiler/compiler`                         |
| 7   | `@zeus-js/compiler-shared`                  | `packages/core/compiler-shared`                  | `packages/compiler/compiler-shared`                  |
| 8   | `@zeus-js/compiler-native`                  | `packages/core/compiler-native`                  | `packages/compiler/compiler-native`                  |
| 9   | `@zeus-js/compiler-wasm`                    | `packages/core/compiler-wasm`                    | `packages/compiler/compiler-wasm`                    |
| 10  | `@zeus-js/compiler-native-darwin-arm64`     | `packages/core/compiler-native-darwin-arm64`     | `packages/compiler/compiler-native-darwin-arm64`     |
| 11  | `@zeus-js/compiler-native-darwin-x64`       | `packages/core/compiler-native-darwin-x64`       | `packages/compiler/compiler-native-darwin-x64`       |
| 12  | `@zeus-js/compiler-native-linux-arm64-gnu`  | `packages/core/compiler-native-linux-arm64-gnu`  | `packages/compiler/compiler-native-linux-arm64-gnu`  |
| 13  | `@zeus-js/compiler-native-linux-x64-gnu`    | `packages/core/compiler-native-linux-x64-gnu`    | `packages/compiler/compiler-native-linux-x64-gnu`    |
| 14  | `@zeus-js/compiler-native-linux-x64-musl`   | `packages/core/compiler-native-linux-x64-musl`   | `packages/compiler/compiler-native-linux-x64-musl`   |
| 15  | `@zeus-js/compiler-native-win32-arm64-msvc` | `packages/core/compiler-native-win32-arm64-msvc` | `packages/compiler/compiler-native-win32-arm64-msvc` |
| 16  | `@zeus-js/compiler-native-win32-x64-msvc`   | `packages/core/compiler-native-win32-x64-msvc`   | `packages/compiler/compiler-native-win32-x64-msvc`   |
| 17  | `@zeus-js/vite-plugin`                      | `packages/devtools/vite-plugin`                  | `packages/tooling/vite-plugin`                       |
| 18  | `@zeus-js/eslint-plugin`                    | `packages/devtools/eslint-plugin`                | `packages/tooling/eslint-plugin`                     |
| 19  | `@zeus-js/playground-engine`                | `packages/devtools/playground-engine`            | `packages/tooling/playground-engine`                 |
| 20  | `@zeus-js/devtools-consumer`                | `packages/devtools/consumer`                     | `packages/tooling/consumer`                          |
| 21  | `create-zeus`                               | `packages/devtools/create-zeus`                  | `packages/create/create-zeus`                        |

The old `packages/devtools/` directory (retired path) was left empty by the move and was removed.

### Unchanged

| Domain   | Packages                                                 |
| -------- | -------------------------------------------------------- |
| `core`   | `shared`, `signal`, `runtime-dom`, `runtime-ssr`, `zeus` |
| `web-c`  | all 10                                                   |
| `create` | `zeus-ui`, `registry`                                    |

---

## Resulting distribution

| Domain     | Count  | Packages                                                                                                                                               |
| ---------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `core`     | 5      | shared, signal, runtime-dom, runtime-ssr, zeus                                                                                                         |
| `compiler` | 11     | compiler, compiler-shared, compiler-native, compiler-wasm, 7 × native platform                                                                         |
| `features` | 4      | router, resource, query, i18n                                                                                                                          |
| `web-c`    | 10     | component-analyzer, component-dts, bundler-plugin, web-c-runtime, web-c, output-wc, output-css, output-icons, output-react-wrapper, output-vue-wrapper |
| `tooling`  | 5      | vite-plugin, eslint-plugin, testing, playground-engine, consumer                                                                                       |
| `create`   | 3      | create-zeus, zeus-ui, registry                                                                                                                         |
| **total**  | **38** |                                                                                                                                                        |

---

## Configuration changed

Every entry below was a real path reference, not a text substitution pass.

### Workspace and build

| File                  | Change                                                                                     |
| --------------------- | ------------------------------------------------------------------------------------------ |
| `pnpm-workspace.yaml` | `packages/devtools/*` → `packages/compiler/*`, `packages/features/*`, `packages/tooling/*` |
| `pnpm-lock.yaml`      | regenerated                                                                                |
| `tsconfig.json`       | `@zeus-js/*` path globs and `include` cover the new domains                                |
| `tsconfig.build.json` | 21 source entries repointed                                                                |
| `vitest.config.ts`    | test globs and the create-zeus template exclusion                                          |
| `eslint.config.js`    | ignore entries and file-scoped rule selectors                                              |
| `Cargo.toml`          | `workspace.members`: `packages/core/compiler-native` and `-wasm` → `packages/compiler/`    |
| `package.json`        | `clean` globs, `check:vite-plugin-package` path, new `check:structure` script              |

### The package discovery root

`scripts/shared/utils.ts` — `findWorkspacePackages()` hardcoded a scan of
`packages/core`, `packages/devtools`, `packages/web-c`, `packages/create`.
Every script that enumerates packages goes through it, including the vitest
alias generator, so a stale list here breaks module resolution across the whole
test suite rather than failing loudly. It now scans all six domains.

### Scripts that hardcoded a domain directory

| File                                                              | What it did                                                               |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `scripts/check/check-native-packages.ts`                          | read platform manifests from `packages/core/<name>`                       |
| `scripts/check/check-hmr-packed.ts`                               | located the host `.node` under `packages/core`                            |
| `scripts/check/check-zeus-package-versions.ts`                    | `DEFAULT_PACKAGE_ROOTS` and the required-fixed-roots list                 |
| `scripts/check/check-runtime-dependency-boundary.ts`              | workspace directory candidates, host binary path                          |
| `scripts/check/canary-readiness.ts`                               | host binary candidates, create-zeus template regex                        |
| `scripts/ci/impact-analysis.ts`                                   | compiler path rules matched only the old `packages/core/compiler*` prefix |
| `scripts/release/rc-manifest.ts`                                  | native platform package presence check                                    |
| `scripts/release/create-zeus-candidate-matrix.ts`                 | host native binary directory                                              |
| `scripts/release/smoke-compiler-install.ts`                       | `pnpm pack` target directory                                              |
| `scripts/release/version-rehearsal.ts`                            | `DEFAULT_TEMPLATES_ROOT`                                                  |
| `scripts/release/create-zeus-versions.ts`                         | template root and vite-plugin manifest                                    |
| `.github/workflows/compiler-native.yml`                           | `paths:` trigger filter                                                   |
| `benchmarks/component-host/tsconfig.json`                         | compiler `global.d.ts` include                                            |
| `examples/{admin,devtools-panel}/tsconfig.json`, `vite.config.ts` | devtools consumer source path                                             |
| `crates/zeus_compiler/tests/ir.rs`                                | canonical IR fixture path                                                 |

### Package metadata

`repository.directory` was corrected in 21 `package.json` files. A wrong value
points readers and provenance tooling at a directory that no longer exists;
`check:structure` now fails when a declared value disagrees with the real path.

---

## History preserved

Every move used `git mv`, so `git log --follow` still traces each file through
the reorganization. Use `git log --follow -- packages/features/router/src/index.ts`
to see work done before the move (retired path: `packages/core/router/`).

---

## Old-path references intentionally left

These files contain old paths as **historical record**. They describe what was
true at a point in time, and rewriting them would falsify an audit trail.

| Kind                                              | Location                                                 |
| ------------------------------------------------- | -------------------------------------------------------- |
| Release records and incident reports              | `docs/release/**`                                        |
| Internal engineering reports                      | `docs/internal/**`                                       |
| Acceptance and evidence reports                   | `docs/acceptance/**`, `docs/security/**`                 |
| RFCs (written against the old layout)             | `docs/rfcs/**`                                           |
| The frozen historical RC manifest                 | `docs/release/0.2.0-rc-manifest.json`                    |
| The size baseline (recorded at a specific commit) | `scripts/size/baseline/2026-11-12.json`                  |
| The incident audit for this task                  | `docs/architecture/r16-phase0-release-incident-audit.md` |

`docs/release/0.2.0-rc-manifest-candidate.json` is regenerated from the working
tree and is expected to reflect the new layout on its next run.

---

## Verification

| Check                                    | Result                        |
| ---------------------------------------- | ----------------------------- |
| `pnpm check:structure`                   | pass — 6 domains, 38 packages |
| `pnpm check` (tsc)                       | pass                          |
| `pnpm check:structure` adversarial suite | 10/10 pass                    |
| `pnpm test-unit`                         | see §Remaining issues         |
| Release groups                           | 32 fixed / 8 native unchanged |
| npm package names                        | unchanged                     |
| `private` flags                          | unchanged                     |

### Remaining issues

Two failure groups in `pnpm test-unit` are environmental, not layout-related:

- `examples/admin/server/__tests__/{api,database}.spec.ts` — `node:sqlite`
  requires Node 22.5+ with the flag enabled; this machine runs 22.12.0 without it.
- Long-running web-c declaration tests time out under full-suite concurrency and
  pass when run alone. They build real packages and are sensitive to parallel load.

Neither touches a path this migration changed.
