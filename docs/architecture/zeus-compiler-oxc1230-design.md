# Zeus JSX 编译器绣化方案 (oxc 0.123.0)

> 基于 `dom-expressions` 分析 + Zeus 现有编译器架构的深度绣化设计

---

## 目录

- [1. 概述与设计目标](#1-概述与设计目标)
- [2. 整体架构设计](#2-整体架构设计)
- [3. 核心数据结构](#3-核心数据结构)
- [4. 编译阶段详细设计](#4-编译阶段详细设计)
  - [4.1 Preprocess 阶段](#41-preprocess-阶段)
  - [4.2 JSXElement/Fragment 转换](#42-jsxelementfragment-转换)
  - [4.3 属性处理系统](#43-属性处理系统)
  - [4.4 事件委托系统](#44-事件委托系统)
  - [4.5 子节点处理系统](#45-子节点处理系统)
  - [4.6 组件处理](#46-组件处理)
  - [4.7 条件与循环处理](#47-条件与循环处理)
  - [4.8 Postprocess 阶段](#48-postprocess-阶段)
- [5. 代码生成器设计](#5-代码生成器设计)
- [6. SSR 编译模式](#6-ssr-编译模式)
- [7. 水合支持](#7-水合支持)
- [8. 实现路线图](#8-实现路线图)
- [9. 关键算法详解](#9-关键算法详解)
- [10. 测试策略](#10-测试策略)
- [附录 A: dom-expressions → Zeus 命名映射](#附录-a-dom-expressions--zeus-命名映射)
- [附录 B: oxc 0.123.0 变更说明](#附录-b-oxc-01230-变更说明)

---

## 1. 概述与设计目标

### 1.1 绣化目标

基于 `dom-expressions` 的成熟方案，在 Zeus 编译器中实现一套完整的 JSX → 高效 JavaScript 编译管道。核心目标是：

| 目标 | 说明 |
|------|------|
| **零虚拟 DOM 开销** | 直接生成 DOM 操作代码，无需运行时 VDOM |
| **编译时确定性** | 准确判断每个表达式的动态性 |
| **模板复用** | 相同静态结构只创建一次 |
| **事件委托** | 减少事件监听器数量 |
| **完整响应式集成** | 与 Zeus 信号系统深度整合 |

### 1.2 核心挑战

| 挑战 | dom-expressions 方案 | Zeus 实现策略 |
|------|---------------------|---------------|
| AST 分析 | Babel traverse | oxc_traverse 0.123.0 |
| 代码生成 | Babel AST builder | oxc_codegen 0.123.0 |
| 动态性判断 | JS 深度遍历 | Rust 递归遍历 |
| 模板字符串 | Babel template literal | oxc_allocator + Atom |
| 表达式源码 | Babel evaluate() | oxc_semantic + evaluate |
| SSR 同构 | 独立 `ssr/*` 模块 | `compiler-ssr` crate |
| JSX Spread | Babel spread 处理 | Rust 属性收集 |

### 1.3 与现有 Zeus 编译器的关系

**当前 Zeus 编译器架构（已实现部分）：**

```
crates/compiler-core/src/
  └── jsx/                    ✓ 统一 JSX 编译核心
        ├── mod.rs           ✓ 入口和导出
        ├── config.rs        ✓ 配置系统
        ├── state.rs         ✓ 编译器状态
        ├── ir.rs            ✓ 中间表示定义
        ├── constants.rs     ✓ 常量定义
        ├── utils.rs         ✓ 工具函数
        ├── preprocess.rs     ✓ 预处理
        ├── postprocess.rs   △ 基础后处理
        ├── transform.rs     △ 核心转换（待完善）
        ├── component.rs     △ 组件转换（待完善）
        ├── condition.rs     △ 条件表达式处理
        └── fragment.rs      △ Fragment 转换

crates/compiler-dom/src/jsx/    △ DOM 特定扩展
      ├── element.rs      ✓ DOM 元素转换
      ├── attributes.rs   △ 属性处理
      ├── events.rs       ✓ 事件委托
      ├── children.rs     △ 子节点处理
      ├── template.rs     △ 模板生成
      ├── codegen.rs      △ 代码生成
      └── hydration.rs   ○ 水合支持（待实现）

crates/compiler-ssr/src/         ○ SSR 编译器（待创建）
crates/compiler-universal/src/   ○ 跨平台编译器（待创建）
```

**图例说明：**
- ✓ 已完成
- △ 部分完成/待完善
- ○ 待实现

---

## 2. 整体架构设计

### 2.1 编译管道

```
输入: JSX 源代码
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│ 阶段 1: 解析 (oxc_parser 0.123.0)                    │
│   └── Program<'a>                                       │
└─────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│ 阶段 2: 语义分析 (oxc_semantic 0.123.0)              │
│   └── Scoping（用于 traverse_mut 0.123.0）              │
└─────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│ 阶段 3: JSX 转换 (compiler-core/jsx/)                 │
│                                                          │
│   Preprocess ──────────────────────────────────────┐    │
│   (合并配置, 检测处理范围)                            │    │
│                                                      │    │
│   Transform ──────────────────────────────────────┼──►│
│   (JSXElement / JSXFragment / JSXText /           │    │
│    JSXExpressionContainer / CallExpression 等)       │    │
│                                                      │    │
│   Postprocess ────────────────────────────────────┘    │
│   (追加模板声明, 事件委托注册)                          │
└─────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│ 阶段 4: 代码生成 (oxc_codegen 0.123.0)                │
│   └── 生成最终 JavaScript 代码                           │
└─────────────────────────────────────────────────────────┘
  │
  ▼
输出: 高效 JavaScript 代码
```

### 2.2 三种渲染模式

| 模式 | 输出 | 用途 |
|------|------|------|
| **DOM** | `template()` + `insert()` + `effect()` | 客户端渲染 |
| **SSR** | `ssr()` + `ssrElement()` + `escape()` | 服务端渲染 |
| **Universal** | `createElement()` + `setProp()` + `insertNode()` | 跨平台（Canvas、WebGL 等） |

### 2.3 oxc 0.123.0 迁移要点

#### 变更 1：`traverse_mut` 签名变更

**新签名（>= 0.122）：**

```rust
use oxc_traverse::{traverse_mut, Traverse, TraverseCtx};
use oxc_semantic::SemanticBuilder;

pub fn compile(source: &str, config: JsxConfig) -> CompileResult {
    let allocator = Allocator::default();
    let ret = Parser::new(&allocator, source, SourceType::jsx()).parse();
    let mut program = ret.program;

    // 1. 构建语义分析（获取 Scoping）
    let semantic = SemanticBuilder::new()
        .with_cfg(true)
        .build(&program);

    let scoping = semantic.scoping;

    // 2. 创建编译器状态
    let mut state = JsxCompilerState::new(config);
    let mut pass = JsxCompilerPass { source, state: &mut state };

    // 3. 传入 Scoping 执行遍历
    let new_scoping = traverse_mut(
        &mut pass,
        &allocator,
        &mut program,
        scoping,
        JsxCompilerState::new(config),
    );

    // 4. postprocess
    postprocess(&mut program, &mut state, &allocator);

    generate_code(&program, &state)
}
```

---

## 3. 核心数据结构

### 3.1 编译器配置

```rust
// crates/compiler-core/src/jsx/config.rs

/// JSX 编译器配置
#[derive(Debug, Clone)]
pub struct JsxConfig {
    /// 运行时模块名，默认为 "zeus/runtime-dom"
    pub module_name: String,
    /// 生成目标: "dom" | "ssr" | "universal"
    pub generate: GenerateMode,
    /// 是否支持水合
    pub hydratable: bool,
    /// 是否启用事件委托
    pub delegate_events: bool,
    /// 额外的委托事件列表
    pub delegated_events: Vec<String>,
    /// 内置组件列表 (如 For, Show, Switch, Index)
    pub built_ins: Vec<String>,
    /// 是否要求 @jsxImportSource 注释
    pub require_import_source: Option<String>,
    /// 是否包装条件表达式为 memo
    pub wrap_conditionals: bool,
    /// 省略最后一个闭合标签
    pub omit_last_closing_tag: bool,
    /// 省略属性引号 (安全时)
    pub omit_quotes: bool,
    /// 静态标记注释，默认为 "@once"
    pub static_marker: String,
    /// 副作用包装函数名，默认为 "effect"
    pub effect_wrapper: String,
    /// 记忆化包装函数名，默认为 "memo"
    pub memo_wrapper: String,
    /// 是否验证模板有效性
    pub validate: bool,
    /// 是否内联静态样式
    pub inline_styles: bool,
}

impl Default for JsxConfig {
    fn default() -> Self {
        Self {
            module_name: "zeus/runtime-dom".to_string(),
            generate: GenerateMode::Dom,
            hydratable: false,
            delegate_events: true,
            delegated_events: Vec::new(),
            built_ins: vec![
                "For".to_string(),
                "Show".to_string(),
                "Switch".to_string(),
                "Match".to_string(),
                "Index".to_string(),
                "Portal".to_string(),
            ],
            require_import_source: None,
            wrap_conditionals: true,
            omit_last_closing_tag: true,
            omit_quotes: true,
            static_marker: "@once".to_string(),
            effect_wrapper: "effect".to_string(),
            memo_wrapper: "memo".to_string(),
            validate: true,
            inline_styles: true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum GenerateMode {
    #[default]
    Dom,
    Ssr,
    Universal,
}
```

### 3.2 编译器状态

```rust
// crates/compiler-core/src/jsx/state.rs

/// JSX 编译器状态，在 AST 遍历过程中累积
pub struct JsxCompilerState<'a> {
    /// 合并后的配置
    pub config: JsxConfig,
    /// 文件路径 (用于错误报告)
    pub source_file: Option<String>,
    /// 收集的模板声明
    pub templates: Vec<TemplateDecl<'a>>,
    /// 需要注册的事件名集合
    pub delegated_events: Vec<String>,
    /// 已注册的 helper 导入
    pub registered_helpers: Vec<(String, String)>, // (helper_name, module_name)
    /// 当前是否在 JSX 上下文中
    pub in_jsx: bool,
    /// 嵌套深度
    pub depth: usize,
    /// 模板计数器 (用于生成 tmpl$0, tmpl$1, ...)
    pub template_counter: usize,
    /// 元素计数器 (用于生成 el$0, el$1, ...)
    pub element_counter: usize,
    /// 占位符计数器 (用于生成 [0], [1], ...)
    pub placeholder_counter: usize,
    /// 组件计数器 (用于生成 _c$0, _c$1, ...)
    pub component_counter: usize,
    /// 收集的错误
    pub errors: Vec<JsxError>,
}

impl<'a> JsxCompilerState<'a> {
    pub fn new(config: JsxConfig) -> Self { /* ... */ }

    pub fn generate_template_name(&mut self) -> String {
        let name = format!("_tmpl${}", self.template_counter);
        self.template_counter += 1;
        name
    }

    pub fn generate_element_name(&mut self) -> String {
        let name = format!("_el${}", self.element_counter);
        self.element_counter += 1;
        name
    }

    pub fn next_placeholder_index(&mut self) -> usize {
        let idx = self.placeholder_counter;
        self.placeholder_counter += 1;
        idx
    }

    pub fn register_helper(&mut self, name: String, module_name: Option<String>) {
        let module = module_name.unwrap_or_else(|| self.config.module_name.clone());
        if !self.registered_helpers.contains(&(name.clone(), module.clone())) {
            self.registered_helpers.push((name, module));
        }
    }

    pub fn register_delegated_event(&mut self, event_name: String) {
        if !self.delegated_events.contains(&event_name) {
            self.delegated_events.push(event_name);
        }
    }
}
```

### 3.3 IR (中间表示)

```rust
// crates/compiler-core/src/jsx/ir.rs

/// 渲染器类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Renderer {
    #[default]
    Dom,
    Ssr,
    Universal,
}

/// 模板标记类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MarkerKind {
    DynamicChildStart,
    DynamicChildEnd,
    EmptyPlaceholder,
    HydrationStart,
    HydrationEnd,
}

impl MarkerKind {
    pub fn to_html(&self, index: Option<usize>) -> String {
        match self {
            Self::DynamicChildStart => {
                if let Some(idx) = index {
                    format!("<!--[{}]-->", idx)
                } else {
                    "<!--[]-->".to_string()
                }
            }
            Self::DynamicChildEnd => {
                if let Some(idx) = index {
                    format!("<!--/[{}]-->", idx)
                } else {
                    "<!--/[]-->".to_string()
                }
            }
            Self::EmptyPlaceholder => "<!---->".to_string(),
            Self::HydrationStart => "<!--$-->".to_string(),
            Self::HydrationEnd => "<!--/$-->".to_string(),
        }
    }
}

/// 属性绑定类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AttrBindingKind {
    Attribute,        // 普通 HTML 属性
    Property,         // DOM 属性 (如 checked, value)
    Event,            // 事件处理器
    ClassName,        // className 设置
    ClassList,        // classList 切换
    Style,            // 行内样式
    StyleProperty,    // style: 前缀
    ClassToggle,      // class: 前缀
    BoolAttribute,    // bool: 前缀
    ForceAttribute,   // attr: 前缀
    Ref,              // ref 引用
    Use,              // use: 指令
    Prop,             // prop: 指令
    Spread,           // 展开属性
}

impl AttrBindingKind {
    /// 是否需要 effect 包装
    pub fn needs_effect(&self) -> bool {
        matches!(
            self,
            Self::Property | Self::ClassName | Self::ClassList |
            Self::Style | Self::Event | Self::Ref | Self::Use |
            Self::StyleProperty | Self::ClassToggle
        )
    }

    /// 对应的 runtime helper
    pub fn helper_name(&self) -> Option<&'static str> {
        match self {
            Self::Event => Some("delegateEvents"),
            Self::ClassName => Some("className"),
            Self::ClassList => Some("classList"),
            Self::Style | Self::StyleProperty => Some("style"),
            Self::Ref | Self::Use => Some("use"),
            Self::Prop => Some("setProp"),
            Self::Spread => Some("spread"),
            _ => None,
        }
    }
}

/// 模板声明
pub struct TemplateDecl<'a> {
    pub name: String,
    pub html: String,
    pub template_parts: Vec<String>,
    pub is_svg: bool,
    pub is_custom_element: bool,
    pub is_import_node: bool,
    pub renderer: Renderer,
    pub child_bindings: Vec<ChildBinding<'a>>,
    pub attr_bindings: Vec<AttrBinding<'a>>,
    pub post_exprs: Vec<Expression<'a>>,
    pub skip_template: bool,
}

impl<'a> TemplateDecl<'a> {
    pub fn new(name: String, html: String, renderer: Renderer) -> Self {
        Self {
            name, html,
            template_parts: Vec::new(),
            is_svg: false,
            is_custom_element: false,
            is_import_node: false,
            renderer,
            child_bindings: Vec::new(),
            attr_bindings: Vec::new(),
            post_exprs: Vec::new(),
            skip_template: false,
        }
    }

    pub fn has_dynamic_content(&self) -> bool {
        !self.child_bindings.is_empty()
            || self.attr_bindings.iter().any(|b| !b.is_static && b.kind.needs_effect())
    }
}

/// 子节点绑定
pub struct ChildBinding<'a> {
    pub index: usize,
    pub expression: Expression<'a>,
    pub is_text: bool,
    pub needs_marker: bool,
}

impl<'a> ChildBinding<'a> {
    pub fn new(index: usize, expression: Expression<'a>, is_text: bool) -> Self {
        Self { index, expression, is_text, needs_marker: false }
    }
}

/// 属性绑定
pub struct AttrBinding<'a> {
    pub name: String,
    pub namespace: Option<String>,
    pub expression: Expression<'a>,
    pub kind: AttrBindingKind,
    pub is_static: bool,
}

/// 元素转换结果
pub struct ElementResult<'a> {
    pub template: String,
    pub template_parts: Vec<String>,
    pub template_values: Vec<Expression<'a>>,
    pub element_id: Option<String>,
    pub declarations: Vec<Expression<'a>>,
    pub exprs: Vec<Expression<'a>>,
    pub dynamics: Vec<DynamicAttr<'a>>,
    pub post_exprs: Vec<Expression<'a>>,
    pub is_svg: bool,
    pub is_custom_element: bool,
    pub is_import_node: bool,
    pub tag_name: String,
    pub renderer: Renderer,
    pub child_bindings: Vec<ChildBinding<'a>>,
    pub attr_bindings: Vec<AttrBinding<'a>>,
    pub skip_template: bool,
    pub has_hydratable_event: bool,
}

impl<'a> ElementResult<'a> {
    pub fn new(tag_name: String, renderer: Renderer) -> Self {
        Self {
            template: String::new(),
            template_parts: Vec::new(),
            template_values: Vec::new(),
            element_id: None,
            declarations: Vec::new(),
            exprs: Vec::new(),
            dynamics: Vec::new(),
            post_exprs: Vec::new(),
            is_svg: false,
            is_custom_element: false,
            is_import_node: false,
            tag_name,
            renderer,
            child_bindings: Vec::new(),
            attr_bindings: Vec::new(),
            skip_template: false,
            has_hydratable_event: false,
        }
    }

    pub fn has_dynamic(&self) -> bool {
        !self.dynamics.is_empty() || !self.child_bindings.is_empty() || !self.exprs.is_empty()
    }
}

/// 动态属性描述
pub struct DynamicAttr<'a> {
    pub elem: String,
    pub key: String,
    pub value: Expression<'a>,
    pub is_svg: bool,
    pub is_ce: bool,
    pub tag_name: String,
}

impl<'a> DynamicAttr<'a> {
    pub fn new(elem: String, key: String, value: Expression<'a>) -> Self {
        Self { elem, key, value, is_svg: false, is_ce: false, tag_name: String::new() }
    }
}

/// 组件转换结果
pub struct ComponentResult<'a> {
    pub expression: Expression<'a>,
    pub dynamic: bool,
}

impl<'a> ComponentResult<'a> {
    pub fn new(expression: Expression<'a>, dynamic: bool) -> Self {
        Self { expression, dynamic }
    }
}
```

### 3.4 常量定义

```rust
// crates/compiler-core/src/jsx/constants.rs

/// 自闭合 (Void) HTML 元素列表
pub const VOID_ELEMENTS: &[&str] = &[
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "keygen", "link", "menuitem", "meta", "param", "source", "track", "wbr",
];

/// SVG 元素集合
pub const SVG_ELEMENTS: &[&str] = &[
    "altGlyph", "circle", "clipPath", "defs", "ellipse", "feBlend",
    "feColorMatrix", "feComposite", "feConvolveMatrix", "feDiffuseLighting",
    "feDisplacementMap", "feDistantLight", "feDropShadow", "feFlood",
    "feGaussianBlur", "feImage", "feMerge", "feMergeNode", "feMorphology",
    "feOffset", "fePointLight", "feSpecularLighting", "feSpotLight",
    "feTile", "feTurbulence", "filter", "font", "foreignObject", "g",
    "glyph", "glyphRef", "hkern", "image", "line", "linearGradient",
    "marker", "mask", "metadata", "missing-glyph", "mpath", "path",
    "pattern", "polygon", "polyline", "radialGradient", "rect", "set",
    "stop", "svg", "switch", "symbol", "text", "textPath", "tref",
    "tspan", "use", "view", "vkern",
];

/// DOM 属性集合 (需要通过 property 赋值而非 setAttribute)
pub const DOM_PROPERTIES: &[&str] = &[
    "className", "value", "readOnly", "noValidate", "formNoValidate",
    "isMap", "noModule", "playsInline", "allowFullscreen", "defaultChecked",
    "disabled", "hidden", "indeterminate", "multiple", "muted", "open",
    "required", "selected",
];

/// 布尔 HTML 属性 (存在即为 true)
pub const BOOLEAN_ATTRIBUTES: &[&str] = &[
    "allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls",
    "default", "defer", "disabled", "formnovalidate", "hidden", "indeterminate",
    "inert", "ismap", "loop", "multiple", "muted", "nomodule", "novalidate",
    "open", "playsinline", "readonly", "required", "reversed", "selected",
];

/// 委托事件集合
pub const DELEGATED_EVENTS: &[&str] = &[
    "beforeinput", "click", "dblclick", "contextmenu",
    "focusin", "focusout", "input", "keydown", "keyup",
    "mousedown", "mousemove", "mouseout", "mouseover", "mouseup",
    "pointerdown", "pointermove", "pointerout", "pointerover", "pointerup",
    "touchend", "touchmove", "touchstart",
];

/// 保留的命名空间前缀
pub const RESERVED_NAMESPACES: &[&str] = &[
    "class", "on", "oncapture", "style", "use", "prop", "attr", "bool",
];

/// 需要使用 importNode 的元素
pub const IMPORT_NODE_ELEMENTS: &[&str] = &["img", "iframe"];

/// 检测函数
#[inline]
pub fn is_void_element(tag: &str) -> bool { VOID_ELEMENTS.contains(&tag) }
#[inline]
pub fn is_svg_element(tag: &str) -> bool { SVG_ELEMENTS.contains(&tag) }
#[inline]
pub fn is_dom_property(attr: &str) -> bool { DOM_PROPERTIES.contains(&attr) }
#[inline]
pub fn is_boolean_attribute(attr: &str) -> bool { BOOLEAN_ATTRIBUTES.contains(&attr) }
#[inline]
pub fn is_delegated_event(event: &str) -> bool { DELEGATED_EVENTS.contains(&event) }
#[inline]
pub fn is_reserved_namespace(ns: &str) -> bool { RESERVED_NAMESPACES.contains(&ns) }
#[inline]
pub fn is_import_node_element(tag: &str) -> bool { IMPORT_NODE_ELEMENTS.contains(&tag) }
```

---

## 4. 编译阶段详细设计

### 4.1 Preprocess 阶段

```rust
// crates/compiler-core/src/jsx/preprocess.rs

/// JSX 预处理器
pub struct JsxPreprocessor;

impl JsxPreprocessor {
    /// 执行预处理：合并配置、检测处理范围
    pub fn run(source: &str, user_config: Option<JsxConfig>) -> JsxCompilerState<'_> {
        // 1. 构建配置
        let mut config = user_config.unwrap_or_default();

        // 2. 检测 @jsxImportSource 注释
        if let Some(ref lib) = config.require_import_source {
            let has_marker = Self::check_jsx_import_source(source);
            if !has_marker && lib != "zeus/runtime-dom" {
                return JsxCompilerState::new(config);
            }
        }

        // 3. 检测生成模式
        let mode = Self::detect_generate_mode(source);
        if mode != GenerateMode::Dom {
            config.generate = mode;
        }

        // 4. 构建初始状态
        let mut state = JsxCompilerState::new(config);
        state.source_file = Some(source.to_string());

        state
    }

    /// 检测 @jsxImportSource 注释
    fn check_jsx_import_source(source: &str) -> bool {
        for line in source.lines() {
            let trimmed = line.trim();
            if trimmed.starts_with("//") || trimmed.starts_with("/*") {
                if trimmed.contains("@jsxImportSource")
                    || trimmed.contains("@jsx-runtime")
                    || trimmed.contains("jsx:")
                {
                    return true;
                }
            }
        }
        false
    }

    /// 检测生成模式
    fn detect_generate_mode(source: &str) -> GenerateMode {
        for line in source.lines() {
            let trimmed = line.trim();
            if trimmed.contains("server-side") || trimmed.contains("ssr:") {
                return GenerateMode::Ssr;
            }
        }
        GenerateMode::Dom
    }
}
```

### 4.2 JSXElement/Fragment 转换

#### 4.2.1 核心转换入口（基于 oxc 0.123.0）

```rust
// crates/compiler-core/src/jsx/transform.rs

/// JSX 编译器入口 Pass（基于 oxc 0.123.0 API）
pub struct JsxCompilerPass<'a, 'ctx> {
    pub source: &'a str,
    pub state: &'ctx mut JsxCompilerState<'a>,
}

impl<'a, 'ctx> Traverse<'a, JsxCompilerState<'a>> for JsxCompilerPass<'a, 'ctx> {
    fn enter_program(
        &mut self,
        node: &mut Program<'a>,
        ctx: &mut TraverseCtx<'a, JsxCompilerState<'a>>,
    ) {
        // preprocess 已在主流程中完成
    }

    fn enter_jsx_element(
        &mut self,
        node: &mut JSXElement<'a>,
        ctx: &mut TraverseCtx<'a, JsxCompilerState<'a>>,
    ) {
        // 收集事件信息（在 exit_jsx_element 之前）
        self.collect_event_info(node, ctx);
    }

    fn exit_jsx_element(
        &mut self,
        node: &mut JSXElement<'a>,
        ctx: &mut TraverseCtx<'a, JsxCompilerState<'a>>,
    ) {
        let allocator = ctx.ast.allocator;
        let mut transformer = JsxTransformer::new(self.source, allocator, self.state);
        transformer.transform_jsx_element(node);
    }

    fn exit_jsx_fragment(
        &mut self,
        node: &mut JSXFragment<'a>,
        ctx: &mut TraverseCtx<'a, JsxCompilerState<'a>>,
    ) {
        let allocator = ctx.ast.allocator;
        let mut transformer = JsxTransformer::new(self.source, allocator, self.state);
        transformer.transform_jsx_fragment(node);
    }
}

impl<'a, 'ctx> JsxCompilerPass<'a, 'ctx> {
    /// 收集事件信息
    fn collect_event_info(&mut self, node: &mut JSXElement<'a>, _ctx: &mut TraverseCtx<'a, JsxCompilerState<'a>>) {
        for attr in &node.opening_element.attributes {
            if let JSXAttributeItem::Attribute(attr) = attr {
                let name = attr.name.as_identifier().map(|id| id.name.as_str()).unwrap_or("");
                if is_event_attribute(name) {
                    let event_name = to_event_name(name);
                    if is_delegated_event(&event_name) {
                        self.state.register_delegated_event(event_name);
                    }
                }
            }
        }
    }
}

/// JSX 转换器
pub struct JsxTransformer<'a, 'ctx> {
    pub source: &'a str,
    pub allocator: &'a Allocator,
    builder: AstBuilder<'a>,
    pub state: &'ctx mut JsxCompilerState<'a>,
}

impl<'a, 'ctx> JsxTransformer<'a, 'ctx> {
    pub fn new(source: &'a str, allocator: &'a Allocator, state: &'ctx mut JsxCompilerState<'a>) -> Self {
        Self { source, allocator, builder: AstBuilder::new(allocator), state }
    }

    /// 入口：处理 JSXElement
    pub fn transform_jsx_element(&mut self, node: &mut JSXElement<'a>) {
        let config = &self.state.config;
        let tag_name = get_jsx_tag_name(&node.opening_element.name);

        if is_component(&tag_name) {
            // 组件处理 → 调用 component 模块
            let mut component_transformer = ComponentTransformer::new(
                self.source, self.allocator, self.state,
            );
            let _result = component_transformer.transform_component(node);
            return;
        }

        match config.generate {
            GenerateMode::Dom => {
                let result = self.transform_element_dom(node);
                self.finish_element_transform(node, result);
            }
            GenerateMode::Ssr => {
                let result = self.transform_element_ssr(node);
                self.finish_ssr_transform(node, result);
            }
            GenerateMode::Universal => {
                let result = self.transform_element_universal(node);
                self.finish_element_transform(node, result);
            }
        }
    }

    /// DOM 元素转换
    fn transform_element_dom(&mut self, node: &mut JSXElement<'a>) -> ElementResult<'a> {
        let tag_name = get_jsx_tag_name(&node.opening_element.name);
        let config = &self.state.config;

        let wrap_svg = self.needs_svg_wrapper(&tag_name);
        let is_custom = is_custom_element(&tag_name);
        let is_import_node = self.needs_import_node(node, &tag_name);
        let is_void = is_void_element(&tag_name);

        let mut result = ElementResult::new(tag_name.clone(), Renderer::Dom);
        result.is_svg = wrap_svg;
        result.is_custom_element = is_custom;
        result.is_import_node = is_import_node;

        // SVG 包装
        if wrap_svg {
            result.template.push_str("<svg>");
        }

        result.template.push('<');
        result.template.push_str(&tag_name);
        result.element_id = Some(self.state.generate_element_name());

        // 处理属性
        self.transform_attributes(node, &mut result);

        // 闭合标签
        result.template.push('>');

        // 处理子节点
        if !is_void && tag_name != "noscript" {
            self.transform_children(node, &mut result);
        }

        // 闭合标签
        if !is_void {
            result.template.push_str("</");
            result.template.push_str(&tag_name);
            result.template.push('>');
        }

        // SVG 包装闭合
        if wrap_svg {
            result.template.push_str("</svg>");
        }

        result
    }

    /// SSR 元素转换
    fn transform_element_ssr(&mut self, node: &mut JSXElement<'a>) -> ElementResult<'a> {
        let tag_name = get_jsx_tag_name(&node.opening_element.name);
        let mut result = ElementResult::new(tag_name.clone(), Renderer::Ssr);

        result.template_parts.push(format!("<{}", tag_name));
        self.transform_ssr_attributes(node, &mut result);
        result.template_parts.push(">".to_string());
        self.transform_ssr_children(node, &mut result);
        result.template_parts.push(format!("</{}>", tag_name));

        result
    }

    /// 检测是否需要 SVG 包装
    fn needs_svg_wrapper(&self, tag_name: &str) -> bool {
        if !is_svg_element(tag_name) {
            return false;
        }
        if tag_name == "svg" {
            return false;
        }
        true
    }

    /// 检测是否需要 importNode
    fn needs_import_node(&self, node: &JSXElement<'a>, tag_name: &str) -> bool {
        if !is_import_node_element(tag_name) {
            return false;
        }

        node.opening_element.attributes.iter().any(|attr| {
            if let JSXAttributeItem::Attribute(attr) = attr {
                if let Some(ident) = attr.name.as_identifier() {
                    ident.name.as_str() == "loading"
                } else {
                    false
                }
            } else {
                false
            }
        })
    }
}
```

#### 4.2.2 组件类型判断

```rust
/// 检测标签名是否表示组件
pub fn is_component(tag_name: &str) -> bool {
    if let Some(c) = tag_name.chars().next() {
        // 首字母大写
        if c.is_uppercase() {
            return true;
        }
    }
    // 包含点号 (如 Foo.Bar)
    if tag_name.contains('.') {
        return true;
    }
    // 非字母开头 (如 $dynamic, _private)
    if let Some(c) = tag_name.chars().next() {
        if !c.is_alphabetic() {
            return true;
        }
    }
    false
}
```

### 4.3 属性处理系统

```rust
// crates/compiler-dom/src/jsx/attributes.rs

/// 处理元素的全部属性
pub fn transform_attributes<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    node: &mut JSXElement<'a>,
    result: &mut ElementResult<'a>,
) {
    let attributes = &node.opening_element.attributes;

    // 1. 检测是否有 Spread 属性
    let has_spread = attributes.iter().any(|attr| attr.as_spread().is_some());
    if has_spread {
        handle_spread_attributes(transformer, result);
        return;
    }

    // 2. 预处理：合并多个 class 属性
    let merged_attributes = merge_class_attributes(transformer, attributes);

    // 3. 遍历处理每个属性
    for attr in merged_attributes.iter() {
        handle_normal_attribute(transformer, attr, result);
    }
}

/// 合并多个 class 属性
fn merge_class_attributes<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    attributes: &[JSXAttributeItem<'a>],
) -> Vec<'a, JSXAttributeItem<'a>> {
    let mut result: Vec<'a, JSXAttributeItem<'a>> = transformer.builder.vec();
    let mut class_values: Vec<'a, String> = transformer.builder.vec();

    for attr in attributes {
        if let JSXAttributeItem::Attribute(attr) = attr {
            let name = attr.name.as_identifier().map(|id| id.name.as_str()).unwrap_or("");
            if name == "class" || name == "className" {
                if let Some(value) = attr.value.as_ref() {
                    if let JSXAttributeValue::StringLiteral(s) = value {
                        class_values.push(s.value.as_str().to_string());
                        continue;
                    }
                }
            }
        }
        result.push(attr.clone_in(transformer.allocator));
    }

    // 如果有多个 class 值，需要合并...
    // 简化版本：暂不处理

    result
}

/// 处理普通属性
fn handle_normal_attribute<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    attr: &JSXAttributeItem<'a>,
    result: &mut ElementResult<'a>,
) {
    if let JSXAttributeItem::Attribute(attr) = attr {
        let name = attr.name.as_identifier().unwrap().name.as_str();
        let value_opt = attr.value.as_ref();

        let (namespace, attr_name) = parse_namespace(name);
        let kind = classify_attribute(
            attr_name,
            namespace,
            &result.tag_name,
            result.is_svg,
        );

        // 事件属性特殊处理
        if is_event_attribute(name) {
            let mut event_handler = EventHandler::new(
                transformer.allocator,
                transformer.state,
                result.element_id.clone().unwrap_or_else(|| "_el$0".to_string()),
            );
            if let Some(event_result) = event_handler.handle_event(name, value_opt) {
                if let Some(stmt) = event_result.statement {
                    result.exprs.insert(0, Statement::Expression(stmt).into());
                }
            }
            return;
        }

        // ref 属性处理
        if kind == AttrBindingKind::Ref {
            handle_ref_attribute(transformer, result, attr);
            return;
        }

        if let Some(value) = value_opt {
            if let JSXAttributeValue::ExpressionContainer(expr_container) = value {
                let jsx_expr = &expr_container.expression;
                let check_config = CheckConfig::default_dom();

                let is_dynamic = if let Some(expr) = jsx_expr.as_expression() {
                    is_dynamic_expression(expr, check_config)
                } else {
                    false
                };

                if is_dynamic {
                    if kind.needs_effect() {
                        if let Some(expr) = jsx_expr.as_expression() {
                            result.dynamics.push(DynamicAttr::new(
                                result.element_id.clone().unwrap_or_else(|| "_el$0".to_string()),
                                attr_name.to_string(),
                                expr.clone_in(transformer.allocator),
                            ));

                            // 注册必要的 helper
                            if let Some(helper) = kind.helper_name() {
                                transformer.state.register_helper(helper.to_string(), None);
                            }
                        }
                    } else {
                        // 非 effect 属性 → 直接调用 setAttribute
                        let call = build_set_attr_call(transformer, result, attr_name, jsx_expr, kind);
                        result.exprs.push(call);
                    }
                } else {
                    // 静态值 → 内联到模板
                    inline_static_attribute(transformer, result, attr_name, jsx_expr);
                }
            }
        } else {
            // 无值属性 (如 <div disabled />)
            if is_boolean_attribute(attr_name) {
                result.template.push(' ');
                result.template.push_str(attr_name);
            }
        }
    }
}

/// 内联静态属性到模板
fn inline_static_attribute<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    result: &mut ElementResult<'a>,
    name: &str,
    expr: &JSXExpression<'a>,
) {
    if let Some(expr) = expr.as_expression() {
        match expr {
            Expression::StringLiteral(s) => {
                result.template.push(' ');
                result.template.push_str(name);
                result.template.push_str("=\"");
                result.template.push_str(s.value.as_str());
                result.template.push('"');
            }
            Expression::BooleanLiteral(b) if b.value => {
                result.template.push(' ');
                result.template.push_str(name);
            }
            Expression::NumericLiteral(n) => {
                result.template.push(' ');
                result.template.push_str(name);
                result.template.push_str("=\"");
                result.template.push_str(&n.value.to_string());
                result.template.push('"');
            }
            _ => {}
        }
    }
}

/// 构建 setAttribute 调用
fn build_set_attr_call<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    result: &mut ElementResult<'a>,
    name: &str,
    expr: &JSXExpression<'a>,
    kind: AttrBindingKind,
) -> Expression<'a> {
    let elem_id = result.element_id.clone().unwrap_or_else(|| "_el$0".to_string());

    match kind {
        AttrBindingKind::ClassName => {
            transformer.call(
                transformer.ident_ref("className"),
                transformer.builder.vec_from_iter([
                    elem_id.clone().clone_in(transformer.allocator).into(),
                    expr.clone_in(transformer.allocator).into(),
                ]),
            )
        }
        AttrBindingKind::ForceAttribute => {
            transformer.call(
                transformer.ident_ref("setAttribute"),
                transformer.builder.vec_from_iter([
                    elem_id.clone().clone_in(transformer.allocator).into(),
                    Str::from_in(name, transformer.allocator).into(),
                    expr.clone_in(transformer.allocator).into(),
                ]),
            )
        }
        _ => {
            transformer.call(
                transformer.ident_ref("setAttribute"),
                transformer.builder.vec_from_iter([
                    elem_id.clone().clone_in(transformer.allocator).into(),
                    Str::from_in(name, transformer.allocator).into(),
                    expr.clone_in(transformer.allocator).into(),
                ]),
            )
        }
    }
}

/// 处理 Spread 属性
fn handle_spread_attributes<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    result: &mut ElementResult<'a>,
) {
    transformer.state.register_helper("spread".to_string(), None);
    transformer.state.register_helper("mergeProps".to_string(), None);

    // TODO: 完整的 spread 处理逻辑
    // 1. 收集所有展开对象
    // 2. 如果有静态属性，与动态展开合并
    // 3. 生成 mergeProps 调用
    // 4. 注册 spread 调用
}

/// 处理 ref 属性
fn handle_ref_attribute<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    result: &mut ElementResult<'a>,
    attr: &JSXAttribute<'a>,
) {
    transformer.state.register_helper("use".to_string(), None);

    if let Some(value) = attr.value.as_ref() {
        if let JSXAttributeValue::ExpressionContainer(expr_container) = value {
            let elem_id = result.element_id.clone().unwrap_or_else(|| "_el$0".to_string());
            let call = transformer.call(
                transformer.ident_ref("use"),
                transformer.builder.vec_from_iter([
                    elem_id.clone().clone_in(transformer.allocator).into(),
                    expr_container.expression.clone_in(transformer.allocator).into(),
                ]),
            );
            result.post_exprs.push(call);
        }
    }
}
```

### 4.4 事件委托系统

```rust
// crates/compiler-dom/src/jsx/events.rs

/// 事件处理器
pub struct EventHandler<'a, 'ctx> {
    allocator: &'a Allocator,
    state: &'ctx mut JsxCompilerState<'a>,
    element_id: String,
}

impl<'a, 'ctx> EventHandler<'a, 'ctx> {
    pub fn new(
        allocator: &'a Allocator,
        state: &'ctx mut JsxCompilerState<'a>,
        element_id: String,
    ) -> Self {
        Self { allocator, state, element_id }
    }

    /// 处理事件属性
    pub fn handle_event(
        &mut self,
        name: &str,
        value_opt: Option<&JSXAttributeValue<'a>>,
    ) -> Option<EventResult<'a>> {
        let config = &self.state.config;

        // 1. 提取事件名 (onClick → click)
        let event_name = to_event_name(name);
        let full_event_key = format!("${}", event_name);

        // 2. 获取处理函数表达式
        let handler = self.extract_handler_expression(value_opt)?;

        // 3. 检测强制非委托模式 (on:click)
        if is_forced_direct(name) {
            return Some(self.build_direct_event(event_name, handler));
        }

        // 4. 检测是否可委托
        let can_delegate = config.delegate_events && is_delegated_event(&event_name);

        if can_delegate {
            Some(self.build_delegated_event(&event_name, &full_event_key, handler))
        } else {
            Some(self.build_direct_event(event_name, handler))
        }
    }

    /// 提取处理函数表达式
    fn extract_handler_expression(&self, value_opt: Option<&JSXAttributeValue<'a>>) -> Option<Expression<'a>> {
        if let Some(value) = value_opt {
            if let JSXAttributeValue::ExpressionContainer(expr_container) = value {
                if !expr_container.expression.is_null_literal() {
                    return Some(expr_container.expression.clone());
                }
            }
        }
        None
    }

    /// 构建委托事件
    fn build_delegated_event(
        &mut self,
        event_name: &str,
        full_event_key: &str,
        handler: Expression<'a>,
    ) -> EventResult<'a> {
        self.state.register_delegated_event(event_name.to_string());
        self.state.register_helper("delegateEvents".to_string(), None);

        let handler_type = detect_handler_type(&handler);

        match handler_type {
            HandlerType::StaticFunction | HandlerType::Resolvable => {
                // 直接赋值给元素属性
                let elem_str = Str::from_in(&self.element_id, self.allocator);
                let key_str = Str::from_in(full_event_key, self.allocator);

                let assignment = Expression::AssignmentExpression(AssignmentExpression {
                    node_id: Default::default(),
                    left: MemberExpression::StaticMemberExpression(Box::new(
                        StaticMemberExpression {
                            node_id: Default::default(),
                            span: Default::default(),
                            object: Expression::Identifier(IdentifierReference {
                                name: Ident::from_in(&self.element_id, self.allocator),
                                span: Default::default(),
                                node_id: Default::default(),
                                reference_id: Default::default(),
                            }),
                            property: Ident::from_in(full_event_key, self.allocator),
                            optional: false,
                        },
                    )),
                    operator: AssignmentOperator::Assign,
                    right: handler,
                });

                EventResult {
                    statement: Some(Statement::ExpressionStatement(Box::new(
                        ExpressionStatement {
                            node_id: Default::default(),
                            span: Default::default(),
                            expression: assignment,
                        },
                    ))),
                    is_delegated: true,
                }
            }
            HandlerType::Array => {
                // [handler, data] → 分别赋值 $click 和 $clickData
                // TODO: 完整实现
                EventResult { statement: None, is_delegated: true }
            }
            HandlerType::Dynamic => {
                // 需要 addEventListener
                self.state.register_helper("addEventListener".to_string(), None);
                EventResult { statement: None, is_delegated: false }
            }
        }
    }

    /// 构建直接事件
    fn build_direct_event(&mut self, event_name: String, handler: Expression<'a>) -> EventResult<'a> {
        self.state.register_helper("addEventListener".to_string(), None);

        let call = Expression::CallExpression(CallExpression {
            callee: Expression::Identifier(IdentifierReference {
                name: Ident::from_in("addEventListener", self.allocator),
                span: Default::default(),
                node_id: Default::default(),
                reference_id: Default::default(),
            }),
            arguments: self.allocator.vec([
                self.element_id.clone().clone_in(self.allocator).into(),
                event_name.clone().into(),
                handler.into(),
            ]),
            span: Default::default(),
            node_id: Default::default(),
            optional: false,
            pure: false,
        });

        EventResult {
            statement: Some(Statement::ExpressionStatement(Box::new(
                ExpressionStatement {
                    node_id: Default::default(),
                    span: Default::default(),
                    expression: call,
                },
            ))),
            is_delegated: false,
        }
    }
}

/// 事件结果
pub struct EventResult<'a> {
    pub statement: Option<Statement<'a>>,
    pub is_delegated: bool,
}

/// 检测处理函数类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum HandlerType {
    StaticFunction,
    Resolvable,
    Array,
    Dynamic,
}

impl HandlerType {
    pub fn detect(expr: &Expression) -> Self {
        match expr {
            Expression::FunctionExpression(_) | Expression::ArrowFunctionExpression(_) => {
                Self::StaticFunction
            }
            Expression::ArrayExpression(arr) if !arr.elements.is_empty() => Self::Array,
            _ => Self::Dynamic,
        }
    }
}

/// 检测是否为可委托事件
pub fn can_delegate_event(event_name: &str) -> bool { is_delegated_event(event_name) }

/// 检测事件属性名
pub fn is_event_attribute(name: &str) -> bool {
    name.starts_with("on") && name.len() > 2 && !name.contains(':')
}

/// 提取事件名
pub fn extract_event_name(name: &str) -> Option<&str> {
    if is_event_attribute(name) {
        Some(&name[2..])
    } else {
        None
    }
}

/// 检测是否为强制非委托模式
pub fn is_forced_direct(name: &str) -> bool { name.starts_with("on:") }
```

### 4.5 子节点处理系统

```rust
// crates/compiler-dom/src/jsx/children.rs

/// 处理元素的子节点
pub fn transform_children<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    node: &JSXElement<'a>,
    result: &mut ElementResult<'a>,
) {
    let config = &transformer.state.config;

    // 1. 过滤空白和空表达式
    let filtered: Vec<_> = node
        .children
        .iter()
        .filter(|child| !is_useless_child(child))
        .collect();

    // 2. 查找最后一个元素节点
    let last_element_index = find_last_element_index(&filtered);

    // 3. 确定是否需要 marker
    let needs_markers = config.hydratable && filtered.len() > 1;

    // 4. 处理每个子节点
    for (index, child) in filtered.iter().enumerate() {
        let is_last = index == last_element_index;

        match child {
            JSXChild::Element(elem) => {
                transform_child_element(transformer, elem, result, is_last);
            }
            JSXChild::ExpressionContainer(expr_container) => {
                let binding = transform_expression_child(
                    transformer, expr_container, result, index, needs_markers,
                );
                if let Some(binding) = binding {
                    result.child_bindings.push(binding);
                }
            }
            JSXChild::Text(text) => {
                let content = normalize_whitespace(text.value.as_str());
                result.template.push_str(&escape_html(&content, false));
            }
            _ => {}
        }
    }
}

/// 处理动态表达式子节点
fn transform_expression_child<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    expr_container: &JSXExpressionContainer<'a>,
    result: &mut ElementResult<'a>,
    index: usize,
    needs_markers: bool,
) -> Option<ChildBinding<'a>> {
    let expr = &expr_container.expression;

    // 空表达式
    if matches!(expr, JSXExpression::EmptyExpression(_)) {
        return None;
    }

    let check_config = CheckConfig::default_dom();
    let Some(inner_expr) = expr.as_expression() else {
        return None;
    };

    let is_dynamic = is_dynamic_expression(inner_expr, check_config);

    if !is_dynamic {
        // 尝试静态求值
        if let Some(lit) = evaluate_static_expression(transformer, inner_expr) {
            return Some(ChildBinding::new(
                transformer.state.next_placeholder_index(),
                Expression::StringLiteral(StringLiteral {
                    value: Str::from_in(&lit, transformer.allocator),
                    span: Default::default(),
                    node_id: Default::default(),
                    lone_surrogates: Default::default(),
                    raw: Default::default(),
                }),
                true,
            ));
        }
        return None;
    }

    let placeholder_idx = transformer.state.next_placeholder_index();

    // 添加 marker
    if needs_markers {
        result.template.push_str(&MarkerKind::DynamicChildStart.to_html(Some(placeholder_idx)));
    }

    // 检测条件表达式并包装
    let config = &transformer.state.config;
    if config.wrap_conditionals && config.generate == GenerateMode::Dom {
        if matches!(inner_expr, Expression::ConditionalExpression(_))
            || matches!(inner_expr, Expression::LogicalExpression(_))
        {
            let wrapped = transformer.wrap_conditional_expr(inner_expr);
            return Some(ChildBinding::new(placeholder_idx, wrapped, false));
        }
    }

    Some(ChildBinding::new(
        placeholder_idx,
        inner_expr.clone_in(transformer.allocator),
        false,
    ))
}

/// 评估静态表达式
fn evaluate_static_expression<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    expr: &Expression<'a>,
) -> Option<String> {
    match expr {
        Expression::StringLiteral(s) => Some(s.value.as_str().to_string()),
        Expression::TemplateLiteral(t) if t.expressions.is_empty() => {
            Some(t.quasis.first()?.value.cooked.as_str().to_string())
        }
        _ => None,
    }
}

/// 查找最后一个元素索引
fn find_last_element_index(children: &[&JSXChild]) -> usize {
    let mut last_idx = 0;
    for (i, child) in children.iter().enumerate() {
        if matches!(child, JSXChild::Element(_)) {
            last_idx = i;
        }
    }
    last_idx
}
```

### 4.6 组件处理

```rust
// crates/compiler-core/src/jsx/component.rs

/// JSX 组件转换器
pub struct ComponentTransformer<'a, 'ctx> {
    pub source: &'a str,
    pub allocator: &'a Allocator,
    builder: AstBuilder<'a>,
    pub state: &'ctx mut JsxCompilerState<'a>,
}

impl<'a, 'ctx> ComponentTransformer<'a, 'ctx> {
    pub fn new(
        source: &'a str,
        allocator: &'a Allocator,
        state: &'ctx mut JsxCompilerState<'a>,
    ) -> Self {
        Self { source, allocator, builder: AstBuilder::new(allocator), state }
    }

    /// 转换组件 JSXElement
    pub fn transform_component(&mut self, node: &mut JSXElement<'a>) -> ComponentResult<'a> {
        let config = &self.state.config;

        // 1. 获取组件标识符
        let tag_id = self.convert_component_identifier(&node.opening_element.name);

        // 2. 检查内置组件
        if let Expression::Identifier(ident) = &tag_id {
            let name = ident.name.as_str();
            if config.built_ins.iter().any(|b| b.as_str() == name) {
                return self.transform_builtin_component(ident, node);
            }
        }

        // 3. 构建 props 对象
        let (props_expr, has_dynamic) = self.transform_component_props(node);

        // 4. 处理 children
        let children_result = self.transform_component_children(node);
        let final_props = self.merge_children_into_props(props_expr, children_result);

        // 5. 注册 helpers
        self.state.register_helper("createComponent".to_string(), None);
        if has_dynamic {
            self.state.register_helper("mergeProps".to_string(), None);
        }

        // 6. 生成 createComponent 调用
        ComponentResult::new(
            self.call(
                self.ident_ref("createComponent"),
                self.builder.vec_from_iter([tag_id.into(), final_props.into()]),
            ),
            has_dynamic,
        )
    }

    /// 转换内置组件
    fn transform_builtin_component(&mut self, ident: &IdentifierReference, node: &mut JSXElement<'a>) -> ComponentResult<'a> {
        let name = ident.name.as_str();

        match name {
            "Show" => self.transform_show(node),
            "For" => self.transform_for(node),
            "Index" => self.transform_index(node),
            "Switch" | "Match" => self.transform_match(node),
            "Portal" => self.transform_portal(node),
            _ => {
                ComponentResult::new(
                    Expression::Identifier(IdentifierReference {
                        name: ident.name,
                        span: ident.span,
                        node_id: Cell::new(NodeId::DUMMY),
                        reference_id: Default::default(),
                    }),
                    false,
                )
            }
        }
    }

    /// 转换 Show 组件
    fn transform_show(&mut self, node: &mut JSXElement<'a>) -> ComponentResult<'a> {
        // Show 组件特殊处理：
        // 1. 提取 when 属性
        // 2. 包装 children 为条件表达式
        // 3. 生成 Show 调用

        let mut when_expr: Option<Expression<'a>> = None;
        let mut fallback: Option<Expression<'a>> = None;

        for attr in &node.opening_element.attributes {
            if let JSXAttributeItem::Attribute(attr) = attr {
                let name = attr.name.as_identifier().map(|id| id.name.as_str()).unwrap_or("");
                if name == "when" {
                    if let Some(value) = attr.value.as_ref() {
                        if let JSXAttributeValue::ExpressionContainer(expr_container) = value {
                            when_expr = Some(expr_container.expression.clone());
                        }
                    }
                } else if name == "fallback" {
                    // fallback 处理...
                }
            }
        }

        // 注册 Show helper
        self.state.register_helper("Show".to_string(), None);

        ComponentResult::new(
            Expression::JSXElement(node.clone_in(self.allocator)),
            true,
        )
    }

    /// 转换 For 组件
    fn transform_for(&mut self, node: &mut JSXElement<'a>) -> ComponentResult<'a> {
        self.state.register_helper("For".to_string(), None);
        ComponentResult::new(
            Expression::JSXElement(node.clone_in(self.allocator)),
            true,
        )
    }

    /// 转换组件的 props (生成 getter 实现延迟求值)
    fn transform_component_props(&mut self, node: &mut JSXElement<'a>) -> (Expression<'a>, bool) {
        let mut properties: Vec<'a, ObjectPropertyKind<'a>> = self.builder.vec();
        let mut spread_args: Vec<'a, Expression<'a>> = self.builder.vec();
        let mut has_dynamic = false;

        for attr in &node.opening_element.attributes {
            match attr {
                JSXAttributeItem::Attribute(attr) => {
                    let (key, value, is_dyn) = self.transform_prop_attr(attr);
                    has_dynamic = has_dynamic || is_dyn;
                    properties.push(self.obj_prop(&key, value));
                }
                JSXAttributeItem::SpreadAttribute(spread) => {
                    spread_args.push(spread.argument.clone_in(self.allocator));
                }
            }
        }

        if !spread_args.is_empty() {
            let merged = self.merge_spread_args(spread_args);
            (merged, true)
        } else {
            (self.obj_expr(properties), has_dynamic)
        }
    }

    /// 转换单个 prop 属性为 getter (延迟求值)
    /// 例如: title={title} → { get title() { return title; } }
    fn transform_prop_attr(&mut self, attr: &JSXAttribute<'a>) -> (String, Expression<'a>, bool) {
        let key = attr.name.as_identifier().unwrap().name.as_str().to_string();
        let value_opt = attr.value.as_ref();

        if let Some(value) = value_opt {
            if let JSXAttributeValue::ExpressionContainer(expr_container) = value {
                if let Some(expr) = expr_container.expression.as_expression() {
                    let check_config = CheckConfig { check_member: true, check_tags: true, ..Default::default() };
                    let is_dyn = is_dynamic_expression(expr, check_config);

                    if is_dyn {
                        // 动态属性 → 生成 getter 以实现延迟求值
                        let getter_expr = Expression::ObjectExpression(ObjectExpression {
                            properties: self.builder.vec_from_iter([ObjectPropertyKind::ObjectProperty(
                                self.builder.alloc(ObjectProperty {
                                    key: PropertyKey::StaticIdentifier(self.builder.alloc(self.ident_name(&key))),
                                    value: Expression::Getter(Getter {
                                        body: FunctionBody {
                                            statements: self.builder.vec_from_iter([Statement::ReturnStatement(
                                                self.builder.alloc(ReturnStatement {
                                                    argument: Some(expr.clone_in(self.allocator).into()),
                                                    span: Default::default(),
                                                    node_id: Cell::new(NodeId::DUMMY),
                                                }),
                                            )]),
                                            directives: self.builder.vec(),
                                            span: Default::default(),
                                            node_id: Cell::new(NodeId::DUMMY),
                                        }),
                                        span: Default::default(),
                                        node_id: Cell::new(NodeId::DUMMY),
                                        type_parameters: None,
                                        value: None,
                                    }),
                                    kind: PropertyKind::Init,
                                    span: Default::default(),
                                    node_id: Cell::new(NodeId::DUMMY),
                                    method: false,
                                    shorthand: false,
                                    computed: false,
                                }),
                            )]),
                            span: Default::default(),
                            node_id: Cell::new(NodeId::DUMMY),
                        });
                        return (key, getter_expr, true);
                    }
                    return (key, expr.clone_in(self.allocator), false);
                }
            }
        }

        (key, self.bool_lit(true), false)
    }

    /// 转换组件的 children
    fn transform_component_children(&mut self, node: &mut JSXElement<'a>) -> Option<Expression<'a>> {
        if node.children.is_empty() {
            return None;
        }

        if node.children.len() == 1 {
            if let JSXChild::Element(elem) = &node.children[0] {
                return Some(Expression::JSXElement(self.builder.alloc(elem.clone())));
            }
        }

        let mut elements: Vec<'a, ArrayExpressionElement<'a>> = self.builder.vec();

        for child in &node.children {
            match child {
                JSXChild::Element(elem) => {
                    elements.push(ArrayExpressionElement::Expression(
                        Expression::JSXElement(self.builder.alloc(elem.clone())),
                    ));
                }
                JSXChild::ExpressionContainer(expr_container) => {
                    if !matches!(expr_container.expression, JSXExpression::EmptyExpression(_)) {
                        if let Some(expr) = expr_container.expression.as_expression() {
                            elements.push(ArrayExpressionElement::Expression(expr.clone_in(self.allocator)));
                        }
                    }
                }
                JSXChild::Text(text) => {
                    elements.push(ArrayExpressionElement::Expression(self.str_lit(text.value.as_str())));
                }
                _ => {}
            }
        }

        if elements.len() == 1 {
            let ArrayExpressionElement::Expression(expr) = elements.into_iter().next().unwrap() else {
                return None;
            };
            Some(expr)
        } else {
            Some(Expression::ArrayExpression(self.builder.alloc(ArrayExpression {
                elements,
                span: Default::default(),
                node_id: Cell::new(NodeId::DUMMY),
            })))
        }
    }

    /// 将 children 合并到 props 对象
    fn merge_children_into_props(&mut self, props: Expression<'a>, children: Option<Expression<'a>>) -> Expression<'a> {
        let Some(children) = children else {
            return props;
        };

        if let Expression::ObjectExpression(obj) = props {
            let mut props_vec = obj.properties.into_vec();
            props_vec.push(ObjectPropertyKind::ObjectProperty(self.builder.alloc(ObjectProperty {
                key: PropertyKey::StaticIdentifier(self.builder.alloc(self.ident_name("children"))),
                value: children,
                kind: PropertyKind::Init,
                span: Default::default(),
                node_id: Cell::new(NodeId::DUMMY),
                method: false,
                shorthand: false,
                computed: false,
            })));
            self.obj_expr(props_vec)
        } else {
            props
        }
    }

    /// 转换组件标识符
    fn convert_component_identifier(&mut self, name: &JSXElementName<'a>) -> Expression<'a> {
        match name {
            JSXElementName::Identifier(id) => Expression::Identifier(IdentifierReference {
                name: self.builder.ident(id.name.as_str()),
                span: Default::default(),
                node_id: Cell::new(NodeId::DUMMY),
                reference_id: Default::default(),
            }),
            JSXElementName::MemberExpression(member) => {
                self.member_expression_to_expr(member)
            }
            JSXElementName::NamespacedName(ns) => Expression::Identifier(IdentifierReference {
                name: self.builder.ident(&format!("{}:{}", ns.namespace.name, ns.property.name)),
                span: Default::default(),
                node_id: Cell::new(NodeId::DUMMY),
                reference_id: Default::default(),
            }),
            _ => Expression::Identifier(IdentifierReference {
                name: self.builder.ident("div"),
                span: Default::default(),
                node_id: Cell::new(NodeId::DUMMY),
                reference_id: Default::default(),
            }),
        }
    }

    /// 将 JSXMemberExpression 转换为表达式
    fn member_expression_to_expr(&mut self, member: &JSXMemberExpression<'a>) -> Expression<'a> {
        let full_name = self.flatten_jsx_member_name(member);
        Expression::Identifier(IdentifierReference {
            name: self.builder.ident(&full_name),
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
            reference_id: Default::default(),
        })
    }

    /// 递归展开 JSXMemberExpression 为字符串
    fn flatten_jsx_member_name(&self, member: &JSXMemberExpression<'a>) -> String {
        let mut parts: Vec<String> = self.builder.vec();
        self.collect_member_parts(member, &mut parts);
        parts.reverse();
        parts.join(".")
    }

    /// 收集 MemberExpression 的各个部分
    fn collect_member_parts(&self, member: &JSXMemberExpression<'a>, parts: &mut Vec<String>) {
        parts.push(member.property.name.as_str().to_string());
        match &member.object {
            JSXMemberExpressionObject::IdentifierReference(id_ref) => {
                parts.push(id_ref.name.as_str().to_string());
            }
            JSXMemberExpressionObject::MemberExpression(inner) => {
                self.collect_member_parts(inner, parts);
            }
            JSXMemberExpressionObject::ThisExpression(_) => {
                parts.push("this".to_string());
            }
        }
    }

    // === 辅助方法 ===

    fn ident_ref(&self, name: &str) -> IdentifierReference<'a> {
        IdentifierReference {
            name: Ident::from_in(name, self.allocator),
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
            reference_id: Default::default(),
        }
    }

    fn ident_name(&self, name: &str) -> IdentifierName<'a> {
        IdentifierName {
            name: self.builder.ident(name),
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
        }
    }

    fn call(&self, callee: IdentifierReference<'a>, args: Vec<'a, Argument<'a>>) -> Expression<'a> {
        Expression::CallExpression(CallExpression {
            node_id: Cell::new(NodeId::DUMMY),
            span: Default::default(),
            callee: Expression::Identifier(self.builder.alloc(callee)),
            arguments: args,
            optional: false,
            pure: false,
            type_arguments: None,
        })
    }

    fn bool_lit(&self, value: bool) -> Expression<'a> {
        Expression::BooleanLiteral(BooleanLiteral {
            value,
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
        })
    }

    fn str_lit(&self, value: &str) -> Expression<'a> {
        Expression::StringLiteral(StringLiteral {
            value: self.builder.str(value),
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
            lone_surrogates: Default::default(),
            raw: Default::default(),
        })
    }

    fn obj_prop(&self, key: &str, value: Expression<'a>) -> ObjectPropertyKind<'a> {
        ObjectPropertyKind::ObjectProperty(self.builder.alloc(ObjectProperty {
            key: PropertyKey::StaticIdentifier(self.builder.alloc(self.ident_name(key))),
            value,
            kind: PropertyKind::Init,
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
            method: false,
            shorthand: false,
            computed: false,
        }))
    }

    fn obj_expr(&self, properties: Vec<'a, ObjectPropertyKind<'a>>) -> Expression<'a> {
        Expression::ObjectExpression(ObjectExpression {
            properties,
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
        })
    }

    fn merge_spread_args(&mut self, spread_args: Vec<'a, Expression<'a>>) -> Expression<'a> {
        let merge_call = self.call(
            self.ident_ref("mergeProps"),
            self.builder.vec_from_iter(spread_args.into_iter().map(|e| e.into())),
        );

        Expression::ObjectExpression(ObjectExpression {
            properties: self.builder.vec_from_iter([ObjectPropertyKind::ObjectProperty(
                self.builder.alloc(ObjectProperty {
                    key: PropertyKey::StaticIdentifier(self.builder.alloc(self.ident_name("__spread"))),
                    value: merge_call,
                    kind: PropertyKind::Init,
                    span: Default::default(),
                    node_id: Cell::new(NodeId::DUMMY),
                    method: false,
                    shorthand: false,
                    computed: false,
                }),
            )]),
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
        })
    }
}
```

### 4.7 条件与循环处理

```rust
// crates/compiler-core/src/jsx/condition.rs

/// 条件表达式包装器
pub struct ConditionWrapper<'a, 'ctx> {
    allocator: &'a Allocator,
    state: &'ctx mut JsxCompilerState<'a>,
}

impl<'a, 'ctx> ConditionWrapper<'a, 'ctx> {
    pub fn new(allocator: &'a Allocator, state: &'ctx mut JsxCompilerState<'a>) -> Self {
        Self { allocator, state }
    }

    /// 包装条件表达式
    /// 输入: {flag ? <A/> : <B/>}
    /// 输出:
    /// (() => {
    ///   const _c$0 = memo(() => flag);
    ///   return _c$0() ? <A/> : <B/>;
    /// })()
    pub fn wrap(&mut self, expr: &Expression<'a>) -> Expression<'a> {
        match expr {
            Expression::ConditionalExpression(cond) => self.wrap_conditional(cond),
            Expression::LogicalExpression(logical) => self.wrap_logical(logical),
            _ => expr.clone_in(self.allocator),
        }
    }

    /// 包装条件表达式 (三元表达式)
    fn wrap_conditional(&mut self, cond: &ConditionalExpression<'a>) -> Expression<'a> {
        let config = &self.state.config;
        let test = &cond.test;

        let check_config = CheckConfig { check_member: true, ..CheckConfig::default_dom() };

        if is_dynamic_expression(test, check_config) {
            let memo_id = self.state.generate_component_name();
            self.state.register_helper(config.memo_wrapper.clone(), None);

            // 创建 memo 包装
            let memo_call = self.call1(&config.memo_wrapper, self.arrow_fn(test.clone_in(self.allocator)));

            // 创建变量声明
            let var_decl = Statement::VariableDeclaration(Box::new(VariableDeclaration {
                node_id: Cell::new(NodeId::DUMMY),
                span: Default::default(),
                kind: VariableDeclarationKind::Const,
                declare: false,
                declarations: self.vec_from_iter([VariableDeclarator {
                    node_id: Cell::new(NodeId::DUMMY),
                    span: Default::default(),
                    id: BindingPattern::BindingIdentifier(Box::new(BindingIdentifier {
                        name: Ident::from_in(&memo_id, self.allocator),
                        span: Default::default(),
                        node_id: Cell::new(NodeId::DUMMY),
                        symbol_id: Default::default(),
                    })),
                    init: Some(memo_call.into()),
                    definite: false,
                    kind: VariableDeclarationKind::Const,
                    type_annotation: None,
                }]),
            }));

            // 创建新的条件表达式
            let mut new_cond = cond.clone_in(self.allocator);
            new_cond.test = self.call0(&memo_id);

            // 创建块语句
            let block_body = Statement::BlockStatement(Box::new(BlockStatement {
                node_id: Cell::new(NodeId::DUMMY),
                span: Default::default(),
                body: self.vec_from_iter([
                    var_decl,
                    Statement::ReturnStatement(Box::new(ReturnStatement {
                        node_id: Cell::new(NodeId::DUMMY),
                        span: Default::default(),
                        argument: Some(Box::new(Expression::ConditionalExpression(new_cond))),
                    })),
                ]),
                scope_id: Default::default(),
            }));

            self.arrow_fn_block(block_body)
        } else {
            Expression::ConditionalExpression(cond.clone_in(self.allocator))
        }
    }

    /// 包装逻辑表达式 (&&, ||)
    fn wrap_logical(&mut self, logical: &LogicalExpression<'a>) -> Expression<'a> {
        // 类似 wrap_conditional，但对 left 操作数进行包装
        // ...
        Expression::LogicalExpression(logical.clone_in(self.allocator))
    }

    // === 辅助方法 ===

    fn arrow_fn(&self, body: Expression<'a>) -> Expression<'a> {
        Expression::ArrowFunctionExpression(ArrowFunctionExpression {
            node_id: Cell::new(NodeId::DUMMY),
            span: Default::default(),
            expression: true,
            r#async: false,
            type_parameters: None,
            params: self.empty_params(),
            return_type: None,
            body: Box::new(FunctionBody {
                node_id: Cell::new(NodeId::DUMMY),
                span: Default::default(),
                directives: Vec::new_in(self.allocator),
                statements: Vec::from_iter_in([Statement::ExpressionStatement(Box::new(
                    ExpressionStatement {
                        node_id: Cell::new(NodeId::DUMMY),
                        span: Default::default(),
                        expression: body,
                    },
                ))], self.allocator),
            }),
            scope_id: Default::default(),
            pure: false,
            pife: false,
        })
    }

    fn arrow_fn_block(&self, body: Statement<'a>) -> Expression<'a> {
        Expression::ArrowFunctionExpression(ArrowFunctionExpression {
            node_id: Cell::new(NodeId::DUMMY),
            span: Default::default(),
            expression: false,
            r#async: false,
            type_parameters: None,
            params: self.empty_params(),
            return_type: None,
            body: Box::new(FunctionBody {
                node_id: Cell::new(NodeId::DUMMY),
                span: Default::default(),
                directives: Vec::new_in(self.allocator),
                statements: Vec::from_iter_in([body], self.allocator),
            }),
            scope_id: Default::default(),
            pure: false,
            pife: false,
        })
    }

    fn empty_params(&self) -> Box<FormalParameters<'a>> {
        Box::new(FormalParameters {
            node_id: Cell::new(NodeId::DUMMY),
            span: Default::default(),
            kind: FormalParameterKind::FormalParameter,
            items: Vec::new_in(self.allocator),
            rest: None,
        })
    }

    fn call0(&self, name: &str) -> Expression<'a> {
        self.call(
            &IdentifierReference {
                name: Ident::from_in(name, self.allocator),
                span: Default::default(),
                node_id: Cell::new(NodeId::DUMMY),
                reference_id: Default::default(),
            },
            Vec::new_in(self.allocator),
        )
    }

    fn call1(&self, name: &str, arg: Expression<'a>) -> Expression<'a> {
        self.call(
            &IdentifierReference {
                name: Ident::from_in(name, self.allocator),
                span: Default::default(),
                node_id: Cell::new(NodeId::DUMMY),
                reference_id: Default::default(),
            },
            Vec::from_iter_in([arg.into()], self.allocator),
        )
    }

    fn call(&self, callee: &IdentifierReference<'a>, args: Vec<'a, Argument<'a>>) -> Expression<'a> {
        Expression::CallExpression(CallExpression {
            callee: Expression::Identifier(*callee),
            arguments: Vec::from_iter_in(args, self.allocator),
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
            optional: false,
            pure: false,
            type_arguments: None,
        })
    }

    fn vec_from_iter<T, I>(&self, iter: I) -> Vec<'a, T>
    where
        I: IntoIterator<Item = T>,
    {
        Vec::from_iter_in(iter, self.allocator)
    }
}
```

### 4.8 Postprocess 阶段

```rust
// crates/compiler-core/src/jsx/postprocess.rs

/// 执行后处理
pub fn postprocess<'a>(
    program: &mut Program<'a>,
    state: &mut JsxCompilerState<'a>,
    allocator: &'a Allocator,
) {
    // 1. 注册 delegateEvents 调用
    if !state.delegated_events.is_empty() {
        let delegate_call = build_delegate_events_call(state, allocator);
        program.body.insert(0, Statement::ExpressionStatement(Box::new(delegate_call)));
    }

    // 2. 注册模板声明
    if !state.templates.is_empty() {
        let dom_templates: Vec<_> = state
            .templates
            .iter()
            .filter(|t| t.renderer == Renderer::Dom)
            .collect();

        if !dom_templates.is_empty() {
            let template_decls = generate_template_declarations(dom_templates, allocator);
            program.body.splice(0..0, template_decls);
        }
    }
}

/// 生成 delegateEvents 调用
fn build_delegate_events_call<'a>(
    state: &JsxCompilerState<'a>,
    allocator: &'a Allocator,
) -> Expression<'a> {
    let events: Vec<'a, Expression<'a>> = state
        .delegated_events
        .iter()
        .map(|name| {
            Expression::StringLiteral(StringLiteral {
                value: Str::from_in(name.as_str(), allocator),
                span: Default::default(),
                node_id: Cell::new(NodeId::DUMMY),
                lone_surrogates: Default::default(),
                raw: Default::default(),
            })
        })
        .collect();

    Expression::CallExpression(CallExpression {
        callee: Expression::Identifier(IdentifierReference {
            name: Ident::from_in("delegateEvents", allocator),
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
            reference_id: Default::default(),
        }),
        arguments: Vec::from_iter_in([Expression::ArrayExpression(ArrayExpression {
            elements: Vec::from_iter_in(events.into_iter().map(|e| ArrayExpressionElement::Expression(e)), allocator),
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
        })
        .into()], allocator),
        span: Default::default(),
        node_id: Cell::new(NodeId::DUMMY),
        optional: false,
        pure: false,
        type_arguments: None,
    })
}

/// 生成 DOM 模板声明
pub fn generate_template_declarations<'a>(
    templates: &[&TemplateDecl<'a>],
    allocator: &'a Allocator,
) -> Vec<'a, Statement<'a>> {
    templates
        .iter()
        .map(|tmpl| {
            let args: Vec<'a, Argument<'a>> = if tmpl.is_svg
                || tmpl.is_custom_element
                || tmpl.is_import_node
            {
                Vec::from_iter_in([
                    template_literal(&tmpl.html, allocator).into(),
                    Expression::BooleanLiteral(BooleanLiteral {
                        value: tmpl.is_import_node,
                        span: Default::default(),
                        node_id: Cell::new(NodeId::DUMMY),
                    })
                    .into(),
                    Expression::BooleanLiteral(BooleanLiteral {
                        value: tmpl.is_svg,
                        span: Default::default(),
                        node_id: Cell::new(NodeId::DUMMY),
                    })
                    .into(),
                ], allocator)
            } else {
                Vec::from_iter_in([template_literal(&tmpl.html, allocator).into()], allocator)
            };

            let template_call = Expression::CallExpression(CallExpression {
                callee: Expression::Identifier(IdentifierReference {
                    name: Ident::from_in("template", allocator),
                    span: Default::default(),
                    node_id: Cell::new(NodeId::DUMMY),
                    reference_id: Default::default(),
                }),
                arguments: args,
                span: Default::default(),
                node_id: Cell::new(NodeId::DUMMY),
                optional: false,
                pure: false,
                type_arguments: None,
            });

            Statement::VariableDeclaration(Box::new(VariableDeclaration {
                node_id: Cell::new(NodeId::DUMMY),
                span: Default::default(),
                kind: VariableDeclarationKind::Const,
                declare: false,
                declarations: Vec::from_iter_in([VariableDeclarator {
                    node_id: Cell::new(NodeId::DUMMY),
                    span: Default::default(),
                    kind: VariableDeclarationKind::Const,
                    id: BindingPattern::BindingIdentifier(Box::new(BindingIdentifier {
                        name: Ident::from_in(tmpl.name.as_str(), allocator),
                        span: Default::default(),
                        node_id: Cell::new(NodeId::DUMMY),
                        symbol_id: Default::default(),
                    })),
                    init: Some(template_call.into()),
                    definite: false,
                    type_annotation: None,
                }], allocator),
            }))
        })
        .collect()
}

/// 生成模板字面量
fn template_literal<'a>(html: &str, allocator: &'a Allocator) -> Expression<'a> {
    Expression::TemplateLiteral(TemplateLiteral {
        node_id: Cell::new(NodeId::DUMMY),
        span: Default::default(),
        quasis: allocator.alloc([TemplateElement {
            node_id: Cell::new(NodeId::DUMMY),
            span: Default::default(),
            tail: true,
            value: TemplateElementValue { cooked: html.to_string(), raw: html.to_string() },
        }]),
        expressions: Vec::new_in(allocator),
    })
}
```

---

## 5. 代码生成器设计

### 5.1 完整元素创建代码生成

```rust
// crates/compiler-dom/src/jsx/codegen.rs

/// 生成完整的元素创建代码
/// 对于有动态内容的元素，生成类似如下的代码:
/// ```js
/// (() => {
///   var _el$ = _tmpl$0();                      // 模板创建
///   effect(() => className(_el$, message())); // 动态属性
///   insert(_el$, () => count(), _el$.firstChild); // 动态子节点
///   return _el$;
/// })()
/// ```
pub fn generate_element_code<'a>(
    state: &JsxCompilerState<'a>,
    result: ElementResult<'a>,
    allocator: &'a Allocator,
) -> Expression<'a> {
    // 1. 纯静态元素 → 直接返回模板引用
    if result.declarations.is_empty()
        && result.exprs.is_empty()
        && result.dynamics.is_empty()
        && result.post_exprs.is_empty()
    {
        return Expression::CallExpression(CallExpression {
            callee: Expression::Identifier(IdentifierReference {
                name: Ident::from_in(&result.template_name, allocator),
                span: Default::default(),
                node_id: Cell::new(NodeId::DUMMY),
                reference_id: Default::default(),
            }),
            arguments: allocator.vec([]),
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
            optional: false,
            pure: false,
            type_arguments: None,
        });
    }

    // 2. 收集所有语句
    let mut statements: Vec<'a, Statement<'a>> = allocator.vec([]);
    statements.extend(result.declarations);
    statements.extend(result.exprs.into_iter().map(|e| {
        Statement::ExpressionStatement(Box::new(ExpressionStatement {
            node_id: Cell::new(NodeId::DUMMY),
            span: Default::default(),
            expression: e,
        }))
    }));

    // 3. 包装动态属性为 effect
    if !result.dynamics.is_empty() {
        let effect_stmt = generate_effect_wrapper(state, result.dynamics, allocator);
        statements.push(effect_stmt);
    }

    // 4. 后置表达式
    statements.extend(result.post_exprs.into_iter().map(|e| {
        Statement::ExpressionStatement(Box::new(ExpressionStatement {
            node_id: Cell::new(NodeId::DUMMY),
            span: Default::default(),
            expression: e,
        }))
    }));

    // 5. 返回元素
    if let Some(elem_id) = &result.element_id {
        statements.push(Statement::ReturnStatement(Box::new(ReturnStatement {
            node_id: Cell::new(NodeId::DUMMY),
            span: Default::default(),
            argument: Some(elem_id.clone().into()),
        })));
    }

    // 6. 包装为立即执行的箭头函数
    let fn_expr = Expression::ArrowFunctionExpression(ArrowFunctionExpression {
        node_id: Cell::new(NodeId::DUMMY),
        span: Default::default(),
        expression: false,
        r#async: false,
        type_parameters: None,
        params: Box::new(FormalParameters {
            node_id: Cell::new(NodeId::DUMMY),
            span: Default::default(),
            kind: FormalParameterKind::ArrowFormalParameters,
            items: allocator.vec([]),
            rest: None,
        }),
        return_type: None,
        body: Box::new(FunctionBody {
            node_id: Cell::new(NodeId::DUMMY),
            span: Default::default(),
            directives: allocator.vec([]),
            statements,
        }),
        scope_id: Cell::new(None),
        pure: false,
        pife: false,
    });

    Expression::CallExpression(CallExpression {
        callee: fn_expr,
        arguments: allocator.vec([]),
        span: Default::default(),
        node_id: Cell::new(NodeId::DUMMY),
        optional: false,
        pure: false,
        type_arguments: None,
    })
}

/// 生成 effect 包装
fn generate_effect_wrapper<'a>(
    state: &JsxCompilerState<'a>,
    dynamics: Vec<DynamicAttr<'a>>,
    allocator: &'a Allocator,
) -> Statement<'a> {
    let config = &state.config;

    if dynamics.len() == 1 {
        let dyn_attr = &dynamics[0];
        // 单个属性的 effect
        let effect_fn = Expression::ArrowFunctionExpression(ArrowFunctionExpression {
            node_id: Cell::new(NodeId::DUMMY),
            span: Default::default(),
            expression: true,
            r#async: false,
            type_parameters: None,
            params: Box::new(FormalParameters {
                node_id: Cell::new(NodeId::DUMMY),
                span: Default::default(),
                kind: FormalParameterKind::ArrowFormalParameters,
                items: allocator.vec([]),
                rest: None,
            }),
            return_type: None,
            body: Box::new(FunctionBody {
                node_id: Cell::new(NodeId::DUMMY),
                span: Default::default(),
                directives: allocator.vec([]),
                statements: Vec::from_iter_in([Statement::ExpressionStatement(Box::new(
                    ExpressionStatement {
                        node_id: Cell::new(NodeId::DUMMY),
                        span: Default::default(),
                        expression: build_dynamic_attr_call(&dyn_attr, allocator),
                    },
                ))], allocator),
            }),
            scope_id: Cell::new(None),
            pure: false,
            pife: false,
        });

        let effect_call = Expression::CallExpression(CallExpression {
            callee: Expression::Identifier(IdentifierReference {
                name: Ident::from_in(&config.effect_wrapper, allocator),
                span: Default::default(),
                node_id: Cell::new(NodeId::DUMMY),
                reference_id: Default::default(),
            }),
            arguments: allocator.vec([effect_fn.into()]),
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
            optional: false,
            pure: false,
            type_arguments: None,
        });

        Statement::ExpressionStatement(Box::new(ExpressionStatement {
            node_id: Cell::new(NodeId::DUMMY),
            span: Default::default(),
            expression: effect_call,
        }))
    } else {
        // 多个属性的批量 effect（优化版本）
        // TODO: 实现批量优化
        Statement::EmptyStatement(Default::default())
    }
}

/// 构建动态属性调用
fn build_dynamic_attr_call<'a>(dyn_attr: &DynamicAttr<'a>, allocator: &'a Allocator) -> Expression<'a> {
    let helper = match dyn_attr.key.as_str() {
        "className" | "class" => "className",
        "style" => "style",
        "classList" => "classList",
        _ => "setAttribute",
    };

    let args = if helper == "setAttribute" {
        allocator.vec([
            dyn_attr.elem.clone().into(),
            dyn_attr.key.clone().into(),
            dyn_attr.value.clone().into(),
        ])
    } else {
        allocator.vec([
            dyn_attr.elem.clone().into(),
            dyn_attr.value.clone().into(),
        ])
    };

    Expression::CallExpression(CallExpression {
        callee: Expression::Identifier(IdentifierReference {
            name: Ident::from_in(helper, allocator),
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
            reference_id: Default::default(),
        }),
        arguments: args,
        span: Default::default(),
        node_id: Cell::new(NodeId::DUMMY),
        optional: false,
        pure: false,
        type_arguments: None,
    })
}
```

---

## 6. SSR 编译模式

```rust
// crates/compiler-ssr/src/jsx/mod.rs

//! SSR JSX 编译器模块
//!
//! 提供服务端渲染的 JSX 编译功能

pub mod element;
pub mod template;
pub mod codegen;

use zeus_compiler_core::jsx::config::{GenerateMode, JsxConfig};
use zeus_compiler_core::jsx::state::JsxCompilerState;
use zeus_compiler_core::jsx::ir::Renderer;

/// SSR 元素转换
pub mod element {
    use super::*;

    pub fn transform_element_ssr<'a, 'ctx>(
        transformer: &mut JsxTransformer<'a, 'ctx>,
        node: &mut JSXElement<'a>,
    ) -> ElementResult<'a> {
        let tag_name = get_jsx_tag_name(&node.opening_element.name);
        let mut result = ElementResult::new(tag_name.clone(), Renderer::Ssr);

        result.template_parts.push(format!("<{}", tag_name));
        transform_ssr_attributes(transformer, node, &mut result);
        result.template_parts.push(">".to_string());
        transform_ssr_children(transformer, node, &mut result);
        result.template_parts.push(format!("</{}>", tag_name));

        result
    }

    fn transform_ssr_attributes<'a, 'ctx>(
        transformer: &mut JsxTransformer<'a, 'ctx>,
        node: &mut JSXElement<'a>,
        result: &mut ElementResult<'a>,
    ) {
        for attr in &node.opening_element.attributes {
            if let JSXAttributeItem::Attribute(attr) = attr {
                let name = attr.name.as_identifier().map(|id| id.name.as_str()).unwrap_or("");
                let value_opt = attr.value.as_ref();

                if let Some(value) = value_opt {
                    if let JSXAttributeValue::ExpressionContainer(expr_container) = value {
                        if let Some(expr) = expr_container.expression.as_expression() {
                            if name == "style" {
                                // ssrStyle()
                                transformer.state.register_helper("ssrStyle".to_string(), None);
                                let ssr_call = transformer.call(
                                    transformer.ident_ref("ssrStyle"),
                                    transformer.builder.vec_from_iter([
                                        expr.clone_in(transformer.allocator).into(),
                                    ]),
                                );
                                result.template_parts.push(" style=\"".to_string());
                                result.template_values.push(ssr_call);
                            } else if name == "classList" {
                                // ssrClassList()
                                transformer.state.register_helper("ssrClassList".to_string(), None);
                                let ssr_call = transformer.call(
                                    transformer.ident_ref("ssrClassList"),
                                    transformer.builder.vec_from_iter([
                                        expr.clone_in(transformer.allocator).into(),
                                    ]),
                                );
                                result.template_parts.push(" class=\"".to_string());
                                result.template_values.push(ssr_call);
                            } else {
                                // 普通属性需要 escape
                                result.template_parts.push(format!(" {}=\"", name));
                                result.template_values.push(expr.clone_in(transformer.allocator));
                            }
                        }
                    }
                }
            }
        }
    }

    fn transform_ssr_children<'a, 'ctx>(
        transformer: &mut JsxTransformer<'a, 'ctx>,
        node: &mut JSXElement<'a>,
        result: &mut ElementResult<'a>,
    ) {
        for child in &node.children {
            match child {
                JSXChild::Text(text) => {
                    let content = escape_html(text.value.as_str(), false);
                    result.template_parts.push(content);
                }
                JSXChild::ExpressionContainer(expr_container) => {
                    if let Some(expr) = expr_container.expression.as_expression() {
                        result.template_values.push(expr.clone_in(transformer.allocator));
                    }
                }
                JSXChild::Element(elem) => {
                    // 递归处理子元素
                    // TODO: 完整实现
                }
                _ => {}
            }
        }
    }
}

/// 生成 ssr() 调用
pub fn generate_ssr_call<'a>(
    state: &mut JsxCompilerState<'a>,
    parts: Vec<String>,
    values: Vec<Expression<'a>>,
    allocator: &'a Allocator,
) -> Expression<'a> {
    let tmpl_name = state.generate_template_name();

    let args: Vec<'a, Argument<'a>> = std::iter::once(
        Expression::Identifier(IdentifierReference {
            name: Ident::from_in(&tmpl_name, allocator),
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
            reference_id: Default::default(),
        }).into()
    )
    .chain(values.into_iter().map(|v| v.into()))
    .collect();

    Expression::CallExpression(CallExpression {
        callee: Expression::Identifier(IdentifierReference {
            name: Ident::from_in("ssr", allocator),
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
            reference_id: Default::default(),
        }),
        arguments: args,
        span: Default::default(),
        node_id: Cell::new(NodeId::DUMMY),
        optional: false,
        pure: false,
        type_arguments: None,
    })
}
```

---

## 7. 水合支持

```rust
// crates/compiler-dom/src/jsx/hydration.rs

/// 水合模板生成
pub struct HydrationGenerator<'a> {
    allocator: &'a Allocator,
}

impl<'a> HydrationGenerator<'a> {
    pub fn new(allocator: &'a Allocator) -> Self {
        Self { allocator }
    }

    /// 生成水合兼容的模板声明
    /// ```js
    /// const _tmpl$0 = template(`<div><!--$--><!----><!--/$--></div>`);
    /// const _el$ = getNextElement(_tmpl$0);
    /// ```
    pub fn generate_hydration_template<'ctx>(
        &self,
        state: &mut JsxCompilerState<'a>,
        decl: &mut TemplateDecl<'a>,
    ) -> Vec<Statement<'a>> {
        // 1. 注册 getNextElement helper
        state.register_helper("getNextElement".to_string(), None);

        // 2. 添加水合标记到模板 HTML
        let hydrated_html = add_hydration_markers_to_html(&decl.html);

        // 3. 生成声明
        let template_call = Expression::CallExpression(CallExpression {
            callee: Expression::Identifier(IdentifierReference {
                name: Ident::from_in("template", self.allocator),
                span: Default::default(),
                node_id: Cell::new(NodeId::DUMMY),
                reference_id: Default::default(),
            }),
            arguments: self.vec([template_literal(&hydrated_html, self.allocator).into()]),
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
            optional: false,
            pure: false,
            type_arguments: None,
        });

        let elem_name = state.generate_element_name();

        vec![
            Statement::VariableDeclaration(Box::new(VariableDeclaration {
                node_id: Cell::new(NodeId::DUMMY),
                span: Default::default(),
                kind: VariableDeclarationKind::Var,
                declare: false,
                declarations: self.vec([VariableDeclarator {
                    node_id: Cell::new(NodeId::DUMMY),
                    span: Default::default(),
                    kind: VariableDeclarationKind::Var,
                    id: BindingPattern::BindingIdentifier(Box::new(BindingIdentifier {
                        name: Ident::from_in(&decl.name, self.allocator),
                        span: Default::default(),
                        node_id: Cell::new(NodeId::DUMMY),
                        symbol_id: Default::default(),
                    })),
                    init: Some(template_call.into()),
                    definite: false,
                    type_annotation: None,
                }]),
            })),
            Statement::VariableDeclaration(Box::new(VariableDeclaration {
                node_id: Cell::new(NodeId::DUMMY),
                span: Default::default(),
                kind: VariableDeclarationKind::Var,
                declare: false,
                declarations: self.vec([VariableDeclarator {
                    node_id: Cell::new(NodeId::DUMMY),
                    span: Default::default(),
                    kind: VariableDeclarationKind::Var,
                    id: BindingPattern::BindingIdentifier(Box::new(BindingIdentifier {
                        name: Ident::from_in(&elem_name, self.allocator),
                        span: Default::default(),
                        node_id: Cell::new(NodeId::DUMMY),
                        symbol_id: Default::default(),
                    })),
                    init: Some(Expression::CallExpression(CallExpression {
                        callee: Expression::Identifier(IdentifierReference {
                            name: Ident::from_in("getNextElement", self.allocator),
                            span: Default::default(),
                            node_id: Cell::new(NodeId::DUMMY),
                            reference_id: Default::default(),
                        }),
                        arguments: self.vec([Expression::Identifier(IdentifierReference {
                            name: Ident::from_in(&decl.name, self.allocator),
                            span: Default::default(),
                            node_id: Cell::new(NodeId::DUMMY),
                            reference_id: Default::default(),
                        }).into()]),
                        span: Default::default(),
                        node_id: Cell::new(NodeId::DUMMY),
                        optional: false,
                        pure: false,
                        type_arguments: None,
                    }).into()),
                    definite: false,
                    type_annotation: None,
                }]),
            })),
        ]
    }

    fn vec<T>(&self, iter: Vec<T>) -> Vec<'a, T> {
        Vec::from_iter_in(iter, self.allocator)
    }
}

/// 添加水合标记到 HTML
fn add_hydration_markers_to_html(html: &str) -> String {
    // 在每个动态子节点位置添加 <!--$--> 和 <!--/$-->
    // 查找所有 <!--[N]--> 占位符
    let mut result = html.to_string();

    // 简化实现：直接添加水合标记
    // 实际实现需要更复杂的占位符处理
    if result.contains("<!--[") {
        // 在开始标记后添加 <!--$-->
        result = result.replace("<!--[", "<!--$[");
        // 在结束标记前添加 <!--/$-->
        result = result.replace("<!--/[", "<!--/[");
    }

    result
}
```

---

## 8. 实现路线图

### Phase 1: 基础设施 (已完成)

| 任务 | 状态 | 文件 |
|------|------|------|
| 常量定义迁移 | ✓ | `jsx/constants.rs` |
| 配置系统 | ✓ | `jsx/config.rs` |
| 状态结构 | ✓ | `jsx/state.rs` |
| IR 定义 | ✓ | `jsx/ir.rs` |
| 工具函数 | ✓ | `jsx/utils.rs` |
| Preprocess | ✓ | `jsx/preprocess.rs` |
| Postprocess | △ | `jsx/postprocess.rs` |

### Phase 2: DOM 核心 (进行中)

| 任务 | 状态 | 说明 |
|------|------|------|
| 元素转换 | ✓ | `transform_element_dom` |
| 属性处理 | △ | 需完善 spread 处理 |
| 事件处理 | ✓ | `events.rs` |
| 子节点处理 | △ | 需完善 marker 处理 |
| 代码生成 | △ | 需完善 effect 包装 |
| Fragment 支持 | △ | `fragment.rs` |
| 模板复用 | ○ | 待实现 |

### Phase 3: 高级特性 (待实现)

| 任务 | 说明 | 依赖 |
|------|------|------|
| 组件处理 | `transform_component`、`getter props` | Phase 2 |
| 条件包装 | 条件/逻辑表达式 memo 包装 | Phase 3.1 |
| Spread 属性 | `processSpreads`、`spread()` | Phase 2 |
| classList 处理 | 对象展开为 `class:` 前缀 | Phase 2 |
| 样式内联 | 静态样式对象内联到模板 | Phase 2 |
| 合并 class 属性 | 多个 `class` 属性合并 | Phase 2 |
| 静态值内联 | 编译期常量折叠 | Phase 1 |

### Phase 4: SSR 支持 (待创建)

| 任务 | 说明 | 依赖 |
|------|------|------|
| SSR 编译器 crate | 创建 `compiler-ssr` | Phase 1 |
| SSR 元素转换 | `transform_element_ssr` | Phase 4.1 |
| SSR 属性处理 | `ssrAttribute`、`ssrClassList`、`escape` | Phase 4.1 |
| SSR 模板生成 | `generate_ssr_template_declarations` | Phase 4.1 |
| SSR 水合 | `data-hk` 生成、`getNextElement` | Phase 4.2 |

### Phase 5: 优化与测试 (待实现)

| 任务 | 说明 | 依赖 |
|------|------|------|
| 模板复用 | 相同模板合并 | Phase 2 |
| 空标记优化 | 移除不必要的 `<!---->` | Phase 2 |
| 单元测试 | 核心转换逻辑测试 | Phase 1-4 |
| 集成测试 | 端到端编译测试 | Phase 5.1 |
| 模板验证 | `isInvalidMarkup` | Phase 1 |

---

## 9. 关键算法详解

### 9.1 动态性检测 (Rust 实现)

```rust
// crates/compiler-core/src/jsx/utils.rs

/// 动态性检测配置
#[derive(Debug, Clone, Default)]
pub struct CheckConfig {
    pub check_member: bool,
    pub check_tags: bool,
    pub check_call_expressions: bool,
    pub native: bool,  // SSR 模式下禁用某些检查
}

impl CheckConfig {
    pub fn default_dom() -> Self {
        Self {
            check_member: true,
            check_tags: true,
            check_call_expressions: true,
            native: false,
        }
    }

    pub fn ssr() -> Self {
        Self {
            check_member: false,
            check_tags: true,
            check_call_expressions: false,
            native: true,
        }
    }
}

/// 检测表达式是否为动态（基于 AST 类型和配置）
pub fn is_dynamic_expression<'a>(expr: &Expression<'a>, config: CheckConfig) -> bool {
    // 函数表达式 → 静态
    if matches!(
        expr,
        Expression::FunctionExpression(_)
            | Expression::ArrowFunctionExpression(_)
            | Expression::ClassExpression(_)
    ) {
        return false;
    }

    // 静态标记 → 静态
    if let Expression::TaggedTemplateExpression(tag) = expr {
        if let Expression::Identifier(ident) = &tag.tag {
            if ident.name.as_str() == "@once" {
                return false;
            }
        }
        if config.check_call_expressions {
            return true;
        }
    }

    // 调用表达式 → 动态
    if expr.is_call_expression() || matches!(expr, Expression::ChainExpression(_)) {
        return config.check_call_expressions;
    }

    // 成员访问 → 动态
    if expr.is_member_expression() {
        return config.check_member;
    }

    // JSX → 动态
    if expr.is_jsx() {
        return config.check_tags;
    }

    // 关键字 → 静态
    if matches!(
        expr,
        Expression::ThisExpression(_)
            | Expression::Super(_)
            | Expression::MetaProperty(_)
    ) {
        return false;
    }

    // 字面量 → 静态
    if expr.is_literal() {
        return false;
    }

    // 二元/一元/三元 → 递归检测操作数
    if let Expression::BinaryExpression(bin) = expr {
        return is_dynamic_expression(&bin.left, config.clone())
            || is_dynamic_expression(&bin.right, config.clone());
    }
    if let Expression::UnaryExpression(unary) = expr {
        return is_dynamic_expression(&unary.argument, config.clone());
    }
    if let Expression::ConditionalExpression(cond) = expr {
        return is_dynamic_expression(&cond.test, config.clone())
            || is_dynamic_expression(&cond.consequent, config.clone())
            || is_dynamic_expression(&cond.alternate, config.clone());
    }
    if let Expression::LogicalExpression(logical) = expr {
        return is_dynamic_expression(&logical.left, config.clone())
            || is_dynamic_expression(&logical.right, config.clone());
    }

    // 数组 → 检测任意元素
    if let Expression::ArrayExpression(arr) = expr {
        return arr.elements.iter().any(|e| {
            if let Some(expr) = e.as_expression() {
                is_dynamic_expression(expr, config.clone())
            } else {
                false
            }
        });
    }

    // 对象 → 检测属性值
    if let Expression::ObjectExpression(obj) = expr {
        return obj.properties.iter().any(|p| {
            match p {
                ObjectPropertyKind::ObjectProperty(prop) => {
                    is_dynamic_expression(&prop.value, config.clone())
                }
                ObjectPropertyKind::SpreadProperty(spread) => {
                    is_dynamic_expression(&spread.argument, config.clone())
                }
            }
        });
    }

    // 模板字符串 → 检测表达式部分
    if let Expression::TemplateLiteral(tmpl) = expr {
        return tmpl.expressions.iter().any(|e| {
            is_dynamic_expression(e, config.clone())
        });
    }

    // 其他 → 保守地视为动态
    true
}
```

### 9.2 HTML 转义

```rust
/// HTML 转义
pub fn escape_html(s: &str, for_attr: bool) -> String {
    let mut result = String::with_capacity(s.len());

    for ch in s.chars() {
        match ch {
            '<' => result.push_str("&lt;"),
            '>' => result.push_str("&gt;"),
            '&' => result.push_str("&amp;"),
            '"' if for_attr => result.push_str("&quot;"),
            '\'' if for_attr => result.push_str("&#39;"),
            '\n' if !for_attr => result.push_str("&#10;"),
            '\r' => {}
            c => result.push(c),
        }
    }

    result
}
```

### 9.3 事件名转换

```rust
/// 将 JSX 事件属性名转换为 DOM 事件名
/// onClick → click
/// onMouseEnter → mouseenter
/// onFocus → focus
pub fn to_event_name(name: &str) -> String {
    if name.len() > 2 && name.starts_with("on") {
        name[2..].to_lowercase()
    } else {
        name.to_lowercase()
    }
}
```

---

## 10. 测试策略

### 10.1 单元测试

```rust
// crates/compiler-core/src/jsx/__tests__/transform_tests.rs

#[cfg(test)]
mod transform_tests {
    use crate::jsx::{
        config::{JsxConfig, GenerateMode},
        state::JsxCompilerState,
        transform::JsxTransformer,
        ir::{Renderer, AttrBindingKind},
    };
    use crate::jsx_test_helpers::*;

    fn parse_and_transform(source: &str) -> TransformResult {
        let allocator = Allocator::default();
        let ret = Parser::new(&allocator, source, SourceType::jsx()).parse();
        let mut program = ret.program;
        let config = JsxConfig::default();
        let mut state = JsxCompilerState::new(config);
        // ... 执行转换
        TransformResult { state, output: generate_output(&mut program) }
    }

    #[test]
    fn test_simple_static_element() {
        let result = parse_and_transform("<div class=\"container\">Hello</div>");
        assert!(!result.state.templates.is_empty());
        assert_eq!(result.state.templates[0].html, "<div class=\"container\">Hello</div>");
    }

    #[test]
    fn test_dynamic_attribute() {
        let result = parse_and_transform(r#"<div class={name}>Hello</div>"#);
        assert!(result.state.registered_helpers.iter().any(|(n, _)| n == "effect"));
    }

    #[test]
    fn test_event_delegation() {
        let result = parse_and_transform(r#"<button onClick={handle}>Click</button>"#);
        assert!(result.state.delegated_events.iter().any(|e| e.as_str() == "click"));
    }

    #[test]
    fn test_dynamic_child() {
        let result = parse_and_transform(r#"<div>{count}</div>"#);
        assert!(result.state.registered_helpers.iter().any(|(n, _)| n == "insert"));
    }

    #[test]
    fn test_component() {
        let result = parse_and_transform("<MyComponent title={title} />");
        assert!(result.state.registered_helpers.iter().any(|(n, _)| n == "createComponent"));
    }

    #[test]
    fn test_ssr_mode() {
        let mut config = JsxConfig::default();
        config.generate = GenerateMode::Ssr;
        let result = parse_and_transform_with_config("<div>{count}</div>", config);
        assert!(!result.state.registered_helpers.iter().any(|(n, _)| n == "insert"));
    }
}
```

---

## 附录 A: dom-expressions → Zeus 命名映射

| dom-expressions (JS) | Zeus (Rust) |
|----------------------|-------------|
| `transformElement` | `transform_element_dom` |
| `transformComponent` | `transform_component` |
| `createTemplate` | `generate_element_code` |
| `registerImportMethod` | `state.register_helper` |
| `DelegatedEvents` | `DELEGATED_EVENTS` |
| `VoidElements` | `VOID_ELEMENTS` |
| `BooleanAttributes` | `BOOLEAN_ATTRIBUTES` |
| `Properties` | `DOM_PROPERTIES` |
| `ChildProperties` | `CHILD_PROPERTIES` |
| `SVGElements` | `SVG_ELEMENTS` |
| `isDynamic` | `is_dynamic_expression` |
| `isComponent` | `is_component` |
| `escapeHTML` | `escape_html` |
| `trimWhitespace` | `normalize_whitespace` |
| `filterChildren` | `is_useless_child` |
| `transformCondition` | `wrap_conditional_expr` |
| `getTagName` | `get_jsx_tag_name` |
| `toEventName` | `to_event_name` |
| `registerTemplate` | `state.templates.push` |
| `appendTemplates` | `generate_template_declarations` |

---

## 附录 B: oxc 0.123.0 变更说明

### B.1 版本信息

| Crate | 版本 | 发布日期 | MSRV |
|-------|------|----------|------|
| `oxc` | **0.123.0** | 2026-03-30 | **Rust 1.92** |
| `oxc_allocator` | **0.123.0** | 2026-03-30 | Rust 1.92 |
| `oxc_ast` | **0.123.0** | 2026-03-30 | Rust 1.92 |
| `oxc_span` | **0.123.0** | 2026-03-30 | Rust 1.92 |
| `oxc_traverse` | **0.123.0** | 2026-03-30 | Rust 1.92 |
| `oxc_parser` | **0.123.0** | 2026-03-30 | Rust 1.92 |
| `oxc_semantic` | **0.123.0** | 2026-03-30 | Rust 1.92 |
| `oxc_codegen` | **0.123.0** | 2026-03-30 | Rust 1.92 |
| `oxc_diagnostics` | **0.123.0** | 2026-03-30 | Rust 1.92 |

> ⚠️ **MSRV 变更**：所有 oxc 0.122+ crate 的 MSRV 已从 `1.70` 大幅提升至 **`1.92`**。

### B.2 关键 API 变更

#### `traverse_mut` 签名变更

**旧签名（< 0.122）：**
```rust
traverse_mut(&mut pass, &allocator, &mut program, &mut state);
```

**新签名（>= 0.122）：**
```rust
let scoping = SemanticBuilder::new().build(&program).scoping;
let new_scoping = traverse_mut(
    &mut pass,
    &allocator,
    &mut program,
    scoping,
    state,
);
```

### B.3 Cargo.toml 依赖配置

```toml
[workspace.dependencies]
oxc = { version = "0.123.0", features = ["full"] }
oxc_allocator = { version = "0.123.0", features = ["pool"] }
oxc_ecmascript = { version = "0.123.0" }
oxc_semantic = { version = "0.123.0" }
oxc_minify_napi = { version = "0.123.0" }
oxc_parser_napi = { version = "0.123.0" }
oxc_span = { version = "0.123.0" }
oxc_transform_napi = { version = "0.123.0" }
oxc_traverse = { version = "0.123.0" }
oxc_ast = { version = "0.123.0" }
oxc_parser = { version = "0.123.0" }
oxc_codegen = { version = "0.123.0" }
oxc_diagnostics = { version = "0.123.0" }
oxc_syntax = { version = "0.123.0" }
```

---

## 总结

本设计文档基于 `dom-expressions` 的成熟方案，结合 Zeus 编译器的现有实现，提供了一套完整的 JSX 编译器绣化方案。核心要点：

1. **零虚拟 DOM 开销**：通过模板复用和精细化响应式系统，实现极致性能
2. **编译时确定性**：准确判断每个表达式的动态性，生成最优代码
3. **三种渲染模式**：DOM、SSR、Universal 统一编译管道
4. **事件委托优化**：减少事件监听器数量，提升性能
5. **oxc 0.123.0 支持**：基于最新的 traverse API 实现

**下一步工作**：
- 完善 DOM 核心编译（属性处理、子节点处理）
- 实现组件转换的完整支持
- 创建 `compiler-ssr` crate
- 添加完整的测试覆盖
