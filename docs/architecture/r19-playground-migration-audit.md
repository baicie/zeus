# R19 补充任务 · Playground 迁移审计（P1）

> 状态：审计完成，迁移未开始。本文只记录事实与阻塞，不含实施结果。

## 一、资产位置与规模

| 位置                                     | 文件数           | 行数 | 计划归属                    |
| ---------------------------------------- | ---------------- | ---- | --------------------------- |
| `examples/playground-editor/`            | 37               | 7739 | Playground 应用 → ecosystem |
| `packages/tooling/playground-engine/`    | 25               | —    | Core 通用工具（保留）       |
| `scripts/playground/`                    | 12 个脚本 + 测试 | —    | 按断言拆分                  |
| `.github/workflows/playground-image.yml` | —                | —    | 产品交付 → ecosystem        |
| `.github/workflows/playground-pages.yml` | —                | —    | 静态站点交付 → ecosystem    |

## 二、硬阻塞：`@zeus-js/compiler-wasm` 从未发布

这是整个迁移能否开始的前提，**必须先决策**。

`packages/compiler/compiler-wasm/package.json`：

```json
{
  "name": "@zeus-js/compiler-wasm",
  "version": "0.1.1-beta.20",
  "private": true
}
```

- `private: true`，不在 32 包固定发布组内。
- npm 上查无此包。
- Playground 以 `workspace:*` 依赖它，这是它**唯一**的消费者。

`docs/architecture/packages.md:58` 记录了这个设计决定：

> `compiler-wasm` is `private: true` and is not in the fixed release group.
> That is deliberate — **it ships inside the Playground build rather than to npm.**

这条前提与 P2.2 直接冲突：迁移后 Playground 在 `zeus-ecosystem`，
不能再用 workspace 依赖，也不允许把 WASM 源码复制进应用。

**三条可选路径，需要明确选择：**

1. **发布 `@zeus-js/compiler-wasm`**（推荐）。`files` 已包含
   `index.js` / `index.d.ts` / `worker.js` / `worker.d.ts` /
   `zeus-compiler.wasm`，产物齐全（wasm 1.5 MB，整包约 1.6 MB）。
   需要：移出 `private`、纳入发布组或独立版本线、决定版本线
   （它现在停在 `0.1.1-beta.20`，与 core `0.2.0-rc.5` 不同步）。
2. **由 `zeus-ecosystem` 自己构建 WASM**。违反 P2.2「不得在 Docker
   构建过程中重新构建整个 Core」，且需要 Rust 工具链。
3. **放弃 WASM，Playground 只用 native compiler**。不成立：
   Playground 在浏览器里运行，native 是 Node napi 产物。

选 1 时还要回答：它跟 `vite-plugin` / `devtools-consumer` 一样走独立版本线，
还是并入 32 包固定组？前者更合理——它的版本与 core 无耦合。

## 三、其余依赖已就绪

| 包                                                                  | 状态          | 证据                                                         |
| ------------------------------------------------------------------- | ------------- | ------------------------------------------------------------ |
| `@zeus-js/playground-engine`                                        | ✅ 已发布     | 在 `zeusFixedPackages` 内，与 core 同步；npm 有 `0.2.0-rc.3` |
| `@zeus-js/zeus`、`router`、`query`、`i18n`、`signal`、`runtime-dom` | ✅ 已发布     | ecosystem `apps/admin` 已在用 `0.2.0-rc.5`                   |
| `@zeus-js/vite-plugin`                                              | ✅ 独立版本线 | `0.0.6`，ecosystem 已用                                      |

即：**除 compiler-wasm 外，Playground 的依赖全部可以由发布包满足。**

## 四、API 补全生成器需要改数据源（P6）

`scripts/playground/generate-api-completions.ts` 当前读的是**源码构建产物**：

```ts
const repoRoot = path.resolve(import.meta.dirname, '../..')
const ENTRY_PACKAGE_DIR = path.join(repoRoot, 'packages/core/zeus')
```

它通过 TypeScript 编译器加载 `packages/core/zeus/dist/zeus.d.ts`，
用 type checker 提取导出、重载与文档注释。设计本身是对的（不是正则、
不是硬编码），只是**数据源路径绑定了 core 仓库结构**。

