# CI optimization — Phase 2: change impact analysis

What this adds, what it is allowed to skip, and what happens when it is wrong.

## The shape

```
impact  ──┬── lint-and-check      (if: needs.impact.outputs.lint-and-check == 'true')
          ├── rust-compiler       (…)
          ├── build               (…)
          ├── test                (…)
          ├── packed-consumers    (…)
          ├── create-zeus-       (…)
          │   candidates
          ├── docs-build          (…)
          └── cross-platform-evidence (needs full-run == 'true')
                                      │
                                      ▼
                                   ci-gate   (always(), reads toJSON(needs))
```

`impact` runs first and always. Every other job is guarded by one output. The
gate runs regardless of what happened and decides.

## Why a script rather than paths-filter

`dorny/paths-filter` is the usual choice and it is not enough here, for a
reason that matters: it matches filenames against patterns but knows nothing
about the dependency graph. Changing `packages/core/runtime-dom/src/insert.ts`
must reach the applications that bundle it and the browser gates that exercise
it — those are _reverse dependencies_, not path matches. A filter would either
need an exhaustive pattern list (which drifts) or would match `packages/core/**`
and then everything, which defeats the purpose.

The script classifies into areas, then maps areas to jobs, so the rule "runtime
changes reach consumers" is written once, in `PATH_RULES`, and can be tested.

## Failing closed

Every one of these selects **every area**, which runs every job:

| Situation                               | Why                                                       |
| --------------------------------------- | --------------------------------------------------------- |
| diff could not be fetched               | an unknown change is not a small one                      |
| empty diff                              | a merge commit's empty diff says nothing about the change |
| more than 200 files                     | bulk changes are not worth reasoning about                |
| any path matches no rule                | it might be exactly the file that matters                 |
| deleted file                            | classified by its old path; dependents still build        |
| renamed file                            | both endpoints count                                      |
| lockfile / workspace / toolchain change | `shared-infrastructure` ⇒ full suite                      |
| workflow change                         | `.github/**` ⇒ `shared-infrastructure` ⇒ full suite       |

The script never returns "skip everything". The narrowest result is a
docs-only change, which runs `docs-build` and nothing else.

## Job → area mapping

| Job                      | Areas that trigger it                                           |
| ------------------------ | --------------------------------------------------------------- |
| `lint-and-check`         | everything except `docs`                                        |
| `rust-compiler`          | compiler, native, shared-infrastructure                         |
| `build`                  | everything except `docs`                                        |
| `test`                   | code areas, tooling, shared-infrastructure                      |
| `packed-consumers`       | code areas, tooling, shared-infrastructure                      |
| `create-zeus-candidates` | core-runtime, compiler, release, tooling, shared-infrastructure |
| `docs-build`             | docs                                                            |

`rust-compiler` is the only job with a narrow trigger, because Rust changes are
the only ones that cannot affect the JavaScript build. Everything else is broad
on purpose: the goal is to skip for genuinely inert changes, not to compute the
minimal set.

## What the gate enforces

The gate's skip rule is stricter than an allow list of names. It accepts a
`skipped` job **only when the impact plan produced that skip**:

| Situation                                  | Verdict                                                   |
| ------------------------------------------ | --------------------------------------------------------- |
| every job success                          | pass                                                      |
| docs-only PR: six jobs skipped, planned    | pass                                                      |
| a job skips for its own reasons            | **fail** — "skipped, but the impact plan did not skip it" |
| `impact` failed, everything else succeeded | **fail** — no plan means no basis                         |
| `impact` cancelled                         | **fail**                                                  |
| a job cancelled                            | **fail**                                                  |
| required job missing from `needs`          | **fail**                                                  |
| unparseable `NEEDS`                        | **fail**                                                  |

The `plannedSkips` list comes from the `impact` job itself
(`needs.impact.outputs.planned-skips`), not from a constant in the workflow. A
job cannot nominate its own skip.

## The evidence collector constraint

