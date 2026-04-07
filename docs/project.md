# Zeus 项目现状

> 本文档记录 Zeus 框架项目的当前状态、已实现的功能、架构设计和技术栈。

## 1. 项目概述

### 1.1 项目定位

Zeus 是一个现代化的前端框架，采用 **Rust + OXC** 作为编译器基础设施，**TypeScript + alien-signal** 作为运行时，目标实现：

- **无虚拟 DOM**：直接 DOM 操作，类似 SolidJS 的编译器驱动渲染
- **最小化运行时**：尽可能将计算转移到编译时，降低运行时体积
- **精细化响应式**：基于 alien-signal 的细粒度响应式系统
- **高性能编译**：使用 Rust 语言和 oxc 框架实现高效编译

### 1.2 技术栈

| 层级 | 技术 | 说明 |
|------|------|------|
| **编译器** | Rust + OXC | 基于 oxc 的 JSX 编译器 |
| **响应式** | alien-signal | 细粒度响应式信号系统 |
| **运行时** | TypeScript | ES5 兼容的运行时 |
| **构建** | rolldown | 基于 Rust 的打包工具 |
| **测试** | Vitest | 单元测试和 E2E 测试 |
| **包管理** | pnpm | Monorepo 工作流 |

### 1.3 项目结构

```
zeus/
├── crates/                    # Rust 编译器 crates
│   ├── compiler-core/          # 核心编译器 (oxc 集成)
│   ├── compiler-common/        # 编译器公共模块
│   ├── compiler-dom/           # DOM 编译器
│   ├── compiler-ssr/           # SSR 编译器
│   ├── compiler-web-component/ # WebComponent 编译器
│   └── zeusjs_binding/        # NAPI-RS 绑定层
│
├── packages/                  # TypeScript 包
│   ├── compiler-core/          # 编译器 JS 绑定
│   ├── runtime-core/           # 核心运行时
│   ├── runtime-dom/            # DOM 渲染器
│   ├── signal/                 # 响应式信号
│   ├── shared/                 # 共享工具
│   ├── zeus/                  # 统一入口
│   ├── server-renderer/        # 服务端渲染
│   └── compiler-browser/       # 浏览器编译器
│
├── addons/                    # 插件和扩展
│   ├── bundle-plugin/          # Rolldown 插件
│   ├── router/                # 路由
│   ├── store/                 # 状态管理
│   └── web-components/         # Web Components
│
├── playground/                # 测试项目
│   ├── zeus/                 # Zeus Playground
│   ├── solidjs/              # SolidJS 对比
│   └── web-component/         # WebComponent 测试
│
└── docs/                     # 文档
    └── *.md                   # 设计文档
```

---

## 2. 编译器现状

### 2.1 架构设计

当前编译器采用 **oxc_traverse** 进行 AST 遍历和转换：