迁移后改为解析 `node_modules/@zeus-js/zeus` 的 `exports["."].types` 即可，
逻辑不变。P6 要求「不得依赖相邻 Core 仓库的源码路径」，正好对应这一处。

## 五、待补：P2–P13

审计的其余维度（应用源码逐文件分类、engine 边界、安全边界、
CI/交付、测试拆分、Core examples 分类）由并行审计产出，
落定后并入本文档。

---

## 六、逐文件分类（六个维度的交叉核对结果）

审计分六个维度独立进行，每个维度随后由另一个 agent 读同样的文件做**反驳式复核**。
130 条发现中 15 条被推翻——它们比通过的 115 条更有价值，因为每一条都是一个
「看起来合理但代码不是那样」的判断。

| 迁移动作                 | 条目 |
| ------------------------ | ---- |
| 留在 Core                | 41   |
| 拆分（一部分留一部分走） | 40   |
| 迁到 Playground 应用     | 37   |
| 迁到 ecosystem demos     | 11   |
| 删除                     | 1    |

### 被推翻的判断

| 原判断                                                  | 实际情况                                                                                                                                                                                                                                                   |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `host.tsx` / `host-counter.tsx` 是框架能力              | 只由 Playground 的 `host.html` 入口、Inspector 外链和 Playground 门禁消费；core 无消费者。且「全仓唯一在非沙箱页面把 Zeus CE 挂进 React StrictMode 与 Vue 3」不成立——`react-wrapper`、`use-headless-react`、`vue-wrapper`、`use-headless-vue` 早已各自覆盖 |
| `check-playground-browser.ts` 属 Playground 产品        | 它断言的是**文档站** `docs/public/playground` 静态页（`docs/.vitepress/config.ts:15` 导航、`docs.yml`），随 Playground 迁走会打断文档站                                                                                                                    |
| `playground-image.yml` / `playground-pages.yml` 留 Core | 它们直接构建/读取 `examples/playground-editor`，是本仓审计文档自己写明要迁 ecosystem 的对象                                                                                                                                                                |
| `deployment-layout` 是 product-test                     | 它是部署期校验与 manifest 构造库，类别应为 product-deploy，动作留在 Core                                                                                                                                                                                   |
| `stencil-wrapper` 是框架能力                            | 该包**零 Zeus 使用**（唯一的 `@zeus` 命中是它自己的名字），不演示任何框架能力；phase0/phase1 审计记的是 retire                                                                                                                                             |
| `project-board` 是 Playground 产品                      | 它是单文件的 Core 框架演示（context/memo/Show/For/inspector），`docs/audit/phase1` 记录的是 keep in zeus                                                                                                                                                   |

涉及 host 页面与 engine 边界的条目，我需要自己再核一遍才写进设计——两轮 agent
对同一批文件给出了不同结论，说明那里确实有需要人判断的边界。

## 七、P10 的硬约束：parity corpus 只剩 2 个余量

`packages/compiler/compiler-wasm/__tests__/parity.test.mjs:171`：

```js
assert.ok(corpus.length > 60, `corpus has ${corpus.length} modules`)
```

`corpusRoots` 包含整个 `examples/`，所以**每迁走一个含 `.tsx` 的目录，语料就少几项**。
实测当前总数（2026-11-26，`main` @ `aa4e37a4`）：

| 来源                          | 数量   |
| ----------------------------- | ------ |
| `examples/`                   | 58     |
| `scripts/bench/fixtures`      | 9      |
| `scripts/playground/fixtures` | 2      |
| inline sources                | 11     |
| **合计**                      | **80** |

按审计列出的迁移清单计算：

| 目录                 | 减少   |
| -------------------- | ------ |
| `registry-react`     | 7      |
| `playground-editor`  | 4      |
| `use-headless-cli`   | 2      |
| `stencil-wrapper`    | 2      |
| `headless-demo`      | 1      |
| `use-headless-react` | 1      |
| `project-board`      | 1      |
| **合计**             | **18** |

迁移后 62，守卫仍通过，**但余量只有 2**。此后任何再迁走一个含 `.tsx` 的目录都会
让 Rust 编译器的 WASM/原生一致性门禁变红，而失败信息是「corpus has 59 modules」，
看起来像语料被误删，不像迁移导致。