`scripts/release/collect-cross-platform-evidence.ts` requires, by exact job
name, that `lint-and-check`, `packed-consumers` and `create-zeus-candidates`
ran and passed. If impact analysis skipped any of them, the collector would
fail — correctly, because it would otherwise describe checks that never
happened.

That is why `cross-platform-evidence` now also requires
`needs.impact.outputs.full-run == 'true'`. On a `main` push this is always
true: `push` and `workflow_dispatch` force a full run regardless of paths. The
condition is redundant today and exists so that a future change which lets
impact analysis run narrow on `main` cannot silently produce evidence for
checks that were skipped.

The collector itself was not modified, and none of its validation — commit,
run, attempt, platform, artifact digest — was relaxed.

## Verification matrix

Executed locally with `pnpm exec tsx scripts/ci/ci-gate.ts` and the unit tests
in `scripts/ci/__tests__/`. "Gate" is the aggregate verdict for that scenario.

| #   | Scenario                  | Jobs that run                         | Jobs that skip            | Gate     | Verified                                                      |
| --- | ------------------------- | ------------------------------------- | ------------------------- | -------- | ------------------------------------------------------------- |
| 1   | Docs-only PR              | docs-build                            | six                       | pass     | unit: `classifyChanges` + `planJobs`; CLI: planned-skip input |
| 2   | Admin-only PR             | all but docs-build                    | docs-build                | pass     | unit                                                          |
| 3   | Runtime-only PR           | all but docs-build                    | docs-build                | pass     | unit                                                          |
| 4   | Compiler-only PR          | all but docs-build                    | docs-build                | pass     | unit                                                          |
| 5   | Rust / Cargo change       | all but docs-build                    | docs-build                | pass     | unit                                                          |
| 6   | `pnpm-lock.yaml` change   | all seven                             | none                      | pass     | unit (full suite)                                             |
| 7   | Release config change     | lint, build, test, packed, candidates | rust-compiler, docs-build | pass     | unit                                                          |
| 8   | Workflow change           | all seven                             | none                      | pass     | unit (escalates via shared-infrastructure)                    |
| 9   | New workspace package     | all but docs-build                    | docs-build                | pass     | unit                                                          |
| 10  | Broad cross-domain change | all seven                             | none                      | pass     | unit                                                          |
| 11  | Impact analysis fails     | —                                     | —                         | **fail** | CLI with `impact: failure`                                    |
| 12  | A key job cancelled       | —                                     | —                         | **fail** | CLI with `test: cancelled`                                    |

Also verified by CLI: a skip the plan did not make fails the gate with
`packed-consumers: skipped, but the impact plan did not skip it`.

**What is not verified here:** scenarios 1–10 are verified at the level of
"the classifier and planner produce these decisions, and the gate accepts or
rejects the resulting result map". They are **not** verified end-to-end in
GitHub Actions on this branch, because this branch changes `.github/**`, which
itself escalates to a full run. Every job will run on this PR by design — which
is the correct behaviour and also means the PR cannot demonstrate a skip. A
follow-up PR that touches only `docs/` would demonstrate scenario 1 end to end;
that is listed as remaining work rather than claimed as done.

## What this does not do

- It does not enable branch protection. `ci-gate` exists and is correct;
  requiring it is a repository setting.
- It does not shrink `packed-consumers`. On any code change that job still runs
  in full, because it is the job that exercises the browser gates.
- It does not analyse `admin-image.yml`, `playground-image.yml` or
  `compiler-native.yml`. Those have their own `paths:` filters, which is the
  same idea at a coarser grain, and merging them into this analysis is a
  separate change.

## Files

- `scripts/ci/impact-analysis.ts` — classification and planning
- `scripts/ci/__tests__/impact-analysis.spec.ts` — 23 tests
- `scripts/ci/ci-gate.ts` — planned-skip logic
- `scripts/ci/__tests__/ci-gate.spec.ts` — 13 tests
- `scripts/ci/__tests__/ci-gate-workflow.spec.ts` — 5 tests, keeps the workflow
  and the script in agreement
- `.github/workflows/ci.yml` — the `impact` job, seven guards, the gate's
  `planned-skips` input, and the evidence job's `full-run` condition
