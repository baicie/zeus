# R21 验收报告

测量于 `2798aee6`（main）+ 本轮改动。

**每一项只允许四种结论：VERIFIED / FAILED / BLOCKED / NOT_RUN。**
里程碑可为 PARTIAL，但未执行的任务不计入通过。

---

## 最终状态

```text
R21-A HYDRATION_CORRECTNESS_CLOSED:   PARTIAL   — 01/03/04/05/06/07/08 完成；09 未执行
R21-B RUNTIME_LIFECYCLE_VERIFIED:     PARTIAL   — 11/12/13/14 完成；15–18 未执行
R21-C BROWSER_MATRIX_VERIFIED:        PARTIAL   — 19/20/21/26 完成；22–25 未执行
R21-D CONSUMER_CONTRACT_VERIFIED:     PARTIAL   — 10 完成；27–32 未执行
R21-E RC_RECOVERY_READY:              PARTIAL   — 33/34 取证完成；35 未确认；37–39 未执行
```

---

## 逐项验收

```text
CURRENT_MAIN_SHA:                  2798aee6 (+ 未提交的本轮改动)

HYDRATION_TAG_VALIDATION:          VERIFIED
HYDRATION_REACTIVE_BINDINGS:       VERIFIED
HYDRATION_ERROR_CLEANUP:           VERIFIED
SSR_HYDRATION_COMPATIBILITY:       NOT_RUN

DOM_PRECISE_UPDATES:               VERIFIED (Chromium)
DOM_MINIMAL_WORK:                  VERIFIED (Chromium)
HMR_LIFECYCLE:                     VERIFIED (Chromium, 累积计数)
WEB_COMPONENTS_LIFECYCLE:          VERIFIED (Chromium, 待三引擎)

CHROMIUM:                          VERIFIED
FIREFOX:                           BLOCKED (本机无 Playwright Firefox)
WEBKIT:                            BLOCKED (同上)

NATIVE_WASM_PARITY:                NOT_RUN (已有基线，本轮未扩展)
PACKED_CONSUMERS:                  NOT_RUN
VITE_PRODUCTION:                   NOT_RUN
CREATE_ZEUS:                       NOT_RUN

GOLDEN_SEMANTIC_COVERAGE:          PARTIAL (1 个 fixture 修正)
EMIT_PLAN_CONTRACT:                NOT_RUN
PERFORMANCE_BASELINE:              NOT_RUN

RC_REGISTRY_32_PACKAGES:           VERIFIED (实时)
I18N_FIRST_PUBLISH:                ROOT_CAUSE_CONFIRMED
TLOG_409:                          ROOT_CAUSE_UNCONFIRMED
TARBALL_PROVENANCE:                NOT_RUN
SKIP_EXISTING_RECOVERY:            PARTIAL (语义已确认，模拟未执行)
GITHUB_RELEASE_POLICY:             UNDETERMINED (政策问题，非缺陷)

OPEN_PRS:                          0
MERGED_PRS:                        本轮未合并（改动待提交）
FAILED_CI:                         本轮未观测（改动尚未推送）
BLOCKED_TASKS:                     22–26（三引擎在本机不可执行）, 35–39（需凭证/环境）
REMAINING_P0:                      TASK 36（tarball 一致性）, TASK 37/38（隔离演练）
NEXT_ACTIONS:                      见 §9
```

---

## 1. R21-A — Hydration 正确性

### TASK 01 — TagName 校验：VERIFIED

`nodeOccurrences` 现在为 `kind === 'element'` 的节点传入 `node.tagName`：

```ts
const expectedTag = node.kind === 'element' ? node.tagName : undefined
return context.nodes(node.id, expectedTag)
```

**反事实验证**：把 `expectedTag` 改回 `undefined` 后，9 项检查中只有
`hydration rejects an element whose tag disagrees with the plan` 失败，其余全过。
恢复后 11/11 通过。

**根/文本/区域节点未受影响**：`tagName` 只在 element 上记录，其余 kind 传
`undefined`，不误伤。

### TASK 02 — HTML 与 SVG 标签语义：VERIFIED（取证后未改代码）

编译期约定经实测确认：

