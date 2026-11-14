# SBOM 与 RC Readiness 的三层职责

日期：2026-11-15  
基线：Core `96ceb447`

---

## 1. 三个层级，三个问题

| 层级                 | 回答什么问题                  | 何时运行       | 缺证据时                 |
| -------------------- | ----------------------------- | -------------- | ------------------------ |
| **普通 CI**          | 这个提交没有明显坏掉吗？      | 每个 PR / push | 直接失败                 |
| **RC readiness**     | 这个候选具备发版的前提吗？    | 发布准备时     | **不**失败，记 `not_run` |
| **Release approval** | 维护者批准发布这个 SHA 了吗？ | 人工触发       | 不存在即无审批           |

**为什么必须分开**：普通 CI 无法产出在线验收（需要真实部署）、无法产出发布审批（需要人）。
如果让 CI 去满足 RC readiness 的全部条件，它只能伪造证据或永久红灯。

反过来，RC readiness 也不能用 CI 的绿来代替审批与在线验收——那是把「代码没坏」当成「可以发布」。

## 2. SBOM 在哪一层

### 2.1 本轮之前的状态

| 位置                            | 是否生成 SBOM                               |
| ------------------------------- | ------------------------------------------- |
| `ci.yml`                        | **否**                                      |
| `release.config.ts` 的 precheck | **是**（`check:sbom:write` → `check:sbom`） |
| `release-channels.ts`           | **是**                                      |

所以 CI artifact 里的 `rc-readiness.json` 记 `sbom: not_run`，而发布路径记 `pass`。

**这不是缺陷**，是两个层级问的问题不同。但它有一个真实后果：**开发者看不到 SBOM 是否过期**，
直到发布时才失败。

### 2.2 本轮改动

`ci.yml` 的 `lint-and-check` 增加一步：

```yaml
- name: Generate SBOM
  run: pnpm check:sbom:write
```

**只有生成，没有校验。** 这不是遗漏——是必须如此，我在实现过程中先写错了，这里记录原因：

`check:sbom` 与磁盘上的 `temp/sbom/zeus.cdx.json` 比对。而 `temp/` 在 `.gitignore` 里：

```
$ git check-ignore -v temp/sbom/zeus.cdx.json
.gitignore:64:temp    temp/sbom/zeus.cdx.json
```

所以全新 checkout **没有那个文件**。我最初的版本是「先 write 再 check」，那实际上是在比对
刚刚写出的文件与它自己——**恒为通过，零价值**。

「一道永远不会失败的门禁比没有门禁更糟」，因为它会让人以为这里被守着。

**这一步现在验证的是**：生成器能跑、每个发布包的 importer 能解析、lockfile 能产出运行时依赖集。
**它不验证**文档是否过期——那件事属于发布 precheck，那里 write 与 check 在同一次运行内完成。

## 3. SBOM 的覆盖范围（任务特别要求检查）

### 3.1 本轮之前

`createSbom(findWorkspacePackages())` 只穷举本仓库的 workspace 包。

**60 个组件，0 个第三方依赖。**

而 32 个发布包实际依赖 **23 个第三方运行时库**（`@babel/parser`、`@tanstack/query-core`、
`rollup`、`vite`、`intl-messageformat`…）。

**这不是一份完整的物料清单。** 它回答的是「本仓库构建了什么」，不是「消费者会装到什么」。

### 3.2 本轮改动

`collectRuntimeDependencies(lockfile, publishedByPath)` 从 `pnpm-lock.yaml` 提取：

- 只取 `dependencies` 与 `optionalDependencies`（**不含 devDependencies**）；
- 只取 32 个发布包的 importer；
- 记录 `name`、锁定的 `version`、以及 `requiredBy`（哪些发布包依赖它）；
- 写入 `zeus:runtimeDependencies` 字段。

**读锁文件而不是读 manifest**：manifest 是范围（`^1.2.3`），锁文件是实际会安装的版本。
物料清单关心后者。

结果：**60 components + 23 runtime dependencies**。

