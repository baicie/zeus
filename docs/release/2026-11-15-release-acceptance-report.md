# Release Acceptance Report

生成时间：2026-11-15  
执行者：Release Manager / Principal Engineer / Independent Auditor  
判定标准：**不以 CI 全绿代替 Release 验收，不以部署成功代替生产验证，不以 Canary 启动代替 Canary 完成**

---

## 1. main 最终 SHA

| 项                 | 值                                                    |
| ------------------ | ----------------------------------------------------- |
| HEAD               | `96ceb447b92be66ed35152d72d2a5681438e6211`            |
| 与任务描述的一致性 | **不一致**。任务写的是 `7bc850b7`，实际是 `96ceb447`  |
| 差异原因           | 上一轮末尾合并了 PR #272（20:11:50Z），推进了一个提交 |
| 工作区             | 干净（`clean-worktree` 本地与 CI 均 pass）            |

**必须先纠正这一点**：后续所有判断都基于 `96ceb447`，而不是 `7bc850b7`。

## 2. 十一个 PR 合并状态

| PR                 | 状态   | merge commit |
| ------------------ | ------ | ------------ |
| #262 镜像触发      | MERGED | `7bc850b7`   |
| #263 摘要重算      | MERGED | `ff8bc123`   |
| #264 配对门禁      | MERGED | `b7531bd9`   |
| #265 文档 Addendum | MERGED | `0c186f18`   |
| #266 跨源修复      | MERGED | `a57a74a0`   |
| #267 沙箱测试      | MERGED | `fe57a290`   |
| #268 证据链测试    | MERGED | `f966c5f0`   |
| #269 LICENSE       | MERGED | `3b9cee1d`   |
| #270 forced-colors | MERGED | `b4ce0836`   |
| #271 CI 结果补录   | MERGED | `fdaa388e`   |
| #272 RC 交付物     | MERGED | `96ceb447`   |

**11/11 MERGED，无 OPEN，无 Draft。**

### 2.1 一个必须记录的现象

`7bc850b7` 与 `3b9cee1d` 的 **tree SHA 完全相同**（`3db73f95…`）。连续快速 squash merge 时，
GitHub 把后一个 PR 的内容并入了前一个提交。`7bc850b7` 因此是一个空提交。

**内容没有丢失**，逐项 grep 已确认七个修复全部在位。

## 3. CI 与七平台矩阵

| 工作流（`96ceb447`）   | 结果                                             |
| ---------------------- | ------------------------------------------------ |
| CI                     | success                                          |
| Compiler Native Matrix | success（7/7）                                   |
| Admin Image            | success                                          |
| Playground Image       | success                                          |
| Docs                   | success                                          |
| Release Canary         | **success**（#332、21:16:50Z、dry-run 阶段完成） |

UI 仓（`89fc93ca`）：AI Workbench Image / CI / Zeus Canary Compatibility / docs 全部 success。

### 3.1 CI 内部的权威 RC 判定

从 CI artifact `rc-readiness` 取出的真实结果（`commit: 96ceb447`）：

```json
{
  "decision": "NOT_READY",
  "checks": [
    { "id": "clean-worktree", "status": "pass" },
    { "id": "sbom", "status": "not_run", "evidence": "0 SBOM components" },
    {
      "id": "secret-scan",
      "status": "pass",
      "evidence": "0 findings across 1924 tracked files"
    },
    { "id": "packed-consumers", "status": "pass" },
    { "id": "create-zeus", "status": "pass" },
    { "id": "cross-platform", "status": "not_run" },
    { "id": "release-approval", "status": "not_run" },
    { "id": "online-products", "status": "not_run" }
  ]
}
```

**注意与本地运行的差异**：本地 `packed-consumers` 与 `create-zeus` 是 FAIL（报告绑定在 `69f494f2`），
CI 上是 PASS（绑定当前 SHA）。**CI 的结论权威**，本地是过期报告。

## 4. 所有生产部署结果及实际 SHA

