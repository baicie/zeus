# Phase 2 执行记录：zeus-ui 组件职责归位

- 日期：2026-11-23
- 分支：`zeus-ui` @ `claude/phase2-headless-migration`（基于 `main` @ `ff2941e3`）
- 状态：**完成并已合并**。根因已定位并修复，见 §3.1 与 §8
- 合并：zeus-ui #153 → squash `629bd69e`（2026-11-23）
- 合并时 CI：**34 项成功、5 项跳过、0 项失败**（VERIFIED，读 check-runs API）
- 前置发布：zeus `0.2.0-rc.5`（2026-11-23）——见 §8.4 的更新

## 1. 做了什么

把 7 个 `@zeus-ui/headless` 相关目录从 `zeus/examples` 迁到 `zeus-ui/examples`：

| #   | 目录                 | 包名（迁移后）                         | 类型检查     |
| --- | -------------------- | -------------------------------------- | ------------ |
| 1   | `headless`           | `@zeus-ui/headless`（保留原名）        | ✅           |
| 2   | `headless-demo`      | `@zeus-web/example-headless-demo`      | ✅           |
| 3   | `registry-react`     | `@zeus-web/example-registry-react`     | ✅           |
| 4   | `registry-vue`       | `@zeus-web/example-registry-vue`       | ✅           |
| 5   | `use-headless-cli`   | `@zeus-web/example-use-headless-cli`   | ✅           |
| 6   | `use-headless-react` | `@zeus-web/example-use-headless-react` | ✅（修复后） |
| 7   | `use-headless-vue`   | `@zeus-web/example-use-headless-vue`   | ✅           |

**验证命令**（真实执行，非推断）：

```
pnpm --filter "@zeus-web/example-*" --filter="!@zeus-web/example-next-app" \
  --workspace-concurrency=1 check
→ 修复前 exit=2（仅 use-headless-react 失败）；修复后 exit=0
```

## 2. 移植时做的四处修正

复制目录不等于能跑。为了让 6 个示例在 zeus-ui 的依赖体系下工作，必须改：

| 修正                   | 原值（zeus）                 | 新值（zeus-ui）       | 原因                                                                                                       |
| ---------------------- | ---------------------------- | --------------------- | ---------------------------------------------------------------------------------------------------------- |
| `@zeus-js/*` 依赖      | `workspace:*`                | `0.1.1-beta.20`       | zeus-ui 不是 zeus 的 workspace，不能跨仓链接                                                               |
| `vite` 依赖            | `catalog:`                   | `^8.2.1`              | zeus-ui 的 `pnpm-workspace.yaml` **没有 catalog 段**                                                       |
| `@zeus-js/vite-plugin` | 被脚本误改为 `0.1.1-beta.20` | `0.0.5`               | 独立版本线，不属于 0.1.x                                                                                   |
| 包名 scope             | `@zeus-js/example-*`         | `@zeus-web/example-*` | 迁入后必须符合 zeus-ui 的 scope；这样也会被根 `examples:check` 的 `@zeus-web/example-*` 通配符自动纳入门禁 |

`@zeus-ui/headless` 保持原名（D-05 已批准）。

## 3. 发现的上游缺陷（迁移暴露，非迁移引入）

### 3.1 `use-headless-react` 的类型错误

```
src/main.tsx(153,11): error TS2322: Property 'onValueChange' does not exist on type
  'IntrinsicAttributes & ZTabsProps & RefAttributes<ZTabsElement>'
src/main.tsx(177,11): error TS2322: Property 'onOpenChange' does not exist on type
  'IntrinsicAttributes & ZDialogProps & RefAttributes<ZDialogElement>'
```

**根因（已修复，见 §8）**：`component-analyzer` 的 `mergeEvents` 丢弃了只在 `meta.events` 声明的事件。

| 仓库      | wrapper 来源                                                  | 版本            | 结果    |
| --------- | ------------------------------------------------------------- | --------------- | ------- |
| `zeus`    | `workspace:*` → `packages/web-c/output-react-wrapper`（源码） | `0.2.0-rc.3`    | ✅ 通过 |
| `zeus-ui` | registry `@zeus-js/output-react-wrapper`                      | `0.1.1-beta.20` | ❌ 失败 |

**证据**：