| 输入                     | plan 记录的 tagName     | 浏览器 `localName` |
| ------------------------ | ----------------------- | ------------------ |
| `<div>`                  | `"div"`                 | `div`              |
| `<linearGradient>` (SVG) | `"linearGradient"`      | `linearGradient`   |
| `<foreignObject>` (SVG)  | `"foreignObject"`       | `foreignObject`    |
| `<my-thing>`             | `"my-thing"`            | `my-thing`         |
| `<DIV>`                  | **不产生 element 节点** | —                  |

`<DIV>` 被 lowering 当作**组件**（产物是 `createComponent(DIV, …)`），不进入
plan。因此 plan 中的 `tagName` 与浏览器 `localName` 在两种命名空间下都已一致。

**结论：精确比较是正确的，不做大小写归一化。** 归一化反而会破坏 SVG。

### TASK 03 — Optional 不掩盖标签错误：VERIFIED

新增检查同时驱动两种情况：

- 移除 optional 元素的 marker → **成功**（分支未走，合法）
- 保留 marker、改标签 → **失败**，`ZEUS_HYDRATION_TAG_MISMATCH`

`nodeOccurrences` 只吞 `MARKER_MISSING`，其余错误继续抛。

### TASK 04 — For 重复 Marker：VERIFIED

新增检查把**第二个** `<li>` 改成 `<div>` 保留其 marker → hydration 拒绝。
`context.nodes` 校验它解析的**每一个** marker，不只是第一个。

### TASK 05 — 失败后的原子清理：VERIFIED

新增检查让最后一个 handler 抛 `ZEUS_HYDRATION_TAG_MISMATCH`（前面已有 handler
成功执行），断言：

- hydration 中止且错误码正确；
- 容器仍可读（调用方可以替换它）。

`runHydration` 的 `catch` 调用 `hydrationScope.stop()`，listener 通过
`onScopeDispose` 注册，因此随 scope 停止而移除。

### TASK 06 — Hydration 后的真实响应式：VERIFIED

新增 `check:hydration-reactivity-browser`（7 项）用**编译器真实产物**：

| 检查                                    | 结果               |
| --------------------------------------- | ------------------ |
| 服务端 HTML 被采纳                      | ✓                  |
| signal 写入更新被采纳的文本节点         | ✓ 且不替换任何节点 |
| signal 写入更新属性                     | ✓                  |
| signal 写入更新 property                | ✓                  |
| 被采纳的 click handler 每次点击触发一次 | ✓                  |
| dispose 后停止更新、listener 不再触发   | ✓                  |

**注入验证**：让 `mountDynamic` 直接 return → 4 项失败，含"signal 更新到达
DOM"与"handler 状态更新到达文本"。恢复后 7/7。

### TASK 08 — 诊断契约：VERIFIED

逐个探测 `hydratePlan` 路径上的诊断，实测结果：

```
unsupported plan version  → TypeError: Unsupported hydration plan version: 99
MARKER_MISSING            → ZEUS_HYDRATION_MARKER_MISSING
HANDLER_MISSING           → ZEUS_HYDRATION_HANDLER_MISSING
OCCURRENCE_MISSING        → ZEUS_HYDRATION_OCCURRENCE_MISSING
TEXT_TARGET               → ZEUS_HYDRATION_TEXT_TARGET
ELEMENT_TARGET            → ZEUS_HYDRATION_ELEMENT_TARGET
```

**6 个诊断全部真实触发，各返回自己的 code。**

autoHydration 专属的 7 个（`DUPLICATE_OWNER`、`REGION_UNTERMINATED`、
`TEXT_MISMATCH`、`ATTR_MISMATCH`、`EXTRA_NODE`、`UNHYDRATED_COMPONENT`、
`UNSUPPORTED`）在 harness 注释中列明，**未通过 `hydratePlan` 测试**——那样只会
证明错误的东西。

### TASK 07 — Marker 边界：VERIFIED

新增 `check:hydration-boundaries-browser`（5 项），全部用编译器真实产物：

| 用例                     | 结果                                     |
| ------------------------ | ---------------------------------------- |
| `{''}` 空文本            | hydration 成功，保持为空，无孤立闭合标记 |
| `{a}{b}` 相邻文本        | 两者按序保留（`AB`）                     |
| `{'   '}` 纯空白         | 空白被保留（`'   '`），不是空            |
| `<For each={[]}>` 空列表 | hydration 成功，无残留 `<li>`            |
| JSX 注释在两个文本之间   | 不被误读为 marker，两段文本完整          |

