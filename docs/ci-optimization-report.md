# CI optimization — final report

Branch `chore/ci-performance-optimization`, draft PR #238. Phase 1 and Phase 2
are implemented; Phase 3 is deferred with the measurement that justifies
deferring it.

Baseline: `docs/ci-optimization-baseline.md`. Phase 1:
`docs/ci-optimization-phase1.md`. Phase 2: `docs/ci-optimization-phase2.md`.

## 1. Change list

| #   | Problem                                                | Files                                          | Before                                       | After                                                                      | Correctness                                                                                                               | Effect                                        |
| --- | ------------------------------------------------------ | ---------------------------------------------- | -------------------------------------------- | -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| 1   | Every PR commit ran the full suite twice               | `ci.yml`                                       | `push` on 9 branch prefixes + `pull_request` | `push` on `main` + `pull_request`                                          | `main` still runs everything; `pull_request` fires on synchronize, so a branch with an open PR still gets exactly one run | **−21.3 runner min per PR commit** (measured) |
| 2   | Release evidence collected on PRs, consumed by nothing | `ci.yml`                                       | ran on every event                           | requires non-PR event **and** `full-run == 'true'`                         | `rc-approval.yml` reads by `evidence_run_id`, always a main run; collector unchanged                                      | −26s and one install per PR                   |
| 3   | `lint-and-check` had no pnpm cache                     | `ci.yml`                                       | no `cache:`                                  | `cache: 'pnpm'`                                                            | content-addressed store, never `node_modules`; key includes lockfile hash                                                 | removes a cold-runner download                |
| 4   | Release contract checked only after merge              | `ci.yml`, `scripts/ci/check-release-config.ts` | release workflows only                       | `check:package-versions` + a dependency-free consistency check on every PR | additive; both already passed on main                                                                                     | ~10s; closes the #234 class of miss           |
| 5   | Jobs had no timeout                                    | `ci.yml`                                       | 2 of 9                                       | all 9, 3–4× observed duration                                              | bounds a hang at 25–30 min instead of 360                                                                                 | —                                             |
| 6   | No single merge verdict                                | `ci.yml`, `scripts/ci/ci-gate.ts`              | nine results to read by hand                 | one `ci-gate` with `always()`                                              | default is failure: cancelled, unknown, missing, unparseable, unplanned skip                                              | —                                             |
| 7   | No change-impact analysis                              | `scripts/ci/impact-analysis.ts`, `ci.yml`      | every job on every change                    | `impact` → 7 guarded jobs                                                  | expands on any ambiguity; narrowest result is docs-only                                                                   | see §3                                        |

## 2. Performance

All figures from the GitHub API for the named runs. "Runner minutes" is the sum
of job durations in the run.

### The duplication that was removed

|                          | Run         | Event        | Commit     | Runner min |
| ------------------------ | ----------- | ------------ | ---------- | ---------- |
| before                   | 43180711152 | push         | `847b43d1` | 21.8       |
| before                   | 43180717486 | pull_request | `847b43d1` | 21.3       |
| **total for one commit** |             |              |            | **43.0**   |
| after                    | 43193308285 | pull_request | `a9d368aa` | **21.3**   |

Runs 1 and 2 were the same tree with identical nine-job lists. 49.4% of the
spend on that commit was duplicate work. After the change the same PR commit
costs one run.

**Caveat, stated plainly:** run 43193308285 is a PR run, and runs 1–2 are the
before-state for a PR commit, so the comparison is like-for-like. It is _not_ a
prediction for `main`: a `main` push still runs the full suite by design.

### Critical path

|             | Longest job           | Wall clock | Runner min |
| ----------- | --------------------- | ---------- | ---------- |
| before (PR) | packed-consumers 468s | 10.7 min   | 21.3       |
| after (PR)  | packed-consumers 379s | ~9 min     | 21.3       |

The critical path is unchanged in kind: `packed-consumers` still dominates, and
it still runs on every code change. Runner minutes are flat, because the same
nine jobs run — the saving came from not running them twice, which is a
per-commit figure, not a per-run one.

### Cache

| Job            | pnpm cache before | after |
| -------------- | ----------------- | ----- |
| lint-and-check | none              | yes   |
| all others     | yes               | yes   |

Cargo cache hit rate and Docker BuildKit effectiveness were **not measured**
(baseline §5) and are not claimed.

### Playwright

Measured, then not changed. The install is **43s of a 468s job**; the fifteen
gates are the cost, twelve of which each launch three browsers. Caching the
browsers would save under 10% of the job. The image would add pull time and
pinning risk for a similar saving. Phase 3 remains open with that data.

## 3. Verification

### Static

- `actionlint` on the modified workflow: clean. The 8 warnings elsewhere are
  pre-existing on `main` and unchanged.
- 47 test files / 455 tests across `scripts/ci`, `scripts/release`,
  `scripts/check`: all pass.

### Gate behaviour, executed