```
┌─────────────────────────────────────────────────────────────────┐
│                    编译流程 (Current)                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. 解析 (oxc_parser)                                          │
│     └─→ AST                                                     │
│                                                                  │
│  2. 遍历 (oxc_traverse::traverse_mut)                          │
│     └─→ 收集模板信息、委托事件、helper 依赖                      │
│                                                                  │
│  3. 代码生成 (oxc_codegen)                                      │
│     └─→ 生成 import、模板声明、委托事件注册                      │
│     └─→ 转换后的 JSX 代码                                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 已实现功能

#### 2.2.1 核心功能

| 功能 | 状态 | 说明 |
|------|------|------|
| JSX 解析 | ✅ 完成 | 使用 oxc_parser 解析 JSX/TSX |
| JSXElement 转换 | ✅ 完成 | JSX → 模板函数调用 |
| JSXFragment 支持 | ✅ 完成 | `<>...</>` 片段支持 |
| 模板抽取 | ✅ 完成 | 静态 HTML → template() 调用 |
| 委托事件收集 | ✅ 完成 | 收集 onClick 等事件 |
| 事件委托注册 | ✅ 完成 | 生成 delegateEvents() 调用 |
| 条件渲染 | ⚠️ 部分 | 三元运算符支持，逻辑与部分支持 |
| 列表渲染 | ⚠️ 部分 | 检测 .map() 调用，添加 helper |
| if-return 转换 | ⚠️ 部分 | 框架已搭建，AST 替换待完善 |
| Fragment | ✅ 完成 | 基本的 Fragment 支持 |

#### 2.2.2 属性处理

| 属性类型 | 状态 | 说明 |
|----------|------|------|
| 静态属性 | ✅ 完成 | 保留在模板 HTML 中 |
| 动态属性 | ✅ 完成 | class, style, value 等 |
| className | ✅ 完成 | 直接绑定 |
| style | ✅ 完成 | 对象绑定 |
| 事件处理 | ✅ 完成 | onClick, onInput 等 |
| Spread 属性 | ✅ 完成 | `{...props}` 支持 |
| 布尔属性 | ✅ 完成 | disabled, checked 等 |

#### 2.2.3 代码生成

| 功能 | 状态 | 说明 |
|------|------|------|
| Import 生成 | ✅ 完成 | 动态生成使用的 helpers |
| 模板声明 | ✅ 完成 | const _tmpl$N = template("...") |
| 委托事件注册 | ✅ 完成 | delegateEvents([...]) |
| insert 调用 | ✅ 完成 | 动态内容插入 |
| 属性设置 | ✅ 完成 | setAttribute, className 等 |
| 模板清理 | ✅ 完成 | 移除占位注释，优化空白 |

### 2.3 待完善功能

#### 2.3.1 编译器

| 功能 | 优先级 | 说明 |
|------|--------|------|
| if-return → ternary | P1 | 完整的 AST 替换实现 |
| 响应式自动编译 | P1 | 识别 signal() 等响应式调用，转换为最优运行时 |
| 组件转换 | P1 | 组件调用转换为 createComponent |
| 动态元素 | P2 | `<{tag}>` 动态标签名 |
| 异步组件 | P2 | Suspense, lazy 等 |
| HOC 支持 | P3 | 高阶组件转换 |

#### 2.3.2 自定义绑定语法

> **说明**: 仅保留真正提升开发体验的语法。

| 语法 | 状态 | 说明 |
|------|------|------|
| `class:active={cond}` | ❌ 待实现 | 条件类名绑定 ⭐ |
| `use:action={fn}` | ❌ 待实现 | 自定义指令 ⭐⭐ |
| `bool:disabled={cond}` | ❌ 待实现 | 布尔属性优化 |

**已移除** (可用标准 JSX 替代):
- ❌ `style:color="red"` → `style={{color: 'red'}}`
- ❌ `on:click={handler}` → 已有 `onClick`
- ❌ `prop:value={val}` → 前缀多余
- ❌ `{/* @once */}` → 编译器自动优化

#### 2.3.3 SSR 支持

| 功能 | 状态 | 说明 |
|------|------|------|
| SSR 编译器 | ❌ 待实现 | 服务端渲染编译 |
| Hydration | ❌ 待实现 | 客户端水合 |
| 流式 SSR | ❌ 待实现 | 流式渲染支持 |

#### 2.3.4 WebComponent 支持

| 功能 | 状态 | 说明 |
|------|------|------|
| WebComponent 编译器 | ❌ 待实现 | 自定义元素转换 |
| Shadow DOM | ❌ 待实现 | Shadow DOM 支持 |
| Slot 处理 | ❌ 待实现 | 插槽系统 |

---

## 3. 运行时现状

### 3.1 已实现

| 模块 | 状态 | 说明 |
|------|------|------|
| @zeus-js/signal | ✅ 可用 | alien-signal 封装 |
| @zeus-js/runtime-core | ✅ 可用 | 核心运行时 |
| @zeus-js/runtime-dom | ✅ 可用 | DOM 渲染器 |
| @zeus-js/shared | ✅ 可用 | 共享工具 |

### 3.2 待实现

| 功能 | 状态 | 说明 |
|------|------|------|
| template() | ✅ 运行时可用 | 模板创建 |
| insert() | ✅ 运行时可用 | 动态插入 |
| delegateEvents() | ✅ 运行时可用 | 事件委托 |
| effect() | ✅ 来自 signal | 副作用 |
| ssr() | ❌ 待实现 | SSR 运行时 |
| ssrElement() | ❌ 待实现 | SSR 元素创建 |
| yield_ helper | ❌ 待实现 | 条件渲染 (响应式条件) |
| For helper | ❌ 待实现 | 列表渲染优化 |

---

## 4. 构建工具现状

### 4.1 已配置

| 工具 | 状态 | 说明 |
|------|------|------|
| rolldown | ✅ 配置 | 基于 Rust 的打包工具 |
| bundle-plugin | ⚠️ 开发中 | Zeus 专用的 rolldown 插件 |
| NAPI-RS | ✅ 配置 | Rust → Node.js 绑定 |
| Vitest | ✅ 配置 | 测试框架 |
| ESLint + Prettier | ✅ 配置 | 代码质量 |

### 4.2 待完善

| 功能 | 状态 | 说明 |
|------|------|------|
| Vite 插件 | ❌ 待实现 | Vite 开发服务器支持 |
| Rollup 插件 | ⚠️ 部分 | bundle-plugin 完善中 |

---

## 5. 包清单

### 5.1 Rust Crates

| Crate | 版本 | 状态 | 说明 |
|-------|------|------|------|
| compiler-core | 0.1.0 | ✅ 开发中 | 核心编译器，oxc 集成 |
| compiler-common | 0.1.0 | ✅ 开发中 | 公共类型和配置 |
| compiler-dom | 0.1.0 | ✅ 开发中 | DOM 编译器 |
| compiler-ssr | 0.1.0 | ❌ 待实现 | SSR 编译器 |
| compiler-web-component | 0.1.0 | ❌ 待实现 | WebComponent 编译器 |
| zeusjs_binding | 0.1.0 | ✅ 开发中 | NAPI-RS 绑定 |

### 5.2 TypeScript 包

| 包 | 版本 | 状态 | 说明 |
|----|------|------|------|
| @zeus-js/compiler-core | 0.0.1 | ✅ 开发中 | 编译器 JS 绑定 |
| @zeus-js/compiler-browser | 0.0.1 | ⚠️ 开发中 | 浏览器编译器 |
| @zeus-js/runtime-core | 0.0.1 | ✅ 可用 | 核心运行时 |
| @zeus-js/runtime-dom | 0.0.1 | ✅ 可用 | DOM 渲染器 |
| @zeus-js/signal | 0.0.1 | ✅ 可用 | 响应式信号 |
| @zeus-js/shared | 0.0.1 | ✅ 可用 | 共享工具 |
| @zeus-js/server-renderer | 0.0.1 | ❌ 待实现 | SSR 运行时 |
| @zeus-js/zeus | 0.0.1 | ✅ 开发中 | 统一入口 |
| @zeus-js/jsx-runtime | 0.0.1 | ✅ 开发中 | JSX 运行时 |
| @zeus-js/compiler | 0.0.1 | ✅ 开发中 | Babel + TypeScript JSX 编译器（MVP 路线） |
| @zeus-js/babel-preset-zeus | 0.0.1 | ✅ 开发中 | Babel preset（TS + Zeus JSX） |
| @zeus-js/rollup-plugin-zeus | 0.0.1 | ✅ 开发中 | Rollup 集成插件 |
| @zeus-js/vite-plugin-zeus | 0.0.1 | ✅ 开发中 | Vite 集成插件 |

---

## 6. 开发状态

### 6.1 核心模块进度

```
compiler-core (crates)
├── parser           ✅ 完成 (oxc_parser 集成)
├── codegen          ✅ 完成 (oxc_codegen 集成)
├── traverse         ✅ 完成 (oxc_traverse 集成)
│   ├── JSXElement  ✅ 完成
│   ├── JSXFragment ✅ 完成
│   ├── if-statement ⚠️ 部分 (框架完成，AST 替换待完善)
│   └── call-expression ⚠️ 部分 (列表渲染检测)
└── template        ✅ 完成 (模板清理和生成)

