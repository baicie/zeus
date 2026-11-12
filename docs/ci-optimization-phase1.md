# CI optimization — Phase 1

Low-risk changes only. Everything here is reversible and none of it removes a
check. Measured baseline: `docs/ci-optimization-baseline.md`.

## 1. Stop running the full suite twice per PR commit

**Problem.** `ci.yml` triggered on `push` to nine branch prefixes _and_ on
`pull_request` to `main`. A commit on a branch with an open PR ran the whole
suite twice — nine jobs each — against the identical tree.

**Measured.** Runs 43180711152 (push) and 43180717486 (pull_request) are the
same commit `847b43d1`, with identical job lists. Together: 43.0 runner
minutes for 21.8 minutes of work. **49.4% of the spend was duplicate.**

**Change.** `push` now lists only `main`. `pull_request` keeps running for
every PR branch, and the `pull_request` event fires on `synchronize`, so
pushing to a branch with an open PR still gets exactly one full run.

**Correctness.** Nothing is skipped on a PR. A branch with no open PR no longer
gets a run — deliberate: push-only branches should not consume nine runners.
`workflow_dispatch` remains for a deliberate run on any branch. `main` still
runs the full suite on every merge.

**Expected saving.** ~21 runner minutes per PR commit, ~49% of CI spend on
those commits.

## 2. Stop collecting release evidence on PR runs

**Problem.** `cross-platform-evidence` ran on pull requests and uploaded an
artifact no consumer reads.

**Evidence it is unconsumed.** `rc-approval.yml` takes `evidence_run_id` as an
input and downloads the artifact from _that_ run. `release.yml` reads the
result. Neither ever points at a pull-request run — release evidence describes
a `main` commit by construction.

**Change.** `if:` now also requires `github.event_name != 'pull_request'`.

**Correctness.** On `main` and `workflow_dispatch` the job is unchanged and
still validates commit, run, attempt, platform and artifact digests. The gate
allow list accepts its skip on PRs explicitly (§4), so the skip is declared
rather than implicit.

## 3. pnpm cache for `lint-and-check`

**Problem.** The only job with no pnpm cache.

**Why it looked fine anyway.** In run 43182343262 the install reported
`reused 898, downloaded 0` — the runner already had a warm store from an
earlier job on the same machine. That is luck, not configuration.

**Change.** `cache: 'pnpm'` on `setup-node`.

**Correctness.** None affected; the cache holds the pnpm content-addressed
store, never `node_modules`, and the key includes the lockfile hash.

## 4. Release contract checked on the PR

**Problem.** `check:package-versions` and the Changesets/config consistency
test ran only in release workflows. Today `@zeus-js/i18n` shipped in #234
without being registered in `zeusFixedPackages` or the Changesets `fixed`
group. Every PR check passed; `Release Canary` failed on main afterwards.

**Change.** Two steps in `lint-and-check`:

- `pnpm check:package-versions` (~8s)
- `pnpm exec vitest run scripts/release/__tests__/release-config.spec.ts` (~2s)

**Correctness.** Additive. Both were already passing on main; they now run
before the merge instead of after it.

## 5. `timeout-minutes` on every job

| Job                     | Before | After |
| ----------------------- | ------ | ----- |
| lint-and-check          | ∞      | 20    |
| rust-compiler           | ∞      | 25    |
| build                   | ∞      | 30    |
| test                    | ∞      | 25    |
| packed-consumers        | 30     | 30    |
| create-zeus-candidates  | 60     | 60    |
| cross-platform-evidence | ∞      | 15    |
| docs-build              | ∞      | 15    |
| ci-gate                 | —      | 10    |

Without a timeout a hung job runs to GitHub's 360-minute default. The values
are 3–4× the observed durations (baseline §2), so they bound a hang without
cutting a slow-but-healthy run.

## 6. Aggregate `ci-gate`

**Problem.** `main` has no branch protection and no required status checks —
verified with `gh api repos/baicie/zeus/branches/main/protection`, which
returns `Branch not protected`. A merge therefore depends on someone reading
the list of nine job results.

**Change.** A new `ci-gate` job with `if: always()`, needing every other job.
It reads `toJSON(needs)` and fails unless each dependency is `success` or a
skip on an explicit allow list.

The default is the important part:

| Result                           | Verdict                        |
| -------------------------------- | ------------------------------ |
| `success`                        | pass                           |
| `skipped` and on the allow list  | pass, with the reason recorded |
| `skipped` and not on the list    | **fail**                       |
| `failure`                        | **fail**                       |
| `cancelled`                      | **fail**                       |
| unknown / missing result         | **fail**                       |
| unparseable `NEEDS`              | **fail**                       |
| required job absent from `needs` | **fail**                       |

**Tests.** `scripts/ci/__tests__/ci-gate.spec.ts` covers every row above (10
cases). `scripts/ci/__tests__/ci-gate-workflow.spec.ts` asserts the workflow's
`needs` list equals the script's required list, that `if: always()` is present,
and that the job contains no `continue-on-error` — so the two halves cannot
drift apart silently.

**Not done in this phase.** Enabling branch protection is a repository setting,
not a file. The gate exists and is correct; making it _required_ is a decision
for the maintainer, and this change does not make it.

## Explicitly not done

- **Change-impact analysis.** Deferred to Phase 2. It interacts with
  `cross-platform-evidence`'s hard-coded job requirements (baseline §6) and a
  wrong skip is a silent correctness hole.
- **Playwright caching or the official image.** The measured install is 43s of
  a 468s job (baseline §2). The gates themselves — twelve of them, three
  engines each — are the cost, not the download.
- **Unifying `actions/checkout@v4` → `@v5`.** Five deployment workflows still
  use v4. Those files are outside this change's scope and editing them would
  enlarge the diff without improving CI for a PR.
- **Branch protection.** See §6.

## Verification

| Check                                                     | Result                                              |
| --------------------------------------------------------- | --------------------------------------------------- |
| `actionlint .github/workflows/ci.yml`                     | pass (8 pre-existing warnings elsewhere, unchanged) |
| `vitest scripts/ci/__tests__/`                            | 15/15                                               |
| `vitest scripts/release/__tests__/ scripts/ci/__tests__/` | 36 files, 320 tests, 0 failures                     |
| gate with all-success input                               | exit 0                                              |
| gate with a failure                                       | exit 1, names the job                               |
| gate with `cancelled`                                     | exit 1                                              |
| gate with malformed JSON                                  | exit 1                                              |

Real CI confirmation is the next run on this PR: it should show **one** CI run
instead of two, and a green `ci-gate`.
