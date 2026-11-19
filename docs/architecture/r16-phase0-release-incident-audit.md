# R16.0 Phase 0 — 发布事故隔离与仓库冻结审计

> 状态：**MIGRATION_BLOCKED_BY_RELEASE_INCIDENT**
>
> 审计时间：2026-11-19
> 审计对象：Zeus Monorepo `packages/` 架构重构（R16.0）

---

## 1. 仓库基线

| 项目          | 值                                                                                     |
| ------------- | -------------------------------------------------------------------------------------- |
| 分支          | `main`                                                                                 |
| HEAD SHA      | `649e2f6017c05129bb16345bd74c31135c99ad0e`                                             |
| `origin/main` | 同步（同一 SHA）                                                                       |
| 最新提交      | `chore(release): switch the tree to 0.2.0-rc.3 with a verified recovery record (#324)` |
| rc.3 tag      | `v0.2.0-rc.3` → `649e2f60`（与 HEAD 一致）                                             |
| 工作区        | 干净（仅本会话产生的 4 个 `naming.ts` 删除，见 §7）                                    |
| 开放 PR       | 0                                                                                      |

---

## 2. rc.3 发布 Run

| 项目           | 值                             |
| -------------- | ------------------------------ |
| Run ID         | `44447893463`                  |
| 结论           | **failure**                    |
| 创建           | 2026-11-19T02:56:29Z           |
| 结束           | 2026-11-19T03:12:16Z           |
| HEAD SHA       | `649e2f60`                     |
| 是否为恢复 Run | 否（这是 rc.3 的首次发布 Run） |

### Job 结果

| Job                                | 结论                    |
| ---------------------------------- | ----------------------- |
| `native-prebuild / build` × 7 平台 | **全部 success**        |
| `release`                          | **failure**             |
| `github-release`                   | skipped（依赖 release） |
| `compiler-registry-smoke`          | skipped（依赖 release） |

七平台 native 预构建全部成功，事故不在编译侧。

### 失败点

```
pnpm release --publishOnly 0.2.0-rc.3 --tag rc --skipBuild
→ 发布第 8 个包 @zeus-js/compiler-native-linux-x64-gnu 时失败

npm error code TLOG_CREATE_ENTRY_ERROR
npm error error creating tlog entry - (409) an equivalent entry already
  exists in the transparency log with UUID 108e9186e8c5677ad6...
```

这是 npm/Sigstore Transparency Log 的 409 冲突，**不是构建失败，也不是 7 平台矩阵问题**。

### 发布顺序（按日志实际执行）

前 7 个包发布成功：

1. `@zeus-js/eslint-plugin`
2. `@zeus-js/playground-engine`
3. `@zeus-js/compiler`
4. `@zeus-js/compiler-native`
5. `@zeus-js/compiler-native-darwin-arm64`
6. `@zeus-js/compiler-native-darwin-x64`
7. `@zeus-js/compiler-native-linux-arm64-gnu`

第 8 个 `@zeus-js/compiler-native-linux-x64-gnu` 触发 TLOG 409，发布中止。此后 25 个包未发布。

---

## 3. npm 官方 Registry 实测（32 个固定发布包）

查询方式：`npm view @zeus-js/<pkg>@0.2.0-rc.3 version --registry=https://registry.npmjs.org`

> 注意：本机默认 registry 是 `registry.npmmirror.com`，镜像存在同步延迟，会误报未发布。以下结果全部来自官方 registry 直查。

### 已发布（7 / 32）

| 包                                         | rc tag       |
| ------------------------------------------ | ------------ |
| `@zeus-js/eslint-plugin`                   | `0.2.0-rc.3` |
| `@zeus-js/playground-engine`               | `0.2.0-rc.3` |
| `@zeus-js/compiler`                        | `0.2.0-rc.3` |
| `@zeus-js/compiler-native`                 | `0.2.0-rc.3` |
| `@zeus-js/compiler-native-darwin-arm64`    | `0.2.0-rc.3` |
| `@zeus-js/compiler-native-darwin-x64`      | `0.2.0-rc.3` |
| `@zeus-js/compiler-native-linux-arm64-gnu` | `0.2.0-rc.3` |

### 未发布（25 / 32）

核心运行时：

- `@zeus-js/shared`
- `@zeus-js/signal`
- `@zeus-js/runtime-dom`
- `@zeus-js/runtime-ssr`
- `@zeus-js/zeus`
- `@zeus-js/testing`

编译器：

- `@zeus-js/compiler-shared`
- `@zeus-js/compiler-native-linux-x64-gnu` ← **事故点**
- `@zeus-js/compiler-native-linux-x64-musl`
- `@zeus-js/compiler-native-win32-arm64-msvc`
- `@zeus-js/compiler-native-win32-x64-msvc`

生态能力：

- `@zeus-js/i18n`
- `@zeus-js/router`
- `@zeus-js/resource`
- `@zeus-js/query`

Web-C（全部 10 个）：

- `@zeus-js/bundler-plugin`
- `@zeus-js/component-analyzer`
- `@zeus-js/component-dts`
- `@zeus-js/web-c-runtime`
- `@zeus-js/web-c`
- `@zeus-js/output-wc`
- `@zeus-js/output-react-wrapper`
- `@zeus-js/output-vue-wrapper`
- `@zeus-js/output-css`
- `@zeus-js/output-icons`

---

## 4. 是否存在后续恢复 Run

**否。**

`release.yml` 最近 3 次 Run 全部是 failure，且 rc.3 的 Run（`44447893463`）是最新一次。rc.3 tag 之后没有任何新的发布 Run。

