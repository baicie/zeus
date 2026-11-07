# CI / Test Matrix — 2026-11-08

## Main

| Check                       | Status       | Evidence                                          |
| --------------------------- | ------------ | ------------------------------------------------- |
| Core CI `39f90c7`           | PASS (rerun) | Run 42386212157 first attempt FAIL, rerun SUCCESS |
| Core Compiler Native Matrix | PASS         | Run 42386212154                                   |
| Core Release Canary         | PASS         | Run 42386212249                                   |
| Core Docs                   | PASS         | Run 42386212325                                   |
| UI CI `7a38f18`             | PASS         | Run 42386246924                                   |
| UI Canary Compatibility     | PASS         | Run 42356761415                                   |

## PRs

| PR        | Local evidence                                                                 | GitHub                  |
| --------- | ------------------------------------------------------------------------------ | ----------------------- |
| Core #202 | RC evidence/readiness/workflow tests 6 files / 41 tests; 31-package group PASS | 30/30 SUCCESS           |
| Core #203 | Real Stage 2 workspace backup/restore drill PASS `ROLLED_BACK`                 | 22/22 SUCCESS           |
| Core #204 | Signal suite 312/312; 3 P1 regressions fail pre-fix                            | running                 |
| Core #205 | Admin WebKit 3/3                                                               | 22/22 SUCCESS           |
| Core #206 | Rust 14/14; wasm parity 4/4; 24 constructs × 3 engines no trap; clippy clean   | running after `ce594f7` |
| Core #207 | Compiler 62/62; span 3/3; allocator test; 3,200 Show 545→27ms                  | running after `608123e` |
| Core #208 | SSR streaming 22/22                                                            | 23/23 SUCCESS           |
| Core #209 | Runtime-dom suite passed before lint follow-up; Admin drain cherry-picked      | running after `658181a` |
| UI #126   | `STORAGE_SAFETY_PASS`; generation dirs; 20s Windows timeouts                   | 27 SUCCESS / 1 SKIP     |
| UI #127   | Input regression 8/8 jsdom                                                     | 27 SUCCESS / 1 SKIP     |
| UI #128   | Typecheck PASS; DOM-pooling E2E regression                                     | 27 SUCCESS              |

## Compiler preflight matrix (Core #206)

| Host        | Limit                   | Deep input                        | Trap |
| ----------- | ----------------------- | --------------------------------- | ---- |
| Native      | 8,192 JSX levels        | `.ts <T>`, `.tsx extends`, parens | none |
| WASM (Node) | 506 JSX levels          | 20k JSX, 50k parens               | none |
| Chromium    | 506 JSX / per-construct | 24 constructs at limits           | none |
| Firefox     | 506 JSX / per-construct | 24 constructs at limits           | none |
| WebKit      | 506 JSX / per-construct | 24 constructs at limits           | none |

## Not run

- Full three-engine Playground/Admin/AI acceptance on every PR branch: runner
  backlog; individual PR checks cover the touched surfaces.
- Real online four-product acceptance for RC evidence: BLOCKED (no deployment
  authorization).
- VoiceOver/NVDA/manual A11y, 200% zoom, physical mobile: NOT_RUN (human).
- RC-07 actual npm dist-tag repair: BLOCKED (no npm authorization).
