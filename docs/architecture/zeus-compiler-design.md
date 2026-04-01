# Zeus 编译器完整设计方案

> 本文档基于 SolidJS 的 dom-expressions 编译器设计，结合 Zeus 框架的架构特点和 OXC 工具链，为 Zeus 框架的 Rust + OXC JSX 编译器提供完整的设计方案。

## 目录

1. [设计背景与目标](#1-设计背景与目标)
2. [整体架构设计](#2-整体架构设计)
3. [编译流水线](#3-编译流水线)
4. [核心模块详解](#4-核心模块详解)
5. [TemplateIR 中间表示](#5-templateir-中间表示)
6. [DOM 编译器实现](#6-dom-编译器实现)
7. [SSR 编译器实现](#7-ssr-编译器实现)
8. [WebComponent 编译器实现](#8-webcomponent-编译器实现)
9. [运行时设计](#9-运行时设计)
10. [OXC 适配层](#10-oxc-适配层)
11. [配置与扩展](#11-配置与扩展)
12. [编译示例](#12-编译示例)
13. [文件结构](#13-文件结构)
14. [实现路线图](#14-实现路线图)

---

## 1. 设计背景与目标

### 1.1 设计动机

现有 Zeus 编译器采用 **基于 Span 的字符串替换** 策略，存在以下核心问题：

1. **位置失效问题**：JSX 编译后字符串长度变化，导致后续代码的位置信息失效
2. **if-return 转换困难**：无法正确定位原始 if 语句进行 ternary 转换
3. **代码脆弱**：依赖字符串位置计算，边界条件容易出错

通过引入 **oxc_traverse** 进行真正的 AST 转换，结合 SolidJS 的编译理念，可以解决上述问题。

### 1.2 核心目标

| 目标 | 说明 |
|------|------|
| **无虚拟 DOM** | 直接 DOM 操作，类似 SolidJS 的编译器驱动渲染 |
| **Rust + OXC** | 使用 Rust 语言和 oxc 框架实现高性能编译 |
| **最小化运行时** | 尽可能将计算转移到编译时，降低运行时体积 |
| **精细化响应式** | 基于 alien-signal 的细粒度响应式系统 |
| **真正的 AST 转换** | 使用 oxc_traverse 直接修改 AST，消除 Span 依赖 |

### 1.3 与 SolidJS 的关键差异

| 特性 | SolidJS (dom-expressions) | Zeus (本方案) |
|------|---------------------------|---------------|
| **编译器语言** | JavaScript (Babel) | Rust (oxc) |
| **响应式系统** | Solid Signals | alien-signal |
| **AST 遍历** | Babel Visitor | oxc_traverse |
| **代码生成** | Babel AST → 字符串 | oxc AST → oxc_codegen |
| **模板机制** | 模板字面量 | 模板字面量 + comment 占位符 |
| **事件委托** | `$$eventName` 属性 | `$$eventName` 属性 |
| **运行时目标** | ~5KB (solid-js/web) | 目标 <8KB |

### 1.4 OXC 支持度分析

#### 1.4.1 完全支持的功能

| 功能 | OXC 支持 | 说明 |
|------|---------|------|
| JSXElement 解析 | ✅ | 完整的 JSX AST 节点 |
| JSXFragment 解析 | ✅ | 支持 `<>...</>` 语法 |
| JSX 属性类型 | ✅ | 支持 spread, expression 等 |
| 模板字面量 | ✅ | ES2020 模板字符串 |
| 事件绑定 | ✅ | `onClick`, `onInput` 等 |
| 类名/样式绑定 | ✅ | `className`, `style` |

#### 1.4.2 需要扩展支持的功能

| 功能 | OXC 支持 | 实现方式 |
|------|---------|---------|
| `class:*` 绑定 | ❌ | 自定义语法，编译时转换 |
| `style:*` 绑定 | ❌ | 自定义语法，编译时转换 |
| `prop:*` 绑定 | ❌ | 自定义语法，编译时转换 |
| `bool:*` 绑定 | ❌ | 自定义语法，编译时转换 |
| `on:*` 绑定 | ❌ | 自定义语法，编译时转换 |
| `ref` 绑定 | ❌ | 原生支持 |
| `use:*` 指令 | ❌ | 自定义指令系统 |
| `classList` | ❌ | 自定义语法 |
| `spread` | ✅ | JSX Spread 属性 |
| 静态标记 `/* @once */` | ❌ | 自定义注释语法 |

#### 1.4.3 实现策略

对于 OXC 不直接支持的功能，采用以下策略：

```
┌─────────────────────────────────────────────────────────────────┐
│                    自定义语法扩展策略                              │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  1. JSX 属性名解析                                                │
│     ┌─────────────────┐                                         │
│     │ class:active    │                                         │
│     │     ↓           │                                         │
│     │ namespace:key   │  ──► 解析 namespace 和 key               │
│     │     ↓           │                                         │
│     │ 生成对应代码     │                                         │
│     └─────────────────┘                                         │
│                                                                  │
│  2. 注释标记解析                                                  │
│     ┌─────────────────┐                                         │
│     │ {/* @once */}    │                                         │
│     │     ↓           │                                         │
│     │ JSX expression   │  ──► 检查注释标记                        │
│     │ comment nodes    │                                         │
│     └─────────────────┘                                         │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## 2. 整体架构设计

### 2.1 架构概览

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Zeus Compiler                                   │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                         Source Code (JSX/TSX)                          │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                          │
│                                    ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        OXC Parser (oxc_parser)                         │  │
│  │                                                                       │  │
│  │  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐                │  │
│  │  │   Lexer     │───▶│   Parser    │───▶│    AST      │                │  │
│  │  │   (oxc)    │    │   (oxc)     │    │   Tree      │                │  │
│  │  └─────────────┘    └─────────────┘    └─────────────┘                │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                          │
│                                    ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    OXC Traverse (oxc_traverse)                         │  │
│  │                                                                       │  │
│  │  ┌─────────────────────────────────────────────────────────────┐     │  │
│  │  │                     Compiler Passes                           │     │  │
│  │  │                                                             │     │  │
│  │  │  ┌────────────┐  ┌────────────┐  ┌────────────┐            │     │  │
│  │  │  │  Preprocess │  │ JSXTransform │  │ Postprocess │           │     │  │
│  │  │  │    Pass     │  │    Pass      │  │    Pass      │           │     │  │
│  │  │  └──────┬─────┘  └──────┬─────┘  └──────┬─────┘            │     │  │
│  │  │         │                │                │                   │     │  │
│  │  │         ▼                ▼                ▼                   │     │  │
│  │  │  ┌─────────────────────────────────────────────────────────┐ │     │  │
│  │  │  │                    TemplateIR                            │ │     │  │
│  │  │  │   - 静态 HTML 模板                                       │ │     │  │
│  │  │  │   - 动态绑定列表                                          │ │     │  │
│  │  │  │   - 委托事件列表                                          │ │     │  │
│  │  │  │   - 模板变量映射                                          │ │     │  │
│  │  │  └─────────────────────────────────────────────────────────┘ │     │  │
│  │  │                                                             │     │  │
│  │  └─────────────────────────────────────────────────────────────┘     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                          │
│                                    ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                    OXC Codegen (oxc_codegen)                          │  │
│  │                                                                       │  │
│  │  ┌─────────────────────────────────────────────────────────────┐     │  │
│  │  │  1. 生成 import 声明                                        │     │  │
│  │  │  2. 生成模板变量声明                                         │     │  │
│  │  │  3. 生成转换后的 JS/TS 代码                                  │     │  │
│  │  │  4. 输出最终代码                                            │     │  │
│  │  └─────────────────────────────────────────────────────────────┘     │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                    │                                          │
│                                    ▼                                          │
│  ┌───────────────────────────────────────────────────────────────────────┐  │
│  │                        Generated JavaScript                            │  │
│  │                                                                       │  │
│  │  import { template, insert, effect } from "@zeus-js/core";            │  │
│  │  const _tmpl$1 = template("<div class=\"container\"></div>");          │  │
│  │  // ... 转换后的组件代码                                              │  │
│  └───────────────────────────────────────────────────────────────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 编译器 Pass 架构

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           Compiler Passes                                    │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌─────────────────────────────────────────────────────────────────────┐    │
│  │                     CompilerPass Trait                                 │    │
│  │  ┌───────────────────────────────────────────────────────────┐      │    │
│  │  │  fn enter_program(&mut self, program: &mut Program)         │      │    │
│  │  │  fn exit_program(&mut self, program: &mut Program)         │      │    │
│  │  │  fn enter_jsx_element(&mut self, elem: &mut JSXElement)    │      │    │
│  │  │  fn exit_jsx_element(&mut self, elem: &mut JSXElement)    │      │    │
│  │  │  fn enter_jsx_fragment(&mut self, frag: &mut JSXFragment)  │      │    │
│  │  │  fn enter_if_statement(&mut self, stmt: &mut IfStatement)  │      │    │
│  │  │  fn enter_call_expression(&mut self, call: &mut CallExpr)  │      │    │
│  │  │  fn enter_function(&mut self, func: &mut Function)        │      │    │
│  │  └───────────────────────────────────────────────────────────┘      │    │
│  └─────────────────────────────────────────────────────────────────────┘    │
│                                    │                                          │
│           ┌────────────────────────┼────────────────────────┐              │
│           │                        │                        │              │
│           ▼                        ▼                        ▼              │
│  ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐     │
│  │ PreprocessPass  │      │  JSXTransformPass│      │ PostprocessPass │     │
│  │                 │      │                 │      │                 │     │
│  │ - 合并配置       │      │ - 分析 JSX 结构  │      │ - 生成 import   │     │
│  │ - 注册内置组件   │      │ - 生成 TemplateIR│      │ - 生成模板声明  │     │
│  │ - 初始化状态    │      │ - 节点替换       │      │ - 验证 HTML     │     │
│  └─────────────────┘      └────────┬────────┘      └─────────────────┘     │
│                                     │                                          │
│           ┌─────────────────────────┼─────────────────────────┐              │
│           │                         │                         │              │
│           ▼                         ▼                         ▼              │
│  ┌─────────────────┐      ┌─────────────────┐      ┌─────────────────┐     │
│  │ DomTransformPass│      │SsrTransformPass │      │ WcTransformPass │     │
│  │                 │      │                 │      │                 │     │
│  │ - DOM 元素转换   │      │ - SSR 元素转换  │      │ - WebComponent  │     │
│  │ - 事件委托       │      │ - HTML 转义     │      │   转换          │     │
│  │ - 属性设置      │      │ - hydration     │      │ - Shadow DOM    │     │
│  └─────────────────┘      └─────────────────┘      └─────────────────┘     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 2.3 数据流图

```
JSX 源代码
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│                    阶段 1: 解析 (Parser)                         │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  let allocator = Allocator::default();                  │  │
│  │  let source_type = SourceType::jsx();                  │  │
│  │  let program = parser::parse(&allocator, source)?;     │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│                 阶段 2: 预处理 (Preprocess)                     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  1. 合并默认配置与用户配置                                │  │
│  │  2. 注册内置组件 (For, Show, If, Switch, etc.)           │  │
│  │  3. 初始化编译器状态                                     │  │
│  │  4. 收集导入信息                                         │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│                阶段 3: JSX 转换 (JSX Transform)                  │
│                                                                 │
│  ┌────────────────┐  ┌────────────────┐  ┌────────────────┐  │
│  │ JSXElement    │  │ JSXFragment   │  │ Conditional    │  │
│  │   Transform    │  │   Transform    │  │   Transform    │  │
│  └───────┬────────┘  └───────┬────────┘  └───────┬────────┘  │
│          │                   │                   │            │
│          ▼                   ▼                   ▼            │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │                    TemplateIR                           │  │
│  │                                                         │  │
│  │  TemplateIR {                                           │  │
│  │    html: String,          // 静态 HTML                   │  │
│  │    bindings: Vec<Binding>, // 动态绑定                  │  │
│  │    events: Vec<Event>,    // 事件绑定                   │  │
│  │    children: Vec<TemplateIR>, // 子模板                  │  │
│  │  }                                                     │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│                 阶段 4: 后处理 (Postprocess)                     │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  1. 注册运行时导入                                        │  │
│  │  2. 生成模板变量声明                                       │  │
│  │  3. 验证 HTML 有效性                                      │  │
│  │  4. 控制流转换 (if-return → ternary)                      │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
┌─────────────────────────────────────────────────────────────────┐
│                阶段 5: 代码生成 (Codegen)                        │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐  │
│  │  let output = oxc_codegen::generate(&program)?;        │  │
│  └─────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
    │
    ▼
最终 JavaScript 代码
```

---

## 3. 编译流水线

### 3.1 完整编译流程

```rust
/// Zeus 编译器主入口
pub fn compile(source: &str, options: &CompilerOptions) -> Result<CompileResult, CompileError> {
    // ═══════════════════════════════════════════════════════════════════
    // 阶段 1: 初始化
    // ═══════════════════════════════════════════════════════════════════
    let allocator = Allocator::default();
    let source_type = SourceType::tsx(); // 支持 TypeScript
    
    // ═══════════════════════════════════════════════════════════════════
    // 阶段 2: 解析
    // ═══════════════════════════════════════════════════════════════════
    let ret = oxc_parser::parse_ts(&allocator, source);
    if ret.is_error() {
        return Err(CompileError::ParseError(ret.errors));
    }
    let program = ret.program;
    
    // ═══════════════════════════════════════════════════════════════════
    // 阶段 3: 预处理
    // ═══════════════════════════════════════════════════════════════════
    let mut state = CompilerState::new(options.clone());
    PreprocessPass::run(&mut program, &allocator, &mut state);
    
    // ═══════════════════════════════════════════════════════════════════
    // 阶段 4: JSX 转换
    // ═══════════════════════════════════════════════════════════════════
    match options.target {
        Target::Dom => {
            let mut pass = DomTransformPass::new(source, &mut state);
            traverse_mut(&mut pass, &allocator, &mut program, Scoping::default(), ());
        }
        Target::Ssr => {
            let mut pass = SsrTransformPass::new(source, &mut state);
            traverse_mut(&mut pass, &allocator, &mut program, Scoping::default(), ());
        }
        Target::WebComponent => {
            let mut pass = WcTransformPass::new(source, &mut state);
            traverse_mut(&mut pass, &allocator, &mut program, Scoping::default(), ());
        }
    }
    
    // ═══════════════════════════════════════════════════════════════════
    // 阶段 5: 后处理
    // ═══════════════════════════════════════════════════════════════════
    PostprocessPass::run(&mut program, &allocator, &mut state);
    
    // ═══════════════════════════════════════════════════════════════════
    // 阶段 6: 代码生成
    // ═══════════════════════════════════════════════════════════════════
    let printed = oxc_codegen::Codegen::new()
        .with_source_map(false)
        .build(&program)
        .source_text;
    
    Ok(CompileResult {
        code: printed,
        used_helpers: state.used_helpers.clone(),
        delegated_events: state.delegated_events.clone(),
        warnings: state.warnings.clone(),
    })
}
```

### 3.2 遍历顺序

```
程序遍历顺序 (深度优先):

Program
 ├── directives
 └── body: StatementList
      └── Statement (函数/变量声明)
           └── FunctionBody
                └── Statement
                     └── IfStatement
                          ├── test: Expression        ← 条件检查
                          ├── consequent: Statement   ← then 分支
                          │    └── ReturnStatement
                          │         └── argument: JSXElement
                          │              ↓
                          │         enter_jsx_element  ──┐
                          │              ↓               │
                          │         exit_jsx_element    │  (先处理 JSX)
                          └── alternate: Statement   ← else 分支
                               └── ReturnStatement
                                    └── argument: JSXElement
                                         ↓
                                    enter_jsx_element  ──┐
                                         ↓               │
                                    exit_jsx_element    │  (后处理 JSX)
                                                           ↓
                                                    exit_if_statement
                                                    (此时 JSX 已转换，可以安全转换为 ternary)

关键点:
1. enter/exit 钩子保证先处理 JSX，再处理 if 语句
2. if 语句退出时，JSX 已被转换为函数调用
3. 可以安全地将 if 语句转换为 ternary 表达式
```

---

## 4. 核心模块详解

### 4.1 编译器状态 (CompilerState)

```rust
// ═══════════════════════════════════════════════════════════════════════════
// 编译器状态 - 所有 Pass 之间共享的数据
// ═══════════════════════════════════════════════════════════════════════════

/// 编译器状态
pub struct CompilerState {
    /// 编译器选项
    pub options: CompilerOptions,
    
    /// 模板计数器
    pub template_counter: usize,
    
    /// 收集的模板声明
    pub templates: Vec<TemplateDecl>,
    
    /// 使用的运行时 helpers
    pub used_helpers: Vec<String>,
    
    /// 委托事件列表
    pub delegated_events: Vec<String>,
    
    /// 已注册的内置组件
    pub built_ins: HashSet<Atom<'static>>,
    
    /// 已解析的组件作用域
    pub component_scope: Vec<Atom<'static>>,
    
    /// 警告信息
    pub warnings: Vec<Warning>,
    
    /// 原始源代码 (用于错误定位)
    pub source_text: String,
    
    /// 当前函数的嵌套深度
    pub function_depth: usize,
    
    /// 是否在 JSX 上下文中
    pub in_jsx_context: bool,
    
    /// SVG 命名空间栈
    pub svg_namespace_stack: Vec<bool>,
    
    /// 循环/条件上下文栈 (用于 key 追踪)
    pub iteration_context: Vec<IterationContext>,
}

/// 迭代上下文
#[derive(Debug, Clone)]
pub struct IterationContext {
    /// 迭代变量名
    pub variable: Atom<'static>,
    /// 迭代集合
    pub collection: Atom<'static>,
    /// 当前 index
    pub index: Option<Atom<'static>>,
}

/// 模板声明
#[derive(Debug, Clone)]
pub struct TemplateDecl {
    /// 模板变量名 (如 "_tmpl$1")
    pub name: String,
    /// 静态 HTML 内容
    pub html: String,
    /// 是否为 SVG
    pub is_svg: bool,
    /// 绑定信息
    pub bindings: Vec<Binding>,
    /// DOM 路径映射
    pub dom_paths: HashMap<String, DomPath>,
}

/// 绑定信息
#[derive(Debug, Clone)]
pub struct Binding {
    /// 绑定类型
    pub kind: BindingKind,
    /// DOM 路径
    pub dom_path: DomPath,
    /// 源代码 (用于动态表达式)
    pub source: String,
    /// 是否需要 effect 包装
    pub needs_effect: bool,
}

/// 绑定类型
#[derive(Debug, Clone)]
pub enum BindingKind {
    /// 文本内容插入
    Text { marker: String },
    
    /// 元素插入
    Insert { marker: String },
    
    /// 委托事件
    DelegatedEvent { event_name: String },
    
    /// 直接事件
    DirectEvent { event_name: String },
    
    /// 类名
    ClassName { is_static: bool },
    
    /// 类名绑定 (class:active={value})
    ClassBinding { key: String },
    
    /// classList 对象
    ClassList { entries: Vec<(String, bool)> },
    
    /// 样式对象
    Style { is_static: bool },
    
    /// 样式绑定 (style:color={value})
    StyleBinding { property: String },
    
    /// 普通属性
    Attribute { name: String, is_static: bool },
    
    /// 属性绑定 (prop:value={value})
    PropBinding { name: String },
    
    /// 布尔属性绑定 (bool:disabled={value})
    BoolBinding { name: String },
    
    /// DOM 引用
    Ref,
    
    /// 展开属性
    Spread,
    
    /// 条件渲染
    Conditional { then_template: String, else_template: String },
    
    /// 列表渲染
    Iteration { item_template: String, key_path: Option<String> },
}

/// DOM 路径
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub struct DomPath {
    /// 路径步骤
    pub steps: Vec<PathStep>,
}

/// 路径步骤
#[derive(Debug, Clone, Hash, PartialEq, Eq)]
pub enum PathStep {
    /// 获取第一个子元素
    FirstChild,
    /// 获取下一个兄弟元素
    NextSibling,
    /// 按索引获取子元素
    ChildByIndex(usize),
}
```

### 4.2 DOM 路径计算

```rust
// ═══════════════════════════════════════════════════════════════════════════
// DOM 路径计算器
// ═══════════════════════════════════════════════════════════════════════════

/// DOM 路径计算器
pub struct DomPathCalculator {
    /// 当前路径
    current_path: DomPath,
    /// 兄弟元素计数器
    sibling_counter: HashMap<Atom<'static>, usize>,
    /// 元素类型计数器
    element_counter: HashMap<Atom<'static>, usize>,
}

impl DomPathCalculator {
    /// 进入一个元素
    pub fn enter_element(&mut self, tag_name: &Atom<'static>, is_dynamic: bool) -> DomPath {
        let path = self.current_path.clone();
        
        if is_dynamic {
            // 动态元素不需要添加到路径，因为它会被 IIFE 包裹
            return path;
        }
        
        self.current_path.steps.push(PathStep::FirstChild);
        path
    }
    
    /// 进入子元素
    pub fn enter_child(&mut self, index: usize) -> DomPath {
        let path = self.current_path.clone();
        
        // 检查是否是兄弟元素的第一个子元素
        if index == 0 {
            // 第一个子元素已经是 firstChild，不需要额外步骤
        } else {
            self.current_path.steps.push(PathStep::ChildByIndex(index));
        }
        
        path
    }
    
    /// 进入兄弟元素
    pub fn next_sibling(&mut self, tag_name: &Atom<'static>) -> DomPath {
        let path = self.current_path.clone();
        
        let count = self.sibling_counter.entry(tag_name.clone()).or_insert(0);
        if *count > 0 {
            // 不是第一个兄弟，需要 NextSibling
            for _ in 0..*count {
                self.current_path.steps.push(PathStep::NextSibling);
            }
        }
        *count += 1;
        
        path
    }
    
    /// 退出当前作用域
    pub fn exit(&mut self, steps_back: usize) {
        for _ in 0..steps_back {
            self.current_path.steps.pop();
        }
    }
}
```

### 4.3 JSX 元素分析器

```rust
// ═══════════════════════════════════════════════════════════════════════════
// JSX 元素分析器
// ═══════════════════════════════════════════════════════════════════════════

/// JSX 元素分析结果
pub struct JSXElementAnalysis {
    /// 标签名
    pub tag_name: Atom<'static>,
    /// 是否为组件
    pub is_component: bool,
    /// 是否为 Fragment
    pub is_fragment: bool,
    /// 是否为动态元素
    pub is_dynamic: bool,
    /// 是否为 SVG
    pub is_svg: bool,
    /// 是否为自定义元素
    pub is_custom_element: bool,
    /// 是否为自闭合元素
    pub is_void: bool,
    /// 属性分析
    pub attributes: Vec<AttributeAnalysis>,
    /// 子元素分析
    pub children: Vec<ChildAnalysis>,
    /// 需要生成的绑定
    pub bindings: Vec<Binding>,
    /// 静态 HTML
    pub static_html: String,
}

/// 属性分析
pub struct AttributeAnalysis {
    /// 属性名
    pub name: String,
    /// 命名空间 (如 "class", "style", "on", "prop", "bool")
    pub namespace: Option<String>,
    /// 属性值
    pub value: Option<ExpressionSource>,
    /// 是否为动态
    pub is_dynamic: bool,
}

/// 子元素分析
pub struct ChildAnalysis {
    /// 子元素类型
    pub kind: ChildKind,
    /// 源代码
    pub source: Option<String>,
    /// 模板信息
    pub template_info: Option<TemplateInfo>,
}

/// 子元素类型
#[derive(Debug, Clone)]
pub enum ChildKind {
    /// 字符串文本
    String(String),
    /// 表达式
    Expression,
    /// JSX 元素
    Element,
    /// JSX Fragment
    Fragment,
    /// 条件表达式
    Conditional,
    /// 逻辑与表达式
    LogicalAnd,
    /// 列表渲染
    Iteration,
}

/// 表达式来源
#[derive(Debug, Clone)]
pub struct ExpressionSource {
    /// 完整的表达式源代码
    pub full_source: String,
    /// 是否为信号访问
    pub is_signal_access: bool,
}

/// 分析 JSX 元素
pub fn analyze_jsx_element<'a>(
    elem: &JSXElement<'a>,
    state: &CompilerState,
) -> JSXElementAnalysis {
    // 1. 获取标签名
    let tag_name = get_jsx_tag_name(elem);
    
    // 2. 判断元素类型
    let is_component = is_component(&tag_name, state);
    let is_fragment = tag_name == "Fragment" || tag_name == "";
    let is_custom_element = is_custom_element(&tag_name);
    let is_void = is_void_element(&tag_name);
    let is_svg = is_svg_element(&tag_name) || state.svg_namespace_stack.last() == Some(&true);
    
    // 3. 分析属性
    let mut attributes = Vec::new();
    for attr in &elem.opening_element.attributes {
        attributes.push(analyze_attribute(attr, state));
    }
    
    // 4. 分析子元素
    let mut children = Vec::new();
    let mut static_html = String::new();
    
    for child in &elem.children {
        let child_analysis = analyze_jsx_child(child, state, &mut static_html);
        children.push(child_analysis);
    }
    
    // 5. 生成静态 HTML
    let html = build_static_html(elem, &children, &static_html);
    
    JSXElementAnalysis {
        tag_name,
        is_component,
        is_fragment,
        is_dynamic: false, // 将在后续确定
        is_svg,
        is_custom_element,
        is_void,
        attributes,
        children,
        bindings: Vec::new(), // 将在后续填充
        static_html: html,
    }
}

/// 获取 JSX 标签名
fn get_jsx_tag_name(elem: &JSXElement) -> Atom<'static> {
    match &elem.opening_element.name {
        JSXElementName::Identifier(id) => id.name.clone(),
        JSXElementName::QualifiedName(name) => {
            // 处理 <ns:Tag> 格式
            format!("{}:{}", name.namespace, name.name).into()
        }
        JSXElementName::JSXMemberExpression(expr) => {
            // 处理 <Foo.Bar> 格式
            format_expression_as_string(&expr).into()
        }
    }
}

/// 判断是否为组件
fn is_component(tag_name: &Atom<'static>, state: &CompilerState) -> bool {
    // 1. 检查内置组件
    if state.built_ins.contains(tag_name) {
        return false;
    }
    
    // 2. 检查是否为 HTML 元素
    if is_known_html_element(tag_name) {
        return false;
    }
    
    // 3. 检查是否为 SVG 元素
    if is_svg_element(tag_name) {
        return false;
    }
    
    // 4. 检查是否为自定义元素
    if is_custom_element(tag_name) {
        return false;
    }
    
    // 5. 检查首字母大写 (PascalCase)
    let name = tag_name.to_string();
    if let Some(first) = name.chars().next() {
        return first.is_ascii_uppercase();
    }
    
    false
}

/// 构建静态 HTML
fn build_static_html(
    elem: &JSXElement,
    children: &[ChildAnalysis],
    static_content: &str,
) -> String {
    let tag_name = get_jsx_tag_name(elem);
    
    if tag_name == "Fragment" || tag_name == "" {
        // Fragment 没有包装元素
        return static_content.to_string();
    }
    
    let mut html = format!("<{}", tag_name);
    
    // 添加属性
    for attr in &elem.opening_element.attributes {
        if let Some(attr_html) = build_attribute_html(attr) {
            html.push_str(&attr_html);
        }
    }
    
    if is_void_element(&tag_name) {
        // 自闭合元素
        html.push('/');
    }
    
    html.push('>');
    html.push_str(static_content);
    
    if !is_void_element(&tag_name) {
        html.push_str("</");
        html.push_str(&tag_name);
        html.push('>');
    }
    
    html
}
```

---

## 5. TemplateIR 中间表示

### 5.1 模板 IR 结构

```rust
// ═══════════════════════════════════════════════════════════════════════════
// TemplateIR - 模板中间表示
// ═══════════════════════════════════════════════════════════════════════════

/// 模板中间表示
#[derive(Debug, Clone)]
pub struct TemplateIR {
    /// 唯一标识符
    pub id: String,
    /// 模板变量名
    pub name: String,
    /// 静态 HTML 模板
    pub html: String,
    /// 是否为 SVG
    pub is_svg: bool,
    /// 绑定列表
    pub bindings: Vec<BindingIR>,
    /// 子模板引用
    pub children: Vec<ChildTemplate>,
    /// DOM 路径映射
    pub dom_paths: HashMap<String, DomPath>,
    /// 需要的运行时 helpers
    pub helpers: Vec<&'static str>,
}

/// 绑定中间表示
#[derive(Debug, Clone)]
pub struct BindingIR {
    /// 绑定类型
    pub kind: BindingKindIR,
    /// DOM 路径
    pub dom_path: DomPath,
    /// 源代码
    pub source: String,
    /// 是否需要 effect 包装
    pub needs_effect: bool,
    /// 绑定优先级
    pub priority: BindingPriority,
}

/// 绑定类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum BindingKindIR {
    /// 静态属性 (编译时可确定)
    Static,
    /// 动态属性
    Dynamic,
    /// 事件绑定
    Event,
    /// 条件渲染
    Conditional,
    /// 列表渲染
    Iteration,
    /// 文本内容
    Text,
    /// 元素引用
    Ref,
}

/// 绑定优先级
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum BindingPriority {
    /// 最高优先级 - 模板创建时设置
    Template = 0,
    /// 高优先级 - 元素创建后立即设置
    Immediate = 1,
    /// 普通优先级 - 在 effect 中设置
    Effect = 2,
    /// 低优先级 - 异步 effect
    Async = 3,
}

/// 子模板
#[derive(Debug, Clone)]
pub struct ChildTemplate {
    /// 模板 ID
    pub template_id: String,
    /// DOM 路径
    pub dom_path: DomPath,
    /// 位置标记
    pub marker: Option<String>,
    /// 源代码
    pub source: String,
}
```

### 5.2 TemplateIR 生成示例

```jsx
// 输入 JSX
<div className="container">
  <h1 class={titleClass}>{title}</h1>
  <button onClick={handleClick}>Click</button>
</div>

// 生成的 TemplateIR
TemplateIR {
    id: "_tmpl$1",
    name: "_tmpl$1",
    html: "<div><h1><!----></h1><button>Click</button></div>",
    is_svg: false,
    bindings: [
        BindingIR {
            kind: BindingKindIR::Static,
            dom_path: DomPath { steps: [] },
            source: "\"container\"",
            needs_effect: false,
            priority: BindingPriority::Template,
        }
    ],
    children: [
        ChildTemplate {
            template_id: "_tmpl$2",
            dom_path: DomPath { steps: [FirstChild] },
            marker: Some("<!--#-->"),
            source: null,
        },
        ChildTemplate {
            template_id: "_tmpl$3",
            dom_path: DomPath { steps: [FirstChild, NextSibling] },
            marker: None,
            source: null,
        }
    ],
    dom_paths: {
        "_el$": DomPath { steps: [] },
        "_el$1": DomPath { steps: [FirstChild] },
        "_el$2": DomPath { steps: [FirstChild, NextSibling] },
    },
    helpers: ["template"],
}

ChildTemplate "_tmpl$2": TemplateIR {
    id: "_tmpl$2",
    name: "_tmpl$2",
    html: "<h1><!----></h1>",
    bindings: [
        BindingIR {
            kind: BindingKindIR::Dynamic,
            dom_path: DomPath { steps: [] },
            source: "titleClass",
            needs_effect: true,
            priority: BindingPriority::Effect,
        }
    ],
    children: [
        ChildTemplate {
            template_id: null,
            dom_path: DomPath { steps: [FirstChild] },
            marker: Some("<!--#-->"),
            source: "title",
        }
    ],
    helpers: ["template", "insert"],
}

ChildTemplate "_tmpl$3": TemplateIR {
    id: "_tmpl$3",
    name: "_tmpl$3",
    html: "<button>Click</button>",
    bindings: [
        BindingIR {
            kind: BindingKindIR::Event,
            dom_path: DomPath { steps: [] },
            source: "handleClick",
            needs_effect: false,
            priority: BindingPriority::Immediate,
        }
    ],
    helpers: ["template", "delegateEvents"],
}
```

### 5.3 TemplateIR 到代码生成

```rust
// ═══════════════════════════════════════════════════════════════════════════
// TemplateIR 到代码生成
// ═══════════════════════════════════════════════════════════════════════════

/// 代码生成器
pub struct TemplateCodeGenerator<'a> {
    /// 模板 IR
    ir: &'a TemplateIR,
    /// 生成器状态
    buf: String,
    /// 缩进级别
    indent: usize,
}

impl<'a> TemplateCodeGenerator<'a> {
    /// 生成模板声明
    pub fn generate_template_decl(&mut self) {
        self.push_indent();
        
        // 检查是否需要 SVG 命名空间
        let is_svg = self.ir.is_svg;
        
        self.buf.push_str(&format!(
            "const {} = template(\"{}\"{})",
            self.ir.name,
            self.ir.html,
            if is_svg { ", true" } else { "" }
        ));
        
        self.buf.push_str(";\n");
    }
    
    /// 生成元素创建函数
    pub fn generate_create_function(&mut self) {
        let var_name = format!("_el$", );
        let template_call = format!("{}.cloneNode(true)", self.ir.name);
        
        self.push_indent();
        self.buf.push_str(&format!("const {} = {};\n", var_name, template_call));
        
        // 生成 DOM 路径变量
        for (name, path) in &self.ir.dom_paths {
            if name != "_el$" {
                let accessor = path.to_accessor();
                self.push_indent();
                self.buf.push_str(&format!("const {} = {}.{};\n", name, var_name, accessor));
            }
        }
        
        // 生成绑定
        for binding in &self.ir.bindings {
            self.generate_binding(binding);
        }
        
        // 生成子元素
        for child in &self.ir.children {
            self.generate_child(child);
        }
    }
    
    /// 生成绑定代码
    fn generate_binding(&mut self, binding: &BindingIR) {
        match &binding.kind {
            BindingKindIR::Static => {
                // 静态绑定已在模板中，不需要额外代码
            }
            BindingKindIR::Dynamic => {
                if binding.needs_effect {
                    self.generate_effect_binding(binding);
                } else {
                    self.generate_immediate_binding(binding);
                }
            }
            BindingKindIR::Event => {
                self.generate_event_binding(binding);
            }
            BindingKindIR::Ref => {
                self.generate_ref_binding(binding);
            }
            _ => {}
        }
    }
    
    /// 生成事件绑定
    fn generate_event_binding(&mut self, binding: &BindingIR) {
        if let BindingKindIR::Event = binding.kind {
            let event_name = &binding.source; // source 包含事件名
            let handler = &binding.source; // 需要从上下文获取
            
            self.push_indent();
            self.buf.push_str(&format!(
                "_el$.$$eventName = handler;\n",
            ));
        }
    }
    
    /// 生成 effect 绑定
    fn generate_effect_binding(&mut self, binding: &BindingIR) {
        self.push_indent();
        self.buf.push_str("effect(() => {\n");
        self.indent += 1;
        
        self.push_indent();
        self.buf.push_str(&format!("_el$.className = {};\n", binding.source));
        
        self.indent -= 1;
        self.push_indent();
        self.buf.push_str("});\n");
    }
}
```

---

## 6. DOM 编译器实现

### 6.1 DOM 转换 Pass

```rust
// ═══════════════════════════════════════════════════════════════════════════
// DOM 转换 Pass - 将 JSX 转换为 DOM 操作代码
// ═══════════════════════════════════════════════════════════════════════════

/// DOM 转换 Pass
pub struct DomTransformPass<'a> {
    /// 源代码
    source: &'a str,
    /// 编译器状态
    state: &'a mut CompilerState,
    /// AST 构建器
    builder: AstBuilder<'a>,
}

impl<'a> DomTransformPass<'a> {
    pub fn new(source: &'a str, state: &'a mut CompilerState) -> Self {
        Self {
            source,
            state,
            builder: AstBuilder::default(),
        }
    }
}

impl<'a, S> VisitorMut<'a, S> for DomTransformPass<'a>
where
    S: Default,
{
    fn enter_program(&mut self, program: &mut Program<'a>, _ctx: &mut TraverseCtx<'a, S>) {
        // 注册默认配置
        self.state.options.merge_with_defaults();
        
        // 注册内置组件
        self.register_builtin_components();
    }
    
    fn enter_jsx_element(&mut self, elem: &mut JSXElement<'a>, ctx: &mut TraverseCtx<'a, S>) {
        // 1. 分析 JSX 元素
        let analysis = analyze_jsx_element(elem, self.state);
        
        // 2. 判断转换策略
        if analysis.is_component {
            // 组件转换
            self.transform_component(elem, ctx, &analysis);
        } else if analysis.is_fragment {
            // Fragment 转换
            self.transform_fragment(elem, ctx, &analysis);
        } else {
            // DOM 元素转换
            self.transform_element(elem, ctx, &analysis);
        }
    }
    
    fn enter_jsx_fragment(&mut self, frag: &mut JSXFragment<'a>, ctx: &mut TraverseCtx<'a, S>) {
        // Fragment 转换
        self.transform_fragment_from_fragment(frag, ctx);
    }
    
    fn enter_if_statement(&mut self, stmt: &mut IfStatement<'a>, ctx: &mut TraverseCtx<'a, S>) {
        // 检查是否应该转换为 ternary
        if self.should_transform_to_ternary(stmt) {
            self.transform_to_ternary(stmt, ctx);
        }
    }
}
```

### 6.2 DOM 元素转换

```rust
impl<'a> DomTransformPass<'a> {
    /// 转换 DOM 元素
    fn transform_element(
        &mut self,
        elem: &mut JSXElement<'a>,
        ctx: &mut TraverseCtx<'a, S>,
        analysis: &JSXElementAnalysis,
    ) {
        // 1. 生成模板声明
        let template_name = self.generate_template_declaration(analysis);
        
        // 2. 生成元素创建代码
        let element_code = self.generate_element_creation(analysis, &template_name);
        
        // 3. 创建 IIFE 包装
        let iife = self.builder.arrow_function_expression(
            elem.span,
            vec![], // 空参数
            self.builder.block_statement(
                elem.span,
                vec![
                    // 模板声明语句
                    self.builder.variable_declaration(
                        elem.span,
                        vec![self.builder.variable_declarator(
                            elem.span,
                            self.builder.identifier(elem.span, &template_name),
                            Some(self.builder.call_expression(
                                elem.span,
                                self.builder.identifier(elem.span, "template"),
                                vec![self.builder.string_literal(elem.span, &analysis.static_html)],
                                false,
                            )),
                        )],
                        "const",
                    ),
                    // 元素创建语句
                    self.builder.expression_statement(
                        elem.span,
                        self.builder.call_expression(
                            elem.span,
                            self.builder.identifier(elem.span, template_name),
                            vec![],
                            false,
                        ),
                    ),
                ],
            ),
            false,
            false,
        );
        
        // 4. 替换节点
        ctx.replace node.to_expression() with iife;
    }
    
    /// 生成模板声明
    fn generate_template_declaration(&mut self, analysis: &JSXElementAnalysis) -> String {
        let name = format!("_tmpl${}", self.state.template_counter);
        self.state.template_counter += 1;
        
        let mut decl = TemplateDecl {
            name: name.clone(),
            html: analysis.static_html.clone(),
            is_svg: analysis.is_svg,
            bindings: Vec::new(),
            dom_paths: HashMap::new(),
        };
        
        // 收集绑定信息
        for attr in &analysis.attributes {
            if attr.is_dynamic {
                let binding = self.create_binding_from_attribute(attr, &decl.name);
                decl.bindings.push(binding);
            }
        }
        
        // 添加到状态
        self.state.templates.push(decl);
        
        name
    }
    
    /// 生成元素创建代码
    fn generate_element_creation(
        &mut self,
        analysis: &JSXElementAnalysis,
        template_name: &str,
    ) -> String {
        let mut code = format!("const _el$ = {}.cloneNode(true);\n", template_name);
        
        // 生成 DOM 路径访问
        code.push_str("const _h1$ = _el$.firstChild;\n");
        
        // 生成属性设置
        for attr in &analysis.attributes {
            if attr.is_dynamic {
                code.push_str(&self.generate_attribute_setter(attr));
            }
        }
        
        code.push_str("return _el$;");
        code
    }
    
    /// 生成属性设置代码
    fn generate_attribute_setter(&mut self, attr: &AttributeAnalysis) -> String {
        let (handler_name, setter) = match attr.namespace.as_deref() {
            Some("class") => ("class", format!("_el$.className = {};", attr.value.as_ref().unwrap().full_source)),
            Some("style") => ("style", format!("_el$.style.{} = {};", attr.name, attr.value.as_ref().unwrap().full_source)),
            Some("on") => {
                let event_name = attr.name.trim_start_matches("on").to_lowercase();
                self.state.delegated_events.push(event_name.clone());
                ("event", format!("_el$.$$eventName = {};", attr.value.as_ref().unwrap().full_source))
            }
            Some("prop") => ("prop", format!("_el$[{}] = {};", attr.name, attr.value.as_ref().unwrap().full_source)),
            Some("bool") => ("bool", format!("if ({}) {{ _el$.setAttribute('{}', ''); }} else {{ _el$.removeAttribute('{}'); }}", 
                attr.value.as_ref().unwrap().full_source, attr.name, attr.name)),
            _ => ("attr", format!("_el$.setAttribute('{}', {});", attr.name, attr.value.as_ref().unwrap().full_source)),
        };
        
        setter
    }
}
```

### 6.3 if-return → ternary 转换

```rust
impl<'a> DomTransformPass<'a> {
    /// 检查是否应该转换为 ternary
    fn should_transform_to_ternary(&self, stmt: &IfStatement) -> bool {
        // 1. 条件包含信号调用
        let has_signal = contains_signal_call(&stmt.test);
        
        // 2. then 分支返回 JSX
        let then_returns_jsx = self.returns_jsx(&stmt.consequent);
        
        // 3. else 分支存在且返回 JSX
        let else_returns_jsx = stmt.alternate
            .as_ref()
            .map_or(false, |alt| self.returns_jsx(alt));
        
        has_signal && then_returns_jsx && else_returns_jsx
    }
    
    /// 检查语句是否返回 JSX
    fn returns_jsx(&self, stmt: &Statement) -> bool {
        match stmt {
            Statement::Return(ret) => {
                ret.argument.as_ref().map_or(false, |arg| {
                    matches!(
                        arg,
                        Expression::JSXElement(_) | Expression::JSXFragment(_)
                    )
                })
            }
            Statement::Block(block) => {
                // 检查块中最后一个语句
                block.body.last().map_or(false, |s| self.returns_jsx(s))
            }
            _ => false,
        }
    }
    
    /// 转换为 ternary 表达式
    fn transform_to_ternary(&mut self, stmt: &mut IfStatement, ctx: &mut TraverseCtx<'a, S>) {
        // 1. 提取 then 分支的返回值
        let then_expr = self.extract_return_expression(&stmt.consequent)
            .expect("then branch must return JSX");
        
        // 2. 提取 else 分支的返回值
        let else_expr = stmt.alternate
            .as_ref()
            .and_then(|alt| self.extract_return_expression(alt))
            .unwrap_or_else(|| {
                // 如果没有 else 分支，返回 undefined
                self.builder.identifier(stmt.span, "undefined")
            });
        
        // 3. 创建 ternary 表达式
        let ternary = self.builder.conditional_expression(
            stmt.span,
            stmt.test.clone(),
            then_expr,
            else_expr,
        );
        
        // 4. 替换 if 语句为 ternary 表达式
        // 需要检查父节点以确定替换方式
        if let Some(Ancestor::StatementListItemExpression(_)) = ctx.parent_kind() {
            ctx.replace node.to_expression() with ternary;
        } else if let Some(Ancestor::ReturnStatementArgument(_)) = ctx.parent_kind() {
            // 在 return 语句中，直接替换 argument
            if let Some(Ancestor::ReturnStatementArgument(ret)) = ctx.parent_kind() {
                ret.argument = Some(ternary);
            }
        }
    }
    
    /// 提取 return 语句中的表达式
    fn extract_return_expression(&self, stmt: &Statement) -> Option<Expression> {
        match stmt {
            Statement::Return(ret) => ret.argument.clone(),
            Statement::Block(block) => {
                block.body.last().and_then(|s| self.extract_return_expression(s))
            }
            _ => None,
        }
    }
}
```

---

## 7. SSR 编译器实现

### 7.1 SSR 转换策略

```
┌─────────────────────────────────────────────────────────────────┐
│                      SSR 编译策略                                  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  与 DOM 模式的核心差异:                                            │
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐                      │
│  │    DOM 模式      │    │    SSR 模式      │                      │
│  ├─────────────────┤    ├─────────────────┤                      │
│  │  template()     │    │  ssr()          │                      │
│  │  .cloneNode()   │    │  HTML 字符串拼接  │                      │
│  │  insert()       │    │  静态拼接 + 动态  │                      │
│  │  effect()       │    │  运行时无 effect  │                      │
│  │                 │    │                 │                      │
│  │  动态内容:        │    │  动态内容:        │                      │
│  │  <!----> marker  │    │  插值表达式 ${}   │                      │
│  └─────────────────┘    └─────────────────┘                      │
│                                                                  │
│  SSR 示例:                                                        │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  输入:                                                    │    │
│  │  <div class={cls}>{content}</div>                       │    │
│  │                                                         │    │
│  │  DOM 输出:                                               │    │
│  │  const _tmpl = template('<div class=""><!----></div>'); │    │
│  │  effect(() => _el$.className = cls);                   │    │
│  │  insert(_el$, content, marker);                         │    │
│  │                                                         │    │
│  │  SSR 输出:                                              │    │
│  │  ssr(`<div class="${escape(cls)}">${escape(content)}</div>`)  │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 7.2 SSR 转换 Pass

```rust
// ═══════════════════════════════════════════════════════════════════════════
// SSR 转换 Pass
// ═══════════════════════════════════════════════════════════════════════════

/// SSR 转换 Pass
pub struct SsrTransformPass<'a> {
    /// 源代码
    source: &'a str,
    /// 编译器状态
    state: &'a mut CompilerState,
    /// AST 构建器
    builder: AstBuilder<'a>,
    /// 嵌套深度
    depth: usize,
}

impl<'a> SsrTransformPass<'a> {
    pub fn new(source: &'a str, state: &'a mut CompilerState) -> Self {
        Self {
            source,
            state,
            builder: AstBuilder::default(),
            depth: 0,
        }
    }
    
    /// 转换 JSX 元素为 SSR 代码
    fn transform_jsx_to_ssr(&mut self, elem: &mut JSXElement<'a>) -> Expression {
        // 1. 分析元素
        let analysis = analyze_jsx_element(elem, self.state);
        
        // 2. 构建 SSR 表达式
        self.build_ssr_expression(&analysis)
    }
    
    /// 构建 SSR 表达式
    fn build_ssr_expression(&mut self, analysis: &JSXElementAnalysis) -> Expression {
        if analysis.is_component {
            // 组件: 调用组件函数
            self.build_component_ssr(analysis)
        } else if analysis.is_fragment {
            // Fragment: 拼接子元素
            self.build_fragment_ssr(analysis)
        } else {
            // 普通元素: ssrElement 调用
            self.build_element_ssr(analysis)
        }
    }
    
    /// 构建元素 SSR
    fn build_element_ssr(&mut self, analysis: &JSXElementAnalysis) -> Expression {
        let tag = self.builder.string_literal(analysis.tag_name.as_str());
        
        // 处理属性
        let attrs_expr = self.build_ssr_attributes(&analysis.attributes);
        
        // 处理子元素
        let children_exprs = self.build_ssr_children(&analysis.children);
        
        // 生成 ssrElement 调用
        self.builder.call_expression(
            Span::default(),
            self.builder.identifier("ssrElement"),
            vec![tag, attrs_expr, self.builder.array_expression(children_exprs)],
            false,
        )
    }
    
    /// 构建 SSR 属性对象
    fn build_ssr_attributes(&mut self, attrs: &[AttributeAnalysis]) -> Expression {
        let mut properties = Vec::new();
        
        for attr in attrs {
            let key = self.builder.string_literal(&attr.name);
            let value = match &attr.value {
                Some(expr) => {
                    if attr.is_dynamic {
                        // 动态属性: 使用转义的函数调用
                        self.builder.call_expression(
                            Span::default(),
                            self.builder.identifier("escape"),
                            vec![self.parse_expression(&expr.full_source)],
                            false,
                        )
                    } else {
                        self.parse_expression(&expr.full_source)
                    }
                }
                None => {
                    // 布尔属性: true
                    self.builder.boolean_literal(Span::default(), true)
                }
            };
            
            properties.push(self.builder.object_property(
                Span::default(),
                key,
                value,
                false,
                false,
                None,
            ));
        }
        
        self.builder.object_expression(properties)
    }
    
    /// 构建 SSR 子元素
    fn build_ssr_children(&mut self, children: &[ChildAnalysis]) -> Vec<Expression> {
        let mut exprs = Vec::new();
        
        for child in children {
            match child.kind {
                ChildKind::String(ref s) => {
                    exprs.push(self.builder.string_literal(s));
                }
                ChildKind::Expression => {
                    // 使用 escape 转义
                    let escaped = self.builder.call_expression(
                        Span::default(),
                        self.builder.identifier("escape"),
                        vec![self.parse_expression(child.source.as_ref().unwrap())],
                        false,
                    );
                    exprs.push(escaped);
                }
                ChildKind::Element => {
                    // 递归处理子元素
                    if let Some(template_info) = &child.template_info {
                        exprs.push(self.parse_expression(&template_info.source));
                    }
                }
                ChildKind::Conditional | ChildKind::LogicalAnd => {
                    // 条件表达式需要特殊处理
                    exprs.push(self.transform_conditional(child));
                }
                ChildKind::Iteration => {
                    // 列表渲染
                    exprs.push(self.transform_iteration(child));
                }
                _ => {}
            }
        }
        
        exprs
    }
    
    /// 转换条件表达式
    fn transform_conditional(&mut self, child: &ChildAnalysis) -> Expression {
        // 解析条件表达式
        let cond_expr = self.parse_expression(child.source.as_ref().unwrap());
        
        // 包装在 escape 调用中
        self.builder.call_expression(
            Span::default(),
            self.builder.identifier("escape"),
            vec![cond_expr],
            false,
        )
    }
    
    /// 转换列表渲染
    fn transform_iteration(&mut self, child: &ChildAnalysis) -> Expression {
        // 解析 .map() 调用
        let map_expr = self.parse_expression(child.source.as_ref().unwrap());
        
        // 包装在 escape 调用中
        self.builder.call_expression(
            Span::default(),
            self.builder.identifier("escape"),
            vec![map_expr],
            false,
        )
    }
}
```

---

## 8. WebComponent 编译器实现

### 8.1 WebComponent 转换策略

```
┌─────────────────────────────────────────────────────────────────┐
│                    WebComponent 编译策略                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  核心差异:                                                        │
│                                                                  │
│  ┌─────────────────┐    ┌─────────────────┐                      │
│  │    DOM 模式      │    │  WebComponent 模式 │                      │
│  ├─────────────────┤    ├─────────────────┤                      │
│  │  原生 HTML 元素   │    │  customElements  │                      │
│  │  直接操作 DOM    │    │  包装器处理       │                      │
│  │                 │    │                 │                      │
│  │  <div>         │    │  <my-element>    │                      │
│  │                 │    │    ↓             │                      │
│  │                 │    │  转换为:         │                      │
│  │                 │    │  createElement  │                      │
│  │                 │    │  + 属性传递      │                      │
│  │                 │    │  + Shadow DOM   │                      │
│  └─────────────────┘    └─────────────────┘                      │
│                                                                  │
│  Shadow DOM 支持:                                                │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │  输入:                                                    │    │
│  │  <my-card>                                               │    │
│  │    <div slot="header">Title</div>                       │    │
│  │    <div>Content</div>                                   │    │
│  │  </my-card>                                             │    │
│  │                                                         │    │
│  │  输出:                                                   │    │
│  │  const _el$ = document.createElement('my-card');         │    │
│  │  const _shadow$ = _el$.attachShadow({mode: 'open'});    │    │
│  │  // header slot                                         │    │
│  │  const _header$ = document.createElement('div');        │    │
│  │  _header$.setAttribute('slot', 'header');               │    │
│  │  _shadow$.appendChild(_header$);                        │    │
│  │  // default slot                                       │    │
│  │  const _content$ = document.createElement('div');       │    │
│  │  _shadow$.appendChild(_content$);                       │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 WebComponent 转换 Pass

```rust
// ═══════════════════════════════════════════════════════════════════════════
// WebComponent 转换 Pass
// ═══════════════════════════════════════════════════════════════════════════

/// WebComponent 转换 Pass
pub struct WcTransformPass<'a> {
    /// 源代码
    source: &'a str,
    /// 编译器状态
    state: &'a mut CompilerState,
    /// AST 构建器
    builder: AstBuilder<'a>,
    /// Shadow DOM 上下文
    in_shadow: bool,
}

impl<'a> WcTransformPass<'a> {
    pub fn new(source: &'a str, state: &'a mut CompilerState) -> Self {
        Self {
            source,
            state,
            builder: AstBuilder::default(),
            in_shadow: false,
        }
    }
    
    /// 判断是否为自定义元素
    fn is_custom_element(tag_name: &Atom<'static>) -> bool {
        let name = tag_name.to_string();
        // 包含连字符的自定义元素
        name.contains('-') || name.contains(':')
    }
    
    /// 转换自定义元素
    fn transform_custom_element(
        &mut self,
        elem: &mut JSXElement<'a>,
        analysis: &JSXElementAnalysis,
    ) -> Expression {
        let tag = self.builder.string_literal(analysis.tag_name.as_str());
        
        // 创建元素
        let create_expr = self.builder.call_expression(
            Span::default(),
            self.builder.member_expression(
                self.builder.identifier("document"),
                "createElement",
            ),
            vec![tag],
            false,
        );
        
        // 收集 slot 内容
        let (slots, default_content) = self.extract_slots(elem);
        
        // 处理属性
        self.apply_attributes(elem, &create_expr);
        
        // 处理 slots
        self.apply_slots(&create_expr, &slots, &default_content);
        
        create_expr
    }
    
    /// 提取 slot 内容
    fn extract_slots(&mut self, elem: &JSXElement<'a>) -> (HashMap<String, Vec<JSXElement<'a>>>, Vec<JSXElement<'a>>>) {
        let mut slots: HashMap<String, Vec<JSXElement<'a>>> = HashMap::new();
        let mut default_content: Vec<JSXElement<'a>> = Vec::new();
        
        for child in &elem.children {
            if let JSXChild::Element(child_elem) = child {
                // 检查 slot 属性
                if let Some(slot_name) = self.get_slot_name(child_elem) {
                    slots.entry(slot_name).or_default().push(child_elem.clone());
                } else {
                    default_content.push(child_elem.clone());
                }
            }
        }
        
        (slots, default_content)
    }
    
    /// 获取 slot 名称
    fn get_slot_name(&self, elem: &JSXElement) -> Option<String> {
        for attr in &elem.opening_element.attributes {
            if let JSXAttribute::Attribute(attr) = attr {
                if attr.name.name == "slot" {
                    if let Some(value) = &attr.value {
                        if let JSXAttributeValue::Expression(expr) = value {
                            // 简化处理：直接获取字符串值
                            return self.extract_string_from_expression(expr);
                        }
                    }
                }
            }
        }
        None
    }
    
    /// 应用属性到元素
    fn apply_attributes(&mut self, elem: &JSXElement, element_expr: &Expression) {
        // 属性会被转换为 setAttribute 或 property 赋值
        for attr in &elem.opening_element.attributes {
            // 生成相应的属性设置代码
        }
    }
    
    /// 应用 slots
    fn apply_slots(
        &mut self,
        element_expr: &Expression,
        slots: &HashMap<String, Vec<JSXElement<'a>>>,
        default_content: &[JSXElement<'a>],
    ) {
        // 为每个命名 slot 创建对应内容
        for (name, contents) in slots {
            // document.createElement -> setAttribute('slot', name) -> appendChild
        }
        
        // 处理默认 slot 内容
        for content in default_content {
            // 直接 appendChild 到 shadow root
        }
    }
}
```

---

## 9. 运行时设计

### 9.1 核心运行时 API

```typescript
// @zeus-js/core - 核心运行时

// ═══════════════════════════════════════════════════════════════════════════
// 模板系统
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 创建模板元素
 * @param html HTML 模板字符串
 * @param isSVG 是否为 SVG 元素
 * @returns 返回一个函数，调用后返回克隆的 DOM 节点
 */
export function template(html: string, isSVG?: boolean): () => Element {
    const tmpl = document.createElement('template');
    tmpl.innerHTML = html;
    if (isSVG) {
        tmpl.content.querySelectorAll('svg, path, rect, circle, ellipse, line, polyline, polygon')
            .forEach(el => el.setAttribute('xmlns', 'http://www.w3.org/2000/svg'));
    }
    return () => tmpl.content.cloneNode(true) as Element;
}

/**
 * 动态内容插入
 * @param parent 父元素
 * @param accessor 值访问器（响应式函数）
 * @param marker 位置标记元素（可选）
 */
export function insert(
    parent: Node,
    accessor: () => any,
    marker?: Node
): void {
    effect(() => {
        const value = accessor();
        // 实现插入逻辑
    });
}

// ═══════════════════════════════════════════════════════════════════════════
// 事件委托
// ═══════════════════════════════════════════════════════════════════════════

const delegatedEvents: Map<string, EventListener> = new Map();
const delegatedEventTypes = [
    'click', 'mousedown', 'mouseup', 'mouseenter', 'mouseleave',
    'touchstart', 'touchend', 'touchmove', 'touchcancel',
    'input', 'change', 'submit', 'reset',
    'keydown', 'keyup', 'keypress',
    'focus', 'blur', 'scroll',
];

/**
 * 注册委托事件
 * @param events 事件名称数组
 */
export function delegateEvents(events: string[]): void {
    for (const event of events) {
        if (!delegatedEvents.has(event)) {
            const handler = (e: Event) => {
                let target = e.target as Element | null;
                while (target && target !== e.currentTarget) {
                    const handler = (target as any)[`$$${event}`];
                    if (handler) {
                        e.preventDefault();
                        handler.call(target, e);
                        return;
                    }
                    target = target.parentElement;
                }
            };
            delegatedEvents.set(event, handler);
            document.addEventListener(event, handler);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// 属性设置
// ═══════════════════════════════════════════════════════════════════════════

/**
 * 设置类名
 */
export function className(el: Element, value: any): void {
    if (typeof value === 'string') {
        el.className = value;
    } else if (value) {
        el.className = Object.keys(value)
            .filter(k => value[k])
            .join(' ');
    } else {
        el.className = '';
    }
}

/**
 * 设置样式
 */
export function style(el: Element, value: any): void {
    if (typeof value === 'string') {
        el.setAttribute('style', value);
    } else if (value) {
        Object.assign((el as HTMLElement).style, value);
    }
}

/**
 * 设置 HTML 属性
 */
export function setAttribute(el: Element, name: string, value: any): void {
    if (value == null || value === false) {
        el.removeAttribute(name);
    } else {
        el.setAttribute(name, value === true ? '' : String(value));
    }
}

/**
 * 设置 DOM 属性
 */
export function setProperty(el: Element, name: string, value: any): void {
    (el as any)[name] = value;
}

// ═══════════════════════════════════════════════════════════════════════════
// SSR 支持
// ═══════════════════════════════════════════════════════════════════════════

/**
 * HTML 转义
 */
export function escape(value: any): string {
    if (value == null) return '';
    const str = String(value);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

/**
 * SSR 静态字符串
 */
export function ssr(html: string): Comment {
    return document.createComment(html);
}

/**
 * SSR 元素创建
 */
export function ssrElement(
    tag: string,
    attrs: Record<string, any>,
    children: any[]
): Node {
    const el = document.createElement(tag);
    
    // 应用属性
    for (const [key, value] of Object.entries(attrs)) {
        if (key === 'className') {
            el.className = value;
        } else if (key === 'style' && typeof value === 'object') {
            Object.assign((el as HTMLElement).style, value);
        } else if (key.startsWith('on')) {
            // 事件处理
        } else {
            el.setAttribute(key, value);
        }
    }
    
    // 添加子节点
    for (const child of children) {
        if (typeof child === 'string') {
            el.appendChild(document.createTextNode(child));
        } else if (child instanceof Node) {
            el.appendChild(child);
        }
    }
    
    return el;
}

// ═══════════════════════════════════════════════════════════════════════════
// alien-signal 集成
// ═══════════════════════════════════════════════════════════════════════════

// 运行时使用 alien-signal 作为响应式基础
export { signal, effect, memo, untrack, batch } from '@zeus-js/signal';
```

### 9.2 响应式系统集成

```typescript
// @zeus-js/signal - alien-signal 封装

import { createSignal, createEffect, createMemo, batch } from 'alien-signal';

/**
 * 创建信号
 */
export function signal<T>(value: T): [() => T, (value: T) => void] {
    return createSignal(value);
}

/**
 * 创建计算值
 */
export function memo<T>(fn: () => T): () => T {
    return createMemo(fn);
}

/**
 * 创建副作用
 */
export function effect(fn: () => void): () => void {
    return createEffect(fn);
}

/**
 * 批量更新
 */
export function batch(fn: () => void): void {
    batch(fn);
}

/**
 * 忽略追踪
 */
export function untrack<T>(fn: () => T): T {
    return createUntrack(fn);
}
```

---

## 10. OXC 适配层

### 10.1 OXC JSX AST 兼容处理

```rust
// ═══════════════════════════════════════════════════════════════════════════
// OXC 适配层 - 处理 OXC 与 Babel AST 的差异
// ═══════════════════════════════════════════════════════════════════════════

/// OXC JSX 节点扩展
pub mod jsx_extension {
    use oxc_ast::{ast::*, AstBuilder, span::Span};
    
    /// JSX 属性扩展
    pub trait JSXAttributeExt {
        /// 获取属性名
        fn get_name(&self) -> String;
        /// 获取属性值
        fn get_value(&self) -> Option<JSXAttributeValueExt>;
        /// 检查是否为 spread
        fn is_spread(&self) -> bool;
    }
    
    impl JSXAttributeExt for JSXAttribute<'_> {
        fn get_name(&self) -> String {
            self.name.name.to_string()
        }
        
        fn get_value(&self) -> Option<JSXAttributeValueExt> {
            self.value.as_ref().map(|v| JSXAttributeValueExt(v))
        }
        
        fn is_spread(&self) -> bool {
            false
        }
    }
    
    /// JSX Spread 属性
    pub struct JSXSpreadAttributeExt<'a>(&'a JSXSpreadAttribute<'a>>);
    
    impl JSXSpreadAttributeExt<'_> {
        pub fn is_spread(&self) -> bool {
            true
        }
    }
    
    /// JSX 属性值扩展
    pub struct JSXAttributeValueExt<'a>(&'a JSXAttributeValue<'a>>);
    
    impl JSXAttributeValueExt<'_> {
        /// 提取字符串值
        pub fn extract_string(&self) -> Option<String> {
            match self.0 {
                JSXAttributeValue::StringLiteral(s) => Some(s.value.to_string()),
                _ => None,
            }
        }
        
        /// 提取表达式源代码
        pub fn extract_expression_source(&self) -> Option<String> {
            match self.0 {
                JSXAttributeValue::ExpressionContainer(expr) => {
                    Some(format_expression(&expr.expression))
                }
                _ => None,
            }
        }
    }
}

/// 表达式源代码提取
pub fn format_expression(expr: &Expression) -> String {
    // 使用 OXC 的 printer 获取表达式源代码
    let mut printer = Printer::new();
    printer.print_expression(expr);
    printer.output().code
}

/// JSX 元素名处理
pub mod element_name {
    use oxc_ast::{ast::*, Atom};
    
    /// 获取 JSX 元素名称
    pub fn get_element_name<'a>(name: &JSXElementName<'a>) -> Atom<'static> {
        match name {
            JSXElementName::Identifier(id) => id.name.clone(),
            JSXElementName::QualifiedName(qn) => {
                format!("{}:{}", qn.namespace, qn.name).into()
            }
            JSXElementName::JSXMemberExpression(expr) => {
                // 处理 <Foo.Bar> 格式
                let object = get_member_object(&expr.object);
                let property = expr.property.name.to_string();
                format!("{}.{}", object, property).into()
            }
        }
    }
    
    fn get_member_object<'a>(expr: &JSXMemberExpressionObject<'a>) -> String {
        match expr {
            JSXMemberExpressionObject::Identifier(id) => id.name.to_string(),
            JSXMemberExpressionObject::JSXMemberExpression(inner) => {
                let object = get_member_object(&inner.object);
                let property = inner.property.name.to_string();
                format!("{}.{}", object, property)
            }
        }
    }
}
```

### 10.2 自定义语法扩展

```rust
// ═══════════════════════════════════════════════════════════════════════════
// 自定义语法扩展 - 实现 SolidJS 风格的绑定语法
// ═══════════════════════════════════════════════════════════════════════════

/// 命名空间绑定解析
pub mod namespace_binding {
    use crate::analysis::{AttributeAnalysis, ExpressionSource};
    
    /// 命名空间前缀
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub enum Namespace {
        /// class:前缀 - 条件类名
        Class,
        /// style:前缀 - 样式属性
        Style,
        /// on:前缀 - 手动事件绑定
        Event,
        /// prop:前缀 - 属性传递
        Prop,
        /// bool:前缀 - 布尔属性
        Bool,
        /// ref:前缀 - DOM 引用
        Ref,
        /// use:前缀 - 自定义指令
        Use,
    }
    
    impl Namespace {
        /// 从前缀解析命名空间
        pub fn from_prefix(prefix: &str) -> Option<Self> {
            match prefix {
                "class" => Some(Namespace::Class),
                "style" => Some(Namespace::Style),
                "on" => Some(Namespace::Event),
                "prop" => Some(Namespace::Prop),
                "bool" => Some(Namespace::Bool),
                "ref" => Some(Namespace::Ref),
                "use" => Some(Namespace::Use),
                _ => None,
            }
        }
    }
    
    /// 解析命名空间绑定属性
    pub fn parse_namespace_binding(
        attr_name: &str,
        value: Option<ExpressionSource>,
    ) -> Option<(Namespace, String)> {
        // 格式: namespace:key
        if let Some(colon_pos) = attr_name.find(':') {
            let ns_str = &attr_name[..colon_pos];
            let key = &attr_name[colon_pos + 1..];
            
            Namespace::from_prefix(ns_str).map(|ns| (ns, key.to_string()))
        } else {
            None
        }
    }
    
    /// 分析属性为绑定
    pub fn analyze_binding(
        attr_name: &str,
        value: Option<ExpressionSource>,
    ) -> AttributeAnalysis {
        // 检查是否为命名空间绑定
        if let Some((ns, key)) = parse_namespace_binding(attr_name, value.clone()) {
            return AttributeAnalysis {
                name: key,
                namespace: Some(format!("{:?}", ns).to_lowercase()),
                value,
                is_dynamic: value.is_some(),
            };
        }
        
        // 普通属性
        AttributeAnalysis {
            name: attr_name.to_string(),
            namespace: None,
            value,
            is_dynamic: value.as_ref().map(|v| v.is_signal_access).unwrap_or(false),
        }
    }
}

/// 静态标记解析
pub mod static_marker {
    use oxc_ast::ast::*;
    
    /// 静态标记类型
    #[derive(Debug, Clone, Copy, PartialEq, Eq)]
    pub enum StaticMarker {
        /// @once - 静态内容，只计算一次
        Once,
        /// @dynamic - 强制动态计算
        Dynamic,
    }
    
    /// 检查 JSX 表达式容器是否带有静态标记
    pub fn check_static_marker(expr: &JSXExpressionContainer) -> Option<StaticMarker> {
        // JSX 表达式的 leading comments 包含注释
        for comment in &expr.leading_comments {
            let text = comment.value.trim();
            if text.contains("@once") {
                return Some(StaticMarker::Once);
            }
            if text.contains("@dynamic") {
                return Some(StaticMarker::Dynamic);
            }
        }
        None
    }
}
```

---

## 11. 配置与扩展

### 11.1 编译器选项

```rust
// ═══════════════════════════════════════════════════════════════════════════
// 编译器选项
// ═══════════════════════════════════════════════════════════════════════════

/// 编译器选项
#[derive(Debug, Clone)]
pub struct CompilerOptions {
    /// 目标平台
    pub target: Target,
    /// JSX pragma (默认 "h" 或 "jsx")
    pub jsx_pragma: Option<String>,
    /// JSX Fragment pragma (默认 "Fragment")
    pub jsx_pragma_frag: Option<String>,
    /// 运行时模块路径 (默认 "@zeus-js/core")
    pub runtime_module: Option<String>,
    /// 是否启用事件委托 (默认 true)
    pub delegate_events: bool,
    /// 委托事件列表
    pub delegated_events: Vec<String>,
    /// 不委托的事件列表
    pub non_delegated_events: Vec<String>,
    /// 内置组件列表
    pub built_ins: Vec<String>,
    /// 是否生成 hydration 支持代码
    pub hydratable: bool,
    /// 是否启用 classList 优化
    pub class_list: bool,
    /// 是否启用内联样式优化
    pub inline_styles: bool,
    /// 是否验证生成的 HTML
    pub validate: bool,
    /// 静态标记文本 (默认 "once")
    pub static_marker: String,
    /// effect 包装函数名 (默认 "effect")
    pub effect_wrapper: String,
    /// memo 包装函数名 (默认 "memo")
    pub memo_wrapper: String,
    /// 是否启用条件表达式包装
    pub wrap_conditionals: bool,
    /// 是否省略最后一个闭合标签
    pub omit_last_closing_tag: bool,
    /// 是否启用 contextToCustomElements
    pub context_to_custom_elements: bool,
    /// 是否使用 require 而不是 import
    pub require_import_source: bool,
}

impl Default for CompilerOptions {
    fn default() -> Self {
        Self {
            target: Target::Dom,
            jsx_pragma: None,
            jsx_pragma_frag: None,
            runtime_module: Some("@zeus-js/core".to_string()),
            delegate_events: true,
            delegated_events: Vec::new(),
            non_delegated_events: vec![
                "abort".to_string(),
                "beforeinput".to_string(),
                "blur".to_string(),
                "canplay".to_string(),
                "canplaythrough".to_string(),
                "change".to_string(),
                "click".to_string(),
                "contextmenu".to_string(),
                "copy".to_string(),
                "cut".to_string(),
                "dblclick".to_string(),
                "drag".to_string(),
                "dragend".to_string(),
                "dragenter".to_string(),
                "dragleave".to_string(),
                "dragover".to_string(),
                "dragstart".to_string(),
                "drop".to_string(),
                "durationchange".to_string(),
                "emptied".to_string(),
                "ended".to_string(),
                "error".to_string(),
                "focus".to_string(),
                "focusin".to_string(),
                "focusout".to_string(),
                "fullscreenchange".to_string(),
                "fullscreenerror".to_string(),
                "input".to_string(),
                "invalid".to_string(),
                "keydown".to_string(),
                "keypress".to_string(),
                "keyup".to_string(),
                "load".to_string(),
                "loadeddata".to_string(),
                "loadedmetadata".to_string(),
                "loadstart".to_string(),
                "mousedown".to_string(),
                "mouseenter".to_string(),
                "mouseleave".to_string(),
                "mousemove".to_string(),
                "mouseout".to_string(),
                "mouseover".to_string(),
                "mouseup".to_string(),
                "paste".to_string(),
                "pause".to_string(),
                "play".to_string(),
                "playing".to_string(),
                "progress".to_string(),
                "ratechange".to_string(),
                "reset".to_string(),
                "resize".to_string(),
                "scroll".to_string(),
                "search".to_string(),
                "seeked".to_string(),
                "seeking".to_string(),
                "select".to_string(),
                "stalled".to_string(),
                "submit".to_string(),
                "suspend".to_string(),
                "timeupdate".to_string(),
                "toggle".to_string(),
                "touchcancel".to_string(),
                "touchend".to_string(),
                "touchmove".to_string(),
                "touchstart".to_string(),
                "volumechange".to_string(),
                "waiting".to_string(),
                "wheel".to_string(),
            ],
            built_ins: vec![
                "Show".to_string(),
                "For".to_string(),
                "Index".to_string(),
                "Switch".to_string(),
                "Match".to_string(),
                "Dynamic".to_string(),
                "Portal".to_string(),
            ],
            hydratable: false,
            class_list: true,
            inline_styles: true,
            validate: true,
            static_marker: "once".to_string(),
            effect_wrapper: "effect".to_string(),
            memo_wrapper: "memo".to_string(),
            wrap_conditionals: true,
            omit_last_closing_tag: true,
            context_to_custom_elements: false,
            require_import_source: false,
        }
    }
}

impl CompilerOptions {
    /// 合并默认配置
    pub fn merge_with_defaults(&mut self) {
        let defaults = Self::default();
        
        if self.jsx_pragma.is_none() {
            self.jsx_pragma = defaults.jsx_pragma;
        }
        if self.jsx_pragma_frag.is_none() {
            self.jsx_pragma_frag = defaults.jsx_pragma_frag;
        }
        if self.runtime_module.is_none() {
            self.runtime_module = defaults.runtime_module;
        }
    }
}

/// 编译目标
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Target {
    /// 浏览器 DOM
    Dom,
    /// 服务端渲染
    Ssr,
    /// WebComponent
    WebComponent,
}
```

### 11.2 内置组件支持

```rust
// ═══════════════════════════════════════════════════════════════════════════
// 内置组件转换
// ═══════════════════════════════════════════════════════════════════════════

/// 内置组件
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BuiltInComponent {
    /// Show 组件 - 条件渲染
    Show,
    /// For 组件 - 列表渲染
    For,
    /// Index 组件 - 带索引的列表渲染
    Index,
    /// Switch/Match 组件 - 多条件渲染
    Switch,
    Match,
    /// Dynamic 组件 - 动态组件
    Dynamic,
    /// Portal 组件 - 传送门
    Portal,
}

impl BuiltInComponent {
    /// 从名称获取内置组件
    pub fn from_name(name: &str) -> Option<Self> {
        match name {
            "Show" => Some(Self::Show),
            "For" => Some(Self::For),
            "Index" => Some(Self::Index),
            "Switch" | "Match" => Some(Self::Switch),
            "Dynamic" => Some(Self::Dynamic),
            "Portal" => Some(Self::Portal),
            _ => None,
        }
    }
    
    /// 转换为对应的运行时调用
    pub fn to_runtime_call(&self) -> &'static str {
        match self {
            Self::Show => "_show",
            Self::For => "_for",
            Self::Index => "_index",
            Self::Switch => "_switch",
            Self::Dynamic => "_dynamic",
            Self::Portal => "_portal",
        }
    }
}

/// 转换内置组件
pub fn transform_builtin_component(
    component: BuiltInComponent,
    elem: &mut JSXElement,
    builder: &mut AstBuilder,
) -> Expression {
    match component {
        BuiltInComponent::Show => transform_show(elem, builder),
        BuiltInComponent::For => transform_for(elem, builder),
        BuiltInComponent::Index => transform_index(elem, builder),
        BuiltInComponent::Switch => transform_switch(elem, builder),
        BuiltInComponent::Dynamic => transform_dynamic(elem, builder),
        BuiltInComponent::Portal => transform_portal(elem, builder),
    }
}

/// 转换 Show 组件
fn transform_show(elem: &mut JSXElement, builder: &mut AstBuilder) -> Expression {
    // <Show when={condition}>{(flag) => <div>{flag}</div>}</Show>
    // 转换为: _show(() => condition, (flag) => <div>{flag}</div>)
    
    let (when, fallback) = extract_show_props(elem);
    
    builder.call_expression(
        elem.span,
        builder.identifier("_show"),
        vec![
            when,
            fallback.unwrap_or_else(|| builder.identifier("undefined")),
        ],
        false,
    )
}

/// 转换 For 组件
fn transform_for(elem: &mut JSXElement, builder: &mut AstBuilder) -> Expression {
    // <For each={items}>{(item) => <li>{item}</li>}</For>
    // 转换为: _for(items, (item) => <li>{item}</li>)
    
    let (each, render) = extract_for_props(elem);
    
    builder.call_expression(
        elem.span,
        builder.identifier("_for"),
        vec![each, render],
        false,
    )
}
```

---

## 12. 编译示例

### 12.1 基础组件示例

**输入代码**：

```tsx
import { signal } from "@zeus-js/signal";

function Counter() {
  const [count, setCount] = signal(0);
  
  return (
    <div className="container">
      <h1 class="title">Counter: {count()}</h1>
      <button onClick={() => setCount(count() + 1)}>
        Increment
      </button>
    </div>
  );
}
```

**编译输出**：

```javascript
import { template, insert, effect, delegateEvents, signal } from "@zeus-js/core";

const _tmpl$1 = template("<div><h1 class=\"title\">Counter: <!----></h1><button>Increment</button></div>");

function Counter() {
  const [count, setCount] = signal(0);
  
  const _el$ = _tmpl$1();
  const _h1$ = _el$.firstChild;
  const _btn$ = _h1$.nextSibling;
  
  // 动态内容插入
  insert(_h1$, () => count());
  
  // 事件委托
  _btn$.$$click = () => setCount(count() + 1);
  
  return _el$;
}

// 注册委托事件
delegateEvents(["click"]);
```

### 12.2 条件渲染示例

**输入代码**：

```tsx
function App() {
  const show = () => true;
  
  return (
    <div>
      {show() ? <span>Visible</span> : <span>Hidden</span>}
    </div>
  );
}
```

**编译输出**：

```javascript
const _tmpl$1 = template("<div><!----></div>");

function App() {
  const show = () => true;
  
  const _el$ = _tmpl$1();
  
  insert(_el$, () => show() 
    ? (() => {
        const _tmpl$2 = template("<span>Visible</span>");
        return _tmpl$2();
      })()
    : (() => {
        const _tmpl$3 = template("<span>Hidden</span>");
        return _tmpl$3();
      })()
  );
  
  return _el$;
}
```

### 12.3 列表渲染示例

**输入代码**：

```tsx
import { For } from "@zeus-js/core";

function List({ items }) {
  return (
    <ul>
      <For each={items()}>
        {(item) => <li>{item.name}</li>}
      </For>
    </ul>
  );
}
```

**编译输出**：

```javascript
import { For } from "@zeus-js/core";

const _tmpl$1 = template("<ul></ul>");

function List(props) {
  const _el$ = _tmpl$1();
  
  insert(_el$, () => For(props.items(), (item) => {
    const _tmpl$2 = template("<li><!----></li>");
    const _li$ = _tmpl$2();
    insert(_li$, () => item.name);
    return _li$;
  }));
  
  return _el$;
}
```

### 12.4 自定义绑定示例

**输入代码**：

```tsx
function CustomButton() {
  const isActive = signal(true);
  
  return (
    <button 
      class:active={isActive()} 
      style:color="red"
      on:click={handleClick}
    >
      Click
    </button>
  );
}
```

**编译输出**：

```javascript
import { template, effect, delegateEvents } from "@zeus-js/core";

const _tmpl$1 = template("<button>Click</button>");

function CustomButton() {
  const isActive = signal(true);
  
  const _el$ = _tmpl$1();
  
  // class:active 绑定
  effect(() => {
    _el$.className = isActive() ? 'active' : '';
  });
  
  // style:color 绑定
  _el$.style.color = "red";
  
  // on:click 绑定
  _el$.addEventListener("click", handleClick);
  
  return _el$;
}
```

### 12.5 SSR 模式示例

**输入代码**：

```tsx
function Greeting({ name, count }) {
  return (
    <div className={name}>
      Hello, {name}! Visits: {count}
    </div>
  );
}
```

**SSR 编译输出**：

```javascript
import { ssr, ssrElement, escape } from "@zeus-js/core";

function Greeting(props) {
  return ssrElement("div", { className: escape(props.name) }, [
    "Hello, ",
    escape(props.name),
    "! Visits: ",
    escape(props.count)
  ]);
}
```

---

## 13. 文件结构

```
crates/compiler-dom/src/
├── lib.rs                      # 主入口，暴露编译器 API
│
├── options.rs                   # 编译器选项定义
│
├── state.rs                    # 编译器状态定义
│
├── passes/
│   ├── mod.rs                  # Pass 模块入口
│   ├── preprocess.rs           # 预处理 Pass
│   ├── jsx_transform.rs        # JSX 转换 Pass
│   └── postprocess.rs          # 后处理 Pass
│
├── analysis/
│   ├── mod.rs                  # 分析模块入口
│   ├── jsx_element.rs          # JSX 元素分析
│   ├── attribute.rs            # 属性分析
│   ├── child.rs                # 子元素分析
│   └── template_ir.rs          # TemplateIR 生成
│
├── transform/
│   ├── mod.rs                  # 转换模块入口
│   ├── element.rs              # DOM 元素转换
│   ├── component.rs            # 组件转换
│   ├── fragment.rs             # Fragment 转换
│   ├── conditional.rs          # 条件渲染转换
│   ├── iteration.rs            # 列表渲染转换
│   └── control_flow.rs          # 控制流转换
│
├── codegen/
│   ├── mod.rs                  # 代码生成模块入口
│   ├── template.rs             # 模板声明生成
│   ├── binding.rs              # 绑定代码生成
│   ├── dom_path.rs             # DOM 路径生成
│   └── import.rs               # 导入声明生成
│
├── runtime/
│   ├── mod.rs                  # 运行时模块入口
│   ├── delegate.rs             # 事件委托
│   └── template.rs             # 模板运行时
│
├── builtin/
│   ├── mod.rs                  # 内置组件模块
│   ├── show.rs                 # Show 组件
│   ├── for_.rs                 # For 组件
│   ├── switch.rs               # Switch/Match 组件
│   └── portal.rs               # Portal 组件
│
├── util/
│   ├── mod.rs                  # 工具模块入口
│   ├── html.rs                 # HTML 转义
│   ├── dom.rs                  # DOM 工具
│   ├── string.rs               # 字符串工具
│   └── ast.rs                  # AST 工具
│
└── error/
    ├── mod.rs                  # 错误模块入口
    ├── compile_error.rs         # 编译错误
    └── diagnostic.rs            # 诊断信息

crates/compiler-ssr/src/
├── lib.rs                      # SSR 编译器入口
├── ssr_transform.rs            # SSR 转换逻辑
├── ssr_codegen.rs              # SSR 代码生成
└── hydration.rs                # Hydration 支持

crates/compiler-universal/src/
├── lib.rs                      # 通用编译器入口
├── universal_transform.rs      # 通用转换逻辑
└── abstract_codegen.rs          # 抽象代码生成

packages/compiler-core/src/
├── index.ts                    # 编译器核心导出
├── dom.ts                      # DOM 编译器绑定
├── ssr.ts                      # SSR 编译器绑定
└── universal.ts                # 通用编译器绑定
```

---

## 14. 实现路线图

### 14.1 阶段 1: 基础设施（预计 2 周）

**目标**：搭建编译器基础框架，实现 OXC 集成和基本结构

| 任务 | 优先级 | 预计时间 |
|------|--------|----------|
| 创建项目结构和 Cargo 配置 | P0 | 1 天 |
| 实现 CompilerState 和 CompilerOptions | P0 | 1 天 |
| 集成 oxc_parser 和 oxc_traverse | P0 | 2 天 |
| 实现基础的 traverse_mut 调用 | P0 | 1 天 |
| 实现基础代码生成器框架 | P0 | 2 天 |
| 编写测试基础设施 | P1 | 1 天 |

**里程碑**：能够解析 JSX 并生成基础 AST

### 14.2 阶段 2: DOM 编译器核心（预计 3 周）

**目标**：实现完整的 DOM JSX 转换

| 任务 | 优先级 | 预计时间 |
|------|--------|----------|
| JSX 元素分析器 | P0 | 2 天 |
| DOM 元素转换 | P0 | 3 天 |
| 模板生成 | P0 | 2 天 |
| 属性处理（class, style, id） | P0 | 2 天 |
| 事件绑定（onClick 等） | P0 | 2 天 |
| 事件委托系统 | P0 | 2 天 |
| DOM 路径计算 | P1 | 1 天 |
| 子元素递归处理 | P0 | 2 天 |
| 完整测试 | P0 | 2 天 |

**里程碑**：能够编译基本的静态 + 动态 JSX

### 14.3 阶段 3: 高级特性（预计 2 周）

**目标**：实现条件渲染、列表渲染、组件等高级特性

| 任务 | 优先级 | 预计时间 |
|------|--------|----------|
| Fragment 支持 | P0 | 1 天 |
| 条件渲染（? :, &&） | P0 | 2 天 |
| if-return → ternary 转换 | P1 | 2 天 |
| 列表渲染（For 组件） | P0 | 2 天 |
| Show/Match 组件 | P1 | 1 天 |
| 组件调用转换 | P0 | 2 天 |
| 内置组件系统 | P1 | 2 天 |

**里程碑**：支持完整的 SolidJS 风格 JSX

### 14.4 阶段 4: 自定义绑定（预计 1 周）

**目标**：实现 SolidJS 风格的自定义绑定语法

| 任务 | 优先级 | 预计时间 |
|------|--------|----------|
| class:* 绑定 | P1 | 1 天 |
| style:* 绑定 | P1 | 1 天 |
| on:* 绑定 | P1 | 1 天 |
| prop:* / bool:* 绑定 | P2 | 1 天 |
| ref / use:* 绑定 | P2 | 1 天 |
| classList 对象支持 | P1 | 1 天 |

**里程碑**：完整支持自定义绑定语法

### 14.5 阶段 5: SSR 和 WebComponent（预计 2 周）

**目标**：实现 SSR 和 WebComponent 编译器

| 任务 | 优先级 | 预计时间 |
|------|--------|----------|
| SSR 转换 Pass | P0 | 3 天 |
| SSR 代码生成 | P0 | 2 天 |
| Hydration 支持 | P1 | 2 天 |
| WebComponent 转换 | P2 | 3 天 |
| Shadow DOM 支持 | P2 | 2 天 |

**里程碑**：支持多平台编译

### 14.6 阶段 6: 优化和完善（预计 1 周）

**目标**：优化编译结果，完善错误处理

| 任务 | 优先级 | 预计时间 |
|------|--------|----------|
| 模板复用优化 | P1 | 1 天 |
| 静态提升优化 | P1 | 1 天 |
| 错误诊断信息 | P1 | 2 天 |
| 性能测试和优化 | P1 | 2 天 |
| 文档完善 | P2 | 1 天 |

**里程碑**：编译器达到生产就绪状态

---

## 15. 技术对比

### 15.1 与 React 的对比

| 特性 | React | Zeus（本方案） |
|------|-------|---------------|
| 渲染机制 | 虚拟 DOM | 直接 DOM 操作 |
| 响应式 | 组件级重新渲染 | 细粒度信号 |
| 编译方式 | 运行时 + 构建时 | 纯编译时 |
| 运行时大小 | ~40KB (React) | 目标 <8KB |
| 模板 | JSX（运行时解析） | 模板字面量（编译时） |
| 更新粒度 | 组件级 | 属性级 |

### 15.2 与 SolidJS 的对比

| 特性 | SolidJS (dom-expressions) | Zeus（本方案） |
|------|---------------------------|---------------|
| 编译器语言 | JavaScript (Babel) | Rust (oxc) |
| 响应式系统 | Solid Signals | alien-signal |
| AST 遍历 | Babel Visitor | oxc_traverse |
| 代码生成 | Babel AST → 字符串 | oxc AST → oxc_codegen |
| 编译优化 | 标准优化 | Rust 级别优化 |
| 事件委托 | `$$eventName` | `$$eventName` |
| 运行时目标 | ~5KB | <8KB |

### 15.3 预期收益

相比现有方案，预期实现以下收益：

1. **更快的编译速度**：Rust + oxc 的高效实现
2. **更小的运行时**：通过精细的模板和 alien-signal
3. **更好的类型安全**：通过 Rust 的类型系统
4. **更友好的错误信息**：通过编译时的详细诊断
5. **更好的可扩展性**：通过 Pass 架构

---

## 16. 附录

### 16.1 OXC 相关资源

- [oxc 文档](https://oxc-project.github.io/)
- [oxc_traverse 文档](https://docs.rs/oxc_traverse/)
- [oxc_codegen 文档](https://docs.rs/oxc_codegen/)

### 16.2 参考实现

- [dom-expressions 源码](https://github.com/ryansolid/dom-expressions)
- [SolidJS 源码](https://github.com/solidjs/solid)
- [alien-signal 文档](https://github.com/ryansolid/dom-expressions)

---

*本文档最后更新于 2026 年 3 月*