### 3.3 为什么放在自定义字段而不是 CycloneDX 标准结构

CycloneDX 的 `components` 数组语义是「本 BOM 描述的制品」。把第三方依赖混进去会让
「这个仓库发布了什么」这个问题无法回答。

`zeus:runtimeDependencies` 是一个命名空间字段，两个问题各自独立，互不污染。

**这是一个取舍，不是标准做法。** 若将来需要提交给要求标准 CycloneDX 的消费者，
应改为生成 `dependencies` 图或拆分两份 BOM。

## 4. 校验能力

| 场景                                     | 是否检出                             | 证据                                  |
| ---------------------------------------- | ------------------------------------ | ------------------------------------- |
| 组件列表变化                             | 是                                   | `sbomComponentsMatch`                 |
| 运行时依赖增删                           | 是                                   | `runtimeDependenciesMatch`            |
| 版本漂移                                 | 是                                   | 同上                                  |
| 顺序变化                                 | **否**（按 `name@version` 排序比对） | 同上                                  |
| 文档缺 `zeus:runtimeDependencies` 而应有 | 是                                   | `runtimeDependenciesMatch` 返回 false |

实测：

```
$ pnpm check:sbom
SBOM is current (60 components, 23 runtime dependencies).

# 删掉一个 runtime dependency 后
$ pnpm check:sbom
SBOM runtime dependencies are stale; run `pnpm check:sbom:write`.
exit=1
```

## 5. 关于「读取旧提交留下的临时 SBOM」

任务要求「避免读取旧提交留下的临时 SBOM」。

当前状态：`temp/` 在 `.gitignore` 里，`temp/sbom/zeus.cdx.json` **不进入仓库**。
CI 里每次运行都是全新的 checkout + 新生成，不存在跨提交残留。

**但本地不是**：`temp/sbom/zeus.cdx.json` 会留在工作区，下一次 `--check` 读到的是上一次的。
本轮**没有**改这一点——加一个 SHA 绑定字段会改变文档结构，且 CI 场景下无收益。

**记录为已知限制**：本地 `check:sbom` 可能读到上一次生成的副本。它仍会因内容不符而失败，
所以不会误报为通过。

## 6. RC readiness 的三种状态

`rc-readiness.ts` 的 `ReadinessStatus` 是 `'pass' | 'fail' | 'not_run'`：

| 状态      | 含义           | 例                                     |
| --------- | -------------- | -------------------------------------- |
| `pass`    | 证据存在且通过 | `packed-consumers`                     |
| `fail`    | 证据存在且失败 | `clean-worktree`（有未提交改动）       |
| `not_run` | **证据不存在** | `release-approval`（审批工作流零运行） |

**本轮未改动这三态。** 任务要求「未执行发布审批时，必须报告 NOT_RUN」——现有实现已经是这样：
`evidenceResult` 在缺文件时返回 `not_run`，不是 `fail`，也不是 `pass`。

## 7. 未做

| 项                                | 原因                                                                |
| --------------------------------- | ------------------------------------------------------------------- |
| 把 SBOM 提交进仓库                | 它是构建产物，`temp/` 已忽略；提交会让每次 lockfile 变动都产生 diff |
| 把第三方依赖并入标准 `components` | 会污染「本仓库发布了什么」的语义，见 §3.3                           |
| 给 SBOM 加 SHA 绑定               | 需要改文档结构，CI 场景无收益                                       |
| 让 RC readiness 在 CI 里全绿      | **不可能且不应该**：它需要审批与在线验收                            |

## 8. 结论

| 问题                      | 答案                                                |
| ------------------------- | --------------------------------------------------- |
| SBOM 现在覆盖第三方依赖吗 | **是**，23 个运行时依赖，来自 lockfile              |
| 普通 CI 会生成 SBOM 吗    | **是**，本轮新增                                    |
| RC readiness 会因此变绿吗 | **不会**，它缺的是审批与在线验收                    |
| 三态区分保持吗            | **是**，未改动                                      |
| 有伪造证据吗              | **没有**，本轮未生成任何 approval / deployment 证据 |
