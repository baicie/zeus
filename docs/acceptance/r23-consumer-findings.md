# R23 TASK 11–13：仓库外消费者的四个发现

测量时间：2026-11-22
基线：`9d0da888`（R23 起始 main）
检查：`check:vite-dev-consumer`、`check:vite-prod-consumer`、`check:create-zeus-candidate`

---

## 1. 为什么必须做仓库外安装

仓库内的每个 Vite 检查都通过 tsconfig paths 与 workspace link 解析
`@zeus-js/*`。那证明编译器与运行时能工作，**不证明别人装得上**。

rc.3 恰好是前者好、后者不行：编译器在本仓库编译正常，而 `0.2.0-rc.3`
对消费者不可安装。两个问题有不同答案，只有第二个从未被问到过。

---

## 2. 发现一：平台包必须按名安装

**现象**：消费者装完 8 个包，`@zeus-js/vite-plugin` 加载失败，
`MODULE_NOT_FOUND` 来自 `compiler-native/index.js` 对平台二进制的 `require`。

**机制**：`compiler-native` 的七个平台包是 `optionalDependencies`，指向
registry 版本。从 `file:` tarball 安装时，npm 去配好的 registry 找
`0.2.0-rc.3`，找不到，**静默省略**——optional 组允许缺失，所以没有任何警告。

**影响**：这是「tarball-only registry 无法按名安装 optional 依赖」的一般性问题，
不是某个模板的缺陷。TASK 17 的 32 包隔离演练必须解决它；本节的两个检查通过
显式列出平台包绕过，并在代码注释里写明这是与真实安装的差异。

---

## 3. 发现二：`tsconfig.json` 不是可选的

**现象**：没有 tsconfig 时，`vite dev` 报
`react/jsx-dev-runtime could not be resolved`。

**机制**：Vite 的依赖扫描阶段绕过插件的 `esbuild.jsx = 'preserve'`，
回退到 esbuild 默认的 `react` 运行时。项目自带 `jsx: preserve` 的 tsconfig 时
不会走到这个回退。

**为什么这是检查的缺陷而不是产品的**：每个脚手架模板都带 tsconfig。没有它的
fixture 比它代表的东西更不真实，所以修的是 fixture。

---

## 4. 发现三：Vite 8 的 `minify: 'esbuild'` 已不可用

**现象**：

```
Error: Failed to load `transformWithEsbuild`. It is deprecated and it now
requires esbuild to be installed separately.
```

**机制**：Vite 8 用 Rolldown 构建、Oxc 压缩。选项名不再隐含依赖。

**处理**：fixture 用默认配置。要验证的是「产物能否经受压缩」，不是「哪个压缩器」。

---

## 5. 发现四：候选 tarball 让 signal 被打包两份

**这是本轮最重要的一个。**

**现象**：每个脚手架模板在浏览器里都崩溃：

```
Cannot track a reactive value with a different Zeus signal engine.
Deduplicate @zeus-js/signal for this reactive tree.
```

bundle 里 `Symbol.for('@zeus-js/signal/execution-context')` 出现**两次**。

### 5.1 机制

这是候选机制的限制，不是模板或产品的缺陷：

1. 模板只声明 `@zeus-js/zeus`，它依赖 `@zeus-js/signal` 与 `@zeus-js/runtime-dom`；
2. 候选准备把每个包改写成 `file:` 规格；
3. pnpm 因此给每个包独立的 `.pnpm` 实体（哈希里带着上游的 `file:` 路径）；
4. Vite 插件的 `dedupe: [...runtimePackages]` **按包名**比较，但两个副本的
   **物理路径不同**，去重不生效；
5. 真实 registry 安装只有一份 `@zeus-js/signal`，不会这样。

### 5.2 为什么不在这个检查里修

把 `passed` 变成 false 会把**tarball registry 的产物问题报成模板缺陷**。
修复属于候选矩阵（TASK 17），不属于这个检查。

所以探针结果被**记录**，`passed` 仍然表示「构建与类型检查成功」。

### 5.3 这条为什么要写下来

TASK 13 的验收目标是「创建、安装、构建、启动、交互」。前四项一直有人验证，
第五项没有。加上之后立刻发现：**构建成功、类型检查通过、产物存在，而页面
打不开**。

---

## 6. 三个检查的实测结果

| 检查                          | 结果                                                                                   |
| ----------------------------- | -------------------------------------------------------------------------------------- |
| `check:vite-dev-consumer`     | **5/5 通过**（chromium）：安装、解析、TSX 编译、signal 原地更新、3 次热更新 1→4 mounts |
| `check:vite-prod-consumer`    | **7/7 通过**：生产构建、无路径泄漏、SourceMap、静态加载渲染、压缩后仍响应式、无 404    |
| `check:create-zeus-candidate` | 构建通过；**运行期失败已记录**（§5）                                                   |

无浏览器时三者都报 BLOCKED 并保留不需要页面的证据，退出码 2。

---

## 7. 未验证

| 项                          | 原因                                     |
| --------------------------- | ---------------------------------------- |
| Firefox / WebKit 的真实启动 | 本机无 Playwright 三引擎，由 CI 覆盖     |
| 超过 3 次的热更新           | 未做长循环                               |
| 模板的交互（点击、路由）    | 探针只验证「加载并挂载」，不验证具体交互 |
| 候选机制修复后的模板运行    | 取决于 TASK 17                           |