**处理方式**（需要与 P10 同批做）：把 corpus 的输入从「整个 `examples/` 目录」
改为显式的 fixture 清单，或把迁移走的目录换成等量的专用 fixture。不能靠
「暂时调低门槛」——那正是这条守卫存在的理由（它的注释写着语料曾经悄悄丢掉九个模块
而 `> 60` 的守卫没拦住）。

### Core examples 分类（P10）

| 目录                                               | .tsx  | 分类                                                    | 动作               |
| -------------------------------------------------- | ----- | ------------------------------------------------------- | ------------------ |
| `counter` / `todo` / `context` / `light-dom-slots` | 各 1  | 最小框架示例                                            | 留                 |
| `web-component`                                    | 4     | 框架测试 fixture（全部 `shadow: false`，无 Shadow DOM） | 留                 |
| `devtools-panel`                                   | 1     | 框架测试 fixture                                        | 留                 |
| `next-boundary`                                    | 4     | 框架测试 fixture                                        | 留                 |
| `headless`                                         | 23    | 框架测试 fixture（6 个消费示例）                        | 留                 |
| `playground-editor`                                | 4     | 完整应用                                                | 迁 ecosystem apps  |
| `headless-demo`                                    | 1     | 复杂 Demo                                               | 迁 ecosystem demos |
| `use-headless-{cli,react,vue}`                     | 2/1/0 | 复杂 Demo                                               | 迁 ecosystem demos |
| `registry-{react,vue}`                             | 7/0   | 复杂 Demo                                               | 迁 ecosystem demos |
| `project-board`                                    | 1     | 复杂 Demo（单文件 Kanban 演示）                         | 迁 ecosystem demos |
| `stencil-wrapper`                                  | 2     | 零 Zeus 使用（组件用 `@stencil/core`）                  | **已删除**         |
| `admin`                                            | 0     | 已空                                                    | 已删（#418）       |

## 八、两条矛盾结论的亲自核实

两轮 agent 对同一批文件给出了不同判断。以下是逐条查证后的结论，
不是采信其中一方。

### `host.html` / `host.tsx`：属 Playground，不属 Core

三个消费者，全在 Playground 内部：

```
examples/playground-editor/vite.config.ts:44   build 入口 host.html
examples/playground-editor/src/playground/ui.tsx:878  Inspector 的外链
scripts/playground/check-playground-editor.ts:382      goto `${host}/host.html`
```

core 里没有任何消费者。审计提到它「证明 React/Vue 可以把 Zeus 自定义元素挂起来」，
这个能力已分别由 `examples/react-wrapper`、`examples/use-headless-react`、
`examples/vue-wrapper`、`examples/use-headless-vue` 覆盖——宿主页唯一多出的是
「同一页同时演示两者」。

**结论**：随 Playground 迁移。若 core 想要一份「同页双框架宿主」的证据，
应由 P10 新建一个最小示例并配 core 自己的门禁，而不是留着这个页面等它变孤儿。

另外审计指出 `host.tsx:76-81` 发的 `zeus-webc-host` 消息**全仓没有监听者**
（`target=_blank` 打开时 `window.parent === window` 直接 return），是死协议。

### `check-playground-browser.ts`：测文档站，不测 Playground 产品

目标目录写死在源码里：

```
scripts/playground/check-playground-browser.ts:12
const directory = path.join(root, 'docs/public/playground')
```

它验证的是文档站 `/playground/` 下的静态编译器演示（基路径 `/zeus/playground/`、
本地设置存储 `zeus-playground.settings.v2`），与 `examples/playground-editor` 无关。
把它随 Playground 迁走会**打断文档站**。

**结论**：这个脚本留在 core，或随文档站一起处理——但不能算作 Playground 产品测试。
P7 的清单里它应当被单独标注。

## 九、P7 — 每个检查测的是框架还是产品

判断依据不是文件名，是**断言对象**。下表逐条读了断言之后得出。

