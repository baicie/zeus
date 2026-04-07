# Zeus 开发计划

> 本文档记录 Zeus 框架的开发任务清单，包括待办事项、进行中的工作和已完成的功能。

## 1. 任务概览

| 状态 | 数量 | 说明 |
|------|------|------|
| ✅ 已完成 | 13 | 功能已完成并测试通过 |
| 🔄 进行中 | 4 | 正在开发中 |
| 📋 待开始 | 18 | 计划中，尚未开始 |

---

## 2. 编译器开发

### 2.1 核心编译器 (compiler-core)

#### ✅ 已完成

| 任务 | 完成日期 | 说明 |
|------|----------|------|
| oxc_parser 集成 | 2026-03 | JSX/TSX 解析 |
| oxc_traverse 集成 | 2026-03 | AST 遍历框架 |
| oxc_codegen 集成 | 2026-03 | 代码生成 |
| 模板清理逻辑 | 2026-03 | 移除占位注释、优化空白 |
| 委托事件收集 | 2026-03 | 收集 onClick 等事件 |
| JSXElement → template() 转换 | 2026-03 | 元素转换为模板调用 |
| JSXFragment 支持 | 2026-03 | 片段支持 |
| 条件表达式 (ternary) 模板生成 | 2026-03 | 三元运算符模板处理 |
| 逻辑与表达式模板生成 | 2026-03 | `&&` 运算符模板处理 |

#### 🔴 已阻塞

| 任务 | 阻塞原因 | 说明 |
|------|----------|------|
| ~~Target 枚举统一~~ | ~~compiler-common Target 定义冲突~~ | ~~需合并两个 Target 定义~~ |

**阻塞详情**:
- ~~`compiler-core/src/traverse.rs:208-216` 定义了 `Target` 枚举~~
- ~~`compiler-common/src/config.rs` 也定义了 `Target` 枚举~~
- 修复步骤：
  1. ✅ 在 `compiler-common/src/config.rs` 中定义统一的 `Target`
  2. ✅ 从 `compiler-core` 移除重复定义
  3. ✅ 更新 `compiler-dom` 和 `compiler-ssr` 的引用
  4. ✅ 验证编译通过

> **2026-04-02**: Target 枚举统一问题已解决
> - 从 `compiler-core/src/traverse/state.rs` 移除了重复的 `Target` 定义
> - `Target` 现在统一从 `zeus_compiler_common::Target` 导入
> - 修复了相关的类型错误和导入问题

#### 🔄 进行中

| 任务 | 开始日期 | 预计完成 | 说明 |
|------|----------|----------|------|
| if-return → ternary 转换 | 2026-03-15 | 2026-03-30 | AST 替换逻辑完善中，进度 60% |
| 列表渲染 (.map()) 支持 | 2026-03-20 | 2026-03-30 | 检测框架已搭建，实际转换需完善，进度 40% |

**if-return → ternary 进度详情** (2026-04-01):
- ✅ 框架已搭建 (`should_transform_to_ternary`, `statement_returns_jsx`, `expression_is_jsx`)
- ✅ `transform_to_ternary` 方法已实现，收集转换信息
- ✅ `TernaryTransform` 结构体已定义，用于存储转换信息
- ✅ 在 `enter_if_statement` 中收集需要转换的 if 语句
- ⚠️ AST 节点替换需要更复杂的实现（oxc_traverse 限制）
- ⚠️ 当前采用简化方案：仅收集信息，不进行实际替换
- 关键文件: `crates/compiler-core/src/traverse/control_flow.rs`
- 阻塞原因: oxc_traverse 不支持直接修改当前遍历路径上的节点

#### 📋 待开始

| 任务 | 优先级 | 依赖 | 说明 |
|------|--------|------|------|
| if-return → ternary AST 替换 | P0 | traverse | 完成节点替换逻辑 |
| 响应式数据自动识别 | P0 | traverse | 识别 signal() 等响应式调用 |
| 组件识别增强 | P1 | - | 识别内置组件、HOC |
| 语义分析集成 | P1 | traverse | 变量作用域分析 |
| 错误诊断增强 | P2 | - | 更友好的错误信息 |

### 2.2 DOM 编译器 (compiler-dom)

#### ✅ 已完成