### 4.1 线上 `build-info.json`（本轮亲自拉取）

| 站点                      | coreCommit     | uiCommit      | version         | builtAt   | artifactDigest     |
| ------------------------- | -------------- | ------------- | --------------- | --------- | ------------------ |
| `admin.moonbyte.top`      | **`96ceb447`** | `ffde5592` ⚠️ | `0.1.1-beta.20` | 20:12:02Z | `sha256:4ce0201a…` |
| `playground.moonbyte.top` | **`96ceb447`** | `ffde5592` ⚠️ | `0.1.1-beta.20` | 20:12:01Z | `sha256:102c28c9…` |
| `ai.moonbyte.top`         | `a648a4a1`     | `89fc93ca`    | `0.1.0-beta.35` | 06:48:41Z | `sha256:a0b73ef0…` |

### 4.2 Admin Image 部署链路

| 环节                      | 结果                                                                      | 证据                              |
| ------------------------- | ------------------------------------------------------------------------- | --------------------------------- |
| Build and publish to GHCR | success                                                                   | run `43636194133`                 |
| Mirror to TCR             | success                                                                   | 同上                              |
| Deploy                    | success                                                                   | 同上                              |
| 镜像 digest               | `sha256:9bcbcae98e16c093907470fd89b7474bae6b10e76bdaee78e8b6c1420cc7eee9` | deploy job 日志，GHCR 与 TCR 一致 |
| revision 校验             | `EXPECTED_REVISION: 96ceb447…`（完整 40 位）                              | deploy job 日志                   |
| 健康检查                  | `==> healthy after 2s`                                                    | deploy job 日志                   |

### 4.3 Playground Image

`Build and publish: success` / `Deploy: success`（run `43636193960`）。
线上 digest `sha256:102c28c9…` 与上一次相同——**源码未变，产物未变，符合预期**。

### 4.4 Demos Pages / Playground Pages

| 站点             | 最后部署 SHA | run           |
| ---------------- | ------------ | ------------- |
| Demos Pages      | `3b9cee1d`   | `43633201406` |
| Playground Pages | `3b9cee1d`   | `43633201473` |

**`96ceb447` 上两者都没有运行**，原因：该提交只改 `docs/**` 与 `scripts/release/rc-manifest.ts`，
两者都不在 Pages 工作流的 paths 里。`3b9cee1d` 与 `7bc850b7` 树相同，`96ceb447` 在其上只加了
文档与一个只读脚本，**所以站点内容与当前 main 一致**。

### 4.5 Demos 站点的配对记录（公开证据）

```json
{
  "coreCommit": "3b9cee1dcb266e7a5b47dead38cc91588aecd505",
  "uiCommit": "89fc93cac5b97f29f48deb64964886476c5d7aac",
  "coreVersion": "0.1.1-beta.20",
  "uiVersion": "0.1.0-beta.35",
  "runId": "43633201406"
}
```

**这里 UI SHA 是对的**（`89fc93ca`）。同一次推送，Admin 镜像记 `ffde5592`（错），Demos 记
`89fc93ca`（对）——**两条路径对同一件事给出了不同答案**，这就是 P0-1 的直接证据。

### 4.6 线上 Admin 的 dialog 是否含修复（产物核验）

```
GET https://admin.moonbyte.top:8443/assets/zw-dialog.entry-Dyp_7v-B.js
  → "consumed-escapes"  1 处
  → "dialog/state"      1 处
```

**产物是对的**。`uiCommit` 记错，但打包进去的 `vendor/` 构建含修复。

## 5. Release Canary 完整结果

### 5.1 全部 run

| run       | SHA        | 状态        | 失败原因                            |
| --------- | ---------- | ----------- | ----------------------------------- |
| #322      | `fdaa388e` | failure     | `is stale; origin/main is 7bc850b7` |
| #323      | `0c186f18` | failure     | 同上                                |
| #324      | `f966c5f0` | failure     | 同上                                |
| #325      | `fe57a290` | failure     | 同上                                |
| #326      | `b7531bd9` | failure     | `is stale; origin/main is 96ceb447` |
| #327      | `ff8bc123` | failure     | `is stale; origin/main is 96ceb447` |
| #328      | `a57a74a0` | in_progress | 必然 stale                          |
| #329–#332 | …          | pending     | 必然 stale（除 #332）               |

