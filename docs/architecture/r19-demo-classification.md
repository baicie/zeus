# R19 · Core examples 的分类（P11）

判断依据是**这个目录为什么存在**，不是它的名字或行数。

一个东西是**应用**，当且仅当它有独立的交付链路：Dockerfile、镜像、部署单元。
本次审计的十个目录**没有一个**有 Dockerfile，所以它们都不是应用。

## 分类

| 目录                 | .tsx | Zeus 依赖 | 类别             | 依据                                                                                                        | 去向                        |
| -------------------- | ---- | --------- | ---------------- | ----------------------------------------------------------------------------------------------------------- | --------------------------- |
| `project-board`      | 1    | 1         | 复杂 Demo        | 531 行单文件看板，演示 context / memo / Show / For / inspector 的组合；无路由、无后端、无部署               | ecosystem `demos/`          |
| `headless-demo`      | 1    | 4         | 复杂 Demo        | 23 行，但依赖四个 headless 包，是"如何把 headless 包拼起来"的示例                                           | ecosystem `demos/`          |
| `use-headless-cli`   | 2    | 1         | 消费示例         | 演示 CLI 用法，203 行                                                                                       | ecosystem `demos/`          |
| `use-headless-react` | 1    | 1         | 消费示例         | 演示 React 侧消费，214 行                                                                                   | ecosystem `demos/`          |
| `use-headless-vue`   | 0    | 1         | 消费示例         | 11 行，Vue 侧最小消费                                                                                       | ecosystem `demos/`          |
| `registry-react`     | 7    | 1         | 复杂 Demo        | 438 行，演示 registry 在 React 里的消费                                                                     | ecosystem `demos/`          |
| `registry-vue`       | 0    | 1         | 消费示例         | 32 行，Vue 侧最小消费                                                                                       | ecosystem `demos/`          |
| `devtools-panel`     | 1    | 3         | **测试 fixture** | 239 行，不是"演示 devtools 的应用"，而是 devtools 事件协议的可视化验证面板；`docs/audit/phase1` 记录为 keep | **留在 core**               |
| `next-boundary`      | 4    | 4         | **测试 fixture** | 1896 行，SSR/hydration 边界测试工程，有明确测试目的                                                         | **留在 core**               |
| `headless`           | 23   | 5         | **测试 fixture** | 2052 行，6 个消费示例构成 headless 包的行为矩阵；占 parity 语料三分之一                                     | **留在 core**（待议，见下） |

## `devtools-panel` 的单独说明

P11 要求"先判断它属于 DevTools 产品自身，还是单纯演示 DevTools 的复杂应用"。

它**两者都不是**：它是一块面板，用真实事件驱动 devtools 协议的可视化，供测试断言。
`@zeus-js/devtools-consumer` 包本身留在 core，这块面板是它的测试替身，所以留 core。

如果以后要为 Ecosystem 做一个"演示 devtools 怎么用"的宿主应用，那是**新建**的东西，
不是把这个面板搬过去。

## `headless` 为什么标"待议"

23 个 `.tsx`、2052 行，是 `examples/` 里最大的一块，占 parity 语料的 36%。

它同时是两件事：headless 包的行为测试矩阵（fixture），和"如何在三个框架里消费
headless"的示例集合（demo）。两轮独立审计对它的归属给出了不同的答案，
而 `docs/audit/phase1` 记录的是「move to zeus-ui」。

**不在本轮决定它。** 理由是它一动就同时影响：parity 语料（−23，从 56 掉到 33，
低于 `> 60` 守卫）、headless 包的测试覆盖、以及 zeus-ui 的双轨记录。这三件事
必须一起处理，而不是作为目录迁移的副作用。

## 迁移顺序

`project-board` 等七个目录的搬迁依赖 Ecosystem 侧的 `demos/` 结构，
而那个结构目前不存在。所以本轮只完成分类，不动目录。

先建 `zeus-ecosystem/demos/`，再逐个搬，每搬一个同步更新
`packages/compiler/compiler-wasm/__tests__/parity.test.mjs` 的 `expectedCorpusCounts`
——那是上一轮加的约束，正是为了让这种收缩成为显式改动。

## 准入原则（P10 的要求）

Core 的 example 应当：聚焦一个明确的框架能力、只用公共 API、容易读、容易跑、
不含业务模型、没有独立部署链路、不引入产品级交互。

`project-board` 违反了其中三条（业务模型、产品级交互、531 行）。
以后不应再在 core 里发展这类东西。
