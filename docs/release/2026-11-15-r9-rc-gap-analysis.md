# R9 RC 差距分析

日期：2026-11-15  
基线：Core `97a3e626`（本分支），UI `89fc93ca`  
判定：**NO_GO**

---

## 1. 基线区分

任务要求区分四种基线。它们的当前值：

| 概念              | 值                       | 说明                               |
| ----------------- | ------------------------ | ---------------------------------- |
| 历史审计 snapshot | `7bc850b7`               | `0.2.0-rc-manifest.json`，冻结不改 |
| 当前 main         | `d79675dc`               | 本轮起点                           |
| 当前 RC candidate | 由 `rc-manifest.ts` 生成 | `0.2.0-rc-manifest-candidate.json` |
| 正式冻结的 RC     | **不存在**               | 版本未切，无 tag                   |

## 2. blocker 分类（修正后）

`blockerCategories` 现在区分六类，且**零 unclassified**：

| 分类             | 数量                       | 内容                                    |
| ---------------- | -------------------------- | --------------------------------------- |
| code defect      | **0**                      | —                                       |
| release process  | 2                          | 版本未切、三个包首次发布                |
| environment      | 3                          | 三份 build-info 记陈旧 `uiCommit`       |
| evidence missing | 2                          | approval / online / signoff / byok-live |
| evidence stale   | 2                          | demo pairing 与 cross-platform 绑旧 SHA |
| manual approval  | 0（并入 evidence missing） | —                                       |

### 2.1 `code defect: 0` 的准确含义

**它只表示：manifest 的 blocker 列表里没有一条能靠改代码解决。**

它**不**表示仓库没有代码缺陷。本轮就找到并修复了四个：

| #   | 缺陷                                                  | 位置              |
| --- | ----------------------------------------------------- | ----------------- |
| 1   | `verifyUiSources` 丢 lockfile，正确的 24 包文档全判错 | `ui-sources.ts`   |
| 2   | SBOM 不是 CycloneDX（自定义顶层字段）                 | `check-sbom.ts`   |
| 3   | 同名多版本依赖被合并                                  | `check-sbom.ts`   |
| 4   | `sbom` 检查只看 `components.length > 0`               | `rc-readiness.ts` |

**这四个都不在 manifest 的 blocker 列表里**——它们是代码内部的缺陷，不是发布流程的阻塞项。

这个区别是本轮最重要的方法论修正。

## 3. 分维度评估

### 3.1 code

见 §2.1。**分类为 0 不等于没有缺陷。**

### 3.2 release process（2 项）

```
versions are core 0.1.1-beta.20 / ui 0.1.0-beta.35, not 0.2.0-rc.0
never published on npm: @zeus-js/i18n, @zeus-js/eslint-plugin, @zeus-js/playground-engine
```

需维护者授权的版本切换。注意后一项：三个包首次发布会让 `latest` 指向 RC。

### 3.3 environment（3 项）

三份 build-info 记 `uiCommit = ffde5592`。**性质是配置陈旧**（见 T5 方案），不是代码缺陷。

### 3.4 evidence missing（2 项）

- `release-approval`：`rc-approval.yml` 零运行，`Release` 环境 `protection_rules: []`；
- `online-products`：无 Stage 2 部署与事务记录。

### 3.5 evidence stale（2 项）

- demo pairing 记 `69f494f2`，树是 `97a3e626`；
- cross-platform evidence 绑 `96ceb447`，与当前候选不符。

**stale 与 missing 的区别决定修法**：stale 重新收集即可，missing 需要真实执行。

## 4. 本轮修复的四个代码缺陷

### 4.1 `verifyUiSources` 丢 lockfile

精确复现：一个完全正确的 24 包文档报 **24 条** `the lockfile has no integrity for 0.1.0-beta.34`。

**最糟的错误形态**：严格模式拒绝真相，而让它变绿的唯一方法是不传 lockfile——那也是让它什么都不检查的方法。

### 4.2 SBOM 不是 CycloneDX

```
(root) must NOT have additional properties  {"additionalProperty":"zeus:runtimeDependencies"}
```

修复后：85 组件、38 依赖节点、**官方 1.5 schema 通过**。

### 4.3 多版本依赖被合并

按包名做 key，`shared-lib@1.0.0` 与 `2.0.0` 合并成一条——**隐藏了一个版本**。

### 4.4 `sbom` 只看计数

伪造一个组件、空依赖图、没人发布过的版本，全部通过。现在校验文档本身。

## 5. 一个被推翻的历史结论

**上一轮我写：npm provenance 不含源码 commit，所以 beta.34 是 UNVERIFIED。**

那是从 `publish/v0.1` attestation 得出的。**SLSA v1 attestation 里有**：

```
uri:       git+https://github.com/baicie/zeus-ui@refs/tags/v0.1.0-beta.34
gitCommit: a8826dd1f81560aaf6459d8d40a3e599f705f6e0
```

独立验证：该 commit 存在，是 `chore(release): prepare 0.1.0-beta.34`，tag 精确指向它。

**24 个包全部有 SLSA attestation，全部指向同一个 commit。**

## 6. 是否满足 GO

**否。**

| 条件                            | 状态                                     |
| ------------------------------- | ---------------------------------------- |
| 无 code defect（manifest 层面） | 是                                       |
| 证据完整                        | **否**（approval / online / signoff 缺） |
| 证据新鲜                        | **否**（两项 stale）                     |
| 版本已切                        | **否**                                   |
| 人工审批                        | **否**（机制未启用）                     |

## 7. 需要维护者单独授权

| #   | 动作                                |
| --- | ----------------------------------- |
| 1   | 更新 `ZEUS_UI_COMMIT`（先固定语义） |
| 2   | 版本切换到 `0.2.0-rc.0`             |
| 3   | 发布 `@zeus-web/dialog`             |
| 4   | 配置 `Release` 环境保护规则         |
| 5   | Stage 2 部署 + 在线验收             |
| 6   | 产品签核                            |
| 7   | 合并本轮四个 PR（会触发生产部署）   |