### 5.2 失败的确切位置

六个失败**全部只失败在 `canary-dry-run` 一个 job**：

```
Error: Workflow SHA <sha> is stale; origin/main is <newer-sha>
ELIFECYCLE  Command failed with exit code 1.
```

**`release-preflight` 与七平台 `native-prebuild` 在每一个失败 run 里都是 success。**

| job                     | #326            | #327            |
| ----------------------- | --------------- | --------------- |
| release-preflight       | success         | success         |
| native-prebuild ×7      | **7/7 success** | **7/7 success** |
| canary-dry-run          | **failure**     | **failure**     |
| release-canary          | skipped         | skipped         |
| compiler-registry-smoke | skipped         | skipped         |
| dispatch-canary         | skipped         | skipped         |

### 5.3 根因

**这不是代码缺陷，是保护机制正常工作。**

我在 19:36–20:11 之间连续合并了 11 个 PR。每次 push 都触发一个 Canary，但
`concurrency: { group: npm-release, cancel-in-progress: false }` 让它们**串行排队**。
每个 run 启动时，`canary-dry-run` 的第一步就检查「workflow SHA 是否仍是 origin/main」——
此时 main 早已被下一个合并推进，于是失败。

**七平台 native build 每次都真实编译成功**，成本被浪费在一个注定失败的检查上。

### 5.4 当前 main 的 Canary：**已完成且成功**

**这是本轮最重要的更新，推翻初版的「NOT_RUN」判定。**

Run #332（`96ceb447`）：

```
status: completed
conclusion: success
created_at: 2026-11-14T20:11:53Z
updated_at: 2026-11-14T21:16:50Z
```

| job                                                                           | 结果            |
| ----------------------------------------------------------------------------- | --------------- |
| release-preflight                                                             | **success**     |
| native-prebuild ×7（darwin-arm64/x64、linux-arm64/x64/musl、win32-arm64/x64） | **7/7 success** |
| canary-dry-run                                                                | **success**     |
| compiler-registry-smoke                                                       | skipped         |
| release-canary                                                                | skipped         |
| dispatch-canary                                                               | skipped         |

#### 三个 skipped 是设计，不是失败

它们的条件明确写在 workflow 里：

```yaml
release-canary:
  if: ... && github.event_name == 'workflow_dispatch' && inputs.mode == 'publish'
compiler-registry-smoke:
  needs: release-canary # 上游 skipped 则自己也 skipped
dispatch-canary:
  needs: [release-canary, compiler-registry-smoke]
```

`push` 事件下 `inputs.mode` 为空，所以 `release-canary` 必然不跑，下游链式 skipped。
**这三个 job 只有人工 `workflow_dispatch` + `mode=publish` 才会执行。**

所以对 push 触发的 Canary 而言，**`canary-dry-run` 是终点，而它通过了**。

#### dry-run 真的做了事

```
Canary dry-run-only passed (32 packages,
  zeus-canary-43636194094-1 -> 0.1.1-canary.20261114.332.1.96ceb447);
  no packages were published.
```

- **32 个包**被真实打包；
- 版本带 SHA 后缀 `0.1.1-canary.20261114.332.1.96ceb447`；
- dist-tag `zeus-canary-43636194094-1`；
- `(dry-run)` —— **没有发布任何包**。

#### canary-readiness.json 的真实内容

