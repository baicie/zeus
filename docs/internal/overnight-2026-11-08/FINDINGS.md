# Findings — 2026-11-08 Overnight

| ID | Severity | Status | Summary | Evidence / PR |
| --- | --- | --- | --- | --- |
| F-01 | P0 | FLAKE / PARTIAL | Core main `packed-consumers` Admin WebKit search input lost `fill('Radia')` once; same commit rerun passed; 20/20 local WebKit stress passed | CI 42386212157 first attempt failed, rerun SUCCESS; `/tmp/admin-webkit-stress-*.log`; no product code change yet |
| F-02 | P0 | FIXED_IN_PR | Public replay `rmSync(workspaceRoot, recursive)` could delete `/`, `/data`, another tenant or symlink target on seed change | UI #126 `3fcac41`; generation dirs + broad-root/symlink checks; `STORAGE_SAFETY_PASS` |
| F-03 | P1 | FIXED_AND_DRILLED | Stage 2 backed up Admin/AI SQLite but not the AI workspace bind mount; rollback could lose files | Core #203 `64f6675`; `ai-workspace.tgz` + SHA256 + atomic restore; Run 42393622902 ROLLED_BACK with workspace restore PASS |
| F-04 | P0 | PARTIAL | Release workflow had no trusted HEAD-bound RC evidence; hand-written URLs could pass | Core #202 `2f4a994`; v3 evidence from online acceptance/transaction/provenance/pair; workflow fail-closed; malicious/expired artifact negative test still missing |
| F-05 | P1 | FIXED_IN_PR | Versioning dirtied the worktree before `check:rc-readiness` | Core #202; `--release-snapshot` uses captured release rewrite; standalone dirt still fails |
| F-06 | P1 | FIXED_IN_PR | `eslint-plugin` / `playground-engine` were public but outside the release group | Core #202; fixed group 31 packages; release plan confirmed |
| F-07 | P1 | FIXED_FOR_BASIC_TEMPLATE | create-zeus template pins were stale; packed test installs registry versions | Core #202; template sync + `check:create-zeus-versions`; `check:create-zeus-candidate` packs 31 Core packages + vite-plugin and builds basic-ts; UI templates still pending |
| F-08 | P1 | FIXED_IN_PR | Core/UI exact pins had no joint gate | Core #202; release workflow checkout `ZEUS_UI_REF` + `check:ui-pairing`; UI candidate branch must pin Core RC |
| F-09 | P1 | FIXED_CHECK / BLOCKED_OPERATION | 13 packages had prerelease `latest` dist-tags | Core #202 `check:latest-tags`; actual npm dist-tag repair requires npm authorization and is not performed |
| F-10 | P0/P1 | PARTIAL | Rust compiler / Signal / DOM-Hydration deep audits from Phase D | Signal P1 fixed #204; Rust P0/P1 preflight + empty Fragment fixed #206/#207; wasm preflight Z-05, O(N^2) Z-07, DOM audit pending |
| F-13 | P0 | FIXED_IN_PR | Native preflight misclassifies `.ts` generics / `.tsx extends` and can SIGILL the Node host at 35k nesting | Core #206 `c6cf75e`; Rust 14/14; native probe returns ZEUS_INPUT_TOO_DEEP |
| F-14 | P1 | FIXED_IN_PR | Empty Fragment component root references an undeclared `$zeusTmpl` | Core #207 `cb7436a`; compiler 62/62 |
| F-11 | P0 | BLOCKED | Manual VoiceOver/NVDA, 200% Zoom, DataGrid, Shadow DOM, AI SSE, mobile acceptance | requires human execution; `NOT_RUN` |
| F-12 | P0 | BLOCKED | Real RC online deployment evidence / signed release approval | requires production deployment + human approval authorization; not performed |

## F-01 detail

- Failure: `expect(locator('#user-search input')).toHaveValue('Radia')` received `""`
  after `fill('Radia')`; page remained on page 2/3, search empty; Chromium/Firefox passed.
- Suspicion: controlled `zw-input` emits `value-change`, parent signal updates, input
  resets `control.value` to `resolveRenderedValue()`; WebKit scheduling may lose the
  write under runner load. Not proven.
- Mitigation so far: rerun only (same commit); local 20/20 WebKit stress.
- Next safe step: add an instrumented Admin WebKit stress run with event-order logging,
  not a Sleep; only change the input contract if the race reproduces.

## F-02 detail

- Before: `rmSync(tenant.workspaceRoot, { recursive: true, force: true })` on seed change.
- After: `<workspace>/public-replay/<seed>` generation; no recursive delete of the root;
  rejects `/`, `/data`, final-component symlinks and generation escapes; old generation
  and visitor files preserved.