compiler-common (crates)
├── config          ✅ 完成 (CompilerOptions)
├── types           ✅ 完成 (Binding, DomPath, TemplateIR)
├── error           ✅ 完成 (错误类型)
└── utils           ✅ 完成 (HTML 转义等)

compiler-dom (crates)
├── template_analyzer ✅ 完成 (模板分析)
├── template_ir     ✅ 完成 (中间表示)
└── control_flow    ⚠️ 部分 (控制流分析框架)

packages/compiler-core
├── binding         ✅ 完成 (NAPI-RS 绑定)
└── index           ✅ 完成 (导出)

packages/runtime-core
├── template        ✅ 完成
├── insert          ✅ 完成
├── delegateEvents   ✅ 完成
└── effect          ✅ 完成 (来自 signal)
```

### 6.2 构建状态

| 构建目标 | 状态 |
|----------|------|
| macOS x86_64 | ✅ 支持 |
| macOS ARM64 | ✅ 支持 |
| Linux x86_64 | ✅ 支持 |
| Linux ARM64 | ✅ 支持 |
| Windows x86_64 | ✅ 支持 |
| Windows ARM64 | ✅ 支持 |
| WASI | ⚠️ 配置中 |

---

## 7. 测试状态

### 7.1 测试项目

| 项目 | 状态 | 说明 |
|------|------|------|
| playground/zeus | ✅ 可用 | Zeus 功能演示 |
| playground/solidjs | ✅ 可用 | SolidJS 对比 |
| playground/web-component | ⚠️ 开发中 | WebComponent 测试 |

### 7.2 测试覆盖

| 模块 | 单元测试 | E2E 测试 |
|------|----------|----------|
| compiler-core | ⚠️ 部分 | ❌ |
| compiler-dom | ⚠️ 部分 | ❌ |
| runtime-core | ⚠️ 部分 | ❌ |
| runtime-dom | ⚠️ 部分 | ❌ |
| signal | ⚠️ 部分 | ❌ |

---

## 8. 文档状态

| 文档 | 状态 | 说明 |
|------|------|------|
| [index.md](./index.md) | ✅ 完成 | **文档索引入口** |
| [project.md](./project.md) | ✅ 完成 | 项目现状总览 |
| [todo.md](./todo.md) | ✅ 完成 | 开发任务清单 |
| [issues.md](./issues.md) | ✅ 完成 | 问题与修复记录 |
| [architecture/zeus-architecture.md](./architecture/zeus-architecture.md) | ✅ 完成 | 项目整体架构 |
| [architecture/zeus-compiler-design.md](./architecture/zeus-compiler-design.md) | ✅ 完成 | 编译器完整设计 |
| [architecture/zeus-compiler-oxc1230-design.md](./architecture/zeus-compiler-oxc1230-design.md) | ✅ 完成 | 编译器绣化方案 |
| [architecture/zeus-jsx-compiler-rust-oxc-design.md](./architecture/zeus-jsx-compiler-rust-oxc-design.md) | ⚠️ 参考 | 绣化方案 v2 |
| [analysis/solidjs-compiler-analysis.md](./analysis/solidjs-compiler-analysis.md) | ✅ 完成 | SolidJS 编译器分析 |
| [analysis/solidjs-compiler-analysis-dom-expressions.md](./analysis/solidjs-compiler-analysis-dom-expressions.md) | ✅ 完成 | dom-expressions 深度分析 |
| [reference/compiler-fix-plan.md](./reference/compiler-fix-plan.md) | ⚠️ 参考 | 编译器整改方案 |
| [reference/oxc-sourcemap-design.md](./reference/oxc-sourcemap-design.md) | ⚠️ 参考 | SourceMap 生成方案 |
| [progress/progress-report-2026-03-31.md](./progress/progress-report-2026-03-31.md) | ✅ 完成 | 进度报告 |
| `README.md` | 📋 待完成 | 项目说明 |
| `architecture/compiler-dom-design.md` | 📋 待完成 | DOM 编译器设计文档 |
| `architecture/compiler-traverse-design.md` | 📋 待完成 | traverse 重构设计文档 |

---

## 9. 已知限制

### 9.1 编译器限制

1. **if-return 转换不完整**：框架已搭建，但 AST 节点替换需要完善
2. **组件识别简单**：目前通过首字母大写判断组件，需要更完善的组件识别
3. **自定义绑定未实现**：`class:active`, `use:action` 等语法待支持
4. **响应式自动编译进行中**：signal() 识别和转换待完善
5. **SSR/WebComponent 未实现**：仅 DOM 编译器在开发中

### 9.2 运行时限制

1. **alien-signal 依赖**：运行时依赖 alien-signal 包
2. **浏览器限制**：某些特性仅支持现代浏览器
3. **ES5 兼容**：已配置，但部分特性需 polyfill

---

## 10. 下一步计划

### 10.1 短期目标 (1-2 周)

1. 完成 if-return → ternary 转换的 AST 替换
2. 实现响应式自动编译 (条件渲染 + 列表渲染)
3. 实现 yield_/For helpers
4. 实现 `class:active` 和 `use:action` 绑定语法
5. 完善 bundle-plugin
6. 添加更多测试用例

### 10.2 中期目标 (1-2 月)

1. 实现 SSR 编译器
2. 实现 `bool:disabled` 等剩余绑定语法
3. 实现 WebComponent 编译器
4. 完善 Vite 插件

### 10.3 长期目标

1. 生产级稳定性
2. 完整的文档和示例
3. 性能优化
4. 生态系统建设

---

*本文档最后更新于 2026 年 4 月（新增 Babel JSX MVP 路线）*