| Run ID        | 结论    | 时间              | HEAD              |
| ------------- | ------- | ----------------- | ----------------- |
| `44447893463` | failure | 2026-11-19T02:56Z | `649e2f60` (rc.3) |
| `44304328576` | failure | 2026-11-18T12:28Z | `5acab32c` (rc.2) |
| `44263303787` | failure | 2026-11-18T08:00Z | `153f9b2b`        |

无 rc.4，无恢复分支，无进行中的发布操作。远程分支列表中没有 `release/0.2.0-rc.4` 或类似的恢复工作。

---

## 5. rc.3 的资产状态

| 项目                               | 状态                                         |
| ---------------------------------- | -------------------------------------------- |
| Git tag `v0.2.0-rc.3`              | **存在**，指向 `649e2f60`                    |
| `release-pairing/v0.2.0-rc.3.json` | **存在**，`verifiedAt: 2026-11-18T14:00:00Z` |
| GitHub Release `v0.2.0-rc.3`       | **不存在**（`github-release` job skipped）   |
| npm 发布                           | **部分**：7 已发 / 25 未发                   |

---

## 6. 恢复路径已被设计规则封死

`scripts/release/bootstrap-eligibility.ts:190` 明确拒绝部分发布的恢复：

```ts
/*
 * The claim that makes recovery safe. A run that reached publish may have
 * published some packages; publishing a new version then produces a mixed
 * release, and no amount of pairing fixes a version that is half out.
 */
if (recovery.failedRunReachedPublish) {
  return refuse(
    `the failed run reached a publish step; a partially published version cannot be recovered by publishing another, because the packages that did land cannot be withdrawn`,
  )
}
```

同时 `recovery.failedVersionPublished` 与 `recovery.recoveryVersionPublished` 也会拒绝。

**结论**：`0.2.0-rc.3` 已经是"半发布"状态 —— 7 个包在 npm 上不可撤回。任何新的 RC（rc.4）都会被 `bootstrap-eligibility` 拒绝，因为：

- rc.3 已部分发布，不能通过发布新版本恢复
- rc.3 的 tag 已存在且已配对

恢复 25 个未发布包的**唯一技术路径**是重跑同一个 `v0.2.0-rc.3` tag 的发布 Run —— `@baicie/release` 的 `publishOnePackage` 默认 `skipExisting: true`：

```js
const skipExisting = options.skipExisting ?? publishConfig.skipExisting ?? true
if (skipExisting && (await npmVersionExists(config, pkg, options))) {
  console.log(colors.yellow(`skip existing ${pkg.name}@${pkg.version}`))
  return
}
```

重跑会跳过已发布的 7 个包，从第 8 个继续。但需要 TLOG 409 问题的根因排查——Sigstore 返回"相同条目已存在"，说明第 8 包的 tlog 条目已写入而发布未完成，重试可能持续冲突。

---

## 7. 本会话工作区改动

在收到 R16.0 任务前，会话中曾尝试删除 `packages/core/compiler-shared`。**已全部回滚**（`git checkout HEAD --`），因为该包在 R16.0 中被要求迁移至 `packages/compiler/compiler-shared`，不应提前删除。

当前唯一未提交改动是 3 个孤儿文件删除（与 R16.0 无关，可独立处理或丢弃）：

| 文件                                                                  | 依据                                  |
| --------------------------------------------------------------------- | ------------------------------------- |
| `packages/web-c/output-react-wrapper/src/naming.ts`                   | 0 引用，自 `f0efad96` 起从未被 import |
| `packages/web-c/output-vue-wrapper/src/naming.ts`                     | 0 引用                                |
| `packages/web-c/output-wc/src/naming.ts` + `__tests__/naming.spec.ts` | 仅被自己的测试引用                    |

---

## 8. 冻结判定

**`MIGRATION_BLOCKED_BY_RELEASE_INCIDENT`**

### 允许（已执行 / 可继续）

- 只读架构审查
- 生成本文档与架构设计文档
- 制定精确迁移映射（`packages-migration-map.md`）
- 在独立分支准备不影响发布的文档类 PR（PR-1）

### 禁止（本轮不得执行）

- 移动任何发布包源码（`packages/core/*`、`packages/devtools/*` 等）
- 合并影响构建或 Release 的目录迁移 PR
- 修改生产 tag、npm dist-tag 或 Release environment
- 以目录重构名义执行发布恢复

### 恢复前置条件

必须先满足以下全部条件，才能解除冻结：

1. `@zeus-js/compiler-native-linux-x64-gnu@0.2.0-rc.3` 的 TLOG 409 根因确定
2. 25 个未发布包通过重跑 `v0.2.0-rc.3` tag 的 Run 发布完成（利用 `skipExisting`）
3. `github-release` 与 `compiler-registry-smoke` job 成功
4. `release:verify:published` 对 32 包全部通过
5. GitHub Release `v0.2.0-rc.3` 创建完成

在 1–5 全部达成之前，R16.0 的 Phase 2 及之后所有涉及物理路径变更的阶段**不得开始**。

---

## 9. 下一步

- **PR-1（Architecture Contract）可以现在准备**：它只改文档、包清单、迁移映射、依赖图、结构检查器基础与测试，不移动源码，不触碰发布包布局。
- **Phase 2–7 需要等待发布事故关闭。**

建议的发布事故处理顺序（独立于 R16.0）：

1. 排查 TLOG 409 是否为幂等重试问题（`@baicie/release` 已有 `retry: 5`，但 tlog 冲突可能需要更长的退避或跳过 provenance 重试）
2. 若 TLOG 冲突可绕过，重跑 `v0.2.0-rc.3` tag 的 `release.yml`；`skipExisting` 会跳过已发布的 7 包
3. 若不可绕过，需要评估是否接受 7 包永久停留在 rc.3 而其余包走 `latest` 或无 rc tag —— 这会破坏 32 包固定发布组的一致性
