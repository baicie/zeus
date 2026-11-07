# Zeus 0.2.0 — Overnight Mission Final Report

Report time: 2026-11-08 03:55 Asia/Shanghai
Mission start: 2026-11-08 00:08 Asia/Shanghai (prompt received)
Active runtime: ~3 h 47 min
Last checkpoint: `18b40f4` on `docs/overnight-2026-11-08`

## Final verdict

**BLOCKED_BY_CODE**

All code changes produced by this mission are committed, pushed and Draft-PR
green. The one remaining code/release-gate gap is RC-04's candidate tarball
coverage for non-basic create-zeus templates and the UI `@zeus-web` packages.
RC-07, manual A11y, and real online acceptance are environment/authorization
blocked, not code failures.

## 1. Repositories and SHAs

| Repo | Start / final main                                     | Mission branches                                                                                                               |
| ---- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------ |
| Core | `39f90c7f1e73721e805914d19e53c456d0913a55` (unchanged) | #202 `dfa6794`, #203 `fa0c55c`, #204 `8fa5774`, #205 `872be70`, #206 `ce594f7`, #207 `08a872e`, #208 `739cfad`, #209 `658181a` |
| UI   | `7a38f18abe79b9c969bbe04d23b9e80c0ab1d937` (unchanged) | #126 `ffe7801`, #127 `3c858cf`, #128 `c13d0d3`                                                                                 |

