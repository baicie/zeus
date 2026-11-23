# 发布链路诊断：为什么 0.2.0-rc.3 只发布了一半

- 日期：2026-11-23
- 触发原因：Phase 2 需要 `@zeus-js/component-analyzer` 的修复进入 registry，而当前发布链路是坏的
- 结论：**根因是一个 npm sigstore 客户端的已知缺陷，不是仓库的配置错误**

## 1. 事实

### 1.1 发布确实尝试过，且部分成功

| 事实                                 | 证据                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------- |
| `v0.2.0-rc.3` tag 存在（本地与远端） | `git rev-parse v0.2.0-rc.3` → `649e2f60`                                     |
| 配对记录是 bootstrap                 | `meta/release/pairing/v0.2.0-rc.3.json`：`bootstrap: true`, `uiCommit: null` |
| Release 工作流跑过并失败             | run `44447893463`，`v0.2.0-rc.3`，2026-11-19T02:56Z，conclusion=failure      |
| 7 个原生平台全部构建成功             | 该 run 的 `native-prebuild` job 全部 success                                 |
| 失败步骤是 `Build and publish`       | 该 run 的 `release` job                                                      |

### 1.2 哪些包发成功了

| 包                                                                                         | 0.2.0-rc.3 是否在 registry |
| ------------------------------------------------------------------------------------------ | -------------------------- |
| `@zeus-js/compiler-native-darwin-arm64`                                                    | ✅ 是                      |
| `@zeus-js/compiler-native-linux-x64-gnu`                                                   | ❌ **否**                  |
| `@zeus-js/eslint-plugin`                                                                   | ✅ 是                      |
| `@zeus-js/playground-engine`                                                               | ✅ 是                      |
| `@zeus-js/i18n`                                                                            | ❌ **否**（npm 404）       |
| `@zeus-js/zeus` / `runtime-dom` / `router` / `query` / `signal` / `shared` / `runtime-ssr` | ❌ 均停在 `0.1.1-beta.20`  |

**同一个 run 里，部分包成功、部分失败。** 这是判断根因的关键——如果是配置错误，应该全部失败。

### 1.3 失败的真实错误

```
npm notice 📦  @zeus-js/compiler-native-linux-x64-gnu@0.2.0-rc.3
npm notice package size: 942.4 kB
npm notice shasum: c16fb129fbb00dd023d1751945f5b1036c5a682f
npm notice integrity: sha512-xev/4W9KX3Nga[...]EW9g5lxWuu54w==

npm notice Publishing to https://registry.npmjs.org/ with tag rc and public access
npm error code TLOG_CREATE_ENTRY_ERROR
npm error error creating tlog entry - (409) an equivalent entry already exists
  in the transparency log with UUID 108e9186e8c5677ad6c44f407641761200232b988789dbea4f3a318a27949c3f12db0725cb67f8d7
```

**`TLOG_CREATE_ENTRY_ERROR` (409)** —— 发布时 npm 要向 sigstore 透明日志（Rekor）提交一条证明条目，
而**这份 tarball 的等价条目已经存在于日志中**。

### 1.4 为什么会这样

tarball 的 shasum 是确定的。这意味着同一个版本、同样的内容，之前已经有人（或 CI）提交过 tlog 条目——
很可能是 rc.3 的**第一次**发布尝试。Rekor 是只追加的日志，不允许重复条目。

`@baicie/release` 的重试逻辑（`scripts/release/release-canary.ts:459`）匹配的是
`/\bE?(?:409|429|5\d\d)\b|409 Conflict/`——**它不匹配 `TLOG_CREATE_ENTRY_ERROR`**，
所以重试逻辑没有介入，直接抛错退出，后面的包（含 `@zeus-js/i18n`）全部没轮到。

## 2. 这不是仓库配置问题

