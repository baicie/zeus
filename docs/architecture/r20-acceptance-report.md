# R20 验收报告

测量于 `f07c0375`（main）+ 本轮六个 PR。

**每一项只允许四种结论：VERIFIED / PARTIAL / BLOCKED / NOT_RUN。**
未执行的不写"应该没问题"。

---

## 最终状态

```text
COMPILER_ARCHITECTURE_CLOSED:       PARTIAL   — TASK 05/06 完成；TagName 校验缺口新发现
DOM_RUNTIME_E2E_VERIFIED:           VERIFIED  — 6/6，Chrome 157，注入验证通过
SSR_HYDRATION_E2E_VERIFIED:         VERIFIED  — 7/7，含节点采纳与拒绝路径
HMR_LIFECYCLE_VERIFIED:             VERIFIED  — 6/6，五次连续更新 + 卸载
WEB_COMPONENTS_LIFECYCLE_VERIFIED:  VERIFIED  — 8/8，含 10 次连断循环
RC_RELEASE_READY:                   NOT_READY — 7/32 已发布，i18n 从未存在

OPEN_PRS:     6  (#354–#359)
FAILED_CHECKS: 0（本地全绿；CI 首跑未观测）
```

---

## 本轮交付

| PR   | 内容                                                       | 状态          |
| ---- | ---------------------------------------------------------- | ------------- |
| #354 | TASK A/B/C — Fragment 回归、EmitPlan 审计、Golden 覆盖缺口 | 本地全绿      |
| #355 | TASK D — 性能测量协议                                      | 本地全绿      |
| #356 | TASK E/F — 浏览器通道 + DOM 精确更新 E2E                   | **6/6**       |
| #357 | TASK G — SSR/Hydration E2E（叠放于 #356）                  | **7/7**       |
| #358 | TASK H/I — HMR 生命周期 + Custom Elements（叠放于 #357）   | **6/6 + 8/8** |
| #359 | TASK J — 发布链路只读审计                                  | 只读          |

---

## 1. COMPILER_ARCHITECTURE_CLOSED — PARTIAL

### 已完成

**TASK 05 — EmitPlan 约束审计（VERIFIED）**

五个字段中只有 `runtime_import` 被真正读取。其余四个是**描述而非开关**——修改它们不改变任何输出。这符合 `emit_plan.rs` 的自述，但此前无人核实。

发现一处字段错位：`plan.hmr` 无法回答"boundary 会发射吗"，因为 HMR state 需要字面量绑定槽、boundary 只需要 render 调用。**记录，未改代码**——拆字段会新增没有读取者的字段。

发现一处位置事实：`preamble_end` 不含 import，生成段落插在用户 import **之前**。合法 ESM，但推翻了旧的基于文本 marker 的顺序表。

**反事实验证**：交换模板与组件段，输出变成 `})()const $zeusTmpl = …`——**语法错误**。旧的位置断言 5 条里只有 1 条抓住它，因此新增可解析性断言（每份输出必须能被 Oxc 解析为 ES 模块）。

**TASK 06 — Golden 覆盖（VERIFIED，但发现了实质缺口）**

**45 个 fixture 里有 9 个从未产出代码**，其中 7 个是控制流：

| fixture              | 诊断                                     | 本应覆盖      |
| -------------------- | ---------------------------------------- | ------------- |
| `show-tsx`           | `ZEUS_UNSUPPORTED_JSX_ATTRIBUTE_VALUE`   | Show 发射     |
| `for-tsx`            | `ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION` | For 发射      |
| `for-index-tsx`      | 同上                                     | For 索引发射  |
| `show-in-for-tsx`    | 同上                                     | 嵌套控制流    |
| `error-boundary-tsx` | `ZEUS_UNSUPPORTED_JSX_ATTRIBUTE_VALUE`   | ErrorBoundary |
| `transition-tsx`     | 无（空代码无诊断）                       | Transition    |
| `ssr-flow-tsx`       | `ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION` | SSR 控制流    |

**根因：内置节点必须先 import。** 不 import 时 `<Show>` 走普通组件路径，其 JSX `fallback` 被当作"组件 prop 里的 JSX 值"拒绝。

```jsx
// 无 import → 组件路径 → 被拒绝
export const App = p => (
  <Show when={p.o} fallback={<p>c</p>}>
    …
  </Show>
)
// 有 import → 内置路径 → 正常发射
import { Show } from '@zeus-js/runtime-dom'
```

**这 6 个 fixture 不是在覆盖控制流发射，而是在覆盖"误把内置当组件"的拒绝**——名字与内容不符，但因为记录的是稳定输出，**测试一直是绿的**。

`transition-tsx` 更隐蔽：它还用 `name="fade"`，而 `name` 不是 Transition 接受的属性。缺 import 掩盖了这个错误。

