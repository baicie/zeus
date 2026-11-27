# rc.6 → rc.7 发布记录

时间：2026-11-27
基线：`9353ed74`（main）+ `release/0.2.0-rc.6` / `release/0.2.0-rc.7` 分支
registry：`https://registry.npmjs.org`

> **结论先行**：rc.6 **没有发布**。它在两次不同的门禁上失败，第二次暴露的是
> tag 树里一个陈旧的模板 pin。tag 不移动，改用 **rc.7** 从修复后的树重发。
> 本文第 12 节记录两次失败与根因，第 13 节记录 rc.7。

---

## 1. 为什么有 rc.6

rc.5 是关键缺陷的最后一个已发布版本：

| 缺陷                              | 修复提交   | 已发布版本是否包含 |
| --------------------------------- | ---------- | ------------------ |
| WebC 导出无法挂载自己定义的元素   | `bf4e2bd6` | **否**（rc.5 无）  |
| 浏览器编译器缺 wasm target 的路径 | `25d3cfda` | 否                 |
| canary 在 wasm 构建前就检查导出   | `bcc3d49b` | 否                 |

实测证据：已发布的 `@zeus-js/playground-engine@0.2.0-rc.5` tarball 中，
修复后的守卫出现 **0** 次，修复前的分支出现 **1** 次。因此 Playground 浏览器
门禁对着 rc.5 不可能变绿——必须发布新版本，不是重跑。

---

## 2. `latest` 历史豁免

rc.6 的 precheck 原先被一条检查拒绝：

```
REFUSED @zeus-js/i18n: precheck found latest at prerelease 0.2.0-rc.5
```

成因不是配置错误：`@zeus-js/i18n` 在 rc.5 是**首次发布**，npm 对首次发布无条件
把 `latest` 绑到该预发布版本，`--tag rc` 不改变这一点。

三条实测事实支持"无法删除"：

1. 本机 token 只读：packument GET 返回 200，PUT dist-tag 返回 401；
2. 环境里没有 `NODE_AUTH_TOKEN` / `NPM_TOKEN`；
3. 即使有写权限，`DELETE /-/package/<pkg>/dist-tags/latest` 对同样的读写凭据
   返回 E403（`meta/release/historical-latest.json` 的 `evidence.repairFailure`
   记录了 5 次 workflow 尝试）。

且 `i18n` 没有稳定版本可把 `latest` 指过去：Registry 上只有 `0.0.0-stage`
与 `0.2.0-rc.5`，前者同样是预发布。仓库内没有任何机制能清除这个标签。

维护者于 2026-11-27 授权：将该偏差按**精确版本**记入 `meta/release/historical-latest.json`，
不把删除历史 `latest` 作为 rc.6 的前置条件。授权范围只覆盖
`@zeus-js/i18n@0.2.0-rc.5` 这一条。

**没有做的事**：未修改 `check-latest-tags.ts` 的判定逻辑；未让 precheck 读取
当前 pairing record；未新增豁免参数；未把 `latest` 指向 `0.0.0-stage`；
未发布伪稳定版本来覆盖 `latest`。

---

## 3. 基线的真实条目数

历史文档写 13 条，实际是 15 条（8 native + 5 canary 时代 runtime + 2 rc.3 首发
工具包）。加上本次的 `i18n` 共 **16** 条。文档已按实际值修正。

| 类别        | 数量 | 包                                                                     |
| ----------- | ---- | ---------------------------------------------------------------------- |
| canary 污染 | 13   | 8 native + `runtime-ssr` / `router` / `resource` / `query` / `testing` |
| 首发绑定    | 3    | `eslint-plugin`（rc.3）、`playground-engine`（rc.3）、`i18n`（rc.5）   |

---

## 4. 真实 Registry precheck 结果

```
latest-tag census: 32 packages (16 stable, 16 prerelease, 0 absent, 0 failed)
latest policy (precheck): ACCEPTED_HISTORICAL
  (16 historical, 0 first-publish, 0 refused, 0 unknown)
```

退出码 0。16 条全部为精确匹配，refused 与 unknown 均为 0。

---

## 5. 版本切换覆盖面

