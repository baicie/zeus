# PR-27 Playground Engine Evidence

Date: 2026-11-03

## A. Baseline

- Repository: `/Users/liuzhiwei/Desktop/workspace/git-code/zeus`
- Worktree: `temp/worktrees/pr21-template-registry`
- Branch: `codex/pr27-playground-engine`
- Base and start HEAD: `712dc7c`
- Final code HEAD: `d9a9dc5`
- Worktree policy: the main checkout retains only the user's pre-existing
  `Cargo.toml` modification
- Existing work reused: PR-08 Rust/WASM compiler, PR-17 hydration, PR-20
  forms/testing, PR-22 DevTools, and the PR-23 editor/lint commit were not
  reimplemented

## B. Changes

### DONE

- Schema-version 2 `ProjectSnapshot` with path, file count, UTF-8 byte,
  dependency, option, and timeout validation.
- Dependency-first multi-file TS/TSX compilation for DOM and SSR, including
  static and literal dynamic import graph traversal, CSS collection, per-module
  source maps, and diagnostics.
- Browser preview linker with a Zeus runtime allowlist, TypeScript stripping,
  cycle/non-literal-import rejection, and a one-second loop budget.
- Versioned sandbox message parser with 2 MiB limit, 64-message/second host
  budget, request/session validation, opaque-origin checks, and exact window
  source checks.
- Distinct-origin, opaque iframe execution with `sandbox="allow-scripts"`,
  restrictive CSP, blocked network/workers/frames/forms, fresh realm per build,
  and hard timeout.
- Deterministic standalone `.tar.gz` export with original files, auto-mount
  entry, Vite/TypeScript configuration, pinned direct dependencies, and blocked
  dependency install scripts.
- Public package README, API snapshot, CJS contract, RFC-020, compiler-host
  guide, example README, changeset, and progress ledger update.

### Not enabled

- Server-side compiler fallback: WASM Worker satisfies this slice; a future
  fallback remains constrained by RFC-020.
- WebC Studio and Native Lab product shells: these remain PR-28/29 and consume
  this shared engine.
- Production deployment: no URL or deployment authorization exists for PR-27.

## C. Validation

| Command                                                                       | Environment                                                     | Result                         | Evidence                                                                                                               |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| `pnpm check`                                                                  | Node 24.18.0, macOS arm64                                       | PASS                           | TypeScript incremental check                                                                                           |
| `pnpm exec vitest --run --project 'unit*' --maxWorkers=2 --testTimeout=60000` | Node 24.18.0                                                    | PASS, 177 files / 1,934 tests  | Isolated rerun resolves the pre-existing 20 s React type-test contention                                               |
| `pnpm exec vitest run packages/devtools/playground-engine/__tests__`          | Node 24.18.0                                                    | PASS, 5 files / 19 tests       | Project, graph, preview, message, export contracts                                                                     |
| `pnpm check:playground-editor`                                                | Node 24.18.0; Chromium 156.0.8078.4, Firefox 157.0, WebKit 27.2 | PASS                           | [`browser-report.json`](./browser-report.json)                                                                         |
| `pnpm lint`                                                                   | ESLint 10.5.0                                                   | PASS                           | Repository lint                                                                                                        |
| `pnpm format-check`                                                           | Prettier 3.8.4                                                  | PASS                           | Repository formatting                                                                                                  |
| `pnpm check:cjs`                                                              | Node 24.18.0                                                    | PASS, 22 packages / 31 exports | Includes `@zeus-js/playground-engine`                                                                                  |
| `pnpm check:exports`                                                          | Node 24.18.0                                                    | PASS                           | Public export boundary                                                                                                 |
| `pnpm check:docs`                                                             | Node 24.18.0                                                    | PASS                           | Guide and local links                                                                                                  |
| `pnpm check:repository`                                                       | Node 24.18.0                                                    | PASS                           | Package metadata                                                                                                       |
| `pnpm check:release-artifacts`                                                | Node 24.18.0                                                    | PASS, 29 tarballs              | Published package shape                                                                                                |
| Packed ESM + CJS consumer                                                     | Node 24.18.0, pnpm 10.34.3                                      | PASS                           | Temporary 40-package external install                                                                                  |
| `pnpm audit --prod --audit-level=high`                                        | npm registry, 2026-11-03                                        | PASS, exit 0                   | 1 low and 1 moderate finding remain in unrelated `examples/stencil-wrapper` transitive tools; no high/critical finding |