- `zeus/examples/headless/node_modules/@zeus-js/output-react-wrapper` → 符号链接到 `packages/web-c/output-react-wrapper`（源码）
- `zeus-ui/examples/headless/node_modules/@zeus-js/output-react-wrapper` → 指向 `.pnpm/@zeus-js+output-react-wrapper@0.1.1-beta.20_...`

**这解释了为什么同一份源码在 zeus 通过、在 zeus-ui 失败**：两边用不同的 wrapper 生成器，
生成的 `.d.ts` 里事件 prop 的支持不一致。

**这是 Phase 1 风险 R-V1「双版本 `@zeus-js/*` 并存」的第一个真实后果**，
且它比预想的更早出现——不是等到 ecosystem，而是 Phase 2 就撞上了。

### 3.2 我自己的两处报告错误（必须更正）

| 位置              | 我写的                                         | 实际                                                                                      | 影响                                 |
| ----------------- | ---------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------ |
| Phase 0/1 的 R-17 | `headless-demo` **未声明** `@zeus-ui/headless` | 它**已声明** `"@zeus-ui/headless": "workspace:*"`                                         | R-17 不成立，可从风险表移除          |
| Phase 1 报告      | 「两边 `dist` 字节相同」                       | 我用 `ls -l` 比大小（都是 8143）就下了结论，`diff` 显示内容不同（接口顺序不同，语义等价） | 结论错误，但后续用 `diff`/`md5` 修正 |

**教训**：判断文件是否相同必须用 `diff` 或 `md5`，不能用 `ls -l` 的大小。这在本轮排查中误导了好几轮。

## 4. 未完成的部分

| 项                                  | 状态       | 原因                                      |
| ----------------------------------- | ---------- | ----------------------------------------- |
| `use-headless-react` 通过           | ✅         | 已由 analyzer 修复解决（§8）              |
| 在 zeus 侧删除已迁出的 7 个目录     | 未做       | Phase 7 才清理；且需先确认 zeus-ui 侧稳定 |
| `zeus` 的 `examples:check:all` 更新 | 未做       | 迁移完成前 zeus 仍需这些示例              |
| `@zeus-ui/registry` 改名            | 未做       | D-05 的附带项，需要单独 PR                |
| AGENTS.md 登记双 scope              | 未做       | 应在 zeus-ui 侧提交时一并做               |
| 提交到 zeus-ui                      | **未提交** | 见下                                      |

## 5. 为什么不提交

按设计包 `docs/06-acceptance-and-non-goals.md:26-31`：
**不得用删除测试、跳过失败、放宽断言冒充迁移完成。**

当前 7 个示例里 1 个类型检查失败。如果现在提交并声称「Phase 2 完成」，
就是把一个已知失败带进 zeus-ui 的主线。

两个可选的处理方式：

| 方案                                          | 动作                                                         | 代价                                            |
| --------------------------------------------- | ------------------------------------------------------------ | ----------------------------------------------- |
| **A. 先修上游（建议）**                       | 发布含事件 prop 修复的 `@zeus-js/output-react-wrapper`，再迁 | 依赖 X-01 的发布链路，而它当前半途失败（见 §6） |
| B. 只迁 6 个通过的，暂缓 `use-headless-react` | 拆成两个 PR                                                  | 迁移不完整，但可先行验证                        |
| C. 迁入但标注 known-failing                   | 违反设计包原则                                               | 不采纳                                          |

## 6. 复核中发现的两个重要事实（修正 Phase 0/1）

### 6.1 `v0.2.0-rc.3` 的 tag 已存在，但发布半途失败

| 事实                                                                                    | 证据                                         |
| --------------------------------------------------------------------------------------- | -------------------------------------------- |
| `v0.2.0-rc.3` tag 存在于本地与远端                                                      | `git tag -l` / `git ls-remote --tags origin` |
| 配对记录是 `bootstrap: true`、`uiCommit: null`                                          | `meta/release/pairing/v0.2.0-rc.3.json`      |
| `@zeus-js/eslint-plugin@0.2.0-rc.3` **已发布**                                          | `npm view` → `rc: 0.2.0-rc.3`                |
| `@zeus-js/playground-engine@0.2.0-rc.3` **已发布**                                      | 同上                                         |
| `@zeus-js/i18n` **在 npm 上不存在**（404）                                              | `npm view @zeus-js/i18n` → E404              |
| `@zeus-js/zeus`/`runtime-dom`/`router`/`query`/`signal`/`shared` 仍停在 `0.1.1-beta.20` | `npm view <pkg> dist-tags`                   |