No branch was merged into either main branch. The only main-branch changes are
the earlier, separately authorized R4.4 merges (#199/#200/#201/#125).

## 2. Core source reviewed

- Rust compiler: `crates/zeus_compiler/src/{lib,lower,codegen,hydration,hmr,span,nesting}.rs`,
  `crates/zeus_compiler/tests/*`, `packages/core/compiler-native/src/lib.rs`,
  `packages/core/compiler-wasm/{index.js,src/lib.rs,__tests__}`.
- Signal: `packages/core/signal/src/{effect,dep,reactive,ref,watch,effectScope,arrayInstrumentations}.ts`.
- DOM/SSR/WebC: `runtime-dom/src/{render,autoHydration,list,defineElement,bindings,spread}.ts`,
  `runtime-ssr/src/{streaming,serialize,element}.ts`, WebC runtime/lifecycle tests.
- Release: `scripts/release/{deployment-transaction,deployment-layout,assemble-rc-evidence,create-zeus-versions,check-latest-tags}.ts`,
  `scripts/check/{rc-readiness,check-admin,check-ui-pairing,check-create-zeus-candidate}.ts`,
  release/deploy workflows.
- UI: `examples/ai-host/src/{public-replay,protocol-server,server}.ts`,
  `data-grid/src/components/data-grid.tsx`, input runtime tests.

## 3. Findings

| ID   | Severity | Status                          | Summary                                                                                                        |
| ---- | -------- | ------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| F-01 | P0       | FIXED_IN_PR                     | data-grid beta.33 rAF focus restore stole focus from Playwright fill; Admin WebKit failure                     |
| F-02 | P0       | FIXED_IN_PR                     | public replay recursively deleted a workspace root on seed change                                              |
| F-03 | P1       | FIXED_AND_DRILLED               | Stage 2 did not back up the AI workspace bind mount                                                            |
| F-04 | P0       | FIXED_IN_PR                     | RC evidence was not HEAD/run/deployment bound; hand-written URLs could pass                                    |
| F-05 | P1       | FIXED_IN_PR                     | versioning dirtied the worktree before RC readiness                                                            |
| F-06 | P1       | FIXED_IN_PR                     | two public packages were outside the release group                                                             |
| F-07 | P1       | FIXED_FOR_BASIC_TEMPLATE        | create-zeus pins were stale; candidate tarball build added for `basic-ts`; non-basic/UI templates remain RC-04 |
| F-08 | P1       | FIXED_IN_PR                     | no Core/UI exact-pin pairing gate                                                                              |
| F-09 | P1       | FIXED_CHECK / BLOCKED_OPERATION | 13 prerelease `latest` dist-tags; npm auth unavailable                                                         |
| F-10 | P0/P1    | PARTIAL                         | compiler/signal/DOM audit; residual DOM/WebC P2 list remains                                                   |
| F-11 | P0       | BLOCKED                         | manual VoiceOver/NVDA, 200% zoom, mobile acceptance                                                            |
| F-12 | P0       | BLOCKED                         | real online RC acceptance/deployment evidence                                                                  |
| F-13 | P0       | FIXED_IN_PR                     | native preflight misclassified TS generics and could SIGILL the host                                           |
| F-14 | P1       | FIXED_IN_PR                     | empty Fragment root referenced an undeclared `$zeusTmpl`                                                       |
| F-15 | P1       | FIXED_IN_PR                     | wasm host had no preflight and trapped on deep input                                                           |
| F-16 | P1       | FIXED_IN_PR                     | wasm browser gate asserted the trap as expected behavior                                                       |
| F-17 | P1       | OPEN / BLOCKED_BY_CODE          | RC-04 non-basic/UI candidate tarball coverage                                                                  |
| F-18 | P1       | BLOCKED                         | RC-07 actual dist-tag repair (ENEEDAUTH; npmmirror registry)                                                   |
| F-19 | P2       | OPEN / NEEDS_DECISION           | WebC `render()` string output is assigned to `innerHTML`; authors must not interpolate untrusted data          |

## 4. Root causes fixed

1. **Admin WebKit** — scheduled active-cell focus restore raced `selectText`/
   `insertText`; fixed in UI #128 and drained deterministically in Core #205.
2. **AI storage** — destructive `rmSync(workspaceRoot)` replaced by versioned
   generation directories with broad-root and symlink rejection (UI #126).
3. **AI workspace rollback** — `ai-workspace.tgz` + SHA-256; restore keeps the
   previous tree until the new move and chown commit, then deletes it (Core #203);
   real `ROLLED_BACK` drill passed.
4. **RC evidence** — only trusted Stage 2 artifacts, bound to repo/workflow/run/
   commits/environment/digests/staleness; negative cases fail closed (#202).
5. **Native/WASM preflight** — scanner shared in `zeus_compiler`, per-target
   weight tables; native 8,192 / wasm 506 JSX levels; no SIGILL/trap (#206).
6. **O(N²) lowering** — UTF-16 checkpoints every 256 bytes and per-base suffix
   allocation; 3,200 nested Show 545 ms → 27 ms; 6,400 levels 41 ms (#207).
7. **Signal error isolation** — subscriber/batch errors isolated; computed
   failures not cached; failed watches stopped; 312/312 (#204).
8. **SSR streaming** — boundary-safe chunks, surrogate pairs, iterator cleanup,
   `flushAt` validation; 22/22 (#208).
9. **Hydration form state** — only native form controls skip the first adopted
   write; custom elements hydrate correctly; 412/412 (#209).

## 5. Draft PRs and latest CI

| PR        | Title / scope                                     | Latest CI                                             |
| --------- | ------------------------------------------------- | ----------------------------------------------------- |
| Core #202 | RC evidence, release gates, candidate create-zeus | rerun after pin-test portability fix (previous 30/30) |
| Core #203 | AI workspace backup/restore                       | 22/22 SUCCESS                                         |
| Core #204 | Signal error isolation and recovery               | 23/23 SUCCESS                                         |
| Core #205 | Admin focus drain (test-only)                     | 22/22 SUCCESS                                         |
| Core #206 | Native + WASM compiler preflight                  | 30/30 SUCCESS                                         |
| Core #207 | Empty Fragment + linear span/name lookup          | 26/26 SUCCESS                                         |
| Core #208 | SSR streaming safety                              | 23/23 SUCCESS                                         |
| Core #209 | Hydration form-state ownership                    | 23/23 SUCCESS                                         |
| UI #126   | Public replay generation isolation                | 27 SUCCESS / 1 SKIP                                   |
| UI #127   | Controlled input regression tests                 | 27 SUCCESS / 1 SKIP                                   |
| UI #128   | data-grid focus-restore fix                       | 27 SUCCESS / 1 SKIP                                   |

All remain Draft; none is Ready or merged.

## 6. Native matrix

Core Compiler Native Matrix on main `39f90c7`: **7/7 PASS** (run 42386212154).
PR #206 additionally proves native 14/14 Rust tests, wasm/native parity 4/4,
a deterministic 200-case JSX fuzz parity run, and no trap for 24 constructs in
Chromium/Firefox/WebKit.

## 7. Admin / AI / Playground matrix

| Surface                       | Result  | Evidence                                      |
| ----------------------------- | ------- | --------------------------------------------- |
| Admin Chromium                | PASS    | PR #205/#209 packed-consumers                 |
| Admin Firefox                 | PASS    | same                                          |
| Admin WebKit                  | PASS    | same (after focus fix)                        |
| Admin login/session/CSRF/RBAC | PASS    | earlier R4.4 evidence; CI checks              |
| AI public replay three-engine | PASS    | UI #126/#127 CI; read-only probes from R4.4   |
| AI HTTP/SSE read-only suite   | PASS    | UI CI                                         |
| Playground three-engine       | PARTIAL | R4.4 online evidence; not re-run this mission |
| DataGrid framework browser    | PASS    | UI CI                                         |
| Windows/Linux CI              | PASS    | PR matrices                                   |

## 8. RC-01 … RC-07 closure

| Gate                                        | Status                         | Evidence / remainder                                         |
| ------------------------------------------- | ------------------------------ | ------------------------------------------------------------ |
| RC-01 Release workflow trusted evidence     | PASS (PR #202)                 | v3 evidence, trusted artifact, negative tests                |
| RC-02 Version rewrite / clean worktree      | PASS (PR #202)                 | release snapshot, guard, restore tests                       |
| RC-03 Public packages / fixed group         | PASS (PR #202)                 | 31-package group, package version checks                     |
| RC-04 Create Zeus pins / candidate tarballs | PARTIAL                        | pins + `basic-ts` candidate PASS; non-basic/UI tarballs open |
| RC-05 Core/UI pairing and order             | PASS (PR #202)                 | exact pins, UI checkout, pairing gate                        |
| RC-06 Real online evidence in readiness     | PASS (PR #202)                 | accepts only ONLINE_ACCEPTED/ONLINE_PASS bound data          |
| RC-07 npm dist-tag policy                   | CHECK PASS / OPERATION BLOCKED | latest-tag audit; `npm whoami` ENEEDAUTH                     |

## 9. Test matrix (three rounds)

Round 1 — local:

- signal 312/312; runtime-dom 412/412; compiler 62/62 + 5 lib; SSR 22/22;
  RC release/check 192/192 plus create-zeus pin tests; wasm parity 4/4; clippy/fmt/tsc/ESLint clean.

Round 2 — real integration / CI:

- Every PR check above; Admin three engines; packed consumers; Windows/Linux
  matrices; wasm browser check; native matrix; UI unit/type/dts.

Round 3 — source self-review:

- Error paths, resource cleanup, rollback/idempotence, race behavior, security
  boundaries and test assertion quality reviewed for every diff; no empty
  assertions or skipped required checks were introduced.

## 10. Remaining code work

1. RC-04: extend the isolated tarball candidate gate to all create-zeus
   templates and pack UI `@zeus-web` packages for `webc-consumer-ts`; then run
   Linux/Windows install/build.
2. Residual DOM/WebC P2 audit list (keyed reorder, disconnect/reconnect, async
   renderer dispose, custom-element string rendering) — not reproduced as P1 in
   this pass. String render uses `innerHTML` (F-19); decide whether to document
   it as trusted-component HTML or change the contract.

## 11. Deployment / release blockers

- No production deployment, restart, Caddy/Cloudflare/DNS/Secrets change.
- No npm publish/dist-tag/Tag/Promotion; npm auth unavailable (ENEEDAUTH).
- No real online four-product acceptance evidence.
- Manual A11y (VoiceOver/NVDA), 200% zoom and physical mobile not run.
- No merge or Ready conversion; RC requires human review and approval.

## 12. Runtime and checkpoint

- Prompt received: 2026-11-08 00:08 CST; report: 03:45 CST.
- Checkpoint branch `docs/overnight-2026-11-08`; latest checkpoint `18b40f4`.
- Worktrees are clean; user's `Cargo.toml` modification was not touched.

## 13. Suggested R5.1 prompt

> Continue Zeus 0.2.0 RC readiness. Start from Core main `39f90c7` and UI main
> `7a38f18`. Review and merge the green Draft PRs only with explicit human
> authorization. Close RC-04 by extending the isolated candidate tarball gate to
> every create-zeus template and packing the paired UI `@zeus-web` packages;
> verify Linux and Windows installs. Then collect the authorized online
> four-product acceptance, manual A11y/zoom/mobile evidence and signed release
> approval. Repair npm dist-tags only with explicit npm authorization. Do not
> weaken any RC gate; keep the final verdict vocabulary
> READY_FOR_RC_CODE_REVIEW / BLOCKED_BY_CODE / BLOCKED_BY_SECURITY /
> BLOCKED_BY_CI / BLOCKED_BY_ENVIRONMENT.