| 脚本                              | 断言对象                                                                                                                                                                              | 归属                                | 证据                                                                                                                    |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| `check-playground.ts`             | 编译器输出：`counter.tsx` 经 `transformModule` 得到 dom/ssr 两份产物，与 `counter.ir.json` 快照比对，再分别用 rolldown 打成 bundle 量体积，写入 `docs/public/playground/counter.json` | **框架**（编译器 + 文档站静态示例） | `import { transformModule } from '../../packages/compiler/compiler/src/index.ts'`；产物给文档站，与 Playground 应用无关 |
| `check-playground-browser.ts`     | `docs/public/playground` 静态页在三个引擎里的行为                                                                                                                                     | **框架**（文档站）                  | `:12 const directory = path.join(root, 'docs/public/playground')`                                                       |
| `check-playground-loop-budget.ts` | 无限循环在三个引擎里被终止                                                                                                                                                            | **框架**（沙箱协议）                | 与 engine 的 `loop-budget.spec.ts` 同一契约，浏览器层复验                                                               |
| `check-playground-sandbox-csp.ts` | 响应头与 origin 隔离                                                                                                                                                                  | **框架**（安全边界）                | 本次新增；读 nginx.conf 的响应契约                                                                                      |
| `check-playground-i18n-keys.ts`   | `examples/playground-editor/src/playground/locales/` 的 en/zh 键表是否同步                                                                                                            | **产品**                            | 读的是应用自己的 locale 文件                                                                                            |
| `check-playground-theme-i18n.ts`  | Playground 产品的主题/语言切换、持久化、首屏主题                                                                                                                                      | **产品**                            | 驱动构建后的应用 UI                                                                                                     |
| `check-playground-ux.ts`          | Playground 产品的布局、快捷键、文件切换                                                                                                                                               | **产品**                            | 同上                                                                                                                    |
| `check-playground-editor.ts`      | **混合**：产品编辑流程 + 沙箱隔离 + WebC studio + 框架宿主                                                                                                                            | **需拆分**                          | 见下                                                                                                                    |
| `check-playground-performance.ts` | Playground 应用的首屏、懒加载块、WASM 编译、自动运行合并                                                                                                                              | **产品**                            | 读 `examples/playground-editor/dist`                                                                                    |
| `check-playground-drag-online.ts` | 生产站点 `playground.moonbyte.top` 的分隔条拖拽                                                                                                                                       | **产品**（线上验收）                | 默认参数是生产 URL                                                                                                      |
| `check-pages-site.mjs`            | Pages 产物：三个页面都存在、资源不越 base                                                                                                                                             | **产品交付**                        | 由 `playground-pages.yml:113` 调用                                                                                      |
| `generate-api-completions.ts`     | 从 `packages/core/zeus/dist/zeus.d.ts` 的类型检查器提取导出与重载                                                                                                                     | **框架**（P6 要改数据源）           | 见 §4                                                                                                                   |

### `check-playground-editor.ts` 需要拆成三份

731 行、57 个断言，混了三种职责：

| 函数                     | 断言                                         | 归属                            |
| ------------------------ | -------------------------------------------- | ------------------------------- |
| `runEditorChecks`        | 编辑、编译、预览、导出下载                   | 产品                            |
| `runWebCStudioChecks`    | WebC studio 的 manifest 组件标签             | 产品                            |
| `runFrameworkHostChecks` | `host.html` 里 React/Vue 挂载 Zeus 元素      | 产品（宿主页随应用迁走，见 §8） |
| `runSandboxOriginChecks` | opaque origin 门禁、第三方 embed 被拒        | **框架**（安全契约）            |
| 内联的 `securityProbe`   | DOM / localStorage / cookie / fetch 四项隔离 | **框架**（安全契约）            |

`runSandboxOriginChecks` 与 `securityProbe` 这两块是框架契约，迁走应用后仍要在 core 有对应物——
但**不能靠保留一个 Playground 应用实例来验证**（P7 的原话）。它们的归宿是
`check-playground-sandbox-csp.ts` 所在的这一层：用最小的静态服务器 + `sandbox.html`
验证协议与隔离，不需要构建整个应用。

### 一个真孤儿

`check-playground-drag-online.ts`（102 行）没有任何调用者：不在 `package.json`、
不在任何 workflow、也不被别的脚本引用。它断言的是生产站点
`playground.moonbyte.top` 的分隔条拖拽行为，需要真实部署才能跑，所以从未进 CI。

