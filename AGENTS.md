# AGENTS.md

本文件是 Zeus 仓库的**权威入口**：产品原则、强制约束、任务路由。

**语言约定：所有 agent 与贡献者必须以中文进行交流和回复。**

具体实现细节不在本文件。每节末尾给出权威文档位置；本文件与细节文档
冲突时，**细节文档为准**，同时应提交 PR 修正本文件。

---

## 1. 项目定义

Zeus 是一个**编译器优先（compiler-first）**的 UI 框架：

- 基于**细粒度响应式**，不做组件级重渲染
- **无 Virtual DOM**，编译器直接生成精确的 DOM 操作
- 编译器后端是 **Rust**（`crates/zeus_compiler`），Node 与浏览器两个宿主
- **Web Components 是一等编译目标**，不是适配层

**Zeus 不是**：Virtual DOM 框架、运行时解释 JSX 的框架、
状态变化时重渲染整棵树的框架、依赖隐藏式编译魔法的框架。

---

## 2. 核心产品原则（强制）

1. **组件不会重新渲染。** 组件初始化执行一次，之后只更新受影响的绑定点。
   把 rerender 当作主要更新模型是架构性错误。
2. **编译器是主角。** JSX/TSX 编译为静态模板克隆 + 直接 DOM 操作 + 精确绑定。
   不得实现为通用 `createElement → vnode → diff → patch`。
3. **运行时响应式是语义基础。** `createSignal` / `createMemo` / `createEffect` /
   `createRoot` / `onCleanup` / `batch` 是稳定基线；语法糖必须编译回这套语义。
4. **`alien-signal` 是内部引擎，不是公共契约。** 不得把它的类型暴露到公共 API。
5. **Web Components 是一等目标。** `defineElement` / `<Host>` / `<Slot>` /
   Shadow DOM / Light DOM 投影 / 属性反射 / 生命周期清理都必须成立。
   - **Light DOM 投影是 Zeus 自己的语义**，不是浏览器原生 `<slot>` 行为；
     必须支持具名与默认 slot。
   - **Attribute/property 反射**：`String` / `Number` / `Boolean` 支持
     attribute 监听与类型转换；对象/数组只支持 property 行为即可，
     不强制 attribute 序列化。
6. **Beta 阶段不保留历史兼容。** 旧 API 被取代时直接删除，不留 alias、
   转发函数、deprecated export、迁移窗口。发现仅用于历史兼容的代码应在
   同一改动中删除。
7. **显式优先于聪明。** 语义复杂的短 API 不如稍长但明确的 API。

> 决策冲突时按此顺序：细粒度更新 > 编译器降级 > 运行时语义稳定 >
> API 不依赖 alien-signal > Web Components 一等 > 逐层稳定 > 正确性 > 不引入 JS 魔法。

---

## 3. 渲染模型（强制）

- **不使用 Virtual DOM。** 组件返回 DOM 节点或片段，不是 VNode。
- **静态模板提取。** 缓存模板、克隆实例、绑定动态文本节点。
- **绑定必须精确到最小目标**：单个文本节点、一个 attribute、一个 property、
  一个 style 字段、一组 class token。
- **控制流**（`Show` / `For` / Fragment）编译为区域锚点与子树挂载/卸载，
  不是虚拟结构。
- **scope 与 cleanup 是必须项**：条件分支、列表项、Web Components 断开连接
  都必须释放对应的响应式 root。

**生成出的 custom element 必须把响应式作用域清理与三个生命周期打通：**
`connectedCallback`、`disconnectedCallback`、`attributeChangedCallback`。
元素断开连接时必须释放对应的响应式 root。

> 编译期内置节点：`Show`、`For`、`Host`、`Slot`。编译器必须显式识别，
> 不得当作普通组件或 DOM 标签。

---

## 4. Package 架构约束（强制）

`packages/` 按六个领域组织，**包的物理位置就是它的架构身份**：

| 领域       | 内含                                                                  | 允许依赖                                |
| ---------- | --------------------------------------------------------------------- | --------------------------------------- |
| `core`     | shared、signal、runtime-dom、runtime-ssr、zeus                        | 无                                      |
| `compiler` | compiler、compiler-shared、compiler-native、compiler-wasm、7 个平台包 | 无                                      |
| `features` | router、resource、query、i18n                                         | `core`                                  |
| `web-c`    | 10 个 Web Components 相关包                                           | `core`、`compiler`                      |
| `tooling`  | vite-plugin、eslint-plugin、testing、playground-engine、consumer      | `core`、`compiler`、`features`、`web-c` |
| `create`   | create-zeus、zeus-ui、registry                                        | 上述全部                                |

**强制规则：**