| 任务 | 完成日期 | 说明 |
|------|----------|------|
| JSXElement 转换 | 2026-03 | 转换为 template() 调用 |
| JSXFragment 支持 | 2026-03 | 片段支持 |
| 属性分析器 | 2026-03 | 静态/动态属性识别 |
| 模板 IR | 2026-03 | 中间表示定义 |
| 条件表达式模板生成 | 2026-03 | ternary 分支模板处理 |
| 逻辑与表达式模板生成 | 2026-03 | `condition && <JSX />` 处理 |

#### 📋 待开始

| 任务 | 优先级 | 依赖 | 说明 |
|------|--------|------|------|
| 动态元素 | P1 | traverse | `<{tag}>` 动态标签 |
| ref 支持 | P1 | - | DOM 引用 |
| 异步组件 | P2 | - | Suspense, lazy |

### 2.3 SSR 编译器 (compiler-ssr)

#### 📋 待开始

| 任务 | 优先级 | 依赖 | 说明 |
|------|--------|------|------|
| SSR 基础框架 | P0 | compiler-core | SSR 编译器基础 |
| ssr() 函数 | P0 | runtime | SSR 模板函数 |
| ssrElement() | P1 | runtime | 动态元素创建 |
| 模板字符串生成 | P1 | compiler-dom | SSR 模板生成 |
| Hydration 支持 | P2 | - | 客户端水合 |
| 流式 SSR | P3 | - | 流式渲染 |

### 2.4 WebComponent 编译器 (compiler-web-component)

#### 📋 待开始

| 任务 | 优先级 | 依赖 | 说明 |
|------|--------|------|------|
| 基础框架 | P1 | compiler-core | WebComponent 编译器基础 |
| 自定义元素识别 | P1 | - | 识别 `<my-element>` |
| Shadow DOM | P2 | - | Shadow DOM 支持 |
| Slot 处理 | P2 | - | 插槽系统 |
| prop 传递 | P2 | - | 属性传递 |
| 生命周期 | P3 | - | connectedCallback 等 |

---

### 2.5 Babel JSX 编译器 (packages/compiler)

#### ✅ 已完成

| 任务 | 完成日期 | 说明 |
|------|----------|------|
| `packages/compiler` 初始化 | 2026-04-07 | Babel 插件入口、config/shared、pre/post process |
| 最小 DOM 转换 | 2026-04-07 | 静态元素、文本、class/className、事件委托、insert |
| 组件基础转换 | 2026-04-07 | 大写标签转换为 `createComponent` |
| `transformSync`/`transformAsync` API | 2026-04-07 | Programmatic API 可用 |
| 构建工具集成包 | 2026-04-07 | preset/rollup/vite 三个 addons 落地 |

#### 📋 待开始

| 任务 | 优先级 | 说明 |
|------|--------|------|
| Fragment 完整支持 | P1 | 非空 Fragment 和复杂嵌套 |
| spread/ref/directive | P1 | `...props`、`ref`、`use:` 等 |
| SSR / universal | P1 | `generate: ssr/universal` 路线 |
| 动态 style 全量支持 | P2 | style object/string 的动态更新策略 |

---

## 3. 响应式自动编译 ⚡ 核心特性

> **设计理念**: 编译器自动识别 JSX 中的响应式数据（signal()、memo() 等），转换为最优的运行时函数调用。用户只需写纯 JSX，无需使用 Show/For 等特殊组件。

### 3.1 设计原理

#### 用户代码 (输入)
```tsx
function Counter() {
  const [count, setCount] = createSignal(0);
  const [items, setItems] = createSignal([1, 2, 3]);

  return (
    <div>
      {/* 条件渲染 - 自动识别 */}
      {count() > 0 && <span>Count is positive</span>}

      {/* 三元条件 - 自动识别 */}
      {count() === 0 ? <Empty /> : <Full count={count()} />}

      {/* 列表渲染 - 自动识别 */}
      {items().map(item => <li key={item}>{item}</li>)}
    </div>
  );
}
```

