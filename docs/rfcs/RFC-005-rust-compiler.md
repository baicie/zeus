# RFC-005：Rust 编译器架构与迁移策略

## 状态

Accepted

## 背景

Zeus 当前使用 Babel 8 完成 TSX / JSX 解析、Zeus IR lowering、DOM / SSR
codegen 和 source map 生成。`@zeus-js/compiler-shared` 已经把 JSX 子树 IR
从 Babel AST 中分离出来，但整个模块的名称分配、runtime helper import、静态模板、
事件委托和 `defineElement` binding 分析仍由 Babel scope 与 plugin state 持有。

Rust 化的目标不是把 Babel API 逐个翻译成 Rust，也不是新增一个可长期并存的后端。
目标是建立唯一的模块编译接口，并在语义等价后直接由 Rust 实现接管：

```text
TSX / JSX source
  -> parse + semantic analysis
  -> owned Zeus IR
  -> validate + optimize passes
  -> DOM / SSR codegen + source map
  -> transformModule result
```

Zeus 仍然遵守 RFC-001 至 RFC-004：组件只初始化一次、直接操作 DOM、Zeus IR
是长期语义协议，Web Components 是一等目标，DOM 与 SSR 共用 lowering 语义。

## 决策

### 1. 选择 Oxc，不选择 SWC

Rust 编译器底座采用精确锁版的 Oxc crates，Node 绑定采用 napi-rs 3。
首个实现基线为 Oxc `0.144.0`，最低 Rust 版本为 `1.95.0`。

| 方案                         | 结论   | 主要原因                                                                                                                         |
| ---------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------- |
| Oxc                          | 采用   | TSX parser、semantic、traverse、codegen、diagnostics 与 source map 可按需组合；与 Vite 8 / Rolldown 当前技术栈一致               |
| SWC                          | 不采用 | 生态和生产历史更成熟，但会引入与 Rolldown 并行的 AST、resolver、codegen 与 native 发布栈；对 Zeus 没有足以抵消重复成本的能力优势 |
| Biome parser                 | 不采用 | 适合 lossless syntax / formatter 场景，不提供 Zeus 所需的一体化 semantic transform 与 JS codegen 路径                            |
| tree-sitter                  | 不采用 | 适合增量语法树和编辑器，不承担 TypeScript semantic、AST mutation 与 codegen                                                      |
| Rolldown / Vite 内部 Oxc API | 不采用 | API 由 bundler 生命周期拥有，不能成为独立 compiler、Rollup 和其他宿主的稳定边界                                                  |
| 自研 parser                  | 不采用 | 与 Zeus 产品价值无关，语法兼容和诊断成本过高                                                                                     |

不启用 Oxc 的 `full` umbrella feature。每个使用到的 crate 显式列出并保持完全同版，
避免无关能力、重复编译成本和隐式版本漂移。Oxc AST 的 API 仍在快速演进，因此所有
Oxc 类型必须限制在纯 Rust compiler crate 内，不能进入 Zeus IR、NAPI 对象或公共
TypeScript 类型。

### 2. 从两个 Rust crate 开始

初期只建立两个职责边界：

- `zeus_compiler`：纯 Rust compiler，拥有 Oxc parse / semantic adapter、Zeus IR、
  passes、DOM / SSR codegen 和结构化诊断。
- `zeus_compiler_node`：薄 napi-rs adapter，只负责 JavaScript 对象转换、panic
  containment 和 native entry 导出。

不提前按 DOM、SSR、Web Components、IR、diagnostics 拆成更多 crate。只有当真实的
编译边界或独立复用需求出现后才继续拆分。未来 WASM 是另一个薄 adapter，不改变
`zeus_compiler` 的核心接口。

### 3. 唯一模块接口

Rust core 和 Node adapter 共同实现以下语义接口：

```ts
interface TransformModuleOptions {
  source: string
  filename: string
  target: 'dom' | 'ssr'
  runtimeModule: string
  delegateEvents: boolean
  sourceMap: boolean
}

interface TransformModuleResult {
  code: string
  map: RawSourceMap | null
  diagnostics: CompilerDiagnostic[]
}

function transformModule(options: TransformModuleOptions): TransformModuleResult
```

语法或 Zeus 语义错误通过 `diagnostics` 返回；native 加载失败、参数 ABI 错误或 Rust
panic 才是 Node exception。不得使用 `success: false + error: string`，不得吞掉错误后
返回 `null`，也不得在 Rust 失败时静默回退 Babel。

`@zeus-js/compiler` 在迁移完成后仍是唯一公共入口。迁移期的 native Node package
是私有验证宿主，不进入固定版本发布组，也不新增公共 `backend` 选项。

### 4. Zeus IR 所有权

Oxc AST 是单次编译调用内的借用数据；Zeus IR 是可拥有、可序列化、与 parser 无关的
语义数据。lowering 完成后，passes 和 codegen 不得依赖 Oxc node、arena lifetime、
semantic ID 或 source slice。

Rust IR 与 `@zeus-js/compiler-shared` 必须通过共同 fixture 做 JSON 等价测试。在 Rust
成为默认后端前，当前 IR 还需收敛以下问题：

