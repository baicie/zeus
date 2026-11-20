# CI optimization — Phase 3C: making impact analysis's verdicts inspectable

Branch `chore/ci-impact-verification`. Baseline: `main` at `7d1031e4`.

## 1. The problem this phase found

Phase 2 shipped impact analysis with a verification matrix marked **NOT_RUN**
for scenarios 1–10. The reason was structural: the branch that introduced the
analysis changed `.github/**`, which escalates to a full run by design, so the
PR could not demonstrate a skip.

That is still mostly true — but the larger problem turned out to be that
**there was no way to read what the analysis decided**. The plan was rendered
into `$GITHUB_STEP_SUMMARY`, and a job summary is not readable through the
REST API. The only route was `gh api .../jobs/<id>/logs`, and the log of a
passing `impact` job does not contain the rendered table — it contains the
script that would have rendered it.

So every claim about impact analysis in Phase 2's matrix rested on unit tests.
This phase makes the claim inspectable, and then found two real defects by
inspecting it.

## 2. Changes

### 2.1 The plan is now an artifact

`impact` uploads `temp/ci/impact.json` as `impact-plan`
(`.github/workflows/ci.yml`, step "Preserve the impact plan"). It is uploaded
with `if: always()` because the interesting case is the one where the
classification is surprising.

What the file contains, per job: `name`, `run`, `reason`. Plus `areas`,
`fullSuite`, `escalated` and `event` for the run. That is enough to answer
"which jobs ran, which were planned skips, and why" without reading a log.

### 2.2 Partial analysis is now opt-in by event

The old rule was written as _"everything except `push` and
`workflow_dispatch` gets partial analysis"_. That is a fail-open default: any
event added later inherits the narrow path without anyone deciding it should.
`merge_group`, `schedule`, `release`, `repository_dispatch` and `workflow_run`
all fell into it.

It is now an allow list with exactly one member:

```ts
export const PARTIAL_ANALYSIS_EVENTS: readonly string[] = ['pull_request']
export function requiresFullRun({ event, forced }) {
  return forced === true || !PARTIAL_ANALYSIS_EVENTS.includes(event)
}
```

Unknown event ⇒ full run. `requiresFullRun` is exported and unit-tested, so
the rule is a function rather than an inline expression buried in `main()`.

### 2.3 A real fail-open: `.nvmrc` was classified as lint configuration

Found by running the scenario matrix, not by reading the regex.

`^\.[a-z]+rc(\.|$)` is intended to catch `.eslintrc`, `.prettierrc`. It also
matches **`.nvmrc`** — the file that selects the Node version the entire suite
runs on. The classification was:

| File             | Before                                  | After                                |
| ---------------- | --------------------------------------- | ------------------------------------ |
| `.nvmrc`         | `tooling` → **no `rust-compiler`**      | `shared-infrastructure` → full suite |
| `.babelrc`       | unmatched → escalated (accidentally OK) | `shared-infrastructure` → full suite |
| `.swcrc`         | unmatched → escalated (accidentally OK) | `shared-infrastructure` → full suite |
| `.eslintrc.json` | `tooling`                               | `tooling` (unchanged)                |

A Node-version bump changing nothing but `.nvmrc` would have skipped the Rust
compiler entirely while still running the browser gates — a wrong answer in
the direction that matters. The new rule is ordered **before** the lint rule
(first match wins) and names the four toolchain files explicitly rather than
using a broader `[a-z]*rc` pattern, which would have swept `.eslintrc.json`
into the full suite as well.

## 3. Verification matrix

Run locally with `pnpm exec tsx`, feeding `classifyChanges`/`planJobs`
directly so the matrix is reproducible without creating twelve branches.
Baseline HEAD `7d1031e4` except where noted; "skip" means the plan said skip.