The browser gate performs:

- initial multi-file DOM/SSR compilation and source-map inspection;
- direct interaction with the live counter;
- an edit in `counter.tsx` that changes DOM, SSR, and preview output;
- invalid TSX diagnostics and recovery;
- a fresh iframe/session assertion for each build;
- parent DOM, storage, and cookie isolation;
- blocked `/secret` network request;
- malformed postMessage injection;
- infinite-loop budget rejection and recovery;
- export download, archive extraction, external install, `tsc`, Vite build, and
  browser interaction.

The retained export archive is
[`zeus-playground-export.tar.gz`](./zeus-playground-export.tar.gz), SHA-256:
`000dbed083013e1793757dbe047e9c383b8e0bbe3247cc58e8cbbc96fad39eb0`.

## D. Security and Performance

Security boundaries exercised:

- Host and sandbox hostnames differ (`127.0.0.1` vs `localhost`).
- The sandbox omits `allow-same-origin`; its JavaScript origin is `"null"`.
- Parent cookies, parent localStorage, and parent DOM access all failed.
- CSP blocked `fetch` before reaching the test server.
- The host ignored malformed and cross-session messages.
- Each build receives a new nonce/realm, preventing runtime mutation leaking
  into the next preview.
- A `while (true)` loop stopped through `ZEUS_PLAYGROUND_LOOP_BUDGET`, followed
  by a successful fresh build.

Limits:

- 32 files;
- 128 KiB per file;
- 512 KiB per project;
- 2 MiB serialized sandbox message;
- 64 accepted source-message evaluations per second at the host;
- 1 s injected loop budget and 3 s host hard preview timeout.

Final production example bundle sizes from Vite:

| Output                   |         Raw |      Gzip |
| ------------------------ | ----------: | --------: |
| Main app JS              |    14.01 kB |   5.47 kB |
| Playground engine        |   392.07 kB | 108.72 kB |
| Babel preview-only chunk | 2,207.20 kB | 563.96 kB |
| Sandbox runner           |     3.69 kB |   1.80 kB |
| Compiler WASM            | 1,530.36 kB | 472.96 kB |

Babel is dynamically loaded only on preview linking; it is not in the initial
app chunk. No performance threshold is asserted because the design kit requires
an M7 baseline for budget approval.

## E. Git / PR

- Code and initial evidence are committed locally as `d9a9dc5` on
  `codex/pr27-playground-engine`; this report records that SHA.
- Push, Draft PR creation, merge, npm publication, and deployment were not
  authorized and were not performed.
- CI was not triggered because the branch was not pushed.

## F. Risks and Follow-up

- Browser memory exhaustion cannot be made byte-for-byte deterministic from
  JavaScript. The loop budget and hard iframe timeout are covered; process-level
  memory controls remain an M7 hardening item.
- The preview-only Babel chunk is large in absolute gzip terms. It is
  code-split, but a compiler-side JS emission path could remove it later.
- External export validation ran on macOS with Node 24. Windows/Linux matrix is
  not run.
- Arbitrary npm packages, non-literal dynamic imports, module cycles, and
  style re-exports are intentionally rejected in browser preview.
- WebC Studio, Native Lab, production URLs, deep-link deployment, and
  cross-origin cache policy remain PR-28/29/34 follow-up work.

## G. Stop Decision

`READY_FOR_REVIEW`

No secrets, paid model calls, production writes, package publication, or merge
were performed.