**结论**：rc.3 的 `firstPublish` 三个包里，`eslint-plugin` 与 `playground-engine` 发成功了，
`i18n` 没有；核心包全部未发布。**发布链路在中间失败了**，不是「从未尝试」。

这修正了 Phase 0 的说法「0.2.0 线从未发布」——准确表述是「**未成功发布**」。

### 6.2 `Release` environment 没有 required reviewer

我在 Phase 1 文档里写「走 Release environment，需你确认发布窗口」是**错的**。
仓库记录明确：

- `docs/internal/architecture-roadmap-2026-10.md:360`：「`Release` environment 仍不配置 required reviewer，按用户决定停在发布前」
- 同文件 `:368`：「用户明确决定暂不配置 UI `Release` environment 的 required reviewer」
- `docs/internal/roadmap-completion-audit-2026-10-19.md:293,300,307` 三处同样表述

**`environment: Release` 只是一个 secret 作用域，不是审批门。** 发布不需要人工批准。

## 7. 下一步

要让 Phase 2 完整通过，需要先修复 `@zeus-js/output-react-wrapper` 的事件 prop 生成，
并成功发布。而发布链路当前处于半途失败状态（§6.1），需要先恢复：

1. 确认 `@zeus-js/i18n` 为何没发布（是失败还是遗漏）
2. 恢复 rc.3 的发布，或发起新的 rc.4
3. 发布后，zeus-ui 的 `@zeus-js/*` 依赖升级到新版
4. 迁移的 7 个示例再验证一遍

在这之前，`use-headless-react` 无法通过类型检查。

## 8. 修复：`mergeEvents` 丢弃 meta-only 事件

### 8.1 真正的根因

不是 wrapper 版本差异，而是 `component-analyzer` 的一个缺陷：

```ts
// components/web-c/component-analyzer/src/merge.ts（修复前）
for (const [key, value] of Object.entries(explicit ?? {})) {
  if (result[key]) {
    // ← 只在已存在时才处理
    result[key] = normalizeExplicitEvent(key, value, result[key])
  }
}
```

`result` 由 `declared`（`emits` 映射）与 setup 推断的事件构成。
组件若从普通 handler 派发事件、而不通过 `emits` 暴露，其 `meta.events`
声明就会被丢弃 → manifest 里没有该事件 → 生成的 React `.d.ts` 没有对应 prop。

`headless` 的 `z-tabs`（`value-change`）与 `z-dialog`（`open-change`）
正是这种写法，所以 `ZTabsProps` 缺 `onValueChange`、`ZDialogProps` 缺
`onOpenChange`。

之前误判为「wrapper 版本差异」，是因为 zeus 的根 tsconfig 有
`"@zeus-ui/headless": ["./examples/headless/src"]` 别名，直接读 TypeScript
源码，绕过了 `dist` 的类型，所以没暴露。

### 8.2 修复

让 explicit 事件在 `result` 中不存在时也能加入，同时用**规范化后的 kebab 名**
去重，避免 `emits: { checkedChange }` 与 `meta.events: { 'checked-change' }`
被算成两个派发者（`validateComponentManifest` 会报 `ZEUS_WC_EVENT_NAME`）。

### 8.3 验证

| 检查                                                    | 结果                                 |
| ------------------------------------------------------- | ------------------------------------ |
| `component-analyzer` 单测                               | **58 passed**（含新增 2 条回归测试） |
| `packages/web-c` 全量测试                               | **599 passed**，连跑 2 次稳定        |
| zeus 全 examples `check`                                | **exit 0**                           |
| zeus-ui 全 examples `check`                             | **exit 0**                           |
| 生成的 `ZTabsProps` / `ZDialogProps` / `ZCheckboxProps` | 均含正确的事件 prop                  |

提交：`zeus@2d7bc699`（修复 + 测试）、`zeus-ui@e15f497`（迁移）。

### 8.4 遗留（已关闭）