`version-rehearsal --version 0.2.0-rc.6 --apply` 改写 **39 个文件 / 44 处编辑**，
含 32 个固定发布包装配、根 `package.json`、`Cargo.toml`、以及 create-zeus 六个模板。

它**不覆盖**的两处已手工补齐（这是已知缺口）：

| 缺口                              | 补齐方式                                                         | 验证                   |
| --------------------------------- | ---------------------------------------------------------------- | ---------------------- |
| `Cargo.lock` 三个 crate 仍是 rc.5 | `cargo update -p zeus_compiler --offline`                        | 三个 crate 全部 → rc.6 |
| native loader 硬编码期望版本      | `pnpm exec tsx scripts/release/sync-native-loader.ts 0.2.0-rc.6` | 52 处 rc.6、0 处 rc.5  |

派生文档 `docs/api/packages.md` 由 `pnpm write:package-table` 重新生成（32 处 → rc.6）。

独立版本线的包**未**被机械升级，已逐一核对保持原值：
`@zeus-js/vite-plugin` 0.0.6、`@zeus-js/compiler-wasm` 0.1.1-beta.20、
`create-zeus` 0.1.5、`zeus-ui` 0.0.1。

---

## 6. 本机 precheck 的边界

`release:precheck` 共 33 条命令。本机（darwin-arm64）能真实执行 **31** 条，
全部通过。跳过 2 条，原因是它们要求全部 8 个平台的 `.node` 二进制，
而单机只能产出本平台的：

| 跳过                                         | 原因                                |
| -------------------------------------------- | ----------------------------------- |
| `check:native-binaries`                      | 缺 darwin-x64 等 7 个平台的 `.node` |
| `check:release-artifacts --require-binaries` | 同上                                |

CI 的 `release` job 通过 `native-prebuild` → `download native platform artifacts` →
`native:restore:artifacts` 满足这两步，本机无法复现。**因此这两条的真实结论
只有在 CI 上才算数**，本记录不把它们声称为已通过。

另有一条本机环境约束：仓库要求 `engines.node = ^22.18.0 || >=24.11.0`，而本机
默认 shell 是 Node 22.12.0。`build-dts` 在这个版本下报
`Unknown file extension ".ts"` 并失败——这是 `.bin/rollup` wrapper 没有走 tsx
的环境问题，不是代码缺陷。用 `.node-version` 指定的 24.16.0 重跑即通过，
后续全部 precheck 步骤都在该版本下执行。

---

## 7. 发布后的核对

核对对象是 Registry 的实际状态，不是本地清单。脚本按 `release.config.ts` 的
32 个固定包逐个查询，检查四项：精确版本存在、`rc` tag 指向 rc.6、`latest` 的
预发布集合恰好等于基线的 16 条、无新增偏差；另外单独核对每个包的 SLSA
provenance（恰好 1 个 bundle，且其 subject 摘要与 Registry 记录的 integrity 一致）、
7 个平台二进制，以及真实下游安装。

| 项目                                        | 状态 |
| ------------------------------------------- | ---- |
| 32 包精确版本 = 0.2.0-rc.6                  | 待填 |
| `rc` dist-tag 指向 0.2.0-rc.6               | 待填 |
| `latest` 预发布集合 = 基线 16 条，无新增    | 待填 |
| tarball integrity 与 provenance             | 待填 |
| 7 个平台二进制齐备                          | 待填 |
| 真实下游安装（fixtures/published-consumer） | 待填 |

---

## 8. 配对协议：rc.6 卡在一个真实的循环上

这一节记录的是**尚未解决**的问题，不是已完成的步骤。

### 8.1 为什么 rc.6 既不能 bootstrap，也不能 recovery

`.github/workflows/release.yml` 的 "Read the paired UI commit" 要求
`meta/release/pairing/v0.2.0-rc.6.json` 里有一个 40 位的 `uiCommit`。两种例外都不成立：

| 例外      | 适用条件                                  | rc.6 的实际情况                                         |
| --------- | ----------------------------------------- | ------------------------------------------------------- |
| bootstrap | 版本线的**首个** RC，且该线无已发布预发布 | rc.1–rc.5 均已发布，`bootstrap-eligibility.ts` 明确拒绝 |
| recovery  | 前一个 RC **失败且未发布任何产物**        | rc.5 成功发布，不满足                                   |