#### 编译输出 (自动转换)
```js
function Counter() {
  const [count, setCount] = createSignal(0);
  const [items, setItems] = createSignal([1, 2, 3]);

  const _tmpl$1 = template("<div><!----><!----><!----></div>");

  return (() => {
    const _el$1 = _tmpl$1();
    // 条件渲染 - 编译为 yield _
    insert(_el$1, () => count() > 0
      ? (template("<span>Count is positive</span>")())
      : undefined, _el$1.firstChild);

    // 三元条件 - 编译为 yield _
    insert(_el$1, () => count() === 0
      ? (template("<!---->")())  // Empty 组件
      : (template("<!---->")()), _el$1.childNodes[1]);  // Full 组件

    // 列表渲染 - 编译为 For 优化
    insert(_el$1, () => items().map(item =>
      (template(`<li><!--[${item}]--></li>`))()
    ), _el$1.lastChild);

    return _el$1;
  })();
}
```

### 3.2 响应式模式识别

#### 📋 待实现

| 模式 | 识别规则 | 编译策略 | 优先级 |
|------|----------|----------|--------|
| 条件渲染 | `signal() && <JSX />` | 编译为 `yield_` 或 ternary | P0 |
| 列表渲染 | `arr.map(fn)` 在 JSX 中 | 编译为 `For` 优化 | P0 |
| 可选值 | `signal()?.prop` | 保留可选链或编译为条件 | P1 |
| 批量更新 | 多个相邻 signal 写入 | 编译为 `batch()` 包装 | P2 |
| 派生计算 | `memo(fn)` 在 JSX 中 | 编译为 `createMemo` 调用 | P2 |

### 3.3 核心转换规则

#### 条件渲染转换

| JSX 模式 | 识别条件 | 编译输出 |
|-----------|----------|----------|
| `{cond && <El />}` | cond 调用 signal() | `yield_(cond ? template()() : undefined)` |
| `{cond ? <A /> : <B />}` | test 调用 signal() | `yield_(cond ? templateA()() : templateB()())` |
| `{cond ? <A /> : null}` | test 调用 signal() | `yield_(cond ? templateA()() : undefined)` |

#### 列表渲染转换

| JSX 模式 | 识别条件 | 编译输出 |
|-----------|----------|----------|
| `{arr.map(fn)}` | 数组方法调用 | 提取为独立模板，生成 `For` 调用 |
| `{items().map(...)}` | signal 调用后接 map | 同上，自动解包 signal |

### 3.4 实现计划

#### 🔄 进行中

| 任务 | 说明 | 进度 |
|------|------|------|
| if-return → ternary 转换 | AST 节点替换 | 60% |
| .map() 列表渲染识别 | 识别并转换为 For | 40% |

#### 📋 待开始

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 响应式调用识别 | P0 | 识别 `signal()`, `memo()` 等调用 |
| yield_ helper 实现 | P0 | 条件渲染的运行时支持 |
| For helper 实现 | P0 | 列表渲染的运行时支持 |
| 嵌套响应式处理 | P1 | `signal().map(x => <El>{x}</El>)` |
| 动态属性识别 | P1 | `{signal()}` 作为属性值 |
| key 属性处理 | P1 | 列表渲染中的 key 优化 |

---

## 4. 自定义绑定语法

> **说明**: 仅保留真正提升开发体验的语法，移除冗余或可通过标准 JSX 轻松替代的特性。

### 4.1 保留的绑定语法 ⭐

| 语法 | 示例 | 说明 | 优先级 |
|------|------|------|--------|
| 条件类名 | `<div class:active={cond}>` | 简洁的条件类名绑定 | P0 |
| 布尔属性 | `<button bool:disabled={cond}>` | 布尔属性优化 | P1 |
| 指令 | `<div use:action={fn}>` | 自定义指令，类似 SolidJS | P0 |

**为什么不实现其他语法**:
- `style:color="red"` → `style={{color: 'red'}}` 已经足够简洁
- `on:click={handler}` → 已有 `onClick` 等标准语法
- `prop:value={val}` → `value={val}` 更直观
- `{/* @once */}` → 编译器自动优化静态内容

### 4.2 条件类名 (`class:active={cond}`)

#### 📋 待开始

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 命名空间解析 | P0 | 解析 `class:*` 前缀 |
| class 合并逻辑 | P0 | 静态 class + 动态 class 合并 |
| OXC 适配 | P1 | JSX 属性扩展处理 |

### 4.3 指令系统 (`use:action={fn}`)

#### 📋 待开始