按 P7「禁止简单删除」，它应当随 Playground 迁到 ecosystem 并接进那里的
线上验收，而不是留在 core 里继续当孤儿。

## 十、P10 执行状态

### 已做：`stencil-wrapper` 退役

审计两轮都指向它，第二轮推翻得更彻底：该目录的组件全部用 `@stencil/core` 定义，
**零 Zeus 使用**。它演示的是 Stencil 的 output targets，不是 Zeus 的任何能力。

核实过的删除依据：

- 不在 `pnpm-workspace.yaml` 里，`pnpm-lock.yaml` 因此不受影响（删后确认未变）。
- 没有任何 workflow 构建它。
- 除 `docs/release/` 与 `docs/internal/` 的历史记录外，无任何引用。

删掉后 `examples/` 的 `.tsx` 从 58 降到 56，`parity.test.mjs` 的期望计数在同一提交里
同步改成 56 —— 这正是上一节新增的约束所要求的：迁移导致的语料变化必须是显式改动。

### 已做：parity 语料的精确计数

见 §7。原来的守卫有两个缺口，都已补上：

| 缺口               | 后果                                                              | 现在                   |
| ------------------ | ----------------------------------------------------------------- | ---------------------- |
| 只有总数 `> 60`    | `benchmarks/` 移走后少 9 个仍通过（文件自己的注释记录了这次事故） | —                      |
| 每 root 只要 `> 0` | 从 `examples/` 迁走目录，该 root 仍远大于 0，总数仍 > 61          | 每个 root 有精确期望值 |

### 未做：其余目录的迁移

P10 的 Category C/D 迁移（`playground-editor`、`headless-demo`、`use-headless-*`、
`registry-*`、`project-board`）**依赖 P2 的应用迁移先落地**。现在搬走它们，
它们在新家还不存在，等于把示例从树里删掉。

顺序应当是：先让 Playground 在 ecosystem 里跑起来（P2/P8），再回头从 core 移除。
在 P2 完成之前，本节只固定分类与约束，不动目录。

### 一个需要人工判断的边界

`examples/headless`（23 个 `.tsx`，6 个消费示例）是 `examples/` 里最大的一块。
第二轮审计指出它「stay in core」与 `docs/audit/phase1` 记录的「move to zeus-ui」
双轨冲突。它既是框架测试 fixture 又是消费示例，**两轮 agent 没有给出同一个答案**。

我不在这一轮替它做决定：它属于 P10 里「需要人判断」的那一类，而且 23 个模块
占语料的三分之一，动它必须和语料策略一起考虑。

## 十一、迁移时必须带过去的两件事（P4.2 的补充）

发布后由一个独立复核发现、并由我核实的两点。它们不会在构建期报错，
只会在迁移完成后运行时暴露——所以写在这里，而不是留给人去想起来。

### 1. CSP 必须有 `'wasm-unsafe-eval'`

Playground 的编译器是 WebAssembly 模块。`script-src` 没有 `'wasm-unsafe-eval'`
时模块**实例化失败**，表现为运行时错误，构建与类型检查都不会报。

当前状态对比：

| 位置                                                    | `script-src`                         | 可用                          |
| ------------------------------------------------------- | ------------------------------------ | ----------------------------- |
| zeus `examples/playground-editor/deploy/nginx.conf:21`  | `'self' 'wasm-unsafe-eval' sha256-…` | ✅                            |
| zeus-ecosystem `apps/ai-workbench/deploy/nginx.conf:22` | `'self'`                             | ❌ 照抄会让 Playground 起不来 |

迁移时新建的 `apps/playground/deploy/nginx.conf` 必须从 core 这份复制，
**不要**从同仓库的 ai-workbench 复制。`@zeus-js/compiler-wasm` 的 README 也已记录
这条要求，消费者不必去翻 core 的 nginx 配置。

### 2. `compiler-wasm` 不在任何 latest-tag 策略覆盖内

`scripts/release/check-latest-tags.ts:483` 只遍历 `zeusFixedPackages`，
而 `compiler-wasm` 走独立版本线，不在那个列表里。结果是：

- 首次发布后 npm 的 `latest` 与 `beta` 都指向 `0.1.1-beta.20`（npm 首次发布的固有行为）；
- `pnpm repair:latest-tags --check` 列出 16 个包，不含它；
- 因此这个偏差不会有任何门禁记录或修正。

