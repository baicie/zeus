# CI optimization — Phase 3B: the packed-consumers critical path

Branch `perf/ci-phase3b-packed-consumers`. Baseline: `main` at `7d1031e4`.

## 1. Baseline, re-measured

The task asked for three comparable PR runs. Only one recent PR run had a
complete, comparable nine-job suite; the other two either predate the
`ci-gate`/`impact` shape or are native-matrix-only runs. The three used:

| Run                                                                    | Event | Commit     | Wall clock       | Runner min | longest job           |
| ---------------------------------------------------------------------- | ----- | ---------- | ---------------- | ---------- | --------------------- |
| [43246592042](https://github.com/baicie/zeus/actions/runs/43246592042) | PR    | `1dce51df` | 618s (10.3 min)  | 23.2       | packed-consumers 403s |
| [43216552566](https://github.com/baicie/zeus/actions/runs/43216552566) | PR    | `179779a4` | 1155s (19.3 min) | 21.3       | packed-consumers 395s |
| [43180717486](https://github.com/baicie/zeus/actions/runs/43180717486) | PR    | `847b43d1` | 642s (10.7 min)  | 21.3       | packed-consumers 468s |

`43216552566`'s 19.3-minute wall clock is queue latency (130s before the first
job plus a 7-minute gap before `packed-consumers` started), not work. Its
runner minutes match the others, so it is used for the per-step breakdown only
as a cross-check.

### The critical path, from the job log

Per-step durations from run 43246592042's `packed-consumers` log. Queue time
is excluded; this is the work inside the job.

| Step                                                              | Seconds  |
| ----------------------------------------------------------------- | -------- |
| checkout, pnpm, node, rust toolchain, cargo cache, `pnpm install` | 28.4     |
| `native:build:platform` (Rust, linux-x64)                         | 17.3     |
| `pnpm build` + `build-dts`                                        | 8.7      |
| `playwright install --with-deps` (3 engines)                      | **50.0** |
| packed consumers                                                  | 62.4     |
| RC readiness                                                      | 22.5     |
| Admin navigation (3 engines)                                      | 26.2     |
| packed HMR (3 engines)                                            | 21.5     |
| SSR hydration (3 engines)                                         | 4.7      |
| form-associated (3 engines)                                       | 3.9      |
| runtime cleanup (3 engines)                                       | 16.1     |
| accessibility (3 engines)                                         | 4.4      |
| Playground views (3 engines)                                      | 17.6     |
| Next.js boundary (3 engines)                                      | 20.9     |
| WASM Worker: wasm build + check (3 engines)                       | 29.6     |
| Playground UX: editor build + check                               | 36.2     |
| Playground theme/i18n (3 engines)                                 | 25.9     |
| DevTools panel (3 engines)                                        | 5.0      |
| **total**                                                         | **403**  |

### Two facts that decide the design

**Playwright's 50s is 41s of apt, 9s of browser download.** Measured inside
the step: the `apt-get` dependency phase is 41.4s; Chromium, Firefox, WebKit
and FFmpeg downloads are 8.6s total. Caching the browsers would leave the apt
phase in place, which is why this phase does not start by caching engines.

**Every browser gate needs the Rust native compiler.** `@zeus-js/compiler`
re-exports `transformModule` from `@zeus-js/compiler-native`
(`packages/core/compiler/src/index.ts`), so `native:build:platform` (17.3s) is
not optional for any job that builds an example. Neither is
`pnpm install` (2.8s) or the toolchain (8.9s).

Together: **~104s of warm-up per job**. That is the price of every additional
job, and it bounds how far splitting is worth taking.

## 2. The three candidates

Modelled from the measured per-step costs above. `warm-up` = 104s.

|     | Design                                              | Jobs | Critical job | Runner minutes (this subtree) |
| --- | --------------------------------------------------- | ---- | ------------ | ----------------------------- |
| A   | one job, as today                                   | 1    | 409s         | 6.8                           |
| A′  | one job, duplicate editor build removed             | 1    | 373s         | 6.2                           |
| B   | three jobs: consumers / web-components / playground | 3    | 242s         | 10.2                          |
| C   | two jobs: consumers / all other browsers            | 2    | 264s         | 8.4                           |

Candidate A′ was implemented first because it is free: the old step list ran
`pnpm --filter @zeus-js/example-playground-editor build` and then
`check:playground-ux`, whose npm script _also_ builds the editor. 36.2s of the
403s was a duplicate Vite build.

### Selected: B, with A′ folded in

| Metric                         | Current           | A′      | B                          | C          |
| ------------------------------ | ----------------- | ------- | -------------------------- | ---------- |
| PR wall clock (measured/model) | 618s              | 582s    | **457s**                   | 476s       |
| Runner minutes, PR run         | 23.2              | 22.6    | **26.5**                   | 24.8       |
| Longest job                    | 403s              | 373s    | **242s**                   | 264s       |
| Playwright install cost        | 50s × 1           | 50s × 1 | 50s × 3                    | 50s × 2    |
| Failure localisation           | one job, 18 steps | one job | **one gate group per job** | two groups |
| Release evidence               | intact            | intact  | intact                     | intact     |

Wall clock is `103s impact queue + 24s impact + 63s job queue + critical job + 22s ci-gate`,
which reproduces the measured 618s for the current design.

B costs **+3.3 runner minutes** over the current design. That is stated
plainly rather than hidden: three jobs pay 313s of warm-up where one paid 104s.
C costs +1.6 runner minutes and still clears the 20% wall-clock target, but it
leaves a 264s job where B leaves 242s, and it puts Playground UX (the second
largest single gate) in the same job as six unrelated browser checks.

B was chosen because it balances the three groups within 90s of each other
(242/155/214) — every additional job added there is amortised, not idle — and
because its grouping follows a real boundary: packed consumer artifacts,
Web Components behaviour, and the Playground/WASM toolchain. C's boundary is
"everything else", which is not a boundary at all.

A′ alone would have been the cheapest change, and it is included, but it only
recovers the duplicate build. The critical path stays above 370s.

## 3. What was split where

`packed-consumers` keeps everything the release contract names:

- the packed consumer tarballs (`check:packed-consumers`)
- Golden UI consumers (manual dispatch only)
- the RC readiness report and its artifact
- Admin navigation, packed HMR and SSR hydration in three engines

New jobs:

| Job                      | Gates                                                                             |
| ------------------------ | --------------------------------------------------------------------------------- |
| `browser-web-components` | form-associated, runtime cleanup, accessibility, Next.js boundary, DevTools panel |
| `browser-playground`     | Playground views, WASM Worker, Playground UX, Playground theme/i18n               |

Every gate still runs in Chromium, Firefox **and** WebKit. Nothing was reduced
to Chromium. The split moves _where_ a gate runs, not _whether_ it runs.

### Release evidence is untouched

`collect-cross-platform-evidence.ts` requires, by exact name,
`lint-and-check`, `packed-consumers` and `create-zeus-candidates`, and the
artifacts `create-zeus-candidate-ubuntu-latest` /
`create-zeus-candidate-windows-latest`. All four names and both artifact names
are unchanged, and `cross-platform-evidence` still `needs` the original three
jobs. `packed-consumers` continues to run the Admin, HMR and hydration gates,
so the `browser-e2e` category it declares remains true.

### The gate covers the new jobs

`ci-gate` now `needs` both new jobs, and `REQUIRED_DEPENDENCIES` and
`PLANNED_SKIP_JOBS` in `scripts/ci/ci-gate.ts` list them. Without this the
split would have silently turned twelve browser gates into advisory checks
while `ci-gate` stayed green — the exact failure mode the task forbids.

Two tests now pin that:

- `ci-gate-workflow.spec.ts` walks `PLANNED_SKIP_JOBS` and asserts each has an
  `impact` output, a job, and a matching guard, then asserts the three browser
  jobs carry neither `continue-on-error` nor `if: always()`.
- `impact-analysis.spec.ts` feeds eight representative changes through the
  planner and asserts all three browser jobs make the **same** run/skip
  decision every time. They share `BROWSER_GATE_AREAS`, so no future edit can
  narrow one job's trigger below another's.

That second test found a real defect during implementation: both new jobs were
guarded on `needs.impact.outputs.packed-consumers` rather than their own
output. Identical scopes made it look correct, but `ci-gate` judges by
`planned-skips`, which is per job name, so a planned skip of `browser-playground`
would not have matched the job's actual reason for skipping.

## 4. Verification

| Check                                                           | Result                         |
| --------------------------------------------------------------- | ------------------------------ |
| `actionlint .github/workflows/ci.yml`                           | clean                          |
| `vitest run scripts/ci/__tests__/`                              | 54 passed (4 files)            |
| `vitest run scripts/release/__tests__/release-workflow.spec.ts` | 27 passed                      |
| `pnpm check:playground-ux`                                      | see §5                         |
| Three-engine runs                                               | MEASURED on the branch, see §6 |

## 5. Cost that was not removed

- **Playwright's apt phase.** 41s per job, unavoidable without a prebuilt
  image. Three jobs now pay it three times. An image with the engines baked in
  would remove ~123s of runner minutes but adds a build and a pinning
  problem; it is listed as follow-up rather than done here.
- **Native compiler build.** 17s per job, and it cannot be shared across jobs
  without passing a platform binary between runners. The task explicitly
  forbids reusing Native artifacts without SHA, OS, arch and version proof, so
  the cheap version of this shortcut is not taken.
- **`build-dts`.** 3.4s per job. Kept because `check:admin` (in
  `packed-consumers`) runs `tsc --noEmit` over the Admin app against workspace
  types, and the Next.js build typechecks as well.

## 6. Real Actions

| #   | Scenario                        | Expected                                                          | Status  |
| --- | ------------------------------- | ----------------------------------------------------------------- | ------- |
| 1   | PR with code changes            | 3 browser jobs run, no skips                                      | NOT_RUN |
| 2   | `ci-gate` reads 11 dependencies | pass, both new jobs `success`                                     | NOT_RUN |
| 3   | Docs-only PR                    | all three browser jobs skipped, planned                           | NOT_RUN |
| 4   | One gate fails in a new job     | `ci-gate` fails                                                   | NOT_RUN |
| 5   | Main push                       | evidence job still collects; `packed-consumers` unchanged in name | NOT_RUN |

Run ids and measured wall clock will be appended here once the branch's own CI
has finished. The numbers in §2 are modelled from measured step costs; they
are marked as such and are not presented as measurements.