| 任务 | 优先级 | 说明 |
|------|--------|------|
| use: 前缀解析 | P0 | 解析 `use:*` 指令 |
| 指令运行时 | P0 | `register指令` 调用 |
| 元素引用传递 | P0 | 将 DOM 元素传给指令函数 |
| cleanup 支持 | P1 | 指令销毁时的清理 |

**使用示例**:
```tsx
// 用户代码
function MyComponent() {
  const myAction = (el) => {
    el.focus();
    return () => el.blur(); // cleanup
  };
  return <input use:myAction />;
}

// 编译输出
const _el$1 = template("<input>");
const _action = (el) => { el.focus(); return () => el.blur(); };
const _node = _el$1();
register指令(_node, _action);
```

### 4.4 布尔属性 (`bool:disabled={cond}`)

#### 📋 待开始

| 任务 | 优先级 | 说明 |
|------|--------|------|
| bool: 前缀解析 | P1 | 解析 `bool:*` 前缀 |
| 布尔值处理 | P1 | true → 属性, false → 移除属性 |

---

## 5. 运行时开发

### 5.1 核心运行时 (runtime-core)

#### ✅ 已完成

| 任务 | 说明 |
|------|------|
| template() | 模板创建 |
| insert() | 动态内容插入 |
| delegateEvents() | 事件委托 |
| effect() | 副作用追踪 (来自 signal) |
| className() | 类名设置 |
| style() | 样式设置 |
| setAttribute() | 属性设置 |
| 组件系统 | component, render 等 |

#### 🔄 进行中

| 任务 | 说明 |
|------|------|
| yield_ | 条件渲染 helper (响应式条件) |
| For | 列表渲染优化 helper |

#### 📋 待开始

| 任务 | 优先级 | 说明 |
|------|--------|------|
| yield_ 实现 | P0 | 条件渲染的运行时支持 |
| For 实现 | P0 | 列表渲染的运行时支持 |
| memo() 封装 | P1 | createMemo 调用封装 |
| Portal 组件 | P2 | 传送到其他位置 |
| Dynamic 组件 | P2 | 动态组件 |

### 5.2 SSR 运行时 (server-renderer)

#### 📋 待开始

| 任务 | 优先级 | 说明 |
|------|--------|------|
| escape() | HTML 转义 |
| ssr() | SSR 模板创建 |
| ssrElement() | SSR 元素创建 |
| hydration() | 客户端水合 |

### 5.3 响应式系统 (signal)

#### ✅ 已完成

| 任务 | 说明 |
|------|------|
| signal() | 创建信号 |
| effect() | 创建副作用 |
| memo() | 创建计算值 |
| batch() | 批量更新 |
| untrack() | 忽略追踪 |

#### 📋 待开始

| 任务 | 优先级 | 说明 |
|------|--------|------|
| createRoot() | 创建响应式根作用域 |
| createSignal() | 带选项的信号 |
| onCleanup() | 清理回调 |
| onMount() | 挂载回调 |

---

## 6. 构建工具

### 6.1 Rolldown 插件 (bundle-plugin)

#### 🔄 进行中

| 任务 | 说明 | 进度 |
|------|------|------|
| 基础 JSX 转换 | 支持 JSX 编译 | ✅ 完成 |
| NAPI 调用 | 调用 Rust 编译器 | ✅ 完成 |
| 配置文件 | rolldown.config.ts | ✅ 完成 |

#### 📋 待开始

| 任务 | 优先级 | 说明 |
|------|--------|------|
| SourceMap 支持 | P1 | 生成 SourceMap |
| 错误处理 | P1 | 友好的错误信息 |
| 热更新 | P2 | HMR 支持 |

### 6.2 Vite 插件

#### 📋 待开始

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 基础插件 | P0 | Vite 开发服务器集成 |
| 热更新 | P1 | HMR 支持 |
| 依赖预构建 | P2 | 优化依赖加载 |

---

## 7. 测试

### 7.1 单元测试

#### 🔄 进行中

| 任务 | 说明 | 覆盖率目标 |
|------|------|------------|
| traverse 测试 | oxc_traverse 集成测试 | 80% |
| JSX 转换测试 | 元素转换测试 | 80% |
| 模板生成测试 | 模板代码生成测试 | 80% |