`@zeus-js/devtools-consumer` 有同样的情况（`latest` 也指向 beta），所以这不是
`compiler-wasm` 独有的问题，而是独立版本线整体的缺口。修复它属于发布策略的改动，
不在本轮范围内——但迁移后如果 ecosystem 按 `latest` 取版本，会取到一个 beta。

## 十二、P2 侦察：一次错误的"阻塞"判断，以及它为什么会发生

> **更正**：本节最初记录 `@zeus-js/output-wc` / `output-css` 从未发布过 rc.5，
> 判定为 P2 的第二个阻塞。**这个判断是错的。** 两个包在 npmjs 上都有 rc.5。
> 保留这段记录，因为错误的成因比结论更值得记住。

我查 npm 时用的是 `registry.npmmirror.com`（本机 `.npmrc` 的默认 registry）。
镜像对 rc.5 这批包滞后，`npm view @zeus-js/output-wc@0.2.0-rc.5` 返回
`E404 No match found for version 0.2.0-rc.5`。我用这个结果下了结论。

用 `registry.npmjs.org` 交叉验证后：

```
@zeus-js/output-wc@0.2.0-rc.5        -> 0.2.0-rc.5   ✓
@zeus-js/output-css@0.2.0-rc.5       -> 0.2.0-rc.5   ✓
@zeus-js/playground-engine@0.2.0-rc.5 -> 0.2.0-rc.5  ✓
```

我甚至回溯到 rc.5 的发布日志（run 45155201513），看到
`📦 @zeus-js/output-wc@0.2.0-rc.5` 在 tarball 清单里 —— 也就是说证据一直指向
「发布成功」，而我先入为主地用镜像的 404 解释了它。

**教训**：判断"某个版本是否存在"必须用 `registry.npmjs.org`。镜像滞后会把
已发布的包报成不存在，而这个仓库里几乎所有的 `npm view` 都走镜像。

### 因此 P2 没有第二个阻塞

Playground 的全部依赖（`compiler-wasm@0.1.1-beta.20` + 8 个 `0.2.0-rc.5` 包

- `vite-plugin@0.0.6`）都可以从 npmjs 装到。

开始迁移前先验证「Playground 的全部依赖能从 npm 装齐」。装不上：

```
npm error notarget No matching version found for @zeus-js/output-wc@0.2.0-rc.5
```

逐个核对 32 个固定发布组包的 rc.5 在 npm 上的存在性，**两个缺失**：

| 包                    | 仓库版本   | npm 上的 rc 系列 | 谁依赖它                     |
| --------------------- | ---------- | ---------------- | ---------------------------- |
| `@zeus-js/output-wc`  | 0.2.0-rc.5 | **一个都没有**   | `playground-engine`、`web-c` |
| `@zeus-js/output-css` | 0.2.0-rc.5 | **一个都没有**   | `web-c`                      |

两者都在 `zeusFixedPackages` 内、都非 private，所以这不是"故意不发布"，而是
rc.5 那次发布**漏掉了它们**。npm 上它们最新的版本停在
`0.1.1-canary.20261027.237.1.d8533522`。

**为什么之前没暴露**：`apps/admin` 不需要它们（它只用 `zeus`/`router`/`query`/`resource`
和 `@zeus-web/*` 组件），而 `playground-engine` 是第一个依赖 `output-wc` 的消费者。
所以这条缺口在 ecosystem 的现有三个应用里都看不到。

**这改变了 P2 的顺序**：不是「建 apps/playground → 装依赖」，而是
「补发布 output-wc + output-css@0.2.0-rc.5 → 建 apps/playground」。
在补发之前，`pnpm add @zeus-js/playground-engine@0.2.0-rc.5` 必然失败，
且错误信息指向 output-wc 而不是 playground-engine，排查时容易误判成 engine 的问题。

补发的方式与 compiler-wasm 不同：这两个包版本跟随固定组，所以不能用独立 tag，
要走 `release.yml` 的 rc 通道重发——而 `0.2.0-rc.5` 这个版本号一旦在 npm 上存在过
就不能重复使用，需要确认那次发布到底是「从未推送」还是「推送失败」。
