# PR-34 Size Budget Update Evidence

Date: 2026-11-04

## Why the limits changed

`pnpm size:ci` initially failed on the current integration tree:

- `@zeus-js/runtime-dom`: 77.71 KB raw / 25.33 KB gzip, old limits 60 / 20 KB.
- `@zeus-js/zeus`: 65.24 KB raw / 21.24 KB gzip, old limits 50 / 17 KB.
- `@zeus-js/vite-plugin`: 17.34 KB raw / 5.34 KB gzip, old limits 10 / 4 KB.

The increases are attributable to exported product features, not duplicated
packages:

- `runtime-dom` and `zeus` now include automatic hydration, Transition,
  ErrorBoundary and the Web Component host in the browser entry.
- the Vite plugin now classifies TSX edits inside JSX text (RFC-017/RFC-019
  diagnostics) and reuses one parsed AST for comment preservation.
  `@babel/parser` remains an external import.
- the combined-parse change reduced the Vite plugin from 18.31 KB to
  17.34 KB raw while keeping all HMR tests green.

The limits were updated to 81 / 27 KB, 68 / 23 KB and 19 / 6 KB respectively,
with the baseline and date recorded next to each target in
`scripts/size/size-report.ts`. They are review thresholds, not a claim that the
current sizes are permanent targets.

## Validation

| Command                                                                                                                                                                                                       | Result         |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| `pnpm size:ci`                                                                                                                                                                                                | PASS           |
| `pnpm exec vitest run --project unit packages/devtools/vite-plugin/__tests__/hmr.spec.ts packages/devtools/vite-plugin/__tests__/transform.spec.ts packages/devtools/playground-engine/__tests__/hmr.spec.ts` | PASS, 81 tests |

## Not covered

- Maintainer sign-off on the new byte thresholds.
- Browser heap/GC measurements.
- Windows/Linux bundle checks.