1. 新包必须明确归属领域，不能"因为挨着方便"就放。
2. 核心运行时不容纳可选生态能力。router / query / i18n / testing 不属于 `core`。
3. 编译器独立维护：Rust 源码在 `crates/`，npm 包在 `packages/compiler/`。
4. `core` 与 `compiler` 不依赖任何其他领域；需要向上依赖说明包放错了。
5. 正式发布包不得依赖 private 包。
6. 新增包必须同步 `scripts/check/check-structure.ts` 的领域列表与计数。
7. 必须执行 `pnpm check:structure`。它校验目录完整性、依赖方向、发布组、
   已废弃路径与包总数。CI 在 `pnpm check` **之后单独**执行它——本地复现
   两条命令都要跑。
8. **发布契约不随目录调整变化**：32 包固定发布组、8 包 Native 组，
   vite-plugin / compiler-wasm / create-zeus / zeus-ui 的独立版本线都必须保持。
9. 不得用旧路径兼容层维持错误结构。迁移后不留空目录、转发文件、旧路径
   re-export；`check:structure` 会把旧路径重现判为失败。

> 权威文档：[`docs/architecture/packages.md`](docs/architecture/packages.md)、
> 迁移清单 [`docs/architecture/packages-migration-map.md`](docs/architecture/packages-migration-map.md)

---

## 5. 编译器约束（强制）

编译器在 `crates/zeus_compiler`，两个宿主共用 `transform_module`：
Node 侧 `packages/compiler/compiler-native`（napi），浏览器侧
`packages/compiler/compiler-wasm`。

### 5.1 分层

```
support/       跨阶段叶子能力，不 import 任何阶段
ir.rs          编译语义的唯一事实来源
lower/         解析 + 语义分析 + JSX → ModuleIr（frontend.rs 收集事实）
passes/        对 IR 的重写，不改语义
analysis/      读 IR 得出事实，不发射
codegen/       事实 → JavaScript
pipeline.rs    阶段顺序与早退形状（transform_module 委托给它）
```

**核心规则：一个阶段可以计算事实并记录下来，但不得回头到后续阶段重新推导。**

**不要把 Babel AST 当作框架的长期内部协议。** 编译语义必须表达在 Zeus IR 中，
而不是 Babel 节点结构上——这是 Rust 编译器能够接管的前提。

### 5.2 当前结构：哪些已经分开，哪些是一个整体

测量于 `b1519092` 之后，每次重构后应重新测量：

| 文件                   | 行数  | 性质                                             |
| ---------------------- | ----- | ------------------------------------------------ |
| `lower/frontend.rs`    | ~970  | AST 事实收集。只读程序，返回数据，不碰 `Lowerer` |
| `lower/mod.rs`         | ~2680 | `Lowerer` 及其递归降级核心                       |
| `codegen/dom/emit.rs`  | ~1790 | DOM 发射族，47 个函数 + 4 个元素查找器           |
| `codegen/dom/model.rs` | ~600  | `GeneratedComponent`、`DynamicBinding` 及构造    |
| `codegen/dom/names.rs` | ~525  | `RuntimeNames`、`HelperUsage`（DOM 专属）        |
| `codegen/mod.rs`       | ~516  | 模块编排                                         |

**两处是强连通分量，不要再尝试按行切分：**

- `Lowerer` 的 35 个 `lower_*` 方法互相递归（child → component → 该组件的 children）。
  降级一棵树必然递归降级子节点，这不是可消除的耦合。
- `dom/emit.rs` 的 43 个函数同理：`emit_children_value` → `emit_inline_root` →
  `emit_component` → 该组件的 children。

把 DOM 发射族按 bindings / hydration / component 切开失败了两次；第三次把整块
作为一个单元移走才成功。失败的原因是同一个：**对一个递归单元做切片，然后期待
切片独立成立。** `Lowerer` 还没有被这样整块移动过——它现在就在原位，是一个整体。

`lower/mod.rs` 里剩下的辅助函数（`contains_jsx`、`kebab_to_camel`、
`decode_jsx_entities` 等）全部在 `Lowerer` 方法体内被调用，属于该单元的一部分。

**为什么 `Lowerer` 拆不开（三次实测）：** 按语义分组后计算传递闭包——

| 组        | 种子方法 | 闭包 | 逃逸到                                           |
| --------- | -------- | ---- | ------------------------------------------------ |
| attribute | 7        | 19   | `unsupported`、`allocate_id`、`lower_expression` |
| once      | 10       | 11   | `unsupported`                                    |
| component | 6        | 53   | 几乎全部                                         |

`unsupported` 单是组外调用就有 58 次——它是整个降级过程的诊断入口。
任何分组都逃逸到它，所以没有切点。`once` 组闭包最小（11），但移走后
仍要留一个转发壳，而那正是"一两个转发函数的模块"，不允许。

**结论：要拆 `Lowerer`，先改递归本身**（例如把子节点降级改成显式栈），
不是再试一次按语义切分。

### 5.3 必须遵守

1. **Rust IR 是编译语义的唯一事实来源**（`crates/zeus_compiler/src/ir.rs`）。
   `packages/compiler/compiler-shared` 是历史遗留、无源码消费者，
   不要为它同步新增字段；它仍在 32 包发布组内，退役是独立的发布决策，
   **不得作为重构副作用删除**。
