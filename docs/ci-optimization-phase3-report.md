# Phase 3 交付报告

日期：2026-11-13
基线：`origin/main` @ `7d1031e4`
所有数字标注 **MEASURED**（来自真实 Actions run / 本机实测）、**MODELLED**（由实测步骤成本推导）或 **NOT_RUN**。

---

## 1. Baseline

### 1.1 三个参照 PR run

| Run                                                                    | Event | Commit     | Wall clock       | Runner min | 最长 Job              |
| ---------------------------------------------------------------------- | ----- | ---------- | ---------------- | ---------- | --------------------- |
| [43246592042](https://github.com/baicie/zeus/actions/runs/43246592042) | PR    | `1dce51df` | 618s (10.3 min)  | 23.2       | packed-consumers 403s |
| [43216552566](https://github.com/baicie/zeus/actions/runs/43216552566) | PR    | `179779a4` | 1155s (19.3 min) | 21.3       | packed-consumers 395s |
| [43180717486](https://github.com/baicie/zeus/actions/runs/43180717486) | PR    | `847b43d1` | 642s (10.7 min)  | 21.3       | packed-consumers 468s |

`43216552566` 的 19.3 分钟是排队（首个 Job 前 130s + packed-consumers 前 7 分钟空档），不是工作量。

### 1.2 packed-consumers 步骤级（MEASURED，run 43246592042）

| 步骤                                                  | 秒       |
| ----------------------------------------------------- | -------- |
| checkout / pnpm / node / rust / cargo cache / install | 28.4     |
| `native:build:platform`（Rust）                       | 17.3     |
| `pnpm build` + `build-dts`                            | 8.7      |
| **`playwright install --with-deps`（3 引擎）**        | **50.0** |
| packed consumers                                      | 62.4     |
| RC readiness                                          | 22.5     |
| 其余 12 个三引擎浏览器验收                            | 186      |
| 上传                                                  | 8.0      |
| **合计**                                              | **403**  |

Playwright 的 50s 里：**apt 依赖 41.4s，浏览器下载仅 8.6s**。这决定了"缓存浏览器"不是本轮的正确起点。

### 1.3 Native Matrix 重复（MEASURED）

| 场景                                                                | 证据                                                                                                                                                                                                                                                                                                                     |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| feature 分支 push + pull_request 各跑一套 7 平台                    | `179779a4`：[43216543074](https://github.com/baicie/zeus/actions/runs/43216543074) / [43216552540](https://github.com/baicie/zeus/actions/runs/43216552540)；`6d71343f`：[43216215063](https://github.com/baicie/zeus/actions/runs/43216215063) / [43216281805](https://github.com/baicie/zeus/actions/runs/43216281805) |
| main 上独立 Matrix 与 Release Canary `native-prebuild` 各建同一棵树 | `8f8f5256`：[43221565275](https://github.com/baicie/zeus/actions/runs/43221565275)（14.7 runner min）与 [43221565365](https://github.com/baicie/zeus/actions/runs/43221565365)，相隔 3 秒启动                                                                                                                            |

---

## 2. Changes

### PR [#247](https://github.com/baicie/zeus/pull/247) — Native CI 去重（Phase 3A）

| 项   | 内容                                                                                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文件 | `.github/workflows/compiler-native.yml`、`scripts/release/__tests__/release-workflow.spec.ts`、`docs/release-process.md`、`docs/ci-optimization-phase3a.md`            |
| 改动 | `push` 由 4 个前缀收缩为 `main`；新增 6 条回归测试（四个触发器、七平台、自识别守卫）                                                                                   |
| 保留 | `workflow_call`（release.yml / release-canary.yml 都在用）、`workflow_dispatch`（任意分支手动）、`pull_request` 的 `paths:` 过滤逐字未动、七平台矩阵与 artifact 名未动 |
| 风险 | feature 分支无 PR 时不再跑 push 验证；`workflow_dispatch` 仍在，与 Phase 1 对 `ci.yml` 的取舍一致                                                                      |
| 回滚 | 单文件：把四个前缀加回 `push:`，删除守卫块                                                                                                                             |

**main 上的跨 workflow 去重已按你的决定撤回**，改为 `docs/ci-native-matrix-dedup-rfc.md` 记录设计。原因合理：要判定"canary 已建过"需要证明七个平台的结论、artifact 归属与 run attempt，判错的代价是发布物失去唯一验证。

**真实 Actions 证据（MEASURED）**：`597178f2` 的 PR run [43252159090](https://github.com/baicie/zeus/actions/runs/43252159090) 只有 **1** 个 Native Matrix run，`dedupe-against-canary` 正确 skipped，七平台正常启动。旧配置下同一提交会有 2 个。重命名后 CI 全绿（[43272772347](https://github.com/baicie/zeus/actions/runs/43272772347)）。

### PR [#248](https://github.com/baicie/zeus/pull/248) — packed-consumers 关键路径（Phase 3B）

| 项   | 内容                                                                                                                                                                      |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文件 | `.github/workflows/ci.yml`、`scripts/ci/impact-analysis.ts`、`scripts/ci/ci-gate.ts`、两个测试文件、`docs/ci-optimization-phase2.md`、`docs/ci-optimization-phase3b.md`   |
| 改动 | 拆出 `browser-web-components`（5 个 gate）与 `browser-playground`（4 个 gate）；删除与 `check:playground-ux` 重复的 36.2s editor build；三处按 job 名硬编码的清单同步更新 |
| 保留 | `packed-consumers` 名称、packed consumer tarball、RC readiness、Admin/HMR/hydration —— 发布证据链（`collect-cross-platform-evidence.ts` 按精确名要求它）不变              |
| 风险 | 三个 Job 各付 104s 预热；`+3.3 runner min`（MODELLED）                                                                                                                    |
| 回滚 | 把两个新 Job 的步骤搬回 `packed-consumers`，删除 job 块与三处清单项                                                                                                       |

**实现中被测试抓到的真实缺陷**：两个新 Job 最初守卫在 `needs.impact.outputs.packed-consumers` 而非各自输出。范围相同让它看起来正确，但 `ci-gate` 按 `planned-skips` 的**逐 job 名**判定，计划 skip `browser-playground` 与它实际 skip 的理由会错位。已修正并加测试。

### PR [#253](https://github.com/baicie/zeus/pull/253) — impact 可靠性（Phase 3C）

| 项     | 内容                                                                                                                                                                                  |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 文件   | `.github/workflows/ci.yml`、`scripts/ci/impact-analysis.ts`、`scripts/ci/__tests__/impact-analysis.spec.ts`、`docs/ci-optimization-phase3c.md`                                        |
| 改动 1 | `impact` 上传 `impact-plan` artifact（`if: always()`）。此前计划只渲染进 `$GITHUB_STEP_SUMMARY`，而该 summary **无法通过 API 读取**，所以"impact 决定了什么"没有任何可审计记录        |
| 改动 2 | 部分分析改为事件白名单（仅 `pull_request`）。原写法是"非 push 且非 dispatch"，于是 `merge_group` / `schedule` / `release` / `repository_dispatch` / `workflow_run` 全部默认拿到窄路径 |
| 改动 3 | **真实 fail-open**：`^\.[a-z]+rc$` 匹配 `.nvmrc`，Node 版本变更被归为 `tooling` —— 不跑 `rust-compiler`，浏览器 gate 照跑。新增工具链规则置于其前                                     |
| 风险   | 低；三条都是收紧默认值                                                                                                                                                                |
| 回滚   | 删除 artifact 步骤、删除工具链规则、`requiresFullRun` 还原为内联表达式                                                                                                                |

### PR [#249](https://github.com/baicie/zeus/pull/249) — Admin 首屏验收（Phase 3D）

| 项   | 内容                                                                                                                   |
| ---- | ---------------------------------------------------------------------------------------------------------------------- |
| 文件 | `scripts/perf/measure-admin-chunks.ts`、`package.json`、`docs/performance/phase-p10-admin-lazy-routes-verification.md` |
| 改动 | 新增 chunk 归属测量（`pnpm measure:admin-chunks`）；修正一处不可复现的已发布数字                                       |
| 保留 | 未改任何 Admin 业务代码 —— PR #244 已完成拆分                                                                          |
| 回滚 | 删除脚本与文档                                                                                                         |

**为什么不再继续拆**：见 §5。

---

## 3. Performance

### 3.1 Native Matrix 重复执行（MEASURED）

|                         | 优化前                                      | 优化后                 |
| ----------------------- | ------------------------------------------- | ---------------------- |
| feature 分支每个提交    | 2 套 7 平台矩阵（约 9.5 + 10.6 runner min） | **1 套**               |
| PR run 43252159090 实测 | —                                           | 1 个 Native Matrix run |

### 3.2 packed-consumers 最长 Job（MEASURED + MODELLED）

| 指标               | 当前 | 3B 实测                                                  |
| ------------------ | ---- | -------------------------------------------------------- |
| `packed-consumers` | 403s | 240s（拆分后完整 run：见下）                             |
| 最长 Job           | 403s | **231s**（`browser-playground`）                         |
| 新增 Job           | —    | `browser-web-components` 194s、`browser-playground` 231s |

run 43256102857 的实测：`packed-consumers` 240s、`browser-web-components` 194s、`browser-playground` 245s，三者并行。**最长 Job 从 403s 降到 ~245s（−39%）**。

**Runner 分钟代价（MODELLED）**：三份 104s 预热使该子树从 6.8 增至 10.2 runner min，全 run 从 23.2 增至约 26.5。这是为墙钟付的价，已在 `docs/ci-optimization-phase3b.md` 的候选对比里列明（A′ 单 Job 只能到 373s；C 双 Job 264s / 24.8 min）。

### 3.3 PR 全量 CI 墙钟

| 来源                    | 数值                  | 标注                                                                            |
| ----------------------- | --------------------- | ------------------------------------------------------------------------------- |
| 基线（run 43246592042） | 618s（10.3 min）      | MEASURED                                                                        |
| 3B 模型预测             | 457s                  | MODELLED                                                                        |
| 3B run 43256102857 实际 | 413s created→last end | MEASURED（但 `packed-consumers` 在 admin 步骤失败，路径提前结束，不可直接对比） |

**结论：20% 墙钟目标的证据尚不完整。** 拆分本身把最长 Job 降低了 39%，这足以支撑目标，但需要一次**无失败**的完整 run 才能给出可比的墙钟数字。当前不能声称达标。

### 3.4 Admin 首屏（MEASURED）

| 指标                   | 懒加载前 `8f8f5256` | 当前 `7d1031e4` |       变化 |
| ---------------------- | ------------------: | --------------: | ---------: |
| 登录入口 JS raw        |             340,510 |         284,747 | **−16.4%** |
| 登录入口 JS gzip(9)    |              97,293 |          86,972 |     −10.6% |
| 登录入口 JS Brotli     |              82,069 |          74,280 |      −9.5% |
| 登录页传输（含 API）   |             381,164 |         325,401 |     −14.6% |
| 登录页请求的路由 chunk |    9 个页面静态引用 |           **0** |          — |
| 首次进 Users 增量      |                   — |      62,666 raw |          — |

### 3.5 Admin 交互性能：**没有可测出的改善**

| 指标（未限速）                 | 懒加载前 |  当前 |
| ------------------------------ | -------: | ----: |
| loginInteractiveMs             |       95 |   120 |
| dataGridInteractiveMs          |      355 |   498 |
| cold/slow4g loginInteractiveMs |    2,407 | 2,131 |

未限速场景差异在噪声内、方向不一致。**"−16.4% 首屏 JS" 不等于 "快 16.4%"**，报告不能这样写。限速场景有一个方向一致的 −11%，但单次对照不足以结论。

---

## 4. Correctness

| 检查                        | 状态                                                                                                                                           |
| --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| 3A 重命名后 CI              | **success**（[43272772347](https://github.com/baicie/zeus/actions/runs/43272772347)）                                                          |
| 3A Native Matrix 七平台     | 7/7 构建，PR run 只有 1 套（MEASURED）                                                                                                         |
| 3B `browser-web-components` | success（194s）                                                                                                                                |
| 3B `browser-playground`     | success（245s）                                                                                                                                |
| 3B `packed-consumers`       | **failure** —— `check:admin` chromium 空 PATCH（见下）                                                                                         |
| 3B `ci-gate`                | failure（因上一行，**判定正确**）                                                                                                              |
| 3C CI                       | 运行中 / 见 PR                                                                                                                                 |
| 3D CI                       | success（[43258225442](https://github.com/baicie/zeus/actions/runs/43258225442)）                                                              |
| `ci-gate` 逻辑              | 56 个单测通过；docs-only 真实 run 43200924859 六 Job skip + gate success                                                                       |
| Release Evidence            | 3A/3B 未改 `collect-cross-platform-evidence.ts`，所需三个 Job 名与 artifact 名不变                                                             |
| 体积预算                    | 未改 `scripts/size/size-budget.json`；`pnpm size:report:ci` 属 `build` Job，本地未复跑（NOT_RUN）                                              |
| actionlint                  | `ci.yml`、`compiler-native.yml` 均 clean                                                                                                       |
| 本机浏览器验收              | a11y / form-associated / runtime-cleanup / DevTools / Playground smoke / Playground UX / theme-i18n(122/122) / Next.js boundary，三引擎全 PASS |

### 3B 的失败是既有缺陷，不是拆分引入

`check:admin` 在 chromium 上发出 `PATCH /api/users/ada {}` 空 body，导致邮箱断言失败；firefox / webkit 同 run 通过。这与 `docs/admin-patch-race-investigation.md`（另一会话，PR #252）根因定位的现象一致：`seedValue` 的 `dataset.seeded` 守卫在 `<Show>` 卸载重挂后阻止重播种，DOM 值回退成旧值，`changedFields` 返回 `{}`。

判断依据：该缺陷有 100% 确定性复现路径（打开编辑 → 输入 → Cancel → 重开 → Save），与我的 CI 拆分无因果关系；`packed-consumers` 里的 `check:admin` 步骤本身未被我改动（我只删了 playground 的重复 build）。

**这不因重跑而消失**，重跑只能说明概率。修复需要框架层 `Show` / `ref` 语义决策（见 PR #252），不在本轮范围。

---

## 5. Remaining Issues

### 5.1 阻断项

1. **`check:admin` 空 PATCH 是真实产品缺陷**，不是 flake。它会周期性把 `packed-consumers` 判红。修复需在 `Show` 卸载重挂时明确"元素复用 vs 新建"与幂等初始化键（PR #252 有完整分析）。
2. **3B 缺一次无失败的完整 run** 来给出可比墙钟数字。当前只能声称最长 Job −39%。

### 5.2 未做的优化及理由

| 项                                         | 理由                                                                                                                                                     |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **zh-CN 语言包懒加载**（约 4–5 KB gzip）   | `setLocale` 在 catalog 缺失时异步，`locale()` 保持 `en` 直到加载完成 —— 中文用户会先看到英文再跳。这正是任务禁止的闪烁。同步加载才能避免，而那就等于不拆 |
| **更细的页面拆分**                         | `users-*.js` 的 71% 体积来自 WebC entry；再切只增加包装开销，已记录总量 +18.2% 的来源                                                                    |
| **`playground:smoke` 独立成更轻的 Job**    | 它零构建依赖（只读已提交的 `docs/public/playground`），可以只装 install + playwright。但会再加一份 50s Playwright 安装，收益需实测；记为下一步           |
| **Playwright 预装镜像**                    | 41s apt 是每 Job 固定成本，三 Job 即 123s。镜像能省掉但引入构建与 pin 风险                                                                               |
| **main 的 Native Matrix 跨 workflow 去重** | 已按你的决定撤回为 RFC。判错会移除发布物的唯一验证                                                                                                       |
| **Babel/WASM 编译链改写**                  | 任务明确禁止本轮动生产路径                                                                                                                               |

### 5.3 下一步建议

1. 先修 `Show` / `ref` 播种语义（PR #252 的确定性回归测试应先进 main，让缺陷稳定可见）。
2. 修好后重跑 3B，取一次完整 run 的墙钟数据，再判断是否继续拆 `browser-playground`。
3. DataGrid WebC entry（41,912 raw / 13,206 gzip，首次进 Users）是 Admin 侧真正的大头，属 WebC 打包器问题，影响所有消费者，应单独立项。
4. `impact-plan` artifact 上线后，用真实 run 把 3C 的场景 2–10 逐个补成端到端证据，不再依赖单测。

### 5.4 本轮未覆盖

- 3C 场景 2–10 未做端到端（本分支改 `.github/**` 必然全量）。
- Firefox / WebKit 的字节与 timing 未单独采，只在 Chromium 上测；分包图与引擎无关，timing 有关。
- `pnpm size:report:ci`、`pnpm lint` / `format-check` / `check` 的全仓版本未在本机完整复跑（只跑了改动文件与 `tsc --noEmit`）。
- 三个 PR 均未合并、未发布、未部署。
