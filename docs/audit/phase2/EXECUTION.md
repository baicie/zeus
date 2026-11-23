# Phase 2 执行记录：zeus-ui 组件职责归位

- 日期：2026-11-23
- 分支：`zeus-ui` @ `claude/phase2-headless-migration`（基于 `main` @ `ff2941e3`）
- 状态：**部分完成**。7 个目录已迁入，6/7 类型检查通过，1 个因上游版本差异失败

## 1. 做了什么

把 7 个 `@zeus-ui/headless` 相关目录从 `zeus/examples` 迁到 `zeus-ui/examples`：

| #   | 目录                 | 包名（迁移后）                         | 类型检查            |
| --- | -------------------- | -------------------------------------- | ------------------- |
| 1   | `headless`           | `@zeus-ui/headless`（保留原名）        | ✅                  |
| 2   | `headless-demo`      | `@zeus-web/example-headless-demo`      | ✅                  |
| 3   | `registry-react`     | `@zeus-web/example-registry-react`     | ✅                  |
| 4   | `registry-vue`       | `@zeus-web/example-registry-vue`       | ✅                  |
| 5   | `use-headless-cli`   | `@zeus-web/example-use-headless-cli`   | ✅                  |
| 6   | `use-headless-react` | `@zeus-web/example-use-headless-react` | ❌ **2 个类型错误** |
| 7   | `use-headless-vue`   | `@zeus-web/example-use-headless-vue`   | ✅                  |

**验证命令**（真实执行，非推断）：

```
pnpm --filter "@zeus-web/example-*" --filter="!@zeus-web/example-next-app" \
  --workspace-concurrency=1 check
→ exit=2，仅 use-headless-react 失败
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

**根因**：`@zeus-js/output-react-wrapper` 在两个版本间的事件 prop 生成逻辑不同。

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

| 项                                  | 状态       | 原因                                                         |
| ----------------------------------- | ---------- | ------------------------------------------------------------ |
| `use-headless-react` 通过           | ❌         | 需上游发布含事件 prop 修复的 `@zeus-js/output-react-wrapper` |
| 在 zeus 侧删除已迁出的 7 个目录     | 未做       | Phase 7 才清理；且需先确认 zeus-ui 侧稳定                    |
| `zeus` 的 `examples:check:all` 更新 | 未做       | 迁移完成前 zeus 仍需这些示例                                 |
| `@zeus-ui/registry` 改名            | 未做       | D-05 的附带项，需要单独 PR                                   |
| AGENTS.md 登记双 scope              | 未做       | 应在 zeus-ui 侧提交时一并做                                  |
| 提交到 zeus-ui                      | **未提交** | 见下                                                         |

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