`bootstrap-eligibility.ts` 的拒绝文案是直接命中的：

> `0.2.0 already has published prereleases (0.2.0-rc.1, …, 0.2.0-rc.5); bootstrap is for a new version line, and a line that has shipped an RC already has its pairing path`

### 8.2 循环在哪

`meta/release/pairing/README.md` 已经写明这个结构：

> `@zeus-js/*@<new version>` is not on the registry, so the UI lockfile cannot resolve — blocks the UI commit that the record must name
> The record must be in the tagged commit — blocks the Core tag
> Each needs the other's output. That is the deadlock.

文档给出的解法是「bootstrap 打破首次循环，之后**同版本线内** pins 不变、lockfile 已有效，记录可以在 tag 前写好」。

rc.5 → rc.6 不属于「同版本线内 pins 不变」的情况：它跨 rc，UI 的 pins 必须从 rc.5 改到 rc.6，而 rc.6 尚未发布。

### 8.3 一个可能的出口（未执行）

`check:ui-pairing` 实测**不校验 lockfile 能否解析**，只校验 UI 树里每个
`@zeus-js/*` 依赖的版本字符串等于 `coreVersion`，以及 commit / 工作树干净。
这意味着一个只改版本字符串、不重新安装的 UI commit 可以通过配对校验。

这条路径的代价必须说清楚：它会产生一个**其 lockfile 无法用已发布包解析**的 UI commit，
并将其记为 rc.6 的配对对象。这不是"已配对"，只是"校验能过"。

### 8.4 需要维护者决定

- 方案 A：按 8.3 制造 UI 配对 commit，rc.6 走完整配对路径发布。
- 方案 B：先不发布 rc.6，改为让 rc.6 也走 recovery/bootstrap 之外的其他授权路径（需要新增机制，本记录不假设存在）。

在决定之前，rc.6 **未**提交 tag、**未**触发发布。

---

## 9. 本机预检的实测结果（补第 6 节）

逐条执行了预检的 33 条命令。结论按"真实跑过"与"本机无法满足"分开：

| 结果         | 数量 | 说明                                                                  |
| ------------ | ---- | --------------------------------------------------------------------- |
| 通过         | 31   | 含 `check:latest-tags`（ACCEPTED_HISTORICAL）、`test-unit`            |
| 跳过（平台） | 2    | `check:native-binaries`、`check:release-artifacts --require-binaries` |
| 失败         | 0    |                                                                       |

`test-unit` 的全量结果：**275 个文件 / 3349 个测试通过，0 失败，15 skip**。

首次运行时有 1 个测试失败：
`packages/web-c/output-wc/__tests__/public-declarations.spec.ts` 报
`Test timed out in 30000ms`。单独重跑通过（21.4s），全量重跑也通过。
该测试用 `dts-bundle-generator` + TypeScript 在内存里生成声明文件，不涉及版本号，
失败原因是并发负载下的超时抖动——属既有缺陷，不是本次改动引入。

`check:release-worktree --capture/--verify` 必须在同一轮内成对执行：
我在 capture 之后新增了本文件，verify 因此正确地报告了意外变更。提交后再跑即通过。

---

## 10. 配对方案 A 的技术验证

在不改动真实 zeus-ui 工作树的前提下，用 `git archive HEAD` 导出副本、把 170 处
pin 从 rc.5 改成 rc.6，然后跑：

```
pnpm exec tsx scripts/check/check-ui-pairing.ts \
  --ui-root <probe> --core-version 0.2.0-rc.6 --ui-version 0.1.0-beta.35
```

结果：`UI pairing PASS`。

**这只证明校验能通过，不证明配对有效。** 该副本没有 lockfile 更新，
而 rc.6 在发布前无法从 registry 解析。方案 A 的代价是：
产生一个 lockfile 无法安装的 UI commit，并把它记为 rc.6 的配对对象。

---

## 11. 配对循环的解决（第 8 节的后续）

第 8 节把问题记为未解决。维护者选择「改 zeus-ui pin 后配对」，实际执行如下。

### 11.1 第一次尝试暴露了两条规则互相矛盾

先只把 zeus-ui 的 170 处 `@zeus-js/*` pin 从 rc.5 改到 rc.6，`uiVersion` 写
`0.1.0-beta.35`（UI 树的真实版本）。结果：