#### 📋 待开始

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 条件渲染测试 | P0 | ternary 和逻辑与 |
| 列表渲染测试 | P0 | For 组件 |
| 组件测试 | P1 | 组件转换测试 |
| 错误测试 | P2 | 错误处理测试 |

### 7.2 E2E 测试

#### 📋 待开始

| 任务 | 优先级 | 说明 |
|------|--------|------|
| Playwright 配置 | P0 | E2E 测试框架 |
| 基础功能测试 | P0 | 页面渲染测试 |
| 响应式测试 | P1 | 状态更新测试 |
| 性能测试 | P2 | 渲染性能基准 |

### 7.3 Playground 测试

#### 📋 待开始

| 任务 | 优先级 | 说明 |
|------|--------|------|
| 基础组件 | P0 | Counter, TodoList 等 |
| 复杂组件 | P1 | 表单、列表、模态框 |
| 性能对比 | P1 | 与 SolidJS 对比 |

---

## 8. 文档

### 8.1 文档编写

#### ✅ 已完成

| 文档 | 说明 |
|------|------|
| [index.md](./index.md) | **文档索引入口** |
| [project.md](./project.md) | 项目现状 |
| [todo.md](./todo.md) | 开发计划 |
| [issues.md](./issues.md) | 问题与修复记录 |
| [architecture/zeus-architecture.md](./architecture/zeus-architecture.md) | 项目整体架构 |
| [architecture/zeus-compiler-design.md](./architecture/zeus-compiler-design.md) | 编译器完整设计 |
| [architecture/zeus-compiler-oxc1230-design.md](./architecture/zeus-compiler-oxc1230-design.md) | JSX 编译器绣化方案 |
| [architecture/zeus-jsx-compiler-rust-oxc-design.md](./architecture/zeus-jsx-compiler-rust-oxc-design.md) | 绣化方案 v2 |
| [analysis/solidjs-compiler-analysis.md](./analysis/solidjs-compiler-analysis.md) | SolidJS 编译器分析 |
| [analysis/solidjs-compiler-analysis-dom-expressions.md](./analysis/solidjs-compiler-analysis-dom-expressions.md) | dom-expressions 深度解读 |
| [reference/compiler-fix-plan.md](./reference/compiler-fix-plan.md) | 编译器整改方案 |
| [reference/oxc-sourcemap-design.md](./reference/oxc-sourcemap-design.md) | SourceMap 生成方案 |
| [progress/progress-report-2026-03-31.md](./progress/progress-report-2026-03-31.md) | 开发进度报告 |

#### 🔄 进行中

| 文档 | 说明 |
|------|------|
| `architecture/compiler-dom-design.md` | DOM 编译器设计 |
| `architecture/compiler-traverse-design.md` | traverse 重构设计 |

#### 📋 待开始

| 文档 | 优先级 | 说明 |
|------|--------|------|
| `README.md` | P0 | 项目说明 |
| `CONTRIBUTING.md` | P1 | 贡献指南 |
| 响应式编译设计文档 | P0 | 新的响应式自动编译设计 |
| API 文档 | P1 | 运行时 API 文档 |
| 迁移指南 | P2 | 从其他框架迁移 |
| 性能优化 | P2 | 最佳实践 |

---

## 9. 开发流程

### 9.1 当前 sprint (2026-03 末 - 2026-04 初)

#### 🔄 进行中

| 任务 | 状态 | 进度 | 说明 |
|------|------|------|------|
| if-return → ternary | 进行中 | 60% | AST 替换逻辑完善中 |
| 列表渲染支持 | 进行中 | 40% | .map() 响应式识别待完善 |

#### 📋 计划中

| 任务 | 优先级 | 预计开始 | 说明 |
|------|--------|----------|------|
| if-return → ternary 完整实现 | P0 | 立即 | 完成 AST 节点替换 |
| 响应式调用识别 | P0 | 本周 | 识别 signal() 等调用 |
| yield_ helper 实现 | P0 | 本周 | 条件渲染运行时支持 |
| 列表渲染完善 | P0 | 本周 | For 组件支持 |
| 单元测试 | P1 | 本周 | 提高测试覆盖率 |

### 9.2 下一 sprint (2026-04 中期)

| 任务 | 优先级 | 说明 |
|--------|--------|------|
| 响应式自动编译 | P0 | 完整的响应式模式识别 |
| 嵌套响应式处理 | P0 | 复杂的响应式表达式 |
| 动态属性识别 | P1 | signal() 作为属性值 |
| 错误诊断 | P1 | 友好的错误信息 |
| 文档完善 | P1 | API 文档 |

