# R24 / R24.1 验收报告

生成时间：2026-11-23
**状态分为 VERIFIED / FAILED / BLOCKED / NOT_RUN。本地通过不等于 CI 通过，本文档分开记录。**

---

## 1. 仓库与 PR 状态

```
MAIN_SHA:          7fae28ae   （#396 → #393 → #397 已合并；详见 §1.2）
PR_393:            MERGED 9d483c0e
PR_397:            MERGED 7fae28ae   （native 四态判定，原 fix/r24-native-status）
PR_394:            OPEN   待合并（rebase 到 7fae28ae，见 §9）
本报告基于分支:      fix/r24-nested-binding-origin
```

#393、#397 已合并，#394 待合并。

### 1.2 合并记录

| PR   | 合并提交   | 方式   | 说明                                         |
| ---- | ---------- | ------ | -------------------------------------------- |
| #396 | `c5d6785e` | squash | 根治理目录并入 `meta/`（他人提交，本轮前置） |
| #393 | `9d483c0e` | squash | 隔离 registry 32 包演练 + 交付判定           |
| #397 | `7fae28ae` | squash | native 安装检查四态判定                      |

**合并前核对**（GitHub 的 `CLEAN` 只表示无文本冲突）：

- 三个 PR 都基于 `99996f4f`，而 main 已前进到 `c5d6785e`；逐个做了
  `git merge-tree` 冲突测试，均为 NO CONFLICT。
- #396 把 `release-pairing/`、`release-policy/`、`tests/` 移到 `meta/`。
  文本合并看不出来，所以单独核查了三个分支里有没有指向旧路径的新增行 ——
  均无。
- #397 只改自身三个文件，不引用被移动的路径。

**TASK 17（#394 去重）已执行**：rebase 到新 main 后，git 自动
`skipped previously applied commit 4a26cc49`，#393 那条提交从栈里消失；
已确认 `run-release-group-drill.ts` / `delivery-readiness.ts` 不再出现在
#394 的新增文件列表里（它们经 main 存在）。`--force-with-lease` 推送，
22 个文件、4537 行（rebase 前 25 文件，差的 3 个正是 #393 的）。

### 1.1 PR #393 复核（TASK 16）

| 项                 | 结论                                                                                   |
| ------------------ | -------------------------------------------------------------------------------------- |
| 变更面             | 5 个文件、1029 行，全是新增：drill、delivery-readiness、其单测、文档、一行 script 注册 |
| 32/32              | VERIFIED（隔离 Verdaccio，非生产）                                                     |
| 框架 5/5           | VERIFIED（同一演练）                                                                   |
| 消费者安装         | VERIFIED（从该 registry 装 `@zeus-js/zeus` 并加载运行时）                              |
| 真实 registry 写入 | **无**。全部 `--registry` 指向 `127.0.0.1`；唯一 `dist-tags` 用法是 `npm view`（只读） |
| provenance         | 演练内 `--provenance=false`，属演练限制，**不等于**关闭发布 provenance                 |
| 合并               | **未合并**，等发布决策                                                                 |

这项复核只确认「该 PR 不触碰真实环境」，不构成发布授权。

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

| 检查                              | 本地（chromium 157）                       | CI `browser-runtime`（3 引擎） |
| --------------------------------- | ------------------------------------------ | ------------------------------ |
| `check:nested-hydration-browser`  | **7/7 通过**                               | **3/3 引擎通过**（见 §9）      |
| `check:nested-binding-browser`    | **4/4 通过**                               | **3/3 引擎通过**（见 §9）      |
| 导入顺序 DOM 先                   | 通过                                       | 同上                           |
| 导入顺序 SSR 先                   | 通过                                       | 同上                           |
| 反事实（`controls = ssrSignals`） | 失败，报 `CONTROL_SIGNAL_NOT_BOUND_TO_DOM` | —                              |

**三引擎已在 CI 实际跑过**（run `45110152226`，job `browser-runtime`，
head `2940c434`）：

```
Nested hydration:        chromium 156.0.8078.4 PASSED / firefox 157.0 PASSED / webkit 27.2 PASSED
Nested binding control:  chromium 156.0.8078.4 PASSED / firefox 157.0 PASSED / webkit 27.2 PASSED
```

Chromium/Firefox/WebKit 各自 7 项与 4 项断言全过，这是一条 **CI_VERIFIED**。
本地仍然只有 chromium，Firefox/WebKit 未在本地安装 —— 本地与 CI 的差别就
在这里，不是结论的差别。

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

### 6.1 Node/npm 矩阵（TASK 14）