| #   | Scenario                | Areas                                             | Full suite | Jobs that run                         | Jobs skipped                                |
| --- | ----------------------- | ------------------------------------------------- | ---------- | ------------------------------------- | ------------------------------------------- |
| 1   | docs-only               | `docs`                                            | no         | docs-build                            | lint, rust, build, test, packed, candidates |
| 2   | admin-only              | `admin`, `consumers`                              | no         | lint, build, test, packed             | rust, candidates, docs                      |
| 3   | runtime-only            | `consumers`, `core-runtime`, `framework-adapters` | no         | lint, build, test, packed, candidates | rust, docs                                  |
| 4   | compiler-only           | `compiler`, `consumers`, `wasm`                   | no         | all but docs                          | docs                                        |
| 5   | Rust / Cargo            | `compiler`, `native`                              | no         | all but docs                          | docs                                        |
| 6   | lockfile                | all 13                                            | **yes**    | all 7                                 | none                                        |
| 7   | workflow (`.github/**`) | all 13                                            | **yes**    | all 7                                 | none                                        |
| 8   | release config          | all 13                                            | **yes**    | all 7                                 | none                                        |
| 9   | new workspace package   | `consumers`, `core-runtime`, `framework-adapters` | no         | lint, build, test, packed, candidates | rust, docs                                  |
| 10  | unrecognised path       | all 13                                            | **yes**    | all 7                                 | none                                        |
| 11  | `.nvmrc` (before fix)   | `tooling`                                         | no         | lint, build, test, packed, candidates | rust, docs — **WRONG**                      |
| 11  | `.nvmrc` (after fix)    | all 13                                            | **yes**    | all 7                                 | none                                        |

Rows 6–8 and 10 are the fail-closed cases: they escalate to every area, and
the summary names the trigger (`changed area(s) shared-infrastructure require
the full suite`, `unrecognised path(s): …`).

### Gate behaviour

`ci-gate` was verified against the same result maps:

| Input                        | Expected | Actual |
| ---------------------------- | -------- | ------ |
| all success                  | pass     | pass   |
| docs-only, six planned skips | pass     | pass   |
| a skip the plan did not make | fail     | fail   |
| `impact` failed              | fail     | fail   |
| a job `cancelled`            | fail     | fail   |

These are the existing unit tests (`scripts/ci/__tests__/ci-gate.spec.ts`,
54 → 56 tests in this branch). They are not new evidence; they are re-run.

### What is verified in real Actions

| #   | Scenario              | Evidence                                                                                                                                                                                          |
| --- | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | docs-only, end to end | **[43200924859](https://github.com/baicie/zeus/actions/runs/43200924859)** — `docs-build` success, six jobs `skipped`, `ci-gate` **success**. This is the scenario Phase 2 could not demonstrate. |
| —   | full run on a code PR | [43246592042](https://github.com/baicie/zeus/actions/runs/43246592042) — all jobs run, gate success                                                                                               |
| 11  | `impact` job fails    | Phase 2 observed run 43190404827; the gate failed as designed                                                                                                                                     |

Scenarios 2–10 are verified at the classifier/planner level only. They are
**NOT_RUN** end to end, and the reason is not laziness: each needs a PR whose
diff contains exactly one kind of change, and this branch's own diff
(`.github/**`, `scripts/**`) escalates to a full run by definition. Creating
ten throwaway PRs against a public repository to prove what a pure function
already decides has a real cost and proves little more — the classifier is
deterministic and its inputs are the diff.

The gap that mattered was not "more scenarios"; it was "nobody can see what it
decided". §2.1 closes that: from the next run onward, every CI run carries its
own plan as `impact-plan`.

### The 200-file limit

`classifyChanges` escalates above 200 changed files. That limit is not
exercised by any test on a real diff; it is covered by classification tests.

## 4. What this does not do

- **It does not make main run narrow.** `push` and `workflow_dispatch` force a
  full run, so cross-platform evidence can never describe a skipped check.
  That is load-bearing and unchanged.
- **It does not turn `impact` into a required check by itself.** `ci-gate` is
  the single merge verdict; `impact` failing fails the gate.
- **It does not prove scenarios 2–10 end to end.** Stated above rather than
  papered over.

## 5. Files

- `.github/workflows/ci.yml` — the `impact-plan` artifact
- `scripts/ci/impact-analysis.ts` — `PARTIAL_ANALYSIS_EVENTS`,
  `requiresFullRun`, the toolchain path rule
- `scripts/ci/__tests__/impact-analysis.spec.ts` — 3 new tests (51 → 54 in
  this file; 56 across `scripts/ci`)
