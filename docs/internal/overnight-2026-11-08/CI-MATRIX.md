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

## PRs — final

| PR        | Local evidence                                                                         | GitHub              |
| --------- | -------------------------------------------------------------------------------------- | ------------------- |
| Core #202 | 28 files / 204 tests; `tsc`, ESLint, Prettier PASS; six-template candidate matrix PASS | 34/34 SUCCESS       |
| Core #203 | real Stage 2 workspace backup/restore drill PASS `ROLLED_BACK`                         | 22/22 SUCCESS       |
| Core #204 | signal 20 files / 312 tests PASS                                                       | 23/23 SUCCESS       |
| Core #205 | Admin WebKit 3/3                                                                       | 22/22 SUCCESS       |
| Core #206 | Rust 14/14; wasm parity 4/4; 24 constructs × 3 engines no trap; clippy clean           | 30/30 SUCCESS       |
| Core #207 | compiler 62/62 + lib 5/5; 3,200 Show 545→27 ms; clippy/fmt clean                       | 26/26 SUCCESS       |
| Core #208 | SSR streaming 22/22                                                                    | 23/23 SUCCESS       |
| Core #209 | runtime-dom 412/412; `tsc`/ESLint PASS; Admin three-engine PASS                        | 23/23 SUCCESS       |
| UI #126   | `STORAGE_SAFETY_PASS`; generation dirs; Windows test skip documented                   | 27 SUCCESS / 1 SKIP |
| UI #127   | input regression 8/8 jsdom                                                             | 27 SUCCESS / 1 SKIP |
| UI #128   | typecheck PASS; DOM-pooling E2E regression                                             | 27 SUCCESS / 1 SKIP |

## Compiler preflight matrix (Core #206)

| Host        | Limit                   | Deep input                        | Trap |
| ----------- | ----------------------- | --------------------------------- | ---- |
| Native      | 8,192 JSX levels        | `.ts <T>`, `.tsx extends`, parens | none |
| WASM (Node) | 506 JSX levels          | 20k JSX, 50k parens               | none |
| Chromium    | 506 JSX / per-construct | 24 constructs at limits           | none |
| Firefox     | 506 JSX / per-construct | 24 constructs at limits           | none |
| WebKit      | 506 JSX / per-construct | 24 constructs at limits           | none |

## Additional audit evidence

- Deterministic 200-case JSX fuzz parity: native and wasm outputs identical
  (dom/ssr, CRLF, Unicode, dynamic attrs, Show/For, `.map`).

## Create-zeus candidate matrix (Core #202)

| Platform | Prepare             | UI build from Core candidates | Six templates | Pin match                                                               |
| -------- | ------------------- | ----------------------------- | ------------- | ----------------------------------------------------------------------- |
| Ubuntu   | 32 packed/validated | PASS                          | 6/6 PASS      | Core true; `@zeus-web/button` beta.34 vs UI main beta.35 expected drift |
| Windows  | 32 packed/validated | PASS                          | 6/6 PASS      | same expected drift                                                     |

Release runs the same gate with `--require-pin-match` against `ZEUS_UI_REF`.

## Not run

- Real online four-product acceptance for RC evidence: BLOCKED (no deployment
  authorization).
- VoiceOver/NVDA/manual A11y, 200% zoom, physical mobile: NOT_RUN (human).
- RC-07 actual npm dist-tag repair: BLOCKED (no npm authorization).