```json
{
  "schema": "zeus.canary-readiness/v1",
  "decision": "READY_FOR_CANARY_PUBLISH",
  "sourceCommit": "96ceb447b92be66ed35152d72d2a5681438e6211",
  "version": "0.1.1-canary.20261114.332.1.96ceb447",
  "checks": [
    { "id": "source-commit", "status": "pass" },
    { "id": "version", "status": "pass" },
    {
      "id": "worktree",
      "status": "pass",
      "evidence": "only release rewrite paths changed (39)"
    },
    { "id": "package-json-rewrite", "status": "pass" },
    { "id": "native-binaries", "status": "pass" },
    { "id": "packed-consumers", "status": "pass" },
    { "id": "create-zeus", "status": "pass" },
    {
      "id": "secret-scan",
      "status": "pass",
      "evidence": "0 high-confidence secret findings"
    },
    { "id": "sbom", "status": "pass", "evidence": "60 SBOM components" },
    { "id": "lockfile", "status": "pass" }
  ],
  "blockers": []
}
```

**9 项全 pass，blockers 为空。**

#### 这改变了什么

| 项                  | 初版判定    | 实际                            |
| ------------------- | ----------- | ------------------------------- |
| 当前 main 的 Canary | **NOT_RUN** | **success（dry-run 阶段完成）** |
| 发布前的 readiness  | 未知        | **READY_FOR_CANARY_PUBLISH**    |

**注意边界**：这证明的是「打包与 dry-run 发布流程可用」，**不证明任何包已被发布**——
`no packages were published` 是明确写出的。真正的 publish 需要人工 dispatch。

## 6. 失败项及根因

| #   | 失败项                                   | 根因                                                       | 性质                           |
| --- | ---------------------------------------- | ---------------------------------------------------------- | ------------------------------ |
| F-1 | Canary #322–#327                         | stale protection 在工作                                    | **非缺陷**，是连续合并的副作用 |
| F-2 | `sbom` 在 CI 上 not_run                  | `ci.yml` 不生成 SBOM                                       | **真实门禁缺口**，见 §6.1      |
| F-3 | Admin / Playground `uiCommit = ffde5592` | `vars.ZEUS_UI_COMMIT` **存在但自 2026-11-09 起钉死未更新** | **P0，配置陈旧**，见 §6.2      |

### 6.1 SBOM 的定位需要分场景（修正）

我在初版写「`ci.yml` 不生成 SBOM，所以 CI 上的 `rc-readiness` 永远不会全绿」。**这句话只对一半。**

**事实一**：`ci.yml` 确实没有 SBOM 步骤（`grep sbom .github/workflows/*.yml` 无结果），
所以 CI artifact 里的 `rc-readiness.json` 记 `sbom: not_run`。

**事实二**：**发布路径上 SBOM 是被强制执行的。** Canary #332 的日志：

```
> pnpm check:sbom:write
SBOM written to temp/sbom/zeus.cdx.json.
> pnpm check:sbom
```

而它产出的 `canary-readiness.json` 里：

```json
{ "id": "sbom", "status": "pass", "evidence": "60 SBOM components" }
```

**所以正确的表述是**：

| 场景                            | SBOM               | 影响                            |
| ------------------------------- | ------------------ | ------------------------------- |
| `ci.yml`（PR / push 的常规 CI） | 未生成             | `rc-readiness` 里恒为 `not_run` |
| Canary 发布路径                 | **强制生成并校验** | `canary-readiness` 里 pass      |

**这不是一个会导致「永远不会全绿」的缺陷**——发布链路有自己的、更严格的 readiness 检查，
而它覆盖了 SBOM。CI 那份 `rc-readiness` 是**辅助证据**，不是发布闸门。

**我原先把「CI 的 rc-readiness」误当成了「唯一的 RC 闸门」。** 真正的闸门有两道：
CI 的 `rc-readiness`（宽松，缺证据时 not_run）与 Canary 的 `canary-readiness`（严格，
缺证据即 blocker）。

这处修正**不降低** RC 的阻塞——`release-approval` 与 `online-products` 在两道闸门里都缺。

### 6.2 Admin / Playground 的 `uiCommit` 记录错误（P0，未修复）

**我上一轮的根因判断是错的，这里必须更正。**

上一轮我写「`vars.ZEUS_UI_COMMIT` 不存在，工作流回退去解析 UI `main`」。**不成立。**

