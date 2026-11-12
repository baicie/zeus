# CI optimization Phase 3A: the native matrix

Scope: `.github/workflows/compiler-native.yml`.
Baseline: `origin/main` @ `7d1031e4`.
Supersedes the dedupe design in the earlier revision of this file.

---

## 1. What changed, and what deliberately did not

Two duplicates existed. Only one of them is removed here.

| Duplicate                                                                                                                                                 | Evidence                                                                         | Status      |
| --------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------- | ----------- |
| A feature branch built all seven platforms twice — once on `push` (`feat/**`, `fix/**`, `refactor/**`) and once on `pull_request`, for the identical tree | 43216543074 / 43216552540 at `179779a4`; 43216215063 / 43216281805 at `6d71343f` | **Removed** |
| `main` builds all seven platforms twice — once standalone, once as `release-canary.yml`'s `native-prebuild`                                               | 43221565275 (14.7 runner minutes) and 43221565365 (~20), same commit `8f8f5256`  | **Kept**    |

The first is removed by narrowing `push` to `main`. `pull_request` fires on
`synchronize`, so an open PR still gets exactly one matrix per commit.

The second is **not** removed. It is real, measured, and worth roughly 15–20
runner minutes per main merge — but removing it safely is a different problem
from the one it first appears to be. See `docs/ci-native-matrix-dedup-rfc.md`.

---

## 2. Why the cross-workflow dedupe was withdrawn

An earlier revision of this branch implemented it: on main, query
`release-canary.yml`'s runs for the same SHA, and skip the standalone matrix if
one exists.

Four reasons that is not sufficient.

### 2.1 "A run exists" is not "the matrix succeeded"

`7d1031e4` is the counter-example, from this repository, on the day of writing:

| Run                                                | Workflow               | Result                                          |
| -------------------------------------------------- | ---------------------- | ----------------------------------------------- |
| 43249739170                                        | Release Canary         | `conclusion: failure`                           |
| └ `native-prebuild / build (aarch64-apple-darwin)` |                        | **`cancelled`**, `runner_name: ""`, `steps: []` |
| 43249739185                                        | Compiler Native Matrix | `success`, all seven platforms                  |

The canary run **existed**. One of its seven builds never ran. A guard keyed on
existence would have skipped the standalone matrix and left that change with no
`darwin-arm64` validation at all — while reporting green.

### 2.2 The job lacked the permission to ask

`compiler-native.yml` declares `permissions: contents: read`. The dedupe step
queried the Actions API with `gh api`. Every other Actions-API query in this
repository declares `actions: read` explicitly:

```
component-host-bench.yml:35   actions: read
ci.yml:550                    actions: read
host-deployment-stage2.yml:101 actions: read
release.yml:27                actions: read
rc-approval.yml:44            actions: read
```

The step wrapped the call in `2>/dev/null || echo ""`, so a permission failure
became "no canary run found" and the matrix built anyway. That reads as safe —
and it is, in the sense that nothing is skipped — but it also means the
optimization was never actually running, and the log line looked like a
transient network problem rather than a misconfiguration.

### 2.3 `native-prebuild` is conditional, and downstream of a gate

`release-canary.yml`:

```yaml
native-prebuild:
  if: >-
    github.repository == 'baicie/zeus' &&
    (github.ref == 'refs/heads/main' || ...)
  needs: release-preflight
```

The run can exist while `native-prebuild` has not started, is waiting on
`release-preflight`, or was skipped. None of those states means the seven
platforms were built.

### 2.4 Attempts and history are not distinguished

The query matched any run with the SHA, at any attempt. A re-run, a cancelled
first attempt, or a run from a different event all satisfy it.

---

## 3. What a safe implementation must prove

Recorded in full in `docs/ci-native-matrix-dedup-rfc.md`. In short, it needs
all of:

1. exact identity — full 40-character SHA, event, workflow id, run attempt;
2. seven per-platform job conclusions, each `success` **and** with a non-empty
   `runner_name` (a cancelled job has `runner_name: ""` and `steps: []`);
3. an artifact per platform, present, unexpired, and attributable to the SHA;
4. query failure treated as "build", with "no run" and "cannot tell"
   distinguished in the log;
5. `cancelled` / `failure` / `timed_out` canary results leaving `main` to build;
6. `workflow_call`, `workflow_dispatch` and tag releases never inheriting a skip;
7. no cross-workflow wait, so nothing can deadlock against the canary that
   needs these artifacts;
8. `actions: read` added **and observed working** in a real run.

Until every one of those is demonstrated against real Actions runs, `main`
keeps its own matrix. A duplicate costs runner minutes; a silently missing one
costs a release.

---

## 4. What did not change

- The seven-platform matrix: targets, runner images, the musl/Zig path.
- NAPI package names, artifact names (`compiler-native-<target>`) and upload
  shape — `release.yml` and `release-canary.yml` both download
  `compiler-native-*` unchanged.
- The `workflow_call` contract: no inputs, `secrets: inherit`.
- The `pull_request` `paths:` filter, byte for byte.
- `permissions: contents: read` — no Actions API query remains.

---

## 5. Verification

### Static, executed

| Check                                                | Result   |
| ---------------------------------------------------- | -------- |
| `actionlint .github/workflows/compiler-native.yml`   | see §5.1 |
| YAML parses; one job (`build`), seven matrix entries | verified |
| `grep -c dedupe` on the workflow                     | 0        |
| `push.branches`                                      | `[main]` |

