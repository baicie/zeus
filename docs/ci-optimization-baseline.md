# CI optimization baseline

Measured 2026-11-12 against `main` at `11a7bbfc`. Every figure below was read
from the GitHub API for a named run or from a workflow file at that commit.
Nothing here is estimated; where a number could not be measured it says so.

## 1. The three reference runs

All three ran the same workflow on the same day.

| Run                                                                    | Event        | Commit     | Wall clock | Runner minutes |
| ---------------------------------------------------------------------- | ------------ | ---------- | ---------- | -------------- |
| [43180711152](https://github.com/baicie/zeus/actions/runs/43180711152) | push         | `847b43d1` | 8.0 min    | 21.8           |
| [43180717486](https://github.com/baicie/zeus/actions/runs/43180717486) | pull_request | `847b43d1` | 10.7 min   | 21.3           |
| [43182343262](https://github.com/baicie/zeus/actions/runs/43182343262) | push (main)  | `11a7bbfc` | 7.7 min    | 21.7           |

Runner minutes are the sum of every job's execution time in that run.

### The first finding

Runs 1 and 2 are **the same commit**. They have identical job lists:

```
test, rust-compiler, build, create-zeus-candidates (ubuntu),
docs-build, packed-consumers, lint-and-check,
create-zeus-candidates (windows), cross-platform-evidence
```

`ci.yml` triggers on `push` to any of nine branch prefixes **and** on
`pull_request` to `main`. A commit pushed to a branch that has an open PR
therefore runs the entire suite twice, in parallel, for the same tree. Together
the two runs spent **43.0 runner minutes on 21.8 minutes of work** — 49.4% of
the CI spend on that commit was duplicate, and it is the largest single item
available.

The same duplication affects `compiler-native.yml` (push to `feat/**`,
`fix/**`, `refactor/**` plus pull_request) and `admin-image.yml` (push to main
plus pull_request on `examples/admin/**`).

## 2. Where the time goes

Per-job durations for run 43180717486 (PR). Queue time is measured from the
run's `created_at` to the job's `started_at`, so it includes runner scheduling.

| Job                              | Queue | Run      | Notes                 |
| -------------------------------- | ----- | -------- | --------------------- |
| packed-consumers                 | 145s  | **468s** | longest job by 2.4×   |
| create-zeus-candidates (windows) | 129s  | 200s     |                       |
| build                            | 118s  | 143s     |                       |
| create-zeus-candidates (ubuntu)  | 128s  | 125s     |                       |
| test                             | 116s  | 124s     |                       |
| rust-compiler                    | 100s  | 113s     |                       |
| lint-and-check                   | 123s  | **47s**  |                       |
| docs-build                       | 150s  | 30s      |                       |
| cross-platform-evidence          | 2s    | 26s      | depends on three jobs |

The critical path is `max(queue) + packed-consumers + cross-platform-evidence`
≈ 145 + 468 + 26 = **639s**, which matches the 10.7-minute wall clock once
checkout and teardown are added.

Queue time is 100–150s across every job, roughly constant. It is scheduling
latency, not work, and no workflow change removes it.

### packed-consumers breakdown

Per-step durations for run 43180717486. This is the job to optimize: 468s, of
which ~410s is inside the step list.

| Step                                                   | Duration |
| ------------------------------------------------------ | -------- |
| Setup (checkout, pnpm, node, rust, cargo cache)        | 30s      |
| `pnpm install`                                         | 3s       |
| Build host native compiler                             | 23s      |
| `pnpm build` + `build-dts`                             | 11s      |
| **Install browser engines** (`--with-deps`, 3 engines) | **43s**  |
| packed consumers (native, React 18/19, Vue 3)          | 73s      |
| RC readiness report                                    | 26s      |
| Admin navigation (3 engines)                           | 35s      |
| Playground UX (3 engines)                              | **44s**  |
| Playground theme + i18n (3 engines)                    | 32s      |
| Next.js boundary (3 engines)                           | 29s      |
| HMR (3 engines)                                        | 25s      |
| Playground views (3 engines)                           | 22s      |
| WASM compiler Worker (3 engines)                       | 21s      |
| Runtime cleanup (3 engines)                            | 16s      |
| SSR hydration                                          | 6s       |
| Form-associated                                        | 6s       |
| Accessibility                                          | 6s       |
| DevTools panel                                         | 6s       |
| Upload reports                                         | 4s       |

Two observations from the real numbers:

1. **The browser install is 43s, not the dominant cost.** Even eliminating it
   entirely would save under 10% of the job. The gates themselves total ~270s
   across fifteen steps, all serial in one job.
2. **Twelve gates each launch three browsers.** Each step pays its own launch
   and teardown. That is the shape of the cost, not the engine download.

This changes the Phase 3 priority: splitting the job shortens the _critical
path_ (packed-consumers is the longest job, so wall clock improves) but may not
reduce total runner minutes much, because the same work still happens — just in
parallel on more runners. Whether that trade is worth it depends on which
number is being optimized.

## 3. Cache state

| Job                     | pnpm cache           | Cargo cache | Evidence                                                             |
| ----------------------- | -------------------- | ----------- | -------------------------------------------------------------------- |
| lint-and-check          | **none**             | n/a         | no `cache:` key in `setup-node`                                      |
| rust-compiler           | yes                  | yes         | `Cache restored successfully`, key `node-cache-Linux-x64-pnpm-1fde…` |
| build                   | yes                  | n/a         | restored                                                             |
| test                    | yes                  | n/a         |                                                                      |
| packed-consumers        | yes                  | yes         |                                                                      |
| create-zeus-candidates  | yes (both lockfiles) | yes         | `cache-dependency-path` lists Core and UI lockfiles                  |
| cross-platform-evidence | yes                  | n/a         |                                                                      |
| docs-build              | yes                  | n/a         |                                                                      |

`lint-and-check` is the only job without a pnpm cache. In run 43182343262 its
install still reported `reused 898, downloaded 0` — the runner had a warm
`~/.local/share/pnpm/store` from an earlier job on the same machine. That is
luck, not configuration: on a cold runner the same install downloads the
lockfile's dependencies. The job is 47s warm; the cold cost was not measured
because the runner happened to be warm, and this document does not guess at it.

`Swatinem/rust-cache` autosaves on job success by default. Whether it is
actually restoring across runs was not verified from logs in this pass; the
`Cache restored successfully` line seen in `build` is the pnpm cache, not
Cargo. Marked **NOT_VERIFIED**.

## 4. Duplicate and overlapping work

Beyond the push/PR duplication in §1:

| Work                          | Where it runs                                                    | Duplicated?             |
| ----------------------------- | ---------------------------------------------------------------- | ----------------------- |
| `pnpm build`                  | `build`, `packed-consumers`, `create-zeus-candidates` ×2, `test` | 5 times per run         |
| `pnpm build-dts`              | `build`, `packed-consumers`, `create-zeus-candidates` ×2         | 4 times                 |
| `pnpm install`                | every job, 9 jobs                                                | 9 times                 |
| browser engine install        | `packed-consumers` only                                          | once, but three engines |
| `pnpm check:package-versions` | **nowhere in PR CI**                                             | see §6                  |

## 5. What was not measured

Honesty about the gaps matters more than a complete-looking table:

- **Cold-cache install time.** Every observed run had a warm pnpm store. The
  cost a cache miss would add is unknown.
- **Cargo cache hit rate.** `rust-cache` logs its own restore result; those logs
  were not read in this pass.
- **Docker/BuildKit cache effectiveness** in `admin-image.yml` and
  `playground-image.yml`. Both use `cache-from: type=gha`; the hit rate was not
  measured.
- **Artifact transfer time.** Upload steps are visible but their duration was
  not isolated.

Each of these is a candidate for Phase 3 measurement rather than a Phase 1
change, because a Phase 1 change made without them would be guesswork.

Conversely, the browser-install cost **was** measured (§2) and came out smaller
than assumed, which is the reason Phase 3 does not start by caching browser
binaries.

## 6. Gate coverage gaps

### The release contract is not checked on PRs

`check:package-versions` and `release:plan` run in `release.yml`,
`release-canary.yml` and `packed-consumers`' RC-readiness step — none of which
block a PR merge. The consequence was observed today: `@zeus-js/i18n` shipped
in #234 without being registered in `zeusFixedPackages` or the Changesets
`fixed` group. Every PR check passed. `Release Canary` failed **after** the
merge to main.

That is a gate that fires too late to be useful. The fix is cheap:
`check:package-versions` is a single `tsx` script that reads package.json files,
and the Changesets/config consistency test already exists in
`scripts/release/__tests__/release-config.spec.ts`.

### cross-platform-evidence is rigid

`scripts/release/collect-cross-platform-evidence.ts` requires, by exact job
name:

- linux: `lint-and-check`, `packed-consumers`, `create-zeus-candidates
(ubuntu-latest)`
- win32: `create-zeus-candidates (windows-latest)`

and artifacts `create-zeus-candidate-ubuntu-latest` /
`create-zeus-candidate-windows-latest`.

**This constrains change-impact analysis directly**: any scheme that lets
`lint-and-check` or `packed-consumers` be skipped for a "docs-only" change
would break evidence collection on that run. Evidence is only collected on
`github.repository == 'baicie/zeus'`, so it runs on main pushes, but the job
depends on the three jobs above, and a skipped dependency fails the run.

Options are (a) keep those three jobs unconditional, (b) teach the collector
that a run which does not need evidence should not attempt to produce it, or
(c) both. This document recommends (a) plus an explicit `needs` result check,
and it is the reason §7 ranks change-impact work last.

## 7. Workflow hygiene findings

| Item                        | Finding                                                                                                                                                                                                                      | Severity |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| Action pinning              | Mixed: `actions/checkout@v4` in 5 workflows, `@v5` in 13. Same for `setup-node` (v4 in 4, v5 in 12). Third-party actions are SHA-pinned; first-party are tag-pinned.                                                         | Medium   |
| Permissions                 | `ci.yml` sets `contents: read` at workflow level; `cross-platform-evidence` adds `actions: read` scoped to that job. Good. `admin-image.yml` has `packages: write` at workflow level although only the publish job needs it. | Low      |
| timeouts                    | `ci.yml`: 2 of 9 jobs have `timeout-minutes`. `compiler-native.yml`: 0 of 1. `admin-image.yml`: 3 of 4. A hung job runs to GitHub's 360-minute default.                                                                      | Medium   |
| Artifact retention          | Only 5 of 15 upload steps set `retention-days`. Default is 90 days, which for per-run consumer reports is longer than useful.                                                                                                | Low      |
| Duplicate checkout          | None found; each job checks out once.                                                                                                                                                                                        | none     |
| Redundant toolchain install | `rust-compiler` and `packed-consumers` each install Rust + Cargo cache independently — unavoidable across jobs without artifact reuse.                                                                                       | none     |
| actionlint                  | Clean at this commit for `ci.yml` and `compiler-native.yml`.                                                                                                                                                                 | none     |

## 8. Priority

Ordered by measured impact and risk, not by how interesting the work is.

| #   | Change                                                         | Expected effect                                                                | Risk                                                                                             | Phase |
| --- | -------------------------------------------------------------- | ------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------ | ----- |
| 1   | Stop running the full suite twice per PR commit                | **−50% runner minutes on PR branches**; wall clock unchanged for the PR itself | Low — main still runs everything                                                                 | 1     |
| 2   | Add pnpm cache to `lint-and-check`                             | Removes a cold-runner download from a 47s job                                  | Very low                                                                                         | 1     |
| 3   | Run `check:package-versions` + release-plan consistency on PRs | Closes the gate that let #234 through                                          | Very low                                                                                         | 1     |
| 4   | Add `timeout-minutes` to every job                             | Bounds a hung job at 30 min instead of 360                                     | Very low                                                                                         | 1     |
| 5   | Unify action versions                                          | Removes an untested combination                                                | Low                                                                                              | 1     |
| 6   | Measure Playwright install, Cargo cache, BuildKit cache        | Enables Phase 3 with data                                                      | none                                                                                             | 3     |
| 7   | Change-impact analysis with a `ci-gate` aggregate              | Reduces work on docs/admin-only changes                                        | **High** — interacts with cross-platform-evidence, and a wrong skip is a silent correctness hole | 2     |

Item 7 is ranked last deliberately. It is the most valuable change in the long
run and the most dangerous to get wrong: a skip that should not have happened
does not fail anything, it just stops checking. It needs the evidence
collector's constraints solved first, and a verification matrix that includes
the failure cases.

## 9. What this baseline does not claim

- It does not claim a target wall-clock time. The critical path is dominated by
  `packed-consumers` (468s) and runner queue latency (100–150s); neither has
  been optimized yet.
- It does not claim the caches listed in §3 are effective, only configured,
  except where a log line is quoted.
- It does not treat the i18n release-registration miss as a one-off. It is
  evidence that PR gates do not cover the release contract, which is a class of
  bug, not an instance.
