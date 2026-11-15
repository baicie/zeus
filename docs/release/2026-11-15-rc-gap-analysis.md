# RC 最终差距评估（T6）

日期：2026-11-15  
基线：Core `49e8446c`，UI `89fc93ca`  
判定：**NO_GO**

---

## 1. 权威 readiness（CI artifact，非本地）

从 CI run `43651739094` 的 `rc-readiness` artifact 读取，`commit: 49e8446c`：

| 检查             | 状态        |
| ---------------- | ----------- |
| clean-worktree   | **pass**    |
| secret-scan      | **pass**    |
| packed-consumers | **pass**    |
| create-zeus      | **pass**    |
| sbom             | **not_run** |
| cross-platform   | **not_run** |
| release-approval | **not_run** |
| online-products  | **not_run** |

`decision: NOT_READY`。

**本地的 `packed-consumers` / `create-zeus` 报 FAIL 是 stale evidence**（报告绑定 `69f494f2`），
不是产品失败。CI 在 `49e8446c` 上通过。

## 2. 分维度评估

任务要求「不因 code: 0 就直接认定所有代码风险均已关闭」。下面逐维度核实。

### 2.1 code —— 0 项，但有一个 caveat

`blockerCategories.code` 是空数组。这个字段只覆盖 **manifest 已知的 blocker**，
它**不覆盖** readiness 里那些 `not_run` 的项目。

§3 记录了一个真实的代码缺陷（SBOM 跨 job 丢失），它没有出现在 `code` 分类里——
因为 `rc-manifest.ts` 把 `sbom: not_run` 归到了 `evidence`。

**所以 `code: 0` 不等于「没有代码问题」。它等于「manifest 的 blocker 里没有需要改代码就能解决的」。**

### 2.2 environment —— 3 项

```
admin build-info names ui ffde5592, frozen ui is 89fc93ca
native-lab build-info names ui ffde5592, frozen ui is 89fc93ca
webc-studio build-info names ui ffde5592, frozen ui is 89fc93ca
```

性质：**配置陈旧**，不是代码缺陷。修法是更新 `ZEUS_UI_COMMIT`（见 T5 方案）。
但按 T5 的结论，正确做法不是改成 `89fc93ca`，而是先固定语义。

### 2.3 version —— 2 项

```
versions are core 0.1.1-beta.20 / ui 0.1.0-beta.35, not 0.2.0-rc.0
never published on npm: @zeus-js/i18n, @zeus-js/eslint-plugin, @zeus-js/playground-engine
```

需要维护者授权的版本切换，以及发布后立即修 dist-tag 的预案。

### 2.4 approval —— 1 项

`release-approval: not_run`。`rc-approval.yml` 从未运行，`Release` 环境 `protection_rules: []`。

**这是机制未启用，不是证据没收集。**

### 2.5 online acceptance —— 1 项

`online-products: not_run`。需要一次真实 Stage 2 部署 + 事务记录 + 四产品在线验收。

### 2.6 其余

| 项                                      | 分类     | 说明                   |
| --------------------------------------- | -------- | ---------------------- |
| `demo pairing names 69f494f2`           | evidence | 本地缓存的配对记录过期 |
| `product-signoff` / `byok-live-gateway` | evidence | 人工签核与真实网关     |

## 3. 本轮发现的一个真实代码缺陷

**SBOM 从未被 `rc-readiness` 看到。**

R7 在 `lint-and-check` job 加了 `pnpm check:sbom:write`。但 `rc-readiness` 在
**另一个 job**（`packed-consumers`）里跑：

```
lint-and-check:    … Generate SBOM → pnpm check:sbom:write
packed-consumers:  … RC readiness report → pnpm check:rc-readiness   ← 读 temp/sbom/
```

GitHub Actions 的 job 各跑在独立 runner 上，**`temp/` 不共享**。

**后果**：`sbom` 永远 `not_run`，R7 的那次改动没有解决它想解决的问题。

### 3.1 修复

在 `packed-consumers` job 的 RC readiness 之前也生成一次 SBOM：

```yaml
- name: Generate SBOM
  if: always()
  run: pnpm check:sbom:write

- name: RC readiness report
  if: always()
  run: pnpm check:create-zeus && pnpm check:create-zeus-packed && pnpm check:rc-readiness
```

**这一项可以本轮修**——它不改变任何验收标准，只是让已有的检查拿到它需要的输入。

## 4. 是否满足 GO 条件

**否。**

| 条件          | 状态                                     |
| ------------- | ---------------------------------------- |
| 无 P0         | 是（无代码级 P0）                        |
| 无 P1         | **否**（配置陈旧、机制未启用）           |
| 证据完整      | **否**（approval / online / signoff 缺） |
| 版本已切      | **否**                                   |
| manifest 有效 | 候选有效，历史快照按设计冻结             |

按任务的三种结论定义，`NO_GO` 成立。

## 5. code: 0 的准确含义

必须写清楚，避免被误读：

> **`code: 0` 表示：在 manifest 的 blocker 列表中，没有任何一条能通过修改这份代码来解决。**

它**不**表示：

- 仓库没有代码缺陷（§3 就有一个）；
- 所有测试都跑过了（`cross-platform` 在 CI 上跑了，但本地没下载）；
- 可以跳过审批与在线验收。

## 6. 需要维护者单独授权

| #   | 动作                        | 为什么需要授权        |
| --- | --------------------------- | --------------------- |
| 1   | 更新 `ZEUS_UI_COMMIT`       | 改生产仓库变量        |
| 2   | 版本切换到 `0.2.0-rc.0`     | 改变发布物            |
| 3   | 发布 `@zeus-web/dialog`     | npm publish           |
| 4   | 配置 `Release` 环境保护规则 | 改 GitHub Environment |
| 5   | Stage 2 部署 + 在线验收     | 生产部署              |
| 6   | 产品签核                    | 只能由人完成          |
| 7   | UI 仓写入 `sourceCommit`    | 跨仓库变更（T4）      |

## 7. 未验证

| 项                                | 原因                   |
| --------------------------------- | ---------------------- |
| `sbom: not_run` 修复后能否变 pass | 需要一次 CI 运行       |
| Stage 2 在线验收的任何结论        | 未部署                 |
| 真实网关（byok-live）             | 需 environment secrets |