### 5.1 Real Actions

The branch's own runs are the evidence for the trigger change; the rows that
depend on a merge to `main` cannot be produced from a pull request.

| #   | Scenario                                         | Expected                                                          | Status                |
| --- | ------------------------------------------------ | ----------------------------------------------------------------- | --------------------- |
| 1   | Push to this PR branch                           | one matrix (`pull_request`) for the commit; no second `push` run  | see §6                |
| 2   | `workflow_dispatch` of the matrix on a branch    | seven platforms build; no job skipped                             | NOT_RUN               |
| 3   | Merge to main                                    | standalone matrix builds seven; canary prebuild also builds seven | NOT_RUN (needs merge) |
| 4   | Tag release (`workflow_call` from `release.yml`) | seven platforms build                                             | NOT_RUN               |

Row 3 is the duplication this PR keeps on purpose; it is listed so the cost is
visible rather than assumed away.

---

## 6. The macOS ARM64 cancellations

Both cancelled jobs in this work are the same class of event, and neither is a
code defect. Evidence from the Actions API:

| Run         | Workflow               | Job                                      | Result      | `runner_name`               | Window              |
| ----------- | ---------------------- | ---------------------------------------- | ----------- | --------------------------- | ------------------- |
| 43249739185 | Compiler Native Matrix | `aarch64-apple-darwin`                   | `success`   | `GitHub Actions 1000079652` | 15:37:10 → 15:38:57 |
| 43249739170 | Release Canary         | `native-prebuild / aarch64-apple-darwin` | `cancelled` | **empty**                   | 15:39:16 → 15:54:47 |
| 43252159090 | Compiler Native Matrix | `aarch64-apple-darwin`                   | `cancelled` | **empty**                   | 15:50:38 → 16:05:41 |

Classification: **QUEUED / RUNNER_NOT_ASSIGNED**, not `EXECUTION_FAILED`,
`TIMED_OUT` or `UNKNOWN`.

### 6.1 A fourth occurrence, and what it narrows to

Run 43268897138 (this branch, `597178f2`) shows the same pattern once more, and
this one isolates the cause usefully:

| Platform                    | Runner label       | Result        | `runner_name` |
| --------------------------- | ------------------ | ------------- | ------------- |
| `aarch64-unknown-linux-gnu` | `ubuntu-24.04-arm` | success       | assigned      |
| `x86_64-apple-darwin`       | `macos-15-intel`   | success       | assigned      |
| `x86_64-unknown-linux-gnu`  | `ubuntu-24.04`     | success       | assigned      |
| `x86_64-unknown-linux-musl` | `ubuntu-24.04`     | success       | assigned      |
| `aarch64-pc-windows-msvc`   | `windows-11-arm`   | success       | assigned      |
| `x86_64-pc-windows-msvc`    | `windows-2025`     | success       | assigned      |
| **`aarch64-apple-darwin`**  | **`macos-15`**     | **cancelled** | **empty**     |

Every other platform — including the _other_ macOS label, `macos-15-intel` —
got a runner. The failure is specific to the `macos-15` label, not to macOS, not
to ARM, and not to this workflow's logic. Four sightings now:

| Run         | Workflow               | `macos-15` job       | Other platforms |
| ----------- | ---------------------- | -------------------- | --------------- |
| 43249739185 | Compiler Native Matrix | **success**, 1m47s   | all success     |
| 43249739170 | Release Canary         | cancelled, no runner | —               |
| 43252159090 | Compiler Native Matrix | cancelled, no runner | six success     |
| 43268897138 | Compiler Native Matrix | cancelled, no runner | six success     |

The first row is the counter-example that rules out "the job is misconfigured":
the identical job, on the identical label, built successfully in under two
minutes. What remains is capacity: the pool for that label was exhausted or
unavailable during those three windows. Whether it was this account's
concurrency limit or a GitHub-side shortage is not determinable from the data
available here.

Action taken: none in code. The platform stays in the matrix. Re-running the
workflow is the correct response to this class of failure, and it is the only
one that is — nothing in the repository can make a runner appear.

The reasoning, kept deliberately narrow:

- the job object reports `steps: []` — no step ever started;
- `runner_name` is empty — no runner was ever assigned;
- the elapsed window is ~15 minutes, which is the queue, not a build;
- a `macos-15` runner **was** available two minutes earlier for the standalone
  matrix (1000079652) and built the same target in 1m47s.

What this does **not** establish: whether the `macos-15` pool was saturated by
the two runs competing (the standalone and the canary were both in flight),
whether it was an account-level concurrency limit, or whether it was a
transient GitHub capacity event. Those need GitHub status history or support
data that is not in this repository. Recorded as unknown rather than guessed.

Consequence for this PR: nothing. The seven platforms stay; the trigger change
reduces the number of concurrent macOS ARM64 requests rather than increasing
them.

---

## 7. Risk and rollback

| Risk                                                                   | Mitigation                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| A PR branch that never opens a PR no longer runs the matrix on push    | `workflow_dispatch` covers it; the `pull_request` `paths:` filter is unchanged |
| `main` still builds twice                                              | accepted and documented; the safe removal is an RFC                            |
| The trigger change hides a regression that only a push run would catch | `pull_request` runs the same workflow with identical inputs                    |

Rollback is a single revert: restore `feat/**`, `fix/**`, `refactor/**` under
`push.branches`. No artifact names, cache keys or call contracts are involved.