`ZEUS_UI_COMMIT` **确实存在**：

```
$ gh api "repos/baicie/zeus/actions/variables?per_page=100" \
    --jq '.variables[] | select(.name=="ZEUS_UI_COMMIT") | [.name,.value,.created_at,.updated_at] | @tsv'
ZEUS_UI_COMMIT  ffde55920fe9beab52dfe67bdca6d2e4023f28df  2026-11-09T13:51:19Z  2026-11-09T13:51:19Z
```

**我为什么会判错**：`gh api repos/.../actions/variables` 默认每页 10 条，而仓库有 **13** 个变量。
`ZEUS_UI_COMMIT` 按字母序排在最后，正好落在第 2 页。我只看了第一页就下结论——**分页截断**。

#### 真正的根因

变量存在，但**自 2026-11-09T13:51:19Z 创建起从未更新**（`updated_at` 与 `created_at` 相同）。
它是被**钉死**的，不是缺失的。

而 `admin-image.yml` 的逻辑是：

```yaml
sha="${CONFIGURED:-}"
case "$sha" in
*[!0-9a-f]* | '')
sha="$(gh api "repos/.../zeus-ui/commits/${sha:-main}" --jq '.sha')"
;;
esac
```

`ffde5592…` 是全小写十六进制、非空，`case` 不命中，**`gh api` 那行根本不会执行**——直接原样透传。

`demos-pages.yml` 走另一条路：不读变量，`git fetch origin main` 后取 `rev-parse HEAD`，
所以记的是运行时刻的 UI `main` 尖端 `89fc93ca`。

**两条路径读的是两个不同来源，这就是同一次推送给出不同 UI SHA 的全部原因。**

#### 影响与修复

| 项       | 说明                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------ |
| 当前产物 | **正确**（线上 dialog chunk 含修复标记，§4.4 已核验）                                            |
| 溯源记录 | **错误**：镜像自称 UI `ffde5592`，实际组件来自 `vendor/` 的 `74662b61` 构建                      |
| 修复方式 | 更新 `ZEUS_UI_COMMIT` 到当前配对值，或改为从 `demo-pairing.json` 读取，与 `demos-pages.yml` 同源 |

**这个 P0 的性质是「配置陈旧」，不是「配置缺失」。** 修复只需要维护者更新一个仓库变量，
不需要改工作流——但改工作流让它和 Demos 同源更彻底。

## 7. PR #272 状态

| 项           | 值                                        |
| ------------ | ----------------------------------------- |
| 状态         | **MERGED**（2026-11-14T20:11:50Z）        |
| merge commit | `96ceb447`                                |
| head         | `docs/rc-audit-deliverables` @ `dfb1c28a` |
| base         | `main`                                    |
| Decision     | **任务描述里的「PR #272 OPEN」已过时**    |

它把 15 份 RC 审计文档与 manifest 生成器带进了 main。

## 8. RC manifest 冻结 SHA 是否仍然有效

### 8.1 事实

| 项                       | 值                                            |
| ------------------------ | --------------------------------------------- |
| manifest 记录的 core SHA | **`7bc850b7`**（不是任务描述里的 `69f494f2`） |
| manifest 记录的 ui SHA   | `89fc93ca`                                    |
| 当前 main                | `96ceb447`                                    |
| `--verify` 结果          | **`RC manifest is out of date`**              |
| verdict                  | `NO_GO`                                       |
| blockers                 | 9                                             |

### 8.2 为什么是 `7bc850b7` 而不是 `69f494f2`

**我最初的解释是错的，这里更正。**

我先前写「lint-staged 的 prettier 钩子重跑了生成器」。查证后不成立：

```
$ git show dfb1c28a:docs/release/0.2.0-rc-manifest.json | ...
PR分支上的 core: 7bc850b7aa5451b2b1da36ecfa798f5183a2c45c
generatedAt: 2026-11-14T19:45:44.120Z
```