| 候选原因                       | 是否成立    | 判据                                                                                                                               |
| ------------------------------ | ----------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| i18n 被排除在发布集            | ❌ 不成立   | `zeusFixedPackages`（`scripts/release.config.ts:7`）32 个包**含** `@zeus-js/i18n`；`excludedPackages()` 的 6 个候选里**没有** i18n |
| i18n 的 `private` 为 true      | ❌ 不成立   | `packages/features/i18n/package.json` 无 `private`，`publishConfig.access=public`                                                  |
| 发布顺序把 i18n 排在必败项之后 | ✅ 部分成立 | 原生平台包排在前；`linux-x64-gnu` 失败后 i18n 未执行。但这是**症状**，不是原因                                                     |
| npm 认证问题                   | ❌ 不成立   | 同 run 里其他包发布成功                                                                                                            |
| **tlog 409**                   | ✅ **成立** | 错误码明确                                                                                                                         |

## 3. 可选的修复路径

### A. 跳过 provenance 重发（最快，但削弱证据）

```bash
pnpm --filter @zeus-js/compiler-native-linux-x64-gnu publish \
  --access public --tag rc --no-git-checks
# 去掉 --provenance
```

**代价**：该包失去 sigstore provenance attestation，与其余 31 个包不一致。
**适用**：仅作为解除阻塞的临时手段，且必须在发布记录里注明。

### B. 换一个版本号重发（推荐）

rc.3 这个版本号已经被 tlog 部分占用。起 **rc.4**，所有包的 tarball 内容都会变（版本号内嵌在 package.json），
tlog 条目自然是新的，不会冲突。

**代价**：需要重新走完整发布流程。
**收益**：干净，不需要削弱证据；顺便带上 `component-analyzer` 的修复。

### C. 修 npm 的 sigstore 客户端（上游）

npm 自带的 sigstore 在 409 时的恢复分支（`fetchOnConflict`）恒为 false，是死代码。
这是 npm 上游的问题，本仓库改不了。

### D. 用 `--provenance=false` 全局关闭

不可接受——会一次性丢掉全部 32 个包的 provenance。

## 4. 建议

**B（起 rc.4）**，理由：

1. rc.3 的 tlog 已经半污染，即使补发成功，版本历史也不干净
2. rc.4 可以顺带包含 `component-analyzer` 的修复（`2d7bc699`），
   从而解决 zeus-ui PR #153 的 CI 依赖
3. 不需要在任何包上削弱 provenance

**前置检查**（发布前必须确认）：

- [ ] `meta/release/pairing/v0.2.0-rc.4.json` 存在，且 `bootstrap: true` 或指向合法的 UI commit
- [ ] 32 个包的版本号已改为 `0.2.0-rc.4`
- [ ] `pnpm release:precheck` 通过
- [ ] `check:sbom:write` 产出新的 SBOM

**注意**：`Release` environment **没有 required reviewer**，发布不需要人工批准。
但**发起发布仍是你的决定**——我不在没有明确指示时执行 `npm publish` 或创建 Release tag。

## 5. 对迁移计划的影响

| 门禁                 | 状态                    | 说明                                                   |
| -------------------- | ----------------------- | ------------------------------------------------------ |
| G1（0.2.0 已发布）   | **未通过**              | rc.3 半途失败；需 rc.4                                 |
| G1（beta.35 已发布） | **未通过**              | 仍未发布；zeus-ui 侧需要单独处理                       |
| Phase 2 完成         | **代码完成，CI 待发布** | 7/7 本地通过；zeus-ui CI 需 analyzer 修复进入 registry |
| Phase 4 起           | **阻塞**                | 等 G1                                                  |

## 6. 本次诊断的边界

- 读了 run `44447893463` 的 job 列表与 release job 日志（6150 行）
- 用 `npm view` 逐包核对 registry 实际状态（不用仓库 manifest 推断）
- **没有**执行任何发布、没有创建 tag、没有修改 `package.json` 版本号
- 没有读 npm 的 sigstore 源码，`fetchOnConflict` 的行为来自错误信息与社区已知问题（INFERRED）