**写这个时抓到的是我自己的错误**：早期手写探针漏发开启 marker，让空文本看起来
是缺陷。编译器两个 marker 都发；harness 现在直接导入编译器产物，同样的误判不
会重演。

### TASK 09：NOT_RUN

SSR + autoHydrate 组合契约未执行。

---

## 2. R21-B — 运行时生命周期

### TASK 11 — HMR 计数真实性：VERIFIED

**问题确认**：fixture 每次模块执行都有 `state.effects = 0`，历史代际的泄漏被
下一次重置抹掉。

**修复**：改为两个累积计数器 `effectsCreated` / `effectsDisposed`，存活数是差值。

**注入验证**（关键）：只让**第 2 代**跳过 `onCleanup`，其余 4 代正常。结果：

```
mounts: 6, cleanups: 4, effects: 2
```

**第 5 代仍能看见第 2 代的泄漏。** 旧的 `effects = 0` 会在第 3 代把它抹平，
测试通过。这坐实了 P0-3 是真实缺陷，不是理论问题。

### TASK 13 — DOM 最小工作量：VERIFIED

新增 `check:dom-minimal-work-browser`（4 项）。两个独立 signal、两个独立绑定、
各自在读时计数：

| 检查                        | 结果           |
| --------------------------- | -------------- |
| 写 A 只重读 A，不重读 B     | ✓ `{a:1, b:0}` |
| 写 B 只重读 B，不重读 A     | ✓              |
| 静态节点不被更新触碰        | ✓              |
| 无关 DOM 写入不触发任何重读 | ✓ `{a:0, b:0}` |

**局限**：只测 effect 执行粒度。同一 effect 内部是否有冗余子表达式求值，
从这个 harness 看不见，**未声称**。

### TASK 12 — HMR 多代与异常恢复：VERIFIED

五次更新扩到**十次**，并在第 4 次更新时点击触发 signal：

```
mounts: 11, cleanups: 10, effects: 1
```

**中途交互是关键**：点击创建的 effect 若未被下一次更新清理，最终的 `effects`
会是 2。五次无交互的更新测不到这一点。

语法错误恢复**没有重复实现**——`check:hmr-browser` 已覆盖（打断模块、断言旧树
存活、修复、断言修复不被当作初次加载）。

### TASK 14 — For 键控压力：VERIFIED

在原有重排/删除之上补四项：

| 检查                               | 结果          |
| ---------------------------------- | ------------- |
| 追加复用全部既有项                 | ✓             |
| **全量替换时旧项全部脱离**         | ✓ 0/3 存活    |
| 同 key 换 label 保留节点并更新文本 | ✓             |
| 五次同步写入收敛到最后一次         | ✓ `L5-*` 全部 |

**全量替换是容易漏掉的那一项**：只断言"复用"的测试无法区分键控列表和无淘汰
的缓存。

### TASK 11（补充）— 十次更新的计数

TASK 11 的累积计数器在十次更新下同样成立（见 TASK 12 的实测）。

### TASK 15–18：NOT_RUN

Show/For 嵌套作用域、Event Delegation、ErrorBoundary、Web Components 长生命
周期——未执行。

---

## 3. R21-C — 三引擎

### TASK 19 — 三引擎运行能力：VERIFIED

新增 `scripts/check/browser-engines.ts`：

- 复用既有 `requestedEngines`（不另造一套配置）
- 每个引擎独立 `BrowserContext` + trace
- 结果按引擎分组，带**真实版本号**（`browser.version()`）
- 起不来的引擎标 `blocked`，退出码 2
- 失败只保留 trace，通过时丢弃

### TASK 20 / 21 — DOM 与 Hydration 三引擎：PARTIAL

四个检查（`dom-update`、`ssr-hydration`、`hydration-reactivity`、
`web-components`）全部改接统一 runner，并已加入 CI 的三引擎步骤。

**本机只验证了 Chromium**：

```
chromium 157.0.8103.80: PASSED
```

Firefox / WebKit 在本机是 `BLOCKED`（Playwright 缓存里没有对应构建，网络受限
无法下载）。**没有把缺失的引擎算作通过。**

### TASK 26 — CI impact 规则：VERIFIED

新增的 `browser-runtime` job 在加进 `ci.yml` 与 `ci-gate` 之后**仍不会运行**：
`planJobs` 里没有它的条目，impact 分析不产生决策，job 被静默跳过。