命令：`pnpm check:node-compat-matrix`。每行两组数据，**故意分开**：

| Node / npm       | 伞包（只装 `zeus`）   | 逐包安装 | 渲染 |
| ---------------- | --------------------- | -------- | ---- |
| v24.18.0 / 11.16 | `ETARGET`（机制问题） | ok       | ok   |
| v24.16.0 / 11.13 | `ETARGET`             | ok       | ok   |
| v22.12.0 / 10.9  | `ETARGET`             | ok       | ok   |
| v20.19.0 / 10.8  | `ETARGET`             | ok       | ok   |

四行的伞包列都是 `ETARGET`，这是**候选 tarball 机制**的属性而非 npm：
`@zeus-js/zeus` 的 `dependencies` 指向 registry 上的 `0.2.0-rc.3`，
只有 tarball 的 registry 满足不了。R22 测到的 npm major 差异需要 registry 上
**有部分包**才复现，所以那是隔离演练的题目，不是这张表。

有用的是第二列：逐包安装时四个组合全部安装并渲染成功，
**框架本身没有排除任何一组**。npm 10 丢弃 optional 整组的问题仍然存在
（见 §7），但它影响的是伞包路径，不是框架能力。

### 6.2 一个被修掉的挂死缺陷（本轮新发现）

`check:node-ssr-consumer` 在 CI 的 `packed-consumers` job 里挂了 **26 分 30 秒**，
只打出一行 404 就被 job 超时杀掉，`ci-gate` 因此判失败（run `45110152226`）。

根因不是浏览器、也不是资源缺失，而是**资源生命周期**：`browser.close()`
从未被调用，`server.close()` 只在成功路径上。任何失败或 BLOCKED 都会留下
一个活着的 HTTP server 和一个活着的浏览器进程，事件循环永远不空 ——
于是进程既不退出也不报错。

修复三处：

1. `browser` / `server` / `page` 提到模块作用域，`finally` 里逐一关闭；
2. 整个检查加 **120 秒看门狗**，超时打印已完成步骤并 `process.exit(1)`；
   用 `exit` 而不是 `exitCode`，因为要能离开一个被 socket 卡住的事件循环；
3. 请求记录改为存进 report，只打印非 favicon 的 4xx/5xx。

反事实验证：注入一个永不 resolve 的 `await` 后，看门狗在第 17 秒触发、
`EXIT=1`，并打印 `Steps completed: install ... -> a separate Node process renders ...`。
恢复后 6 秒通过、`EXIT=0`。

---

### 6.4 第二个检查也曾靠导入顺序通过（本轮新发现，已修）

`check:nested-binding-browser` 是 `check:nested-hydration-browser` 的对照组，
它自己的 fixture 却重新写回了刚被修掉的那个模式：

```js
const signals = (window.__probeSignals = (() => { … })())
```

同样编译两份、同样各自执行赋值。页面里 SSR 模块先加载、客户端模块后加载，
所以全局**恰好**指向客户端副本 —— 检查通过靠的是两行 import 的相对位置。

**反事实**：只交换那两行 import，`PASSED` → `FAILED`，被测代码一字未改。

已改为导出 + 显式导入 + `CONTROL_SIGNAL_NOT_BOUND_TO_DOM` 守卫。
三种验证：默认顺序通过、反向顺序通过、把控件指向 SSR 副本则带该错误码失败。

**这解释了为什么它是最后一个才发现的位置**：它是「对照组」，
在别的检查失败时被用来证明「运行时没问题」。一个靠运气通过的对照，
会把真实的缺陷判成「只在某一种驱动方式下出现」。

### 6.3 Vite 消费者无法开启 Hydration（本轮新发现，已修）

把 R24 的形状（Show + 嵌套组件 + Hydration）第一次放进**真实 Vite 构建**后，
发现一个产品缺陷：

编译器的 `auto_hydrate` 默认是 `false`（`options.auto_hydrate.unwrap_or(false)`），
而 **Vite 插件从不传这个参数**。因此任何经 Vite 编译的组件都没有 root 标记、
也没有 adoption 调用，`render(..., { hydrate: true })` 必然报：

```
ZEUS_HYDRATION_NO_ADOPTION: no compiled component adopted the server markup
```

而这段 markup 正是同一份源码为 SSR 产出的 —— 看起来像运行时缺陷，
实际是构建开关缺失。

**之前为什么没发现**：所有直接编译的检查自己传了 `autoHydrate: true`；
走插件的检查（`check:vite-dev-consumer` / `check:vite-prod-consumer`）都只做
纯客户端渲染，从不 hydration。两条路径都没覆盖这个组合。

