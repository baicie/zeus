# 两仓分支与工作区核验（2026-10-27）

审计时间：2026-10-27 01:20 (Asia/Shanghai)。只读盘点 + 两项安全清理；不改动任何分支指针、不删除含未推送提交的分支、不丢弃 stash。

## 结论摘要

| 仓库             | main head | 工作区 | 本地分支 | 与 main 同树（已吸收） | 树内容有差异 | stash | 工作树 |
| ---------------- | --------- | ------ | -------- | ---------------------- | ------------ | ----- | ------ |
| `baicie/zeus`    | `148229b` | 干净   | 49       | 21                     | 28           | 3     | 3      |
| `baicie/zeus-ui` | `25ed76e` | 干净   | 17       | 4                      | 13           | 1     | 2      |

两仓 `main` 与工作区均干净，无未提交改动；远端与本地一致（`origin/main` 即本地 `main`）。核验时唯一有开放 PR 的分支是 `codex/golden-beta34-acceptance`（#183，Golden beta.34 持久报告）。

## 采取的清理动作

1. `git worktree prune`：zeus 清掉 5 条指向已删除目录的工作树登记（`zeus-e006`、`zeus-ssr-codegen2`、`zeus-golden-ui`、`zeus-pr73-base-20261017`、`zeus-hydration-plan`），zeus-ui 清掉 4 条（`zeus-ui-baseline.nnIvdO`、`zeus-ui-phase11-components`、`zeus-ui-roadmap-components`、`zeus-ui-components`）。
2. 移除 `/private/tmp/zeus-public-dts-beta20`：工作区干净，分支 `codex/golden-beta34-contract` 已随 PR #181 合并，属临时隔离验证目录。

**未动**：`~/.codex/worktrees/**`（由 Codex 工具托管）、`../zeus-ui-phase15`（独立检出的外部工作树）、以及全部 stash（历史 WIP，删除需用户确认）。

## `baicie/zeus`：树内容与 main 不同的分支（28 条）

继续保留这些分支指针是安全的：它们多数是已被 #176/#178/#179/#180/#181/#182 吸收或已被取代的历史线，SHA 级比较在 squash/merge 之后无法表达“内容已进 main”，因此这里只按树差异列出，不做删除判断。

| 分支                                        | 与 main 的树差异                                       |
| ------------------------------------------- | ------------------------------------------------------ |
| `backup/create-zeus-015-288ba22`            | 79 files changed, 1720 insertions(+), 272 deletions(-) |
| `codex/benchmark-history`                   | 3 files changed, 322 insertions(+), 10 deletions(-)    |
| `codex/beta18-release`                      | 32 files changed, 88 insertions(+), 82 deletions(-)    |
| `codex/compiler-hydration-plan`             | 28 files changed, 1654 insertions(+), 233 deletions(-) |
| `codex/create-zeus-0.1.5`                   | 19 files changed, 607 insertions(+), 42 deletions(-)   |
| `codex/devtools-docs2`                      | 17 files changed, 442 insertions(+), 17 deletions(-)   |
| `codex/docs-executable-guides`              | 6 files changed, 89 insertions(+), 2 deletions(-)      |
| `codex/final-roadmap-contracts`             | 66 files changed, 1392 insertions(+), 485 deletions(-) |
| `codex/golden-beta34-acceptance`            | 6 files changed, 2962 insertions(+), 89 deletions(-)   |
| `codex/lazy-projection-reconnect`           | 2 files changed, 68 insertions(+)                      |
| `codex/refresh-beta18-roadmap`              | 3 files changed, 37 insertions(+), 29 deletions(-)     |
| `codex/release-canary-dist-tag-isolation`   | 2 files changed, 4 insertions(+), 7 deletions(-)       |
| `codex/release-canary-native-latest-policy` | 2 files changed, 4 insertions(+), 7 deletions(-)       |
| `codex/release-native-latest-policy`        | 8 files changed, 75 insertions(+), 66 deletions(-)     |
| `codex/roadmap-audit-20261022`              | 2 files changed, 12 insertions(+), 9 deletions(-)      |
| `codex/roadmap-beta34-verification`         | 24 files changed, 3380 insertions(+), 192 deletions(-) |
| `codex/roadmap-create-zeus-014`             | 1 file changed, 7 insertions(+)                        |
| `codex/roadmap-d006-f011-final`             | 1 file changed, 8 insertions(+), 2 deletions(-)        |
| `codex/roadmap-data-grid-baseline-merged`   | 3 files changed, 85 insertions(+), 85 deletions(-)     |
| `codex/roadmap-e2e-audit-20261022`          | 2 files changed, 30 insertions(+)                      |
| `codex/roadmap-final-audit-20261023`        | 2 files changed, 28 insertions(+)                      |
| `codex/roadmap-final-evidence`              | 78 files changed, 2384 insertions(+), 277 deletions(-) |
| `codex/roadmap-final-state-20261024`        | 4 files changed, 23 insertions(+), 3 deletions(-)      |
| `codex/roadmap-final-status-consistency`    | 2 files changed, 12 insertions(+), 2 deletions(-)      |
| `codex/roadmap-golden-beta33-evidence`      | 5 files changed, 2765 insertions(+), 114 deletions(-)  |
| `codex/runtime-resource-devtools`           | 13 files changed, 1837 insertions(+), 29 deletions(-)  |
| `codex/ui114-merge-audit-20261023`          | 2 files changed, 12 insertions(+)                      |
| `codex/wip-portable-dts-snapshot-20260821`  | 41 files changed, 2184 insertions(+), 81 deletions(-)  |

