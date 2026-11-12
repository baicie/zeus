# CI optimization — Phase 3A: native matrix deduplication

Branch `perf/ci-phase3a-native-dedup`. Baseline: `main` at `7d1031e4`.

Every number below was read from the GitHub API for the named run. Where a
claim could not be verified in real Actions it says so.

## 1. What was duplicated, measured

### Feature branches: push and pull_request built the same tree

`compiler-native.yml` listed `feat/**`, `fix/**` and `refactor/**` under `push`
_and_ ran on `pull_request`. A commit on a branch with an open PR therefore
built all seven platforms twice, in two independent runs, for the identical
tree:

| Commit     | push run    | pull_request run | Jobs each | Runner min (push) | Runner min (PR) |
| ---------- | ----------- | ---------------- | --------- | ----------------- | --------------- |
| `179779a4` | 43216543074 | 43216552540      | 7         | 9.5               | 10.6            |
| `6d71343f` | 43216215063 | 43216281805      | 7         | 9.8               | 11.4            |

Both pairs have identical `head_sha` and identical seven-job lists. The two
runs for `179779a4` overlapped in time (12:17:25 and 12:17:28), so they also
competed for the same macOS and Windows runners.

### `main`: the standalone matrix and Release Canary built the same tree

`release-canary.yml` has a `native-prebuild` job that calls
`compiler-native.yml` via `workflow_call` on every push to main. The standalone
`push: main` trigger ran the same matrix for the same commit:

| Run         | Workflow                  | Seven-platform builds | Runner min |
| ----------- | ------------------------- | --------------------- | ---------- |
| 43221565275 | Compiler Native Matrix    | yes                   | 14.7       |
| 43221565365 | Release Canary (prebuild) | yes                   | ~20.0      |

Same tree (`8f8f5256`), started three seconds apart. 14.7 runner minutes per
main merge were pure duplicate.

## 2. The change

Two separate mechanisms, because the two duplicates have different shapes.

### Feature branches — the trigger, not a guard

`push` now lists `main` only. `pull_request` is unchanged, including its
`paths:` filter. `pull_request` fires on `synchronize`, so a branch with an
open PR still gets exactly one matrix per commit.

This mirrors what Phase 1 did to `ci.yml` for the same reason and with the
same measured shape.

**What stops being validated:** a feature branch with _no open PR_ no longer
runs the native matrix on push. `workflow_dispatch` remains for a deliberate
run, and opening the PR runs it. This is the identical trade Phase 1 made for
`ci.yml`, and it is stated here rather than left implicit.

### `main` — a guard, because the trigger cannot express it

Removing `push: main` is not possible: a main merge must still be validated
when Release Canary does not build it. Adding a second trigger is not possible
either: the duplicate _is_ the two triggers.

So the standalone run decides whether its work is already being done:

1. A `dedupe-against-canary` job queries the Release Canary runs for this
   commit. If one exists, and it is not this run, the canary prebuild will
   build the same tree, and `build` skips.
2. Every uncertain case builds: the query fails, no canary run exists, the
   canary is disabled, the repository is a fork.

The guard is written against **this workflow identifying itself**, which is
load-bearing rather than defensive:

- Inside `workflow_call`, the `github` context belongs to the _caller_.
  `Release Canary` runs on `push` to `refs/heads/main` — exactly the event and
  ref the guard keys on. Without `github.workflow == 'Compiler Native Matrix'`
  the reused workflow would suppress the build that the release then downloads.
- The query excludes `github.run_id`, so the canary call cannot find the
  standalone push run for the same commit and conclude it is a duplicate of
  itself.

`build` carries `always() && !(<guard>)` rather than a bare `if:` because a
reused workflow and a pull request have no `dedupe-against-canary` result at
all. A skip must come from a _successful_ dedupe decision, never from an
absent one.

### What did not change

- The seven-platform matrix, targets, runner images and musl/Zig path.
- NAPI package names, artifact names (`compiler-native-<target>`) and upload
  shape — `release.yml` and `release-canary.yml` both download
  `compiler-native-*` unchanged.
- The `workflow_call` contract: no inputs, `secrets: inherit`.
- The `pull_request` `paths:` filter, byte for byte.

## 3. Verification

### Static, executed

| Check                                                           | Result            |
| --------------------------------------------------------------- | ----------------- |
| `actionlint .github/workflows/compiler-native.yml`              | clean             |
| `actionlint` with shellcheck, same file                         | clean             |
| `vitest run scripts/release/__tests__/release-workflow.spec.ts` | 27 passed (6 new) |
| `prettier --check` on every changed file                        | clean             |

The new tests pin, as text, the four triggers, the seven targets, the
self-identification guard and the `always()` build condition. They do not
prove GitHub's scheduling behaviour — that needs real runs, below.

### Real Actions

The end-to-end matrix must be executed on the branch, not asserted. The
scenarios and what each proves:

| #   | Scenario                                       | Expected                                                     | Status  |
| --- | ---------------------------------------------- | ------------------------------------------------------------ | ------- |
| 1   | Push to this PR branch                         | one native matrix (pull_request); no second push run         | NOT_RUN |
| 2   | Merge to main, canary healthy                  | canary prebuild builds 7; standalone `build` reports skipped | NOT_RUN |
| 3   | `workflow_dispatch` of the matrix              | 7 platforms build; dedupe job skipped, build not suppressed  | NOT_RUN |
| 4   | Tag release (`workflow_call` from release.yml) | 7 platforms build; the guard cannot fire                     | NOT_RUN |
| 5   | Canary disabled or failing before prebuild     | standalone matrix builds 7; no silent gap                    | NOT_RUN |

Scenarios 3 and 4 exercise exactly the paths the `github.workflow` guard
protects, and scenario 2 is the only one that can observe the saving. They are
listed as NOT_RUN until the runs exist; the numbers will be appended to this
document with run ids.

## 4. Risk and rollback

| Risk                                                            | Bound                                                                                                                    |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| A main commit gets no native matrix because the query was wrong | Only a _successful_ query with a matching canary run suppresses it; the canary run must exist before the guard can match |
| A release gets no artifacts                                     | The guard cannot fire inside `workflow_call` (caller context ≠ this workflow)                                            |
| A feature branch without a PR loses push validation             | Accepted, deliberate, `workflow_dispatch` remains; identical to the Phase 1 `ci.yml` trade                               |
| Query API hiccup causes a duplicate build                       | Costs runner minutes, which is the failure direction we chose                                                            |

Rollback is a single file: restore `feat/**`, `fix/**`, `refactor/**` under
`push:` and delete the two guard blocks. No artifact contract, package name or
release workflow references the guard.