- `check:ui-pairing --ui-version 0.1.0-beta.35` **通过**；
- `check:release-pairing` **失败**：`uiVersion 0.1.0-beta.35 does not equal coreVersion 0.2.0-rc.6; the pair must be one version`。

`scripts/release/release-pairing.ts:132` 要求 `uiVersion === coreVersion`；而
`check:ui-pairing` 要求 `--ui-version` 等于 UI 根 `package.json` 的版本。两条规则
同时成立只有一种解：**UI 的版本也必须是 `0.2.0-rc.6`**。

历史记录里 rc.0–rc.5 都满足这个等式，但它们全是 bootstrap（`uiCommit: null`），
从来没走过真配对，所以这条约束此前没有被检验过。

### 11.2 实际改动

| 仓库    | 改动                                         | 数量             |
| ------- | -------------------------------------------- | ---------------- |
| zeus-ui | `@zeus-js/*` pin 从 0.1.0(rc.5) → 0.2.0-rc.6 | 35 文件 / 170 处 |
| zeus-ui | 包版本 0.1.0-beta.35 → 0.2.0-rc.6            | 48 个包          |
| core    | 配对记录 `uiCommit` 指向 zeus-ui 的提交      | 1 文件           |

未改动：zeus-ui 的 13 个 `private: true` 示例与基准包，它们保持 `0.0.0` / `0.0.1`，
从来不属于版本线。

**代价，已由维护者确认**：zeus-ui 的独立 beta 版本线在 RC 期间停用；配对提交的
lockfile 在 rc.6 发布前无法解析（`check:ui-pairing` 校验 pin，不校验 lockfile）。

### 11.3 一个被 `dirty` 检查挡住的细节

`--require-commit` 把**未跟踪文件**也算 dirty（`--untracked-files=normal`）。
zeus-ui 工作树里有两个 11 月 26 日就存在的未跟踪 Dockerfile，因此本机校验报
`UI checkout is dirty`。它们不属于配对提交，CI 的 fresh checkout 不会有。

验证方式：用 `git archive` 导出该提交到临时目录、重新提交成干净树，再跑完整参数
—— `UI pairing PASS`。本机那三个文件没有被删除或改动。

### 11.4 zeus-ui 的分支保护

向 zeus-ui `main` 直接推送被拒：

```
GH006: Protected branch update failed for refs/heads/main.
- Changes must be made through a pull request.
- 11 of 11 required status checks are expected.
```

配对提交因此位于 `release/0.2.0-rc.6` 分支。发布工作流只做
`actions/checkout` 该 SHA，分支上的提交同样可解析，配对不受影响。
合入 zeus-ui main 需要走 PR 并满足 11 项检查，属于独立流程。

### 11.5 释放

| 对象              | 值                                         |
| ----------------- | ------------------------------------------ |
| Core main         | `7cc5f31d`                                 |
| tag `v0.2.0-rc.6` | `7cc5f31d`（可从 origin/main 到达）        |
| 配对 uiCommit     | `6aaef8ca70f42dcf923b51cc5c2e78d3d65ebda5` |
| Release run       | `45964301625`                              |

---

## 12. 第一次 Release run 被 `ci-evidence` 拒绝

第 11.5 节的 Release run `45964301625` **失败**了。失败点不是 `latest` 豁免，
也不是配对——这次失败与它们无关，而且恰好证明了门禁在工作。

### 12.1 结果

`Authorise the release` 步骤输出 `release authorization (zeus.release-policy/v2): REFUSED`，
13 条规则中 1 条拒绝：

```
REFUSED ci-evidence: .github/workflows/ci.yml: run 45964255390 attempt 1 concluded cancelled
```

其余全部通过，包括本任务最关键的两条：

| 规则                | 结果        | 说明                                             |
| ------------------- | ----------- | ------------------------------------------------ |
| `core-ui-pairing`   | ok          | Core 与 UI 都是 0.2.0-rc.6，UI 在 `6aaef8ca`     |
| `native-evidence`   | ok          | 1 个 native matrix run 成功                      |
| `registry-state`    | ok          | 没有任何包已经存在 0.2.0-rc.6                    |
| `tarball-integrity` | ok          | 打包产物不含 `workspace:` / `catalog:` / `file:` |
| `sbom`              | ok          | 本树的 SBOM 已生成并校验                         |
| `tag-unmoved`       | ok          | tag 仍指向 `7cc5f31d`                            |
| `ci-evidence`       | **REFUSED** | 见 12.2                                          |

