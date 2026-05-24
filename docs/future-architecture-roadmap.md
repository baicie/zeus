# Zeus 远期架构路线图

本文档记录不应阻塞当前 MVP，但会影响 Zeus 长期架构方向的主题。

这些内容不建议塞进 `compiler-ir-first-architecture-plan.md` 的主执行路径里。当前阶段应优先完成：

```txt
TSX -> Zeus IR -> DOM codegen -> runtime-dom binding -> 细粒度 DOM 更新
```

本文档中的主题更适合作为后续 RFC、ADR 或独立 milestone。

---

## 1. SSR / Hydration 详细设计

### 1.1 目标

Zeus 初期不做 SSR / hydration，但 IR 设计不能排斥未来支持。

长期目标：

- server codegen 可以从 Zeus IR 生成 HTML string / stream
- client codegen 可以复用同一 IR 生成 hydration 逻辑
- hydration 不引入 Virtual DOM
- hydration 以 template markers / DOM path / region 为基础

### 1.2 核心问题

需要解决：

- server 输出如何保留动态绑定点
- client 如何定位已有 DOM
- `Show` / `For` 的 region 如何 hydration
- event handler 如何延迟绑定
- Web Components shadow / light DOM 如何参与 hydration
- mismatch 如何诊断

### 1.3 可能方向

IR 中保留 hydration metadata：

```ts
export type HydrationMarker = {
  id: string
  kind: 'text' | 'region' | 'component' | 'slot'
}
```

server 输出：

```html
<button>count: <!--z-h:0-->0<!--/z-h:0--></button>
```

client codegen：

```ts
const _text$ = _hydrateText(_root$, '0')
_bindText(_text$, () => count())
```

### 1.4 非目标

第一阶段不做：

- partial hydration
- islands
- server components
- streaming suspense

---

## 2. Rust Compiler AST / IR 序列化协议

### 2.1 目标

Zeus 未来可能迁移到 Rust compiler backend。当前 TypeScript/Babel 版本应把 IR 设计成可迁移的内部协议。

### 2.2 核心原则

- IR 不依赖 Babel `NodePath`
- IR 不长期依赖 Babel `t.Expression`
- source location 使用独立 `SourceSpan`
- diagnostics 使用稳定 error code
- IR 可序列化为 JSON

### 2.3 Expression 过渡模型

当前 TypeScript compiler 可以使用：

```ts
export type ExpressionIR = {
  kind: 'BabelExpression'
  node: t.Expression
  debug?: string
}
```

长期 Rust-compatible 形态：

```ts
export type ExpressionIR = {
  kind: 'SourceExpression'
  source: string
  span: SourceSpan
}
```

### 2.4 序列化协议草案

```ts
export type SerializedIR = {
  version: 1
  source: {
    filename?: string
  }
  root: SerializedIRNode
  diagnostics: SerializedDiagnostic[]
}
```

---

## 3. Source Map 精准映射算法

### 3.1 目标

编译输出需要能映射回用户 TSX。

这影响：

- 浏览器调试
- 编译错误定位
- runtime warning 定位
- Vite HMR overlay

### 3.2 关键挑战

- template hoist 到 module scope 后，如何映射回 JSX
- dynamic binding statement 如何映射到 JSX expression
- helper import 不应污染 source map
- generated marker 不对应用户源代码

### 3.3 建议

IR 所有节点保留：

```ts
span?: SourceSpan
```

codegen 时：

- template declaration 映射到 JSX element opening tag
- binding expression 映射到原 JSX expression
- event handler 映射到 attr expression
- generated helper import 无 source mapping

---

## 4. HMR Runtime 协议

### 4.1 目标

Vite 集成阶段需要开发期热更新。

Zeus 组件初始化只执行一次的模型与 HMR 天然有冲突，因此需要明确 HMR 边界。

### 4.2 可行策略

第一阶段：

- 文件更新后整块 remount
- 保证 cleanup 正确
- 不保留组件局部状态

第二阶段：

- 识别 stable component boundary
- 尝试 preserve signal state
- template-only change 局部替换

### 4.3 Runtime hook 草案

```ts
export type HMRBoundary = {
  id: string
  dispose: () => void
  remount: () => void
}

export function registerHMRBoundary(boundary: HMRBoundary): void
```

---

## 5. Devtools Hooks

### 5.1 目标

Zeus 后续需要开发工具观察：

- signal graph
- effect 执行
- component 初始化
- owner/scope tree
- DOM binding 点

### 5.2 Hook 草案