**结论：所有控制流内置节点的 mount 分派路径，此前没有任何 golden 覆盖。**

修正 9 个 fixture 的输入（不是新增），**8/9 开始真正产出代码**。拒绝路径由 `diagnostics.rs` 的新测试显式钉住。

**没有为了通过测试刷新 Golden。** 32 个纯格式 diff 全部回退。

### 未完成 / 新发现

| 项                                                            | 状态             |
| ------------------------------------------------------------- | ---------------- |
| `ZEUS_HYDRATION_TAG_MISMATCH` 在 `hydratePlan` 路径上是死代码 | **新发现**，见下 |
| `plan.hmr` 语义不精确                                         | 已记录，未改     |
| SSR + autoHydrate 交叉的 marker 序列                          | 未覆盖           |

#### 新发现：tag 校验缺口

`HydrationPlanNode.tagName` 被编译器产出、被运行时类型声明，但 `nodeOccurrences` 调用 `context.nodes(node.id)` 时**不传 `expectedTag`**：

```ts
// packages/core/runtime-dom/src/hydration.ts:195
return context.nodes(node.id) // ← 没有 expectedTag
```

因此 `ZEUS_HYDRATION_TAG_MISMATCH` 在 `hydratePlan` 路径上**不可达**。服务端与客户端对某元素标签不一致时，hydration 会**采纳错误的节点**。

`check:ssr-hydration-browser` 里有一条测试名为 `KNOWN GAP: …`，断言**当前行为**并注明：运行时开始校验时该测试会失败，改它的人必须把断言改成"拒绝"。

**这是一个真实的产品缺陷，本轮记录而非修复**（属运行时行为变更，超出"验收"范围）。

---

## 2. DOM_RUNTIME_E2E_VERIFIED — VERIFIED

`check:dom-update-browser`，**6/6 通过**，Chrome 157。

| 检查          | 断言                                         |
| ------------- | -------------------------------------------- |
| 文本更新      | 只有 `#text` 变；其余 5 个节点**同一个对象** |
| 属性更新      | 只有 `title` 变；其余节点同一对象            |
| class + style | 元素存活；兄弟节点同一对象                   |
| Show 切换     | 分支替换且**从文档脱离**；前后兄弟同一对象   |
| 键控 For 重排 | `c,a,b` 重排后**三项节点全部复用**           |
| 键控 For 删除 | 存活项保持节点；被删项脱离                   |

### 双向验证

**正向**：6/6 通过。

**反向**：手写一个"每次重建 `innerHTML`"的渲染器：

```
{
 "textUpdated": true,     ← 文本断言通过
 "headingSame": false,    ← 身份断言失败
 "footerSame": false,     ← 身份断言失败
 "textSame": false        ← 身份断言失败
}
```

**文本正确，三个身份断言全挂。** 这正是"看起来能用、实际整棵重建"的框架。

### 局限

**未证明更新是"最小工作量"。** 只证明未受影响的节点保持身份。一个每次都重算所有表达式、写回相同值的框架也能通过。

---

## 3. SSR_HYDRATION_E2E_VERIFIED — VERIFIED

`check:ssr-hydration-browser`，**7/7 通过**，Chrome 157。

| 检查        | 内容                                                 |
| ----------- | ---------------------------------------------------- |
| marker 契约 | SSR 输出的 marker 与 DOM plan 逐个对应，**顺序一致** |
| SSR 渲染    | 动态部分来自 props（证明运行时真的执行了组件）       |
| 节点采纳    | hydration 后服务端节点**身份不变**                   |
| 缺失 marker | 拒绝，不回落重建                                     |
| 重复 marker | **合法**——For 项共享模板 id，解析为互不相同的节点    |
| tag 不匹配  | **KNOWN GAP**，见上                                  |

### 注入验证

让 `hydratePlan` 重新赋值 `container.innerHTML`：

```
"hydration replaced server nodes instead of adopting them: [\"root\",\"title\",\"open\",\"list\"]"
```

**精确点名被替换的 4 个节点。**

### 三个被失败断言纠正的框架事实

1. **`optional` 是承重字段**：Show 两分支、For 每项都标 `optional: true`，未走的分支本就没有 marker。
2. **For 的 marker 按项重复**：plan 只描述一次模板，顺序比较须按首次出现去重。
3. **`<!--zeus:hydrate:/-->` 不是节点 marker**：它是文本区域闭合标记。

---

## 4. HMR_LIFECYCLE_VERIFIED — VERIFIED

`check:hmr-lifecycle-browser`，**6/6 通过**，真实 Vite dev server。

