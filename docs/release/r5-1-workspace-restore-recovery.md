# R5.1 Stage 2 Workspace 恢复事务与崩溃恢复

本文说明 Stage 2 回滚时 AI Workspace 归档恢复的事务边界、故障行为与人工介入方式。
实现位于：

- `scripts/release/deployment-workspace-restore.ts`
- `scripts/release/deployment-transaction.ts`（`rollbackDeployment`）
- `scripts/release/__tests__/deployment-transaction-recovery.spec.ts`

## 1. 修复的问题

旧实现先执行 `mv` 切换目录，再对 `/data/workspace` 执行 `chown -R`。当 `chown`
失败时脚本直接 `exit 1`，新目录已经成为活动目录但权限错误，旧目录只留在
`.zeus-workspace-previous`，服务处于半切换状态。旧实现也没有在恢复前比对归档
SHA256，只做了 `tar -tzf` 可读性检查。

## 2. 事务阶段

恢复按以下顺序执行，任何一步失败都不会让旧 Workspace 丢失：

1. **崩溃恢复**：读取 `.zeus-workspace-restore.state`，修复上一次中断留下的状态。
2. **归档校验**：比对备份元数据中的 SHA256，并检查条目数。
3. **清单校验**：列出归档条目，拒绝绝对路径、`..` 穿越、符号链接逃逸、通过符号链接
   目录写入、重复条目、非目录父条目、设备/管道等特殊条目。
4. **解包到候选目录**：`/data/.zeus-workspace-restore`，使用 `--strip-components=1`、
   `--no-same-permissions` 和 `--no-same-owner`（BusyBox 使用 `-o`）。
5. **准备候选目录**：`chown -R -h 10001:10001`，再以 UID 10001 实际创建/删除探针
   文件，并检查每个文件可读、每个目录可读可进入，以及所有者读写位。
6. **候选内容校验**：与归档条目清单比对路径、类型、符号链接目标。
7. **切换**：`/data/workspace` → `.zeus-workspace-previous`，候选目录 →
   `/data/workspace`。任一次 `mv` 失败都会把 previous 恢复为活动目录。
8. **切换后校验**：再次比对活动目录清单与归档清单；失败时把新目录移动到
   `.zeus-workspace-restore-failed-*`，恢复 previous。
9. **清理**：写入 `phase=verified` 后才删除 `.zeus-workspace-previous`。

## 3. 崩溃恢复判定

状态文件：`/data/.zeus-workspace-restore.state`。

| 状态                                       | previous 存在 | workspace 存在 | 恢复动作                                                                   |
| ------------------------------------------ | ------------- | -------------- | -------------------------------------------------------------------------- |
| 任意                                       | 是            | 否             | 将 previous 移回 `/data/workspace`                                         |
| `prepared` / `previous-moved`              | 是            | 是             | 将 workspace 移到 `.zeus-workspace-restore-interrupted-*`，再恢复 previous |
| `switched` / `verified`                    | 是            | 是             | 新目录的 `mv` 已完成且内容在切换前已校验，保留新目录并删除 previous        |
| `switched` / `verified`                    | 是            | 否             | previous 移回 `/data/workspace`                                            |
| `previous-moved` / `switched` / `verified` | 否            | 否             | 报错并停止恢复，活动目录状态不明确，需要人工介入                           |
| 无状态文件                                 | 是            | 是             | 将 previous 移到 interrupted 目录，保留当前 workspace（保守策略）          |
| 无状态文件                                 | 是            | 否             | previous 移回 `/data/workspace`                                            |

候选目录 `.zeus-workspace-restore` 永远不是活动目录；崩溃恢复会删除它。

## 4. 部分恢复报告

`rollbackDeployment()` 逐项执行 Admin DB、AI DB、AI Workspace 恢复，单项失败不会
阻止后续恢复尝试。`RollbackSummary` 增加：

- `workspaceRestored`：Workspace 是否恢复成功（没有 Workspace 备份时为 `true`）。
- `requiresManualIntervention`：任一项失败、健康检查失败或 build-info 不一致时为
  `true`。
- `errors`：逐项错误信息。
- `restoredDatabases` / `restoredWorkspaces` / `restoredContainers`：实际成功的项。

部分恢复时事务报告状态为 `ROLLBACK_FAILED`，并保留完整的 partial summary，不再
返回空数组或把部分恢复当作成功。需要人工介入时，运维应先确认
`.zeus-workspace-previous`、`.zeus-workspace-restore-interrupted-*` 和
`.zeus-workspace-restore-failed-*` 的内容，再决定保留哪一份。

## 5. 测试覆盖

`deployment-transaction-recovery.spec.ts` 使用真实 Docker（默认镜像
`zeus-playground:stage1`，可用 `ZEUS_WORKSPACE_RESTORE_TEST_IMAGE` 覆盖）覆盖：

- 正常恢复、硬链接、符号链接
- 截断/损坏 tar、SHA256 不匹配
- `../evil`、绝对路径、符号链接逃逸、符号链接链、符号链接目录写入
- 只读挂载（权限错误）
- `chown` 失败（PATH 注入真实失败的 chown）
- `mv` 失败（PATH 注入真实失败的 mv）
- 解包阶段 `ulimit -f` 写入上限（容量不足/EFBIG）
- 进程中断：事务边界 `exit 137`，以及通过 `docker kill` 真实杀死暂停中的切换容器
- 切换后内容校验失败并回滚
- DB 恢复成功但 Workspace 恢复失败的部分恢复报告

### 已知测试限制

- Docker Desktop 的 overlayfs 接受 `--storage-opt size=` 但不强制执行；virtiofs
  对 DMG 挂载卷的 bind mount 不稳定（`Not a directory`）。因此“磁盘空间不足”使用
  解包容器内的 `ulimit -f` 触发真实的 EFBIG/SIGXFSZ 写入失败，而不是字面 ENOSPC。
  两者走同一条解包失败与旧数据保护路径。
- `rollbackDeployment()` 的部分恢复单元测试注入 DB 恢复成功；本机测试镜像不包含
  `node:sqlite`，无法用真实容器验证 DB 恢复。Workspace 失败本身由真实 Docker 测试
  覆盖。
