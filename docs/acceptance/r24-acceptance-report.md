# R24 / R24.1 验收报告

生成时间：2026-11-23
**状态分为 VERIFIED / FAILED / BLOCKED / NOT_RUN。本地通过不等于 CI 通过，本文档分开记录。**

---

## 1. 仓库与 PR 状态

```
MAIN_SHA:          99996f4f46a774ec2856f2302f17bdffacdfbd47
PR_393:            OPEN   4a26cc49
PR_394:            OPEN   2940c434
本报告基于分支:      fix/r24-nested-binding-origin
```

PR #393 与 #394 **都未合并**。此前任何「已交付」的说法都不成立。

---

## 2. 根因：`window.__signals` 被后导入的模块覆盖

**VERIFIED。**

### 2.1 机制

fixture 顶层语句：

```js
const signals = (window.__signals = (() => { ... })())
```

它被**编译两次** —— 一次 SSR、一次 DOM —— 两份都执行这条赋值，**后导入的赢**。

### 2.2 对象身份对照

命令：`npx tsx temp/probe/signal-identity.ts`（chromium 157）

| 导入顺序 | `domSignals === ssrSignals` | `window.__signals` 指向 |
| -------- | --------------------------- | ----------------------- |
| DOM 先   | `false`                     | **SSR 的 signal**       |
| SSR 先   | `false`                     | **DOM 的 signal**       |

两个模块各自创建 signal（`false` 那一列），但全局只保留最后一个。
原 harness DOM 先导入 → 全局是 SSR 副本 → 树绑定 DOM 副本 → 写入无人接收。

### 2.3 反事实：失败随顺序翻转

命令：`npx tsx temp/probe/import-order.ts`

| 导入顺序 | `#child-label`            | Show 关闭           |
| -------- | ------------------------- | ------------------- |
| DOM 先   | `child label`（**失败**） | `false`（**失败**） |
| SSR 先   | `UPDATED`（成功）         | `true`（成功）      |

同一份 HTML、同一套运行时、只换两行 import —— 这是因果判据，
不是相关性。

### 2.4 为什么 R24 早期判断错了

早期结论是「七种驱动方式全部通过，因此运行时正确」。那些对照用的 fixture
写的是 `window.__state` / `window.__probeSignals`，或者只导入一份模块 ——
**都没有复现「两份模块争同一全局名」这个条件**。对照组与失败组测的不是同一件事，
它的「通过」不能作为证据。

---

## 3. 修复

| 位置                                           | 改动                                                              |
| ---------------------------------------------- | ----------------------------------------------------------------- |
| `check-nested-hydration-browser.ts` 的 fixture | `window.__signals = …` → `export const signals = …`               |
| `fixtures/nested-hydration-harness.js`         | 显式 `import { signals }`，暴露 `controls` / `ssrControls`        |
| 同上                                           | `assertControlsBound()`，错误码 `CONTROL_SIGNAL_NOT_BOUND_TO_DOM` |
| 检查的写入点                                   | `window.__signals.*` → `window.__harness.controls.*`              |

`CONTROL_SIGNAL_NOT_BOUND_TO_DOM` 仅用于测试诊断，**没有新增运行时公共 API**。

### 3.1 一个被修错的断言

`closing a grandchild branch` 原本断言「存活 scope 数下降」。实测：

```
before: 3 created / 0 disposed   （净 3）
after : 4 created / 1 disposed   （净 3）
```

关闭分支**确实**释放了一个 scope，但重建兄弟内容时又开了一个，净数不变。
改为断言 `scopesDisposed` 增长。原断言会被补偿性创建抵消 ——
**既能误报泄漏，也能掩盖真泄漏**。

---

## 4. 结果

| 检查                              | 本地（chromium 157）                       | CI    |
| --------------------------------- | ------------------------------------------ | ----- |
| `check:nested-hydration-browser`  | **7/7 通过**                               | 见 §9 |
| `check:nested-binding-browser`    | **4/4 通过**                               | 见 §9 |
| 导入顺序 DOM 先                   | 通过                                       | 同上  |
| 导入顺序 SSR 先                   | 通过                                       | 同上  |
| 反事实（`controls = ssrSignals`） | 失败，报 `CONTROL_SIGNAL_NOT_BOUND_TO_DOM` | —     |

**Firefox / WebKit：NOT_RUN（本地无 Playwright 引擎）。** 两个检查已加入
`browser-runtime` job，三引擎由 CI 覆盖。在 CI 实际跑过之前，本条不得写成已验证。

---

## 5. Node SSR → Browser 闭环（TASK 09–13）

命令：`pnpm check:node-ssr-consumer`（需要先 `pnpm check:create-zeus-candidate:prepare`）

**本地 VERIFIED，4/4：**

| 步骤                                                               | 结果 |
| ------------------------------------------------------------------ | ---- |
| 从候选 tarball 安装                                                | 通过 |
| 独立 Node 进程渲染 SSR（断言无 `window`/`document`/`HTMLElement`） | 通过 |
| 浏览器 hydrate 该 HTML                                             | 通过 |
| signal 更新、Show 开关、dispose                                    | 通过 |