2. **Lowering 不关心代码如何输出**，需要输出信息就通过 IR 传递。
3. **Codegen 不重新分析语义**，需要的事实由 analysis 预先算出。
4. **Native 与 WASM 必须基于同一套核心语义**，不得为某一侧复制编译逻辑。
5. **新增 JSX 语义的顺序**：先加黄金 fixture → 改 lowering → 改两侧 emitter。
6. **新增 Diagnostic**：`CompilerDiagnostic::error("ZEUS_*", message, file, span)`，
   code 稳定，位置精确。
7. **新增优化**写成对 `ModuleIr` 的独立函数，放在 emission 之前，
   不要写进 emitter 内部。
8. **升级 Oxc**：先 `cargo check`。报 `JSStr` 或 `Option<&str>` 错误说明
   MSRV 已提升，必须同时升级 toolchain、CI 与七平台矩阵，不能只改 `Cargo.toml`。
9. **验证 Source Map** 用黄金 fixture 比对 `map` 字段，不要只测长度或非空。
10. **`ZEUS_UPDATE_GOLDEN=1` 只在确认变更有意时使用**，且必须在提交信息里
    说明原因。为了让重构通过而刷新快照**不构成验证**。

> 权威文档：[`docs/architecture/compiler/pipeline.md`](docs/architecture/compiler/pipeline.md)
> （现行结构）、[`module-ownership.md`](docs/architecture/compiler/module-ownership.md)、
> [`ir-contract.md`](docs/architecture/compiler/ir-contract.md)
>
> 黄金基线 45 个 fixture，快照 code / map / diagnostics / hydrationPlan / hmrPlan。
> 位置：`crates/zeus_compiler/tests/golden.rs`。

---

## 6. 发布流程

发布链路、配对记录、策略文件、canary 与 RC 流程**不在此处展开**。

**强制边界（不可协商）：**

- `release-pairing/` 与 `release-policy/` 是发布链路的运行时输入，
  **不得无审查迁移或删除**。`write-pair-attestation.ts` 通过 GitHub
  contents API 按路径读取它们。
- `vendor/` 产物必须保持 provenance（`provenance.json` 校验其来源提交）。
- 不得执行 `npm publish`、`npm dist-tag` 或创建 Release Tag，除非任务明确授权。
- 不得借目录移动刷新 Golden。

> 权威文档：[`docs/release-process.md`](docs/release-process.md)、
> [`docs/architecture/compiler/dependency-upgrade-plan.md`](docs/architecture/compiler/dependency-upgrade-plan.md)

---

## 7. 任务路由

| 我要做的事           | 先读                                                                                                |
| -------------------- | --------------------------------------------------------------------------------------------------- |
| 改编译器语义         | [`docs/architecture/compiler/pipeline.md`](docs/architecture/compiler/pipeline.md) + `AGENTS.md` §5 |
| 新增/移动包          | [`docs/architecture/packages.md`](docs/architecture/packages.md) + `AGENTS.md` §4                   |
| 发布、打 tag、canary | [`docs/release-process.md`](docs/release-process.md) + `AGENTS.md` §6                               |
| 看历史决策           | `docs/adr/`、`docs/architecture/`                                                                   |
| 看某次事故的根因     | `docs/release/`、`docs/internal/`                                                                   |
| 部署宿主机 / 容器    | [`docs/deployment/`](docs/deployment/)                                                              |
| Web Components 语义  | `AGENTS.md` §2.5、`docs/compiler-host/`                                                             |

**注意：** `docs/architecture/compiler/current-pipeline.md` 是 **R17.0 之前
的历史快照**，其中行号已全部失效。现行结构看 `pipeline.md`。

---

## 8. 非目标（当前阶段）

以下不属于当前范围，不要主动引入：

- 完整样式系统、CSS-in-JS
- 大规模内置组件生态
- 类 Suspense 的编排、server components
- 对普通 `let` 的隐式自动响应式、对任意 JS 语义的深度编译期改写
- 全局重定义普通变量与赋值语义

**注意 SSR 与 hydration 已不在非目标内**——仓库已有 `runtime-ssr` 包、
SSR 目标与 `crates/zeus_compiler/src/analysis/hydration.rs`。旧版本文档曾把它们列为非目标，
该结论已过期。

---

## 9. 文档索引

| 主题             | 位置                                                 |
| ---------------- | ---------------------------------------------------- |
| 包架构与迁移     | `docs/architecture/packages*.md`                     |
| 编译器结构与契约 | `docs/architecture/compiler/`                        |
| 历史审计         | `docs/architecture/r16-*.md`、`r18-*.md`、`r19-*.md` |
| CI 历史报告      | `docs/ci/`                                           |
| 发布记录         | `docs/release/`                                      |
| 内部证据         | `docs/internal/`（VitePress 已排除，不发布）         |
| 验收证据         | `docs/acceptance/`                                   |