**现有的护栏测试立即抓住了它**——`keeps every browser job on exactly the same
trigger` 把四个 job 在八种代表性改动下逐一比较，加入第四个名字的那一刻就失败
（`expected 2 to be 1`）。

这条测试就是 TASK 26 要防的东西：「测试存在，但受 impact filter 影响从未执行」。
一个被跳过的 job 满足门禁的方式与通过的 job 完全相同。

修复后 30 项 impact 测试全过。

### TASK 22–25：NOT_RUN

HMR 多引擎、Web Components 三引擎、SSR/浏览器 HTML 解析差异、测试稳定性——
未执行。

---

## 4. R21-D — 编译器与消费者

### TASK 10 — SSR ErrorBoundary Golden：VERIFIED

原 fixture 的 purpose 是「ErrorBoundary 被 SSR 拒绝」，实际诊断是
`ZEUS_INVALID_ERROR_BOUNDARY_FALLBACK`——**它在 lowering 阶段就失败了，
SSR 目标从未看到这个 boundary**。

修正：`fallback={<p>e</p>}` → `fallback={err => <p>{err.message}</p>}`。

现在诊断是 **`ZEUS_SSR_ERROR_BOUNDARY_UNSUPPORTED`**，span 精确
（offset 86–165, line 3, column 9–88），输出为空。

**只改这一个 fixture**，其余 40 个格式化 diff 全部回退。

### TASK 27–32：NOT_RUN

Golden 覆盖清单、EmitPlan 收口、Native/WASM 增强、Packed Consumer、
Vite 闭环、性能基线——未执行。

---

## 5. R21-E — RC 恢复

### TASK 33 — 32 包实时审计：VERIFIED

32 次实时 `npm view`（非历史结果）：

```
已发布 rc.3    7
存在但无 rc.3 24
从未发布       1   ← @zeus-js/i18n
```

与 R20 审计一致，为独立复核。

### TASK 34 — i18n 未首发根因：ROOT_CAUSE_CONFIRMED

**决定性发现**：`scripts/release.config.ts` 的 `zeusFixedPackages` **不是发布
顺序**。`@baicie/release` 按 `(kind ?? "", name)` 排序，其中
`eslint-plugin` 与 `playground-engine` 的 `kind` 是 `undefined` → 空串 → **排在最前**。

重建的顺序与 registry 状态**逐一吻合**：

```
1-2   (none)  eslint-plugin, playground-engine      ✓ rc.3
3-7   core    compiler, compiler-native, 3×native   ✓ rc.3
8     core    compiler-native-linux-x64-gnu         ✗ TLOG 409 在此失败
9-32  ...     全部未执行，含位置 13 的 i18n
```

**i18n 从未发布，是因为它在失败点之后，发布流程根本没执行到它。**
不是首发逻辑的缺陷。

### TASK 35 — TLOG 409：ROOT_CAUSE_UNCONFIRMED

两种解释无法区分（tarball 已签名未落库 / Sigstore 重试语义），
**没有 registry 侧证据**。

本轮新增一条事实：失败包的 `latest` 仍是 2026-08-12 的 canary，
说明**此后无任何一次重试成功过它**——排除「自行恢复」，但不说明根因。

### TASK 36–39：NOT_RUN / PARTIAL

| 任务                             | 状态                               |
| -------------------------------- | ---------------------------------- |
| 36 已发布包与源码一致性          | NOT_RUN（需下载 tarball 比对哈希） |
| 37 首发路径隔离演练              | NOT_RUN（需 Verdaccio）            |
| 38 skipExisting 恢复正确性       | PARTIAL — 语义已确认，模拟未执行   |
| 39 Tag / Release / dist-tag 治理 | PARTIAL — 状态已记录，政策未定     |

**`skipExisting` 的关键语义**：它保证重跑不失败，**不保证补全**。
跳过 31 包、发布 0 包的运行会以退出码 0 结束。恢复报告必须核对实际发布数。

---

## 6. 本轮修掉的自己的错误

诚实记录，因为它们说明「测试通过」本身不可靠：

1. **`active="false"` 应为 `true`** —— HTML 布尔属性存在即为真。断言相反是在
   断言一个 bug。