manifest 在 **PR 分支上就已经是 `7bc850b7`**，生成时间 `19:45:44Z`。而那一刻 main 确实是
`7bc850b7`（`96ceb447` 直到 20:11:50Z 才产生）。

**所以生成器的行为是正确的**：它如实记录了运行时的 HEAD。问题在于——

- 我按维护者要求「把 RC 文档开 PR 保留」时，**顺手跑了一次生成器**，而不是提交审计期间原本已有的那一份；
- 原本那份记录的是 `69f494f2`（审计执行的基线），被这次重跑覆盖成了 `7bc850b7`；
- 提交信息里写的仍是「记录审计时的基线」——**提交信息与文件内容不一致**。

**这是我在流程上的错误，不是工具缺陷。** 生成器没有任何问题。

### 8.2.1 独立验证：残留 blob 证明了两份的存在

一个独立验证代理用 `git fsck` 找到了被覆盖的旧版本：

```
$ git fsck --unreachable --no-reflogs | grep 45429755
unreachable blob 45429755cf533e67f1d1c2845dc56d4d0a8c4a68
```

两份的差异恰好 10 行：

| 行                         | 旧 blob（`45429755`）                  | 已提交（`1063f47f`）       |
| -------------------------- | -------------------------------------- | -------------------------- |
| `generatedAt`              | `2026-11-14T12:28:49.783Z`             | `2026-11-14T19:45:44.120Z` |
| `repositories.core.commit` | `69f494f2…`                            | `7bc850b7…`                |
| `cross-platform-evidence`  | **PASS**                               | **FAIL**                   |
| blockers                   | 无 demo pairing 与 cross-platform 两条 | 新增两条                   |

**时间线自洽**：旧版生成时（20:28:49 本地）HEAD 确为 `69f494f2`；新版生成时（03:45:44）
HEAD 确为 `7bc850b7`。

**这意味着重跑不只是改了 SHA 字段**——它把 `cross-platform-evidence` 从 PASS 变成了 FAIL，
因为新 HEAD 与旧证据不匹配。**两个版本都不是「伪造」，都如实描述了各自时刻。**

但对 RC 判定而言，已提交的这份更保守（FAIL 而非 PASS），**方向是安全的**。

### 8.2.2 提交信息的一处错误

`96ceb447` 的提交信息写：

> The committed manifest names `69f494f2` as the frozen Core SHA.

**这与实际内容不符。** `repositories.core.commit` 是 `7bc850b7`；`69f494f2` 只出现在
`artifacts.demoPairing.coreCommit`。提交信息把 demo pairing 的 SHA 说成了冻结基线。

这是我写提交信息时的错误。

### 8.3 冻结 SHA 是否有效

**否。** 三重失效：

1. `7bc850b7` 不是当前 main（差一个提交）；
2. `7bc850b7` 的 tree 与 `3b9cee1d` 相同，本身是空提交，作为「冻结基线」没有意义；
3. cross-platform evidence 绑定的是 `69f494f2`（本地那份），而 CI 已在 `96ceb447` 上产出了新的。

### 8.4 九项 blocker 的重新定性

| #   | blocker                                                             | 本轮核验后的定性                                       |
| --- | ------------------------------------------------------------------- | ------------------------------------------------------ |
| 1   | demo pairing names 69f494f2, tree is 7bc850b7                       | **已过时**（当前是 96ceb447）                          |
| 2   | rc-readiness NOT_READY                                              | **仍然成立**（CI 权威结果 4 项未过）                   |
| 3   | cross-platform commit mismatch                                      | **已修正**：`96ceb447` 上的证据存在且 validator 零错误 |
| 4   | 版本未切 0.2.0-rc.0                                                 | **仍然成立**                                           |
| 5–7 | admin/native-lab/webc-studio build-info uiCommit 错误               | **仍然成立**（P0-1）                                   |
| 8   | 缺 release-approval / online-products / product-signoff / byok-live | **仍然成立**                                           |
| 9   | 三个 fixed 包从未发布                                               | **仍然成立**                                           |