仓库外安装过程中撞到四个问题，都不是工作区内能看到的：

1. 编译器在输出里保留 TypeScript 标注，直接加载需要擦除（用 esbuild，不用正则——
   正则处理不了带花括号的 prop 类型）
2. `require.resolve` 走 `require` 条件，落在 `index.cjs`，浏览器无法加载；
   必须手工从 exports map 取 `import` 项，包括嵌套的 `{node, default}`
3. 裸名的 import map 条目不覆盖 `@zeus-js/signal/internal`；缺了页面 404，
   表现为无错误的超时
4. 跟随 `import` 里的 `node` 分支会指回 `.cjs`；把 `internal.js` 单独服务会产生
   `Detected cycle while resolving name 'batch'`

---

## 6. 其它已完成项（本地）

| 检查                                  | 本地结果                                         | 说明                                                           |
| ------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------- |
| `check:ssr-marker-matrix`             | **35/35**，10 种形状                             | 反事实：把位置标记当区域标记 → 15 项失败                       |
| `check:hydration-cycles-browser`      | **3/3**，50 轮                                   | 反事实：去掉 dispose → `effectsCreated: 4, effectsDisposed: 1` |
| `hydration-region-boundaries.spec.ts` | **5/5**                                          | 反事实：跨父搜索 close marker → 被抓                           |
| `check:compiler-parity`               | **20/20**，5 fixture                             | 语义比较（键序不算差异）                                       |
| `check:native-install`                | PASS / REGISTRY_MISSING / NOT_INSTALLED 三态实测 | 10 项单测                                                      |
| `impact-analysis.spec.ts`             | **32/32**                                        | 反事实：重命名 `browser-runtime` → 3 项失败                    |

全部为**本地**结果。只有 CI 实际跑过才能标记 `CI_VERIFIED`。

---

## 7. 发布状态（与产品验收分开）

| 项                  | 状态                                 | 说明                                                          |
| ------------------- | ------------------------------------ | ------------------------------------------------------------- |
| 真实 Registry       | **7/32**（`0.2.0-rc.3`）             | 只读审计                                                      |
| 框架本体            | **0/5**                              | `shared`/`signal`/`runtime-dom`/`runtime-ssr`/`zeus` 均未发布 |
| 隔离 Registry 32/32 | VERIFIED（PR #393）                  | 隔离环境，非生产                                              |
| Native Install      | 依赖 npm 版本，见下                  |                                                               |
| Provenance          | **NOT_TESTED**                       | 未查询                                                        |
| Dist-tags           | **15 个包 `latest` 指向预发布**      | `repair:latest-tags --check` 退出 1                           |
| Release Canary      | 修复 PR #384/#386 已合并，**未复验** |                                                               |
| Core/UI Pairing     | NOT_RUN                              |                                                               |

**没有执行任何真实 publish、dist-tag 写入或 provenance 关闭。**

npm 兼容性：`npm 10.9.0` 丢弃整个 optional 组（`NOT_INSTALLED`），
`npm 11.13.0` 正常。`Node 22.18` 自带 npm 10.9.3，而 `engines` 声明
`^22.18.0` —— **按 engines 办事的用户装不出 native binding**。这是独立的发布决策。

---

## 8. 未完成与阻塞

| 项                          | 状态         | 原因                       |
| --------------------------- | ------------ | -------------------------- |
| Firefox / WebKit 真实运行   | NOT_RUN      | 本机无 Playwright 引擎     |
| `test/r24-vite-show-branch` | **BLOCKED**  | 分支切换时改动丢失，需重做 |
| TASK 14 兼容矩阵            | NOT_RUN      | 需多 Node 版本环境         |
| TASK 15 独立消费者 CI Gate  | NOT_RUN      | 依赖 TASK 14               |
| TASK 17 #394 去重           | BLOCKED      | 需先合并 #393，属发布决策  |
| TASK 23 发布证据            | 只读部分完成 | provenance / pairing 未查  |

---

## 9. CI

| Run         | SHA        | 结果       |
| ----------- | ---------- | ---------- |
| 45108452461 | `2940c434` | 见 PR 页面 |
| 45108452291 | `2940c434` | 见 PR 页面 |

#394 之前的 run `45049098126` 为 SUCCESS，但**不含**本轮修复与新增检查。
本报告不把它的绿色当作本轮结论。

---

## 10. 判定

```
BETA_READY: NO
```

理由：真实 Registry 的框架本体 0/5，dist-tag 污染 15 个包，provenance 未验证，
三引擎结果未取。Hydration 侧的根因已定位并修复，但那是产品正确性的一小块，
不是发布就绪。

**REMAINING_P0**

1. 在 CI 上确认三引擎结果（本轮的修复依赖它）
2. 真实 Registry 的 25 个未发布包（属发布决策，需授权）
3. `latest` 修复（需授权）
4. provenance 查询