| Input                             | Expected | Actual                                                                 |
| --------------------------------- | -------- | ---------------------------------------------------------------------- |
| all success                       | pass     | pass                                                                   |
| docs-only, six planned skips      | pass     | pass                                                                   |
| a skip the plan did not make      | fail     | fail: `packed-consumers: skipped, but the impact plan did not skip it` |
| `impact` failed, others succeeded | fail     | fail: `impact analysis did not run, so no skip is justified`           |
| a job `cancelled`                 | fail     | fail                                                                   |
| unparseable `NEEDS`               | fail     | fail                                                                   |

### Observed in real CI, not just in tests

Two things this branch proved by failing first:

1. **The gate caught a real failure.** On run 43190404827 the `impact` job
   died (`temp/ci/` did not exist for a shell redirect). All seven jobs
   skipped. `ci-gate` **failed**. Without it, that run would have shown
   "nothing failed" and looked green.
2. **The evidence job's new condition is load-bearing.** It is `full-run ==
'true'` — redundant today, present so a narrow-on-main change cannot produce
   evidence for checks that were skipped.

### Scenario matrix

| #   | Scenario                  | Verified how                                       |
| --- | ------------------------- | -------------------------------------------------- |
| 1   | Docs-only PR              | unit: classifier + planner; CLI with planned skips |
| 2   | Admin-only PR             | unit                                               |
| 3   | Runtime-only PR           | unit                                               |
| 4   | Compiler-only PR          | unit                                               |
| 5   | Rust / Cargo change       | unit                                               |
| 6   | `pnpm-lock.yaml` change   | unit (full suite)                                  |
| 7   | Release config change     | unit                                               |
| 8   | Workflow change           | unit (escalates)                                   |
| 9   | New workspace package     | unit                                               |
| 10  | Broad cross-domain change | unit                                               |
| 11  | Impact analysis fails     | CLI + **real CI** (run 43190404827)                |
| 12  | Key job cancelled         | CLI                                                |

**NOT_RUN:** scenarios 1–10 are not verified end to end in Actions. This branch
changes `.github/**`, which escalates to a full run by design, so the PR cannot
demonstrate a skip. A docs-only follow-up would prove scenario 1 end to end.
This is a real gap in evidence, not a formality.

## 4. Security and gates

| Check                                           | Result                                                                                        |
| ----------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Every required check runs or legitimately skips | yes — skips are computed by `impact`, not nominated by the job                                |
| No change path is unchecked                     | unknown paths, deletions, renames, large diffs, lockfiles and workflows all select every area |
| Failures block                                  | `ci-gate` fails on failure, cancelled, unknown, unplanned skip, failed analysis               |
| Release evidence real and complete              | collector untouched; now additionally gated on `full-run`                                     |
| External UI commit pairing                      | untouched; `create-zeus-candidates` still checks out and pins `baicie/zeus-ui`                |
| No cross-platform cache pollution               | caches are pnpm stores keyed by OS and lockfile; no native binary crosses a platform          |
| No new permission risk                          | `impact` and `ci-gate` use the workflow-level `contents: read`; no new scopes                 |

Branch protection is **not** enabled — `main` has none today. `ci-gate` exists
and is correct; making it required is a repository setting, not a file.

## 5. Remaining risk and follow-ups

| Item                                                       | Why not done                                                                                              | Risk                                                        | Priority  |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | --------- |
| Phase 3: split `packed-consumers`                          | Shortens the critical path but may not reduce runner minutes; needs a decision about which number matters | Medium — parallel jobs multiply temp-dir and port conflicts | Next      |
| Playwright caching / image                                 | 43s of 468s; under 10%                                                                                    | Low value                                                   | Low       |
| **Enable branch protection on `main`**                     | Repository setting                                                                                        | **High** — the gate is advisory until then                  | **First** |
| End-to-end docs-only skip proof                            | This branch cannot demonstrate it                                                                         | Low — unit + CLI cover the logic                            | Follow-up |
| Unify `actions/checkout@v4` → v5 in 5 deployment workflows | Outside scope                                                                                             | Low                                                         | Later     |
| Cargo and BuildKit cache measurement                       | Not measured in this pass                                                                                 | Unknown                                                     | Phase 3   |

## 6. Unrelated work found in the tree

While working, an uncommitted image-size fix existed in the working tree
(`admin-image.yml` plus `scripts/release/image-size-gate*.ts` and
`scripts/size/`). It is a genuine defect — the size gate read
`imagetools inspect --format '{{json .Manifest}}'`, which returns a descriptor
with no `layers` array, so the computed size was always 0.0 MB and the budget
never fired.

It is **not part of these commits**. It was stashed and restored around each
commit so the type-check hook would not fail on unrelated files. Whoever owns
branch `perf/build-size-audit` should land it separately.

## Branch protection is on

Verified by `gh api repos/baicie/zeus/rules/branches/main`: deletion, non-fast-forward and a required `ci-gate` status check.