**九项里两项已因 main 前进而过时，一项已由新的 CI 证据修正，六项仍然成立。**

## 8.5 本轮我修正的三处自身错误

这份报告的第一版有三处判断错误，独立验证代理推翻了两处、补全了一处。全部记在这里，
因为它们比结论本身更能说明这份报告的可信度边界。

| #   | 我最初写的                                           | 实际                                                          | 为什么错                                                                           |
| --- | ---------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| 1   | `vars.ZEUS_UI_COMMIT` 不存在                         | **存在**，值 `ffde5592`，自 2026-11-09 未更新                 | `gh api .../variables` 默认每页 10 条，仓库有 13 个，该变量在第 2 页——**分页截断** |
| 2   | manifest 的 `7bc850b7` 是 lint-staged 重跑生成器所致 | 是**我手动重跑**覆盖了记录 `69f494f2` 的草案                  | 我把自己的操作记成了工具行为                                                       |
| 3   | 浪费「4.3 小时编译」                                 | 墙钟 323 min 含排队；**编译成本 140.9 job-min ≈ 11 计费小时** | 我用 run 墙钟近似编译成本                                                          |

第 1 条尤其重要：它让一个**配置陈旧**问题被误报成**配置缺失**问题，修复建议也因此指错了方向
（「去设置一个不存在的变量」vs「去更新一个钉死的变量」）。

第 2 条由 `git fsck` 找到的 unreachable blob `45429755` 证实：那份草案确实存在过，
记录 `69f494f2`，且在 `cross-platform-evidence` 上是 PASS 而非 FAIL。

**根因都是同一个**：我在证据不足时就下了结论，没有把命令跑完。

## 9. 是否满足 Release Candidate 验收条件

# 否

| 条件                    | 状态                                                                        |
| ----------------------- | --------------------------------------------------------------------------- |
| CI 全绿                 | 是（但这是必要条件，不是充分条件）                                          |
| 七平台矩阵              | 是（7/7）                                                                   |
| 生产部署成功            | 是（Admin / Playground / Demos / AI Workbench）                             |
| 部署产物正确            | **部分**：产物含修复，但 `uiCommit` 记录错误                                |
| Release Canary          | **success**（#332、21:16:50Z、dry-run 阶段完成）                            |
| Canary readiness        | **READY_FOR_CANARY_PUBLISH**（9/9 pass，blockers 为空）                     |
| RC readiness（CI 那份） | NOT_READY（cross-platform / release-approval / online-products 三项缺证据） |
| 版本已切 `0.2.0-rc.0`   | **否**                                                                      |
| 发布审批                | **否**（`rc-approval.yml` 零运行，`Release` 环境 `protection_rules: []`）   |
| 在线产品验收            | **否**                                                                      |
| 产品签核                | **否**                                                                      |
| RC manifest 有效        | **否**（冻结 SHA 过时）                                                     |

**代码质量足以支撑 RC。缺口全部在发布流程。**

## 10. 下一阶段建议

### 立即可做（不需要授权）

| #   | 动作                                           | 理由                                                    |
| --- | ---------------------------------------------- | ------------------------------------------------------- |
| 1   | 重新生成 RC manifest 并以当前 HEAD 为准        | 现有那份记录 `7bc850b7`，`--verify` 失败                |
| 2   | 修正 `96ceb447` 提交信息里关于 manifest 的描述 | 它写「names 69f494f2」，实际是 `7bc850b7`               |
| 3   | 把 SBOM 生成接进 `ci.yml`（可选）              | Canary 路径已有；这只是让 CI 那份 `rc-readiness` 也完整 |

**原第 1 条「等 Canary 跑完」已完成**——#332 success。

### 需要维护者决策