## `baicie/zeus-ui`：树内容与 main 不同的分支（13 条）

UI 仓禁止 merge commit、使用 squash 合并，因此 `git cherry` 的 patch-id 比较同样会误判；下表同样只按树差异列出。

| 分支                                       | 与 main 的树差异                                          |
| ------------------------------------------ | --------------------------------------------------------- |
| `codex/accessibility-release-gates`        | 5 files changed, 65 insertions(+), 3 deletions(-)         |
| `codex/beta34-release-evidence`            | 5 files changed, 146 insertions(+), 21 deletions(-)       |
| `codex/dialog-outside-dismissal`           | 4 files changed, 26 insertions(+), 1 deletion(-)          |
| `codex/pre-sync-local-main`                | 16 files changed, 485 insertions(+), 54 deletions(-)      |
| `codex/registry-phase10-11`                | 99 files changed, 3689 insertions(+), 567 deletions(-)    |
| `codex/u003-renderer-host`                 | 3 files changed, 268 insertions(+), 29 deletions(-)       |
| `codex/ui-beta33-release-prep`             | 230 files changed, 13110 insertions(+), 1516 deletions(-) |
| `codex/ui-beta34-release`                  | 43 files changed, 43 insertions(+), 43 deletions(-)       |
| `codex/ui-event-detail-optionality`        | 76 files changed, 2510 insertions(+), 793 deletions(-)    |
| `codex/ui-phase15-stable-release-20261023` | 42 files changed, 42 insertions(+), 42 deletions(-)       |
| `codex/ui-roadmap-phase15-audit`           | 1 file changed, 9 insertions(+)                           |
| `codex/ui-roadmap-release-hold-20261023`   | 1 file changed, 3 insertions(+), 2 deletions(-)           |
| `release/0.1.0`                            | 85 files changed, 961 insertions(+), 131 deletions(-)     |

## 待用户决定（非阻塞）

- 若确认不再需要，可批量删除两仓中「与 main 同树」的本地分支（zeus 21 条、zeus-ui 4 条）以及 4 条历史 stash；本次未删除。
- `~/.codex/worktrees/lazy-projection-reconnect/zeus`、`~/.codex/worktrees/zeus-beta18-release`、`../zeus-ui-phase15` 属工具或外部工作树，由对应流程回收。

## 复现

```bash
# 一致性
git -C zeus status --porcelain && git -C zeus rev-parse --short origin/main
git -C zeus-ui status --porcelain && git -C zeus-ui rev-parse --short origin/main
# 分支树差异
for b in $(git -C zeus for-each-ref --format='%(refname:short)' refs/heads); do
  git -C zeus diff --quiet origin/main...$b || echo "differs: $b"
done
# 工作树登记
git -C zeus worktree list
git -C zeus-ui worktree list
```