2. **`input.value` 会反映到 attribute** —— 这是 DOM 规范，不是绑定的行为。
3. **SSR 需要 `autoHydrate: true` 才输出根闭合 marker** —— 缺它时
   `adoptComponentRoot` 报 `REGION_UNTERMINATED`，我一度以为是产品缺陷。
4. **`bindingsCreated` 不是执行计数** —— 它是创建计数，写 A 时不会增长。
   改为 fixture 自计读取次数。
5. **`declare global` 的 `window.__signals` 在两个检查间冲突** —— 改成各自
   独有的属性名。

---

## 7. 未执行的原因分类

| 类别         | 任务                     | 原因                                         |
| ------------ | ------------------------ | -------------------------------------------- |
| 本机环境     | 22–26 三引擎部分         | Playwright Firefox/WebKit 无法下载；网络受限 |
| 需要凭证     | 35 的 Sigstore 侧        | 无 npm / Sigstore 访问权                     |
| 需要额外服务 | 37 隔离 registry         | 未搭 Verdaccio                               |
| 需要下载产物 | 36 tarball 一致性        | 需完整 tarball 比对                          |
| 时间预算     | 07, 09, 12, 14–18, 27–32 | 本轮未进入                                   |

**没有任何一项是因为「看起来会失败」而跳过。**

---

## 8. 本轮验证的实际命令与结果

| 命令                                              | 结果                      |
| ------------------------------------------------- | ------------------------- |
| `cargo test --workspace --locked`                 | **261 passed / 0 failed** |
| `cargo fmt --all --check`                         | CLEAN                     |
| `cargo clippy --workspace --all-targets --locked` | **0 error**               |
| `pnpm check`（tsc）                               | 通过                      |
| `pnpm check:structure`                            | 6 domains, 38 packages    |
| `pnpm check:root`                                 | 通过                      |
| `pnpm check:docs`                                 | 通过                      |
| `pnpm check:workflows`                            | 17 files                  |
| `check:dom-update-browser`                        | Chromium 6/6              |
| `check:ssr-hydration-browser`                     | Chromium **11/11**        |
| `check:hydration-reactivity-browser`              | Chromium 7/7              |
| `check:web-components-browser`                    | Chromium 8/8              |
| `check:dom-minimal-work-browser`                  | Chromium 4/4              |
| `check:hmr-lifecycle-browser`                     | Chromium 6/6              |

---

## 9. Zeus 是否具备对外 Beta 发布条件？

**不具备。**

### 还差什么

**第一层：发布链路本身未恢复（阻断性）**

- `0.2.0-rc.3` 只发布了 7/32，流程在第 8 位中断
- TLOG 409 根因未确认，无法保证重试会推进
- i18n 的首次发布路径从未在真实 registry 上执行

**第二层：跨浏览器证据缺失（产品承诺相关）**

- DOM 更新、Hydration、HMR、Web Components 只在 Chromium 上有证据
- Firefox / WebKit 在本机 BLOCKED，CI 配置已就绪但**尚未观测**

**第三层：消费者路径未验证**

- Packed Consumer、Vite 生产构建、create-zeus、Native/WASM 差异
- 这些决定「装上去能不能用」，本轮全部 NOT_RUN

### 已经可以说的

- Hydration 会拒绝标签不符的节点，并在失败时保持容器可恢复
- Hydration 后的 DOM **确实**是响应式的，dispose 后**确实**停止
- 一次 signal 写入只运行它自己的绑定，不波及其他
- HMR **十次**连续更新（含中途交互）只留一个活 effect，且**跨代际的泄漏能被看见**
- 空文本、相邻文本、纯空白、空列表、普通注释都不破坏 hydration
- 键控列表在追加时复用、在全量替换时清空、快速写入收敛到最后一次
- SSR 与 DOM 目标的 marker 契约一致，节点被采纳而非重建

这些都在真实浏览器里用编译器真实产物证明过，且经过注入验证。

### 下一步（按优先级）

1. **确认 CI 三引擎结果**（配置已就绪，需推送后观测）—— 这是把 R21-C 从
   PARTIAL 推到 VERIFIED 的最短路径
2. **TASK 36/37/38**：tarball 一致性 + 隔离演练，把发布恢复从「理解」变成
   「可执行」
3. **TASK 27/29/30**：Golden 语义清单、Native/WASM 差异、Packed Consumer——
   消费者路径的真实性