| #   | 事项                                                                                  | 阻塞级别                     |
| --- | ------------------------------------------------------------------------------------- | ---------------------------- |
| 1   | **更新** `vars.ZEUS_UI_COMMIT`（现为 2026-11-09 的 `ffde5592`），或改为从配对记录读取 | **P0**，影响生产溯源         |
| 2   | 发布 `@zeus-web/dialog` 含修复版本                                                    | **P0**，npm 消费者拿不到修复 |
| 3   | 批准版本切换 78 包 → `0.2.0-rc.0`                                                     | 外部阻塞                     |
| 4   | `Release` 环境保护规则与审批人                                                        | 外部阻塞，机制未启用         |
| 5   | Stage 2 在线验收                                                                      | 外部阻塞                     |
| 6   | 产品签核表                                                                            | 维护者本人                   |

### 关于 Canary 队列的建议（带实测数字）

连续合并时，`cancel-in-progress: false` 会让每个 run 都完整编译七平台再失败。

**实测代价**（八个失败 run 从开始到结束的墙钟时间）：

| run  | 耗时   |
| ---- | ------ |
| #322 | 9 min  |
| #323 | 16 min |
| #324 | 23 min |
| #325 | 29 min |
| #326 | 35 min |
| #327 | 43 min |
| #328 | 50 min |
| #329 | 56 min |
| #330 | 62 min |

**共 9 个失败，合计 323 分钟 ≈ 5.4 小时。**（时长递增是排队累积，不是单次编译变慢。）

而这四个多小时里，**七平台 native 编译每一次都真的成功了**——浪费的是编译本身。

#### 根因在 job 依赖图

```
release-preflight
  └─ native-prebuild（七平台）
       ├─ canary-dry-run      ← stale 检查在这里
       └─ release-canary
```

`Verify main source head` 是 `canary-dry-run` 里的一个 step，位于 `Install deps`、
`Download native artifacts`、`Install Playwright browsers --with-deps` **之后**。

而 `scripts/release/verify-main-head.ts` 只做一件事：

```ts
const remote = readGit([
  'ls-remote',
  '--exit-code',
  'origin',
  'refs/heads/main',
])
```

**它不需要任何依赖、任何原生产物、任何浏览器。** 一个 `git ls-remote` 就够。

#### 独立测量：浪费的是 140.9 job-min

一个验证代理按 job 计时重新算过，比我按 run 墙钟估算更准：

- **native 编译的纯浪费：140.9 job-min**
- 原始分钟约 2.3 小时；按 GitHub 各 runner 计费倍率折算约 **659 分钟 ≈ 11.0 计费小时**

（我上面按 run 墙钟算的 323 分钟包含了排队等待，不是编译成本。两个数字都对，量的是不同的东西。）

#### 修复方案

在 `release-preflight` 里加一步（它已经有 checkout、pnpm 和 node）：

```yaml
- name: Verify main source head
  run: pnpm release:verify:main-head
```

因为 `native-prebuild: needs: release-preflight`，stale 的 run 会在**任何原生编译开始前**
失败。

#### 一个必须说清的局限

前移**只能把「失败被发现的时刻」提前，不能消除失败本身**。

判据是「当前 SHA 是否仍是 `origin/main` 的尖端」——这**本质上是有竞态的**。只要有人在
canary 运行期间往 main 推送，那个 run 就必然失败。这不是缺陷，是设计。

前移的真实收益：这 9 次推送集中在 107 秒内（19:36:43–19:38:30）加 20:11:49 一次，
前移后每个 run 会在推后约 1 分钟内失败，而不是先排队、再做完 7 平台原生编译、最后才失败。

#### 另一个方向

如果维护者希望连续合并时 Canary 仍有意义，可以考虑 `cancel-in-progress: true`——
后一个 push 取消前一个必然失败的 run。代价是失去「每个提交都被 Canary 验证」的保证。

**这是一个需要维护者判断的权衡，不是单方面的缺陷修复。**

需改 workflow，本轮只读，未实施。

---

## 附：本轮未做的事

- 未修改 main、未创建提交、未改 manifest、未重新生成 RC 材料
- 未重新部署、未触发 Release
- 未删除分支、stash、worktree
- 未修改 PR #272

本轮为**只读核验**。