```ts
export type DevtoolsHook = {
  onComponentInit?(info: ComponentInfo): void
  onEffectRun?(info: EffectInfo): void
  onScopeDispose?(info: ScopeInfo): void
  onBindingUpdate?(info: BindingInfo): void
}
```

### 5.3 编译器配合

dev mode codegen 可注入：

```ts
_devComponent('Counter', {
  file: 'Counter.tsx',
  line: 1,
})
```

production 不输出 devtools metadata。

---

## 6. 编译缓存失效策略

### 6.1 目标

Vite plugin 和未来 Rust backend 都需要缓存。

### 6.2 Cache Key

缓存 key 至少包含：

```txt
source content
filename
compiler options
runtime contract version
compiler version
environment mode
```

### 6.3 不应缓存

- diagnostics 中含 fatal error 的结果
- 依赖外部配置但未纳入 key 的结果

---

## 7. Tree-shaking / Code Splitting

### 7.1 目标

Zeus 生成代码应保持 bundler 友好。

原则：

- runtime helper 按需 named import
- 不 import 整个 runtime namespace
- dev-only helper 只在 dev mode 输出
- Web Components runtime 独立于 DOM runtime

### 7.2 推荐输出

```ts
import { template, bindText } from '@zeus-js/runtime-dom'
```

避免：

```ts
import * as runtime from '@zeus-js/runtime-dom'
```

---

## 8. Keyed Reconciliation 详细算法

### 8.1 目标

`For` MVP 可先全量重建，但长期需要 keyed reconciliation。

### 8.2 IR 预留

```ts
export type ForIR = {
  kind: 'For'
  each: ExpressionIR
  item: t.Identifier
  index?: t.Identifier
  key?: ExpressionIR
  body: ZeusIRNode[]
}
```

### 8.3 Runtime 方向

```ts
bindFor(region, each, renderItem, {
  key?: item => key,
})
```

长期目标：

- 节点复用
- item scope 复用
- 删除 item 时 dispose
- reorder 时移动 DOM，而不是重建

---

## 9. Web Components Light DOM Projection

### 9.1 目标

`shadow: false` 时，Zeus 不能依赖原生 `<slot>`。

Light DOM projection 是 Zeus 自己的语义。

### 9.2 核心问题

- 收集 host 原始 childNodes
- 按 `slot` attribute 分组
- 默认 slot 分发
- named slot 分发
- host children 变化后重新投影
- 投影节点 cleanup

### 9.3 Runtime 草案

```ts
export type Projection = {
  dispose: () => void
}

export function createLightDOMProjection(
  host: HTMLElement,
  slots: SlotTarget[],
): Projection
```

```ts
export type SlotTarget = {
  name?: string
  marker: Comment
}
```

### 9.4 MutationObserver

需要监听：

- childList
- `slot` attribute 变化

---

## 10. Trusted Types / CSP 安全策略

### 10.1 目标

Zeus 使用 `template.innerHTML`，长期需要考虑 Trusted Types。

### 10.2 原则

- 动态 expression 永远不拼入 template HTML
- static template 由 compiler 生成
- runtime 可接受 TrustedHTML

### 10.3 Runtime 扩展

```ts
export type TemplateHTML = string | TrustedHTML

export function template(html: TemplateHTML): () => Node
```

### 10.4 Policy 注入

```ts
configureRuntimeDOM({
  trustedTypesPolicy,
})
```

---

## 11. Benchmark Suite

### 11.1 目标

建立性能基线，避免优化无方向。

### 11.2 编译期 benchmark

记录：

- 100 components transform time
- 1000 elements transform time
- generated code size
- template count
- helper import count

### 11.3 运行期 benchmark

记录：

- initial render time
- signal update text binding
- attr binding update
- event dispatch
- Show toggle
- For append/remove/reorder

### 11.4 对比对象

可参考：

- SolidJS
- Preact signals
- vanilla DOM baseline

---

## 12. 远期主题优先级

推荐顺序：

1. HMR runtime 协议
2. source map 精准映射
3. keyed reconciliation
4. light DOM projection
5. benchmark suite
6. compile cache
7. devtools hooks
8. Trusted Types / CSP
9. SSR / hydration
10. Rust compiler 序列化协议

理由：

- HMR / source map 直接影响开发体验。
- keyed reconciliation / light DOM projection 直接影响 Zeus 的核心能力。
- benchmark 应在大规模优化前建立。
- SSR / Rust 是长期目标，应在核心 DOM compiler 稳定后推进。