| 阶段                   | 断言                                    |
| ---------------------- | --------------------------------------- |
| 初始                   | `mounts=1, cleanups=0, effects=1`       |
| 五次连续更新           | `mounts=6, cleanups=5, effects=`**`1`** |
| 点击                   | `listeners+1`，`effects` 仍为 **1**     |
| dispose                | `effects=0`                             |
| 负向（无 `onCleanup`） | cleanup 计数器不移动                    |

### 注入验证

移除 fixture 的 `onCleanup`，三项依次失败：

```
cleanups: 0        ← 每次更新都没清理
effects: 2         ← 点击后 effect 累积（这就是泄漏）
final dispose 无法收敛
```

---

## 5. WEB_COMPONENTS_LIFECYCLE_VERIFIED — VERIFIED

`check:web-components-browser`，**8/8 通过**，Chrome 157。用**真实编译器**编译 `defineElement` + `Host` + `Slot`。

| 检查             | 内容                                             |
| ---------------- | ------------------------------------------------ |
| Shadow root      | 挂载 shadow root，light DOM 不进 shadow          |
| 类型反射         | String 原样 / Number 转数字 / Boolean 存在即为真 |
| DOM 跟随         | 属性变更传到渲染输出                             |
| 具名 + 默认 slot | `assignedNodes()` 精确匹配                       |
| slot fallback    | 无投影时渲染 fallback                            |
| Light DOM        | 不挂 shadow，渲染进自身                          |
| 10 次连断        | `cleanups === mounts - 1`；最终断开后 `= mounts` |

### 注入验证

让 `disconnect()` 跳过 `dispose()`，循环检查以 `cleanups: 0` 对 10 次重连失败。

### 一条被纠正的断言

`active="false"` 就是 `true`——HTML 布尔属性"存在即为真"，运行时实现是 `value !== null`。**断言相反就是在断言一个 bug。**

---

## 6. RC_RELEASE_READY — NOT_READY

只读审计（#359），**未执行任何发布操作**。

```
已发布 rc.3         7
存在但无 rc.3      24
从未在 npm 存在     1   ← @zeus-js/i18n
```

**`@zeus-js/i18n` 连一个版本、一个 dist-tag 都没有。** `release-pairing/v0.2.0-rc.3.json` 把它列进 `firstPublish`，同组的 `eslint-plugin` 与 `playground-engine` 都发布了。

这是与"发布跑到第 8 个包失败"**完全不同性质**的失败：i18n 从未被触碰。

**影响**：`skipExisting: true` 不跳过不存在的包，所以 i18n 会在恢复时**首次发布**——走上一条任何 Run 都从未执行过的路径。

其他：

- 4 个 Native 平台包的 `latest` 指向 2026-08 的 canary
- 四个 RC tag 均无 GitHub Release
- TLOG 409 根因**仍不能确认**；本轮只加了时间性事实（此后无重试成功过该包）

---

## 7. 环境说明：浏览器验收不再 BLOCKED

此前 TASK 09–13 全部 BLOCKED，证据是 `cdn.playwright.dev` 超时。真正原因是**检查脚本硬编码 `channel: 'chromium'`**，而本机有 Chrome 157。

新增 `scripts/check/browser-channel.ts`：

- `ZEUS_BROWSER_CHANNEL` 指向已安装浏览器；CI 保持固定构建
- `ZEUS_BROWSERS` 选择引擎
- 浏览器起不来时标 **BLOCKED + 退出码 2**，不冒充失败也不冒充通过
- 报告打印实际使用的浏览器（"Chrome 157 通过" ≠ "Playwright 固定构建通过"）

---

## 8. 本轮未做

| 项                          | 原因                         |
| --------------------------- | ---------------------------- |
| Firefox / WebKit 上的新检查 | 本机只有 Chromium 系         |
| tag 校验缺口修复            | 运行时行为变更，超出验收范围 |
| SSR + autoHydrate 交叉覆盖  | 需先确定该组合是否受支持     |
| 恢复 rc.3 发布              | 任务禁止                     |
| TLOG 409 根因               | 不可得                       |

---

## 9. 结论

**能证明的**：

- 精确 DOM 更新在真实浏览器里成立，且**未受影响的节点保持身份**
- SSR 与 hydration 的 marker 契约一致，节点被采纳而非重建
- 五次连续热更新只留一个 effect，卸载后无残留
- Custom Element 的反射、Shadow/Light DOM、具名 slot、连断循环全部成立
- 编译架构边界可信；控制流 golden 覆盖缺口已修复

**不能证明的**：

- **Firefox / WebKit** 上的上述任何一项
- 更新是"最小工作量"（只证明了身份保持）
- `RC_RELEASE_READY`：7/32、i18n 从未存在、RC tag 无 Release

**下一步**：

1. CI 首跑结果（本报告全部是本机证据）
2. 修 `hydratePlan` 的 tag 校验缺口
3. 查明 i18n 为何从未被 publish 触及（Release Run 日志可查）