修复：`ZeusNativeCompilerOptions.autoHydrate`，同时作用于客户端与 SSR 变换
（标记必须两边一致，暴露成 per-target 开关就等于允许设错），并进入编译器缓存键。

新检查 `check:vite-show-branch-consumer` 端到端覆盖：从候选 tarball 安装 →
构建 → 独立 Node 进程渲染同一源码 → 用构建产物 hydrate 该 HTML → 写 signal →
关闭并重开 Show。**5/5 步，9 秒。**

两个断言值得点名：

- Show 分支内的 `leaf` **不要求**保持节点同一性 —— 动态区域内部按设计禁用
  adoption。初版断言正是写反了，断言了被文档化掉的行为。分支要求的是
  **内容**来自服务端；分支外的节点才要求同一性。
- 反事实是重点：去掉 `autoHydrate: true`，检查以
  `ZEUS_HYDRATION_NO_ADOPTION` 失败。缺陷被钉住了。

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

| 项                          | 状态         | 原因                                                                                   |
| --------------------------- | ------------ | -------------------------------------------------------------------------------------- |
| Firefox / WebKit 本地运行   | NOT_RUN      | 本机无 Playwright 引擎；CI 已覆盖，见 §4                                               |
| `test/r24-vite-show-branch` | **已关闭**   | 与 main 无差异，分支已删除；覆盖面由 `check:vite-show-branch-consumer` 取代（见 §6.3） |
| TASK 17 #394 去重           | BLOCKED      | 需先合并 #393，属发布决策                                                              |
| TASK 19 去重审计            | **完成**     | 见 [`r24-dedup-audit.md`](r24-dedup-audit.md)；删 1 处重复键、修 1 处 fixture          |
| TASK 23 发布证据            | 只读部分完成 | provenance / pairing 未查                                                              |

TASK 14 兼容矩阵与 TASK 15 消费者 Gate 在 R24.1 中已完成，见 §6.1。

---

## 9. CI

| Run             | SHA            | 结果                                                                                                                      |
| --------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **45122096564** | **`9356ac93`** | **SUCCESS — 26 通过 / 4 跳过 / 0 失败，`ci-gate` success。本轮首次让完整 CI 在含全部修复的 HEAD 上跑通**                  |
| 45110152226     | `2940c434`     | `browser-runtime` SUCCESS（两检查 3/3 引擎）；`ci-gate` FAIL，因 `packed-consumers` 被 `check:node-ssr-consumer` 挂死超时 |
| 45108452461     | `2940c434`     | 见 PR 页面                                                                                                                |
| 45108452291     | `2940c434`     | 见 PR 页面                                                                                                                |

`45110152226` 的失败**不是** Hydration 修复的失败：`browser-runtime` 里
两个检查三引擎全过。失败的是我新加步骤的生命周期缺陷，已在 §6.2 修复。

**`9356ac93` 的绿色是本轮结论。** 该 HEAD 上实际跑过的、本轮新增的步骤：

| job                | 步骤                                    | 结果    |
| ------------------ | --------------------------------------- | ------- |
| `packed-consumers` | Node SSR to browser hydration           | success |
| `packed-consumers` | Vite build with a Show branch, hydrated | success |
| `packed-consumers` | Node and npm compatibility matrix       | success |
| `browser-runtime`  | Nested hydration（三引擎）              | success |
| `browser-runtime`  | Nested binding control（三引擎）        | success |
| `browser-runtime`  | SSR hydration marker matrix             | success |
| `browser-runtime`  | Hydration cycles（三引擎）              | success |
| `rust-compiler`    | Native and WASM compiler output agree   | success |

中途 `27874af` 上 `build` 曾失败，原因是加公共选项未同步
`docs/api/snapshots`（`pnpm api:check`）；已用 `pnpm api:snapshot` 重新生成，
只有 `vite-plugin.main.api.md` 变化 17 行 —— 变更面与声称的一致。

#394 之前的 run `45049098126` 为 SUCCESS，但**不含**本轮修复与新增检查。
本报告不把它的绿色当作本轮结论。

---

## 10. 判定

```
BETA_READY: NO
```

理由：真实 Registry 的框架本体 0/5，dist-tag 污染 15 个包，provenance 未验证。
Hydration 侧根因已定位并修复，三引擎 CI 已验证；但那是产品正确性的一小块，
不是发布就绪。

**REMAINING_P0**

1. 真实 Registry 的 25 个未发布包（属发布决策，需授权）
2. `latest` 修复（需授权）
3. provenance 查询
4. TASK 17：合并 #393 后去掉 #394 栈里的那条提交（需先合并）