- `ProgramIR` 必须真正承载模块级 templates、runtime imports、delegated events 和
  target metadata，而不是把这些状态藏在 Babel scope data 中。
- node ID 每个模块从固定值开始，输出确定且可并行编译。
- DOM ref 是语义引用，不保存 Babel 生成的 JavaScript 变量名；变量名由 codegen
  adapter 分配并负责名称卫生。
- expression 只保存源码与 Zeus span，不保存 Oxc / Babel expression node。

首个纵向切片允许只实现已覆盖节点的 owned Rust IR，但字段含义必须遵守上述方向，
且不得把临时 Oxc 类型包装成“IR”。

### 5. span 与 source map

`SourceSpan` 采用以下明确规则：

- `offset`：从文件开始计算的 UTF-8 byte offset，end 为 exclusive；
- `line`：1-based；
- `column`：0-based UTF-16 code unit column，与 Source Map v3、Vite 和浏览器一致。

Oxc byte span 在 adapter 边界转换为该结构。必须用包含 emoji、CJK 和 CRLF 的测试
证明转换，不能用 ASCII-only fixture 代替。

source map 属于编译结果契约。动态表达式和诊断位置必须回到原始 TSX；生成的 helper、
template 和锚点可以没有原始映射，但不能伪装成源文件第 1 行。Vite / Rollup 只能消费
Rust compiler 返回的 map，不得重新猜测位置。

### 6. TypeScript 与宿主职责

Zeus compiler 负责解析 TypeScript 并移除 JSX，但迁移期不负责完整的 TypeScript
downlevel。类型擦除和目标语法降级继续由 Vite / Rolldown 的后续 pipeline 负责，行为与
当前 Babel plugin 一致。独立调用 `transformModule` 的输出因此允许保留 TypeScript
syntax，调用方必须按接口文档选择后续 transformer。

### 7. 迁移与删除门槛

迁移采用内部 tracer bullets，不采用公开双后端：

1. 原生 DOM 元素：静态模板、动态文本、attribute、property、event、ref；
2. Fragment 与普通组件；
3. `Show` / `For` 与子树 cleanup；
4. `Host` / `Slot`、基于 symbol 的 `defineElement` 识别；
5. RFC-004 SSR；
6. HMR transform；
7. Vite 与 Web-C bundler adapter 统一切换。

切换默认实现前必须同时满足：

- 现有 DOM、SSR、Web Components 和 compiler diagnostics 测试语义等价；
- source map 在 Vite dev、Vite build 和 Rollup 中通过精确映射测试；
- Linux、macOS、Windows 的 Node 目标有可复现 prebuild 与加载测试；
- native package 的 provenance、optional platform packages 和 canary 流程已验证；
- 性能和二进制大小至少有基线报告，不以未经测量的“Rust 更快”作为切换理由。

门槛满足后，直接删除 Babel compiler、Babel HMR pass、无效配置和重复 bundler
transform adapter。Zeus beta 不保留 alias、deprecated export、Babel fallback 或迁移
窗口。

## 首个纵向切片

首个切片必须覆盖一条真实可执行路径：

```tsx
export const App = (props: { name: string }) => (
  <div class="greeting">Hello {props.name}</div>
)
```

验收路径：

```text
TSX
  -> Oxc parse + semantic
  -> owned Zeus IR
  -> static template + dynamic text DOM codegen
  -> exact source map
  -> napi-rs transformModule
  -> Node/Vite 加载并执行真实 runtime
```

它暂不接管默认 `@zeus-js/vite-plugin`，但必须由测试证明不是 parser demo：输出中不存在
JSX，组件返回真实 DOM，更新 signal 只修改动态 text binding，source map 能把生成的
`props.name` 定位回输入表达式。

## 被拒绝的迁移方式

- 恢复 2026 年 1 月至 4 月被删除的旧 Rust compiler：它早于当前 RFC / IR，横向铺开
  DOM、SSR、Web Components 和 WASI，存在重复 target、TODO、静默错误与弱集成测试。
- 先把 Babel IR 经 NAPI 送入 Rust passes：仍需 Babel parse，并把 migration 变成永久
  双解析架构。
- 先发布空 native package 或只返回 parse 成功：没有验证 Zeus compiler 的语义路径。
- 长期同时维护 Babel / Rust 选项：与 beta 阶段“唯一正确设计”原则冲突。

## 后果

正面后果：

- Rust 后端与 Vite 8 / Rolldown 的 Oxc 生态对齐；
- compiler core 可被 Node、未来 WASM 和其他宿主复用；
- Zeus IR 与诊断成为真正的跨语言协议；
- 迁移完成后删除 Babel 和重复 adapter，公共 API 不扩大。

成本与风险：

- Oxc `0.x` API 更新需要集中 adapter 升级和完整回归；
- napi-rs 增加跨平台 prebuild、发布和供应链工作；
- arena AST 与 owned IR 之间需要明确复制，不能用 lifetime 技巧跨越 NAPI；
- source map、名称卫生和 Unicode span 是正确性门槛，不能推迟到最后补齐。
