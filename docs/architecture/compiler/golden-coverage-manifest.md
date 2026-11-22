# Golden fixture 覆盖清单（R22 TASK 53）

生成的清单：45 个 fixture，全部带 `purpose`。
位置：`crates/zeus_compiler/tests/golden/`
测试：`crates/zeus_compiler/tests/golden.rs`（快照 code / map / diagnostics /
hydrationPlan / hmrPlan）

**本清单的用途不是数数，是回答「哪一类风险由哪个 fixture 覆露」。**
所以下面按**风险**分组，每组注明它防的是哪种回归；同组的多个 fixture
是必要的（它们覆盖同一风险的不同触发路径），跨组重复才算冗余。

---

## 1. 按目标与选项分布

| 目标 | delegateEvents | fixture 数 |
| ---- | -------------- | ---------- |
| dom  | 默认（委托）   | 38         |
| dom  | false          | 1          |
| ssr  | 默认           | 6          |

这是一个不均衡但**合理**的分布：SSR 的语义面比 DOM 小得多，而委托开关
对每个 DOM fixture 都成立，不需要每个都跑一遍。

---

## 2. 按风险分组

### 2.1 绑定必须精确到最小目标

防的回归：把 `title={x}` 编成整个元素重建，或把属性绑成 property。

| fixture       | 覆盖的具体形态                |
| ------------- | ----------------------------- |
| `attr`        | 动态 attribute                |
| `prop`        | DOM property 走 property 路径 |
| `class-style` | class 与 style 的字段级绑定   |
| `text`        | 动态文本绑到单个文本节点      |
| `multi-text`  | 同一元素内多个动态文本        |
| `spread`      | spread 合并为一个来源         |

**六个都需要**：它们各自的绑定目标类型不同，合成一个会让失败信息指不到具体哪类。

### 2.2 静态内容必须被提取成模板

防的回归：静态 JSX 没有走模板缓存，退化成运行时创建。

| fixture    | 覆盖                    |
| ---------- | ----------------------- |
| `static`   | 无绑定的元素 → 缓存模板 |
| `plain-ts` | 无 JSX 的模块原样返回   |
| `types`    | TS 类型从输出中擦除     |

### 2.3 控制流

防的回归：Show/For 的锚点或作用域边界错位。

| fixture                                    | 覆盖                                 |
| ------------------------------------------ | ------------------------------------ |
| `show`                                     | Show + JSX fallback                  |
| `for`                                      | For + accessor                       |
| `for-index`                                | For + index accessor                 |
| `show-in-for`                              | For 内的 Show（嵌套边界）            |
| `fragment`                                 | Fragment 降为相邻子节点              |
| `region` / `region-map` / `region-ternary` | 表达式子节点成为动态区域（三种形态） |

### 2.4 组件

防的回归：props 传递或 children 归属错误。

| fixture             | 覆盖                             |
| ------------------- | -------------------------------- |
| `component`         | props + children                 |
| `component-dynamic` | 动态 prop                        |
| `no-component`      | 有 JSX 但无组件 → 不渲染任何东西 |

### 2.5 事件

防的回归：该委托的被直接绑定，或反之。

| fixture               | 覆盖               |
| --------------------- | ------------------ |
| `event`               | 委托的 click       |
| `event-no-delegation` | 全局关闭委托       |
| `event-non-delegated` | 不可委托的事件类型 |

### 2.6 hydration 与 HMR 计划

防的回归：采纳标记序列变化而代码没同步。

| fixture        | 覆盖                   |
| -------------- | ---------------------- |
| `auto-hydrate` | auto hydration 采纳体  |
| `hmr`          | render 调用的 HMR 计划 |
| `hmr-manual`   | 已有手动边界时跳过 HMR |

### 2.7 SSR

防的回归：SSR 与 DOM 语义分叉。

| fixture              | 覆盖                           |
| -------------------- | ------------------------------ |
| `ssr-basic`          | 组件渲染成字符串               |
| `ssr-flow`           | SSR 下的 Show 与 For           |
| `ssr-escape`         | 文本与属性值转义               |
| `ssr-void`           | void 元素不加闭合标签          |
| `ssr-bad-prop`       | 无 HTML 对应的 property 被拒绝 |
| `ssr-error-boundary` | ErrorBoundary 在 SSR 下被拒绝  |

### 2.8 边界与诊断

防的回归：该拒绝的输入被放行，或诊断位置丢失。

| fixture      | 覆盖                         |
| ------------ | ---------------------------- |
| `async`      | async 组件被拒绝             |
| `deep`       | 超出嵌套限制 → 诊断          |
| `module-css` | 不支持的源类型被报告而非猜测 |
| `raw-text`   | raw text 元素绑动态内容      |

### 2.9 语言与源码映射

防的回归：Source Map 在特定语法下错位。

| fixture     | 覆盖                       |
| ----------- | -------------------------- |
| `unicode`   | unicode 与多行表达式       |
| `plain-jsx` | 纯 JS 里的 JSX 与 TSX 一致 |
| `no-map`    | 未请求时不产生 map         |

### 2.10 Web Components 与平台特性

| fixture          | 覆盖                            |
| ---------------- | ------------------------------- |
| `define-element` | defineElement + pure 模式       |
| `ref`            | ref 绑定                        |
| `svg`            | 命名空间属性                    |
| `nested`         | 嵌套元素 DOM 路径稳定           |
| `transition`     | Transition 由 inline style 驱动 |
| `error-boundary` | ErrorBoundary + render fallback |

---

## 3. 清单暴露出的空洞（已在本轮补上）

### 3.1 多缺陷同时出现（已补）

45 个 fixture 里，只有 5 个产生诊断，且**每个只有一条**。所有专项诊断测试
（`diagnostics.rs` 的 12 个用例）也都是单缺陷。

**没有任何东西验证过「一个模块里多个独立错误是否全部报告」。** 一个只报
第一个就停的编译器可以通过全部既有测试，代价是用户每修一个错就要重新构建
一次。

已补：`crates/zeus_compiler/tests/diagnostics.rs`

- `several_defects_in_one_module_are_all_reported` —— 三个独立缺陷，断言恰好
  三条诊断且都能识别；
- `diagnostics_are_reported_in_a_stable_order` —— 同一模块两次报告顺序一致
  （防止哈希表迭代顺序渗入上报路径）。

### 3.2 仍然存在的空洞（未补，注明原因）

| 空洞                                                 | 为什么没补                                                                             |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------- |
| 三个 fixture 在 `delegateEvents: false` 下的等价形态 | 委托开关是全局选项，逐个 fixture 跑一遍只会翻倍快照数量，不增加语义覆盖                |
| SSR 下的 `define-element` / `transition`             | 需要先确认这两个特性在 SSR 下是否有定义；贸然加 fixture 会让「未定义行为」被固化成基线 |
| Golden 之外的性能回归                                | 属于 TASK 54–57 的基准任务，不塞进 golden                                              |

---

## 4. 判定原则（写给下一个人）

新增 fixture 时必须能回答：**它防的是哪种回归，且这个风险当前没有 fixture
覆盖。** 两条都答不上来就不要加——那只是让快照数量变大。

本轮没有新增任何 golden fixture，因为清单分析显示：语义覆盖是完整的，
缺的是**组合**（多缺陷）与**选项矩阵**，而后者不增加信息量。
