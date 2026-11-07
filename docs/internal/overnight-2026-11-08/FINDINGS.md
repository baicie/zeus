# Findings — 2026-11-08 Overnight

| ID   | Severity | Status                          | Summary                                                                                                                           | Evidence / PR                                                                                                                                                               |
| ---- | -------- | ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| F-01 | P0       | FIXED_IN_PR                     | Data-grid scheduled rAF active-cell focus restore stole focus from Playwright `fill` under WebKit load                            | UI #128 `c13d0d3` guards a foreign active element; Core #205 drains queued restores; WebKit 3/3                                                                             |
| F-02 | P0       | FIXED_IN_PR                     | Public replay `rmSync(workspaceRoot, recursive)` could delete `/`, `/data`, another tenant or symlink target on seed change       | UI #126 `3fcac41`; generation dirs + broad-root/symlink checks; `STORAGE_SAFETY_PASS`                                                                                       |
| F-03 | P1       | FIXED_AND_DRILLED               | Stage 2 backed up Admin/AI SQLite but not the AI workspace bind mount; rollback could lose files                                  | Core #203 `64f6675`; `ai-workspace.tgz` + SHA256 + atomic restore; Run 42393622902 ROLLED_BACK with workspace restore PASS                                                  |
| F-04 | P0       | PARTIAL                         | Release workflow had no trusted HEAD-bound RC evidence; hand-written URLs could pass                                              | Core #202 `2f4a994`; v3 evidence from online acceptance/transaction/provenance/pair; workflow fail-closed; malicious/expired artifact negative test still missing           |
| F-05 | P1       | FIXED_IN_PR                     | Versioning dirtied the worktree before `check:rc-readiness`                                                                       | Core #202; `--release-snapshot` uses captured release rewrite; standalone dirt still fails                                                                                  |
| F-06 | P1       | FIXED_IN_PR                     | `eslint-plugin` / `playground-engine` were public but outside the release group                                                   | Core #202; fixed group 31 packages; release plan confirmed                                                                                                                  |
| F-07 | P1       | FIXED_FOR_BASIC_TEMPLATE        | create-zeus template pins were stale; packed test installs registry versions                                                      | Core #202; template sync + `check:create-zeus-versions`; `check:create-zeus-candidate` packs 31 Core packages + vite-plugin and builds basic-ts; UI templates still pending |
| F-08 | P1       | FIXED_IN_PR                     | Core/UI exact pins had no joint gate                                                                                              | Core #202; release workflow checkout `ZEUS_UI_REF` + `check:ui-pairing`; UI candidate branch must pin Core RC                                                               |
| F-09 | P1       | FIXED_CHECK / BLOCKED_OPERATION | 13 packages had prerelease `latest` dist-tags                                                                                     | Core #202 `check:latest-tags`; actual npm dist-tag repair requires npm authorization and is not performed                                                                   |
| F-10 | P0/P1    | PARTIAL                         | Rust compiler / Signal / DOM-Hydration deep audits from Phase D                                                                   | Signal #204; native+wasm preflight #206; empty Fragment #207; SSR #208; hydration #209; O(N^2) codegen Z-07 and DOM/WebC P2s pending                                        |
| F-15 | P1       | FIXED_IN_PR                     | WASM host had no nesting preflight: 20k JSX trapped the engine and discarded the instance; native-only scanner did not protect it | Core #206 `064b768`; shared scanner, per-target weights (wasm 506 JSX levels); wasm parity 4/4; 24 constructs × Chromium/Firefox/WebKit no trap                             |
| F-16 | P1       | FIXED_IN_PR                     | Deep input in the WASM worker was asserted as an expected trap in the browser gate                                                | `check-compiler-wasm-browser` now requires `ZEUS_INPUT_TOO_DEEP` and a usable instance after the deep transform                                                             |
| F-13 | P0       | FIXED_IN_PR                     | Native preflight misclassifies `.ts` generics / `.tsx extends` and can SIGILL the Node host at 35k nesting                        | Core #206 `c6cf75e`; Rust 14/14; native probe returns ZEUS_INPUT_TOO_DEEP                                                                                                   |
| F-14 | P1       | FIXED_IN_PR                     | Empty Fragment component root references an undeclared `$zeusTmpl`                                                                | Core #207 `cb7436a`; compiler 62/62                                                                                                                                         |
| F-11 | P0       | BLOCKED                         | Manual VoiceOver/NVDA, 200% Zoom, DataGrid, Shadow DOM, AI SSE, mobile acceptance                                                 | requires human execution; `NOT_RUN`                                                                                                                                         |
| F-12 | P0       | BLOCKED                         | Real RC online deployment evidence / signed release approval                                                                      | requires production deployment + human approval authorization; not performed                                                                                                |

## F-01 detail

- Failure: `expect(locator('#user-search input')).toHaveValue('Radia')` received `""`
  after `fill('Radia')`; page remained on page 2/3, search empty; Chromium/Firefox passed.
- Root cause: data-grid beta.33 scheduled an rAF `focusActiveCellElement()` after a
  click; when the click and Playwright's `selectText`/`insertText` landed in the same
  frame, the restore moved focus before text insertion and the value never reached the
  controlled input.
- Fix: the data-grid only restores focus when the active element is still the cell it
  scheduled (or body), and the Admin check drains two animation frames before filling.
  UI #128 adds the DOM-pooling E2E regression; Core #205 keeps the drain explicit.
- Evidence: WebKit 3/3 after the fix, 20/20 local WebKit stress before it.

## F-15 detail

- Native crash depths (64 MiB worker) and WebAssembly engine crash depths differ by
  2–6× per construct: JSX 23,000/1,447, paren 32,500/730, object 28,500/622,
  template 29,000/559, class heritage 55,000/460.
- A single shared budget would either trap wasm or reject ordinary native input, so
  `nesting.rs` selects a weight table per `target_arch`; wasm uses the measured
  depths and a 35% budget (506 JSX levels).
- Browser evidence: 24 constructs at their calibrated limits in Chromium, Firefox
  and WebKit; zero traps. 500-level JSX still compiles; 507 returns
  `ZEUS_INPUT_TOO_DEEP`; the worker and main-thread instances remain usable.

## F-02 detail

- Before: `rmSync(tenant.workspaceRoot, { recursive: true, force: true })` on seed change.
- After: `<workspace>/public-replay/<seed>` generation; no recursive delete of the root;
  rejects `/`, `/data`, final-component symlinks and generation escapes; old generation
  and visitor files preserved.