- ~~修复尚未发布。zeus-ui 的 CI 用的是 `@zeus-js/component-analyzer@0.1.1-beta.20`，
  不含此修复，因此 zeus-ui 的 CI 要等一次发布后才能真正通过。~~
  **已解决（VERIFIED）**：`0.2.0-rc.5` 于 2026-11-23 发布，32 个包全部上 npm
  （含 `@zeus-js/component-analyzer@0.2.0-rc.5`）。zeus-ui 随后把整个工作区升到
  rc.5（`fbf7a7e`），CI 34 项全绿。
- 这正是 Phase 1 门禁 G1 的实践意义：上游发布是下游可复现的前提。
  rc.5 的发布本身要跨过五个不同的失败点，见 §9。

### 8.5 rc.5 发布后才暴露的三个缺陷

迁移完成不等于门禁覆盖完整。合并 #153 的过程中暴露了三处「存在但从未验证」：

| #   | 缺陷                                                            | 后果                                                        | 证据            |
| --- | --------------------------------------------------------------- | ----------------------------------------------------------- | --------------- |
| 1   | CI 从不构建 `examples/headless`                                 | 首个消费示例报 `TS2882`；本地因磁盘有旧 `dist` 看不见       | 已修，`38a888c` |
| 2   | `examples/headless` 自身 `check` 从不执行                       | 8 个 `TS2344` 长期隐藏（`type` 被 eslint 改成 `interface`） | 已修，`7b8eb01` |
| 3   | `examples/headless/__tests__` 的 21 个测试不被任何 project 收集 | 从未运行过一次                                              | 已修，`38a888c` |

修法沿用上游 `zeus` 的 `buildFirst` 约定，并补了 21 个测试的 vitest 收集。

## 9. 发布记录：0.2.0-rc.5 是 RC 线第一次成功

`0.2.0-rc.0` 到 `rc.4` 五次发布全部失败，且**没有一次败在同一个环节**（VERIFIED，
读 release workflow 的 job/step 结论）：

| 版本 | 失败步骤                  | 真因                                                         |
| ---- | ------------------------- | ------------------------------------------------------------ |
| rc.0 | Release precheck          | `audit:prod` 扫出 picomatch ReDoS（high）                    |
| rc.1 | Release precheck          | `check:latest-tags` 拒绝：13 个包 latest 被 canary 污染      |
| rc.2 | Authorise the release     | 授权校验未通过                                               |
| rc.3 | Build and publish         | Rekor tlog 409（npm sigstore 的 `fetchOnConflict` 恒 false） |
| rc.4 | Verify release tag source | **tag 打在分支提交上**，不满足「可达 origin/main」           |

rc.4 的失败是操作失误，代价永久：`release tag immutability` ruleset 把 tag 锁死，
无法重指也无法删除，只能重切 rc.5。**教训：打 tag 前必须验证
`git merge-base --is-ancestor <commit> origin/main`。**

### 9.1 rc.5 的改动

除版本号外修了两处会让发版反复失败的结构问题：

| 缺陷                                        | 表现                                                                    | 修复                                              |
| ------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------- |
| `release:version-packages` 完全不改 Cargo   | rc.4 时 32 个 npm 包到 rc.4，`Cargo.toml`/`Cargo.lock` 停在 rc.3        | 改用 `version-rehearsal --apply` + `cargo update` |
| `align-zeus-beta` 给 `vite-plugin` 编造版本 | `pnpm install` 报 `ERR_PNPM_NO_MATCHING_VERSION`，指向 npm 而非 aligner | 加独立版本白名单（zeus-ui `8c533f6`）             |
| `check:zeus-beta-alignment` 硬编码期望版本  | 升级后 147 处**正确**的 pin 被判错                                      | 改为读工作区实际版本（zeus-ui `e1649f4`）         |

### 9.2 结果（VERIFIED）

| 项                                        | 结果                       |
| ----------------------------------------- | -------------------------- |
| npm 上 32 个包                            | 全部有 `0.2.0-rc.5`        |
| `@zeus-js/i18n`                           | 首次发布，从 404 变为可用  |
| `compiler-registry-smoke`（Node 22 / 24） | 真实安装并执行已发布编译器 |
| GitHub Release                            | 已创建，标记 prerelease    |
| 下游 zeus-ui                              | 升到 rc.5，CI 34 项全绿    |