`Release precheck` 步骤本身是 **success**——`latest` 历史豁免在真实 CI 里被接受，
这是本任务第 8 点要求的结果。

### 12.2 根因：并发组取消了 tag 提交的 CI

`.github/workflows/ci.yml` 声明：

```yaml
concurrency:
  group: ci-${{ github.workflow }}-${{ github.ref }}
  cancel-in-progress: true
```

打 tag 之后我又推了一次文档提交 `0bf6a438`（第 11 节的记录）。两次推送的
`github.ref` 都是 `refs/heads/main`，属于同一个并发组，于是后一次把前一次**取消**了：

| run           | head_sha   | 事件 | 结论                       |
| ------------- | ---------- | ---- | -------------------------- |
| `45964255390` | `7cc5f31d` | push | cancelled                  |
| `45964443722` | `0bf6a438` | push | success                    |
| `45964254973` | `7cc5f31d` | push | success（compiler-native） |

`ci-evidence` 的判定（`scripts/release/release-authorization.ts`）是：对每个必需
workflow，取**同一 commit 上 run_attempt 最大的一次**，其 `conclusion` 必须是
`success`。`7cc5f31d` 上 ci.yml 只有那一次 cancelled，所以拒绝。

这是正确行为，不是误报：发布确实没有得到 tag 提交自身的验证。

### 12.3 为什么新提交上的绿不能替代

`0bf6a438` 的 CI 是绿的，但授权把证据绑定在 `workflowSha`（即 tag 提交）上，理由
写在 `find-release-evidence.ts` 的 `TRUSTED_EVENTS` 与 `headSha` 过滤里：一个在
**别的**提交上跑绿的 CI 不能证明 tag 指向的树通过了检查。用新提交冒充旧提交，
正是这条规则要挡的事。

### 12.4 补救：重跑 tag 提交上的 CI

没有改门禁、没有改授权脚本、没有绕过。执行的是一次 re-run：

```
POST /repos/baicie/zeus/actions/runs/45964255390/rerun
```

re-run 保留原 `event: push` 与原 `head_sha: 7cc5f31d`，只把 `run_attempt` 从 1 提到 2。
`ci-evidence` 取 attempt 最大者，因此 attempt 2 的结论才是这次发布的证据——这正是
规则设计里「后一次是产物对应的那一次」的含义。

触发前确认过三件事：

1. `TRUSTED_EVENTS` 包含 `push`，re-run 不会改变事件类型；
2. 该 workflow 上没有任何 in-progress 的 run，重跑不会被同一个 `cancel-in-progress` 再取消；
3. `45964254973`（compiler-native，同样在 `7cc5f31d`）已经是 success，不必重跑。

### 12.5 教训

打 tag 之后**不要**再向同一分支推送提交。tag 触发的 Release 依赖 tag 提交上的 CI
证据，而同分支的后续推送会因 `cancel-in-progress: true` 把它取消。文档类提交应在
打 tag **之前**合并，或放在另一个分支。

### 12.6 补救结果

| 项目                          | 值                                                      |
| ----------------------------- | ------------------------------------------------------- |
| ci.yml on `7cc5f31d`          | run `45964255390`, event `push`, attempt 2, **success** |
| compiler-native on `7cc5f31d` | run `45964254973`, event `push`, attempt 1, success     |
| Release run                   | `45964301625`, re-run attempt 2                         |
| attempt 2 的授权结果          | **success**（13 条规则全部成立）                        |
| attempt 2 之后失败于          | `Verify create-zeus candidate templates`（见 12.7）     |

attempt 2 成功后，`ci-evidence` 取该 workflow 上 attempt 最大的 run，读到的是
attempt 2 的 success，规则成立。释放路径没有触碰任何门禁代码。

### 12.7 第三个问题：模板 pin 落后于配对 UI 版本

授权通过后，流程走到 `Verify create-zeus candidate templates` 并失败：