---

## 10. 问题跟踪

### 10.1 技术债务

| 问题 | 优先级 | 说明 |
|------|--------|------|
| ~~Target 枚举重复定义~~ | ~~P1~~ | ~~已修复: 从 zeus_compiler_common 统一导入~~ |
| 硬编码路径 | P2 | 配置文件路径 |
| 重复代码 | P2 | traverse 和 codegen 中的表达式处理 |
| 缺少类型导出 | P2 | public API 类型 |
| 未使用函数警告 | P2 | traverse.rs 中有多个未使用的函数 |

**未使用函数列表** (`crates/compiler-core/src/traverse.rs`):
- `is_whitespace_only` (line 149)
- `trim_whitespace` (line 154)
- `normalize_jsx_whitespace` (line 162)
- `should_preserve_whitespace` (line 198)
- `handle_list_rendering` (line 1040)
- `is_number_comment` 变量 (line 36)
- `after_close_tag` 变量 (line 93)
- `scoping` 变量 (line 1295)

### 10.2 性能问题

| 问题 | 优先级 | 说明 |
|------|--------|------|
| 模板生成性能 | P1 | 大文件编译速度 |
| 内存使用 | P2 | AST 遍历内存 |

---

## 11. 里程碑

### 11.1 v0.1.0 (预计 2026-04 中)

- [ ] if-return → ternary 完整实现
- [ ] 响应式自动编译基础 (条件 + 列表)
- [ ] yield_ helper 实现
- [ ] For helper 实现
- [ ] 基础 bundle-plugin (SourceMap, 错误处理)
- [ ] 单元测试覆盖率达到 80%
- [ ] 基础文档

### 11.2 v0.2.0 (预计 2026-05)

- [ ] 完整的响应式自动编译
- [ ] SSR 支持
- [ ] 自定义绑定语法
- [ ] 完整的组件系统
- [ ] Vite 插件
- [ ] 完整测试覆盖

### 11.3 v0.3.0 (预计 2026-06)

- [ ] WebComponent 支持
- [ ] 性能优化
- [ ] 生产级稳定性
- [ ] 完整文档

---

## 12. 推荐行动

基于当前状态，按以下顺序执行：

### 立即执行 (本周)

1. **完成 if-return → ternary AST 替换**
   - 文件: `crates/compiler-core/src/traverse.rs`
   - 方法: `transform_to_ternary`
   - 需要使用 `ctx.replace` 进行节点替换

2. **实现响应式调用识别**
   - 在 traverse 中识别 `signal()`, `memo()` 等调用
   - 自动添加对应的 helper

3. **实现 yield_ helper**
   - 文件: `packages/runtime-core/src/yield_.ts`
   - 支持条件渲染的运行时

4. **完善 For helper**
   - 文件: `packages/runtime-core/src/for.ts`
   - 优化列表渲染性能

### 近期执行 (下周)

1. **嵌套响应式处理**
2. **bundle-plugin 完善** (SourceMap, 错误处理)
3. **Playground 示例更新**

---

## 13. 完成状态统计

```
已完成:  ✅ 13 项
进行中:  🔄 4 项
待开始:  📋 18 项

总计:    35 项
完成率:  37%
```

---

## 14. 设计理念说明

### 响应式自动编译 vs 显式组件

| 特性 | 显式组件 (Show/For) | 响应式自动编译 (Zeus) |
|------|---------------------|----------------------|
| 语法 | `<Show when={...}>...</Show>` | `{cond && <JSX />}` |
| 学习成本 | 需要学习框架特定语法 | 标准 JSX |
| 代码可读性 | 需要理解组件嵌套 | 直接表达意图 |
| 编译复杂度 | 中等 | 较高 |
| 运行时开销 | 组件实例化 | 直接函数调用 |
| 灵活性 | 封装良好 | 更灵活 |

**Zeus 选择响应式自动编译的原因**:
1. 用户体验更好 - 只需写标准 JSX
2. 与 SolidJS 等框架理念一致
3. 减少框架特定概念
4. 编译时优化更多，性能更好

---

*本文档最后更新于 2026 年 3 月*
