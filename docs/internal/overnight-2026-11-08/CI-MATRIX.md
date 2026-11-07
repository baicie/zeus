# CI / Test Matrix — 2026-11-08

## Main

| Check | Status | Evidence |
| --- | --- | --- |
| Core CI `39f90c7` | PASS (rerun) | Run 42386212157 first attempt FAIL, rerun SUCCESS |
| Core Compiler Native Matrix | PASS | Run 42386212154 |
| Core Release Canary | PASS | Run 42386212249 |
| Core Docs | PASS | Run 42386212325 |
| UI CI `7a38f18` | PASS | Run 42386246924 |
| UI Canary Compatibility | PASS | Run 42356761415 |

## PR #202 `fix/r5-rc-gates`

| Check | Status |
| --- | --- |
| `pnpm check` | PASS (local) |
| RC evidence/readiness/workflow/latest/pairing tests | PASS 6 files / 41 tests |
| `check:package-versions` (31 packages) | PASS |
| `check:create-zeus-versions` | PASS |
| `check:ui-pairing` against local UI | PASS (beta) |
| `check:create-zeus-packed` | PASS |
| `check:release-worktree --capture/--verify` | PASS |
| GitHub CI | IN_PROGRESS at checkpoint (new commits rerun) |

## PR #203 `fix/r5-ai-workspace-backup`

| Check | Status |
| --- | --- |
| `pnpm check` | PASS (local) |
| Real Stage 2 workspace backup/restore drill | PASS Run 42393622902 `ROLLED_BACK` |
| GitHub CI | PASS 22/22 |

## UI PR #126 `fix/r5-public-replay-storage-safety`

| Check | Status |
| --- | --- |
| `pnpm check` | PASS (local) |
| Storage helper direct check | PASS `STORAGE_SAFETY_PASS` |
| Full `public-replay.spec.ts` | GitHub CI PASS |
| GitHub CI | PASS 27 / SKIP 1 (Windows portability fix `585cb57`) |

## Admin browser matrix

| Engine | Local `ADMIN_BROWSERS=webkit` | Notes |
| --- | --- | --- |
| Chromium | PASS (CI rerun) | first attempt passed |
| Firefox | PASS (CI rerun) | first attempt passed |
| WebKit | PASS (CI rerun); 20/20 local stress | first attempt failed search fill once |

## Not run

- Native Matrix rerun for PR branches: pending CI.
- Playground three-engine on PR branches: pending CI.
- AI HTTP/SSE full suite on UI PR #126: pending CI.
- Real online four-product acceptance for RC evidence: BLOCKED (no deployment authorization).
- VoiceOver/NVDA/manual A11y: NOT_RUN.

## Audit PRs (02:05)

| PR | Local | GitHub |
| --- | --- | --- |
| Core #204 signal error isolation | signal 309/309 PASS | PASS 23/23 |
| Core #205 Admin rAF drain | WebKit 3/3 PASS | PASS 22/22 |
| Core #206 compiler preflight | Rust 14/14 + native probe PASS | rerunning after rustfmt |
| Core #207 empty Fragment | compiler 62/62 PASS | rerunning after rustfmt |
| UI #128 data-grid focus | typecheck PASS | IN_PROGRESS |
| UI #127 input regression | 8/8 jsdom PASS | Windows public-replay timeout (unrelated, #126 adds timeout) |