```
Error: webc-consumer-ts has stale pins: @zeus-web/button 0.1.0-beta.34 != 0.2.0-rc.6
```

根因不是 rc.6 引入的缺陷，而是**一条此前从未被执行过的规则**：

- `check-create-zeus-candidate.ts` 要求每个 `@zeus-web/*` pin 等于配对 UI 树的
  `package.json` 版本（`uiVersion`）；
- rc.0–rc.5 的配对记录全是 `bootstrap: true`、`uiCommit: null`，工作流因此从不
  checkout UI 树、也不传 `--ui-root`，这条校验从未运行；
- rc.6 是第一个真配对，规则第一次生效，立刻暴露模板里的 `0.1.0-beta.34` 自 R16.0
  起就没动过。

修复本身很小，用官方工具完成：

```
pnpm exec tsx scripts/release/create-zeus-versions.ts --ui-version 0.2.0-rc.6
```

但修复提交（`bccf9fd8`）在 tag 指向的 `7cc5f31d` **之后**，而发布授权把
`readCoreVersions` 与 `ci-evidence` 都绑定在 tag 提交的树上。这就产生了第 13 节
的处理方式：不移动 tag，改用 rc.7。

---

## 13. rc.7：从修复后的树重发

### 13.1 为什么换版本号而不是移动 tag

`v0.2.0-rc.6` 指向 `7cc5f31d`，而模板修复在其后的 `bccf9fd8`。发布授权
（`authorize-release.ts`）把 `ci-evidence` 与树内容都绑定在 tag 提交上：

- `readCoreVersions(root)` 读的是 CI checkout 的工作树，即 `GITHUB_SHA`（tag 提交）；
- `ci-evidence` 只接受 `head_sha === workflowSha` 的 run。

所以让 rc.6 通过的唯一方式是让 tag 指向含修复的提交。删除并重建一个已推送的 tag
会削弱 tag 保护所提供的那一条性质，而 rc.6 没有发布任何东西——没有半成品需要救。
用新版本号是代价更小的选择。

### 13.2 事实核对：rc.6 没有留下任何东西

| 检查项                           | 结果                                                                             |
| -------------------------------- | -------------------------------------------------------------------------------- |
| registry 上是否存在 `0.2.0-rc.6` | 不存在（zeus / signal / runtime-dom / compiler-native / i18n / router 逐个查过） |
| `@zeus-js/zeus` 的 `rc` dist-tag | 仍指 `0.2.0-rc.5`                                                                |
| `latest`                         | 仍指 `0.1.0`                                                                     |

### 13.3 rc.7 的改动面

| 对象                        | 改动                                                       |
| --------------------------- | ---------------------------------------------------------- |
| Core 固定组（32 包 + 模板） | `0.2.0-rc.6` → `0.2.0-rc.7`                                |
| `Cargo.lock`                | 由 `cargo metadata` 重算，非手改                           |
| `compiler-native/index.js`  | 由 `sync-native-loader.ts` 重新生成                        |
| `docs/api/packages.md`      | 由 `write:package-table` 重新生成                          |
| zeus-ui                     | 46 个包版本 + 170 处 pin → rc.7，分支 `release/0.2.0-rc.7` |
| 配对记录                    | `meta/release/pairing/v0.2.0-rc.7.json`                    |

### 13.4 验证结果

| 检查                                                         | 结果                                                                         |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `check:latest-tags --version 0.2.0-rc.7`                     | `ACCEPTED_HISTORICAL (16 historical, 0 first-publish, 0 refused, 0 unknown)` |
| `check:structure`                                            | PASS（6 领域 / 38 包）                                                       |
| `check:package-versions`                                     | PASS（`0.2.0-rc.7` 全对齐）                                                  |
| `check`（tsc）                                               | PASS                                                                         |
| `check:release-pairing`（Core）                              | PASS                                                                         |
| `check:create-zeus-versions --ui-version 0.2.0-rc.7`         | PASS                                                                         |
| `check:release-pairing` / `check:release-channel`（zeus-ui） | PASS（rc, static）                                                           |
| `test-unit`                                                  | 待填                                                                         |
| Core main CI                                                 | 待填                                                                         |
| Release run                                                  | 待填                                                                         |
