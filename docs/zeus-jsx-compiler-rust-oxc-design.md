# Zeus JSX 编译器绣化方案

> 基于 `dom-expressions` 分析 + Zeus 现有编译器架构

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
| AST 分析 | Babel traverse | oxc_traverse |
| 代码生成 | Babel AST builder | oxc_codegen |
| 动态性判断 | JS 深度遍历 | Rust 递归遍历 |
| 模板字符串 | Babel template literal | oxc_allocator + Atom |
| 表达式源码 | Babel evaluate() | oxc_semantic + evaluate |
| SSR 同构 | 独立 `ssr/*` 模块 | `compiler-ssr` crate |
| JSX Spread | Babel spread 处理 | Rust 属性收集 |

### 1.3 与现有 Zeus 编译器的关系

**当前 Zeus 编译器架构：**

```
crates/compiler-core/src/
  ├── parser.rs          → 使用 oxc_parser 解析
  ├── codegen.rs         → 简单的 sourcemap 生成
  └── traverse/
        ├── mod.rs       → 入口和状态管理
        ├── jsx.rs       → JSX→模板 IR (雏形)
        ├── state.rs     → 编译器状态
        └── control_flow.rs → if→ternary 转换

crates/compiler-dom/src/
  ├── jsx/
  │     ├── mod.rs      → DOM 特定扩展
  │     ├── element.rs   → DOM 元素转换
  │     └── template.rs → DOM 模板生成
  └── codegen/
        └── mod.rs      → Babel 风格代码生成
```

**绣化后的目标架构：**

```
crates/compiler-core/src/
  └── jsx/                    ← NEW: 统一 JSX 编译核心
        ├── mod.rs           → 入口和导出
        ├── config.rs        → 配置系统
        ├── state.rs         → 编译器状态
        ├── ir.rs            → 中间表示定义
        ├── constants.rs     → 常量定义
        ├── utils.rs         → 工具函数
        ├── preprocess.rs    → 预处理
        ├── postprocess.rs   → 后处理
        ├── transform.rs     → 核心转换逻辑
        ├── component.rs     → 组件转换
        ├── fragment.rs      → Fragment 转换
        ├── condition.rs     → 条件表达式处理
        └── validate.rs     → 模板验证

crates/compiler-dom/src/jsx/    ← 扩展现有 jsx/
      ├── element.rs      → DOM 元素转换
      ├── template.rs     → DOM 模板生成
      ├── attributes.rs   → 属性处理
      ├── events.rs       → 事件委托
      ├── children.rs     → 子节点处理
      └── hydration.rs   → 水合支持

crates/compiler-ssr/src/         ← NEW: SSR 编译器
      └── jsx/
            ├── mod.rs
            ├── element.rs
            ├── template.rs
            └── hydration.rs

crates/compiler-universal/src/   ← NEW: 跨平台编译器
      └── jsx/
            ├── mod.rs
            ├── element.rs
            └── template.rs
```

---

## 2. 整体架构设计

### 2.1 编译管道

```
输入: JSX 源代码
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│ 阶段 1: 解析 (oxc_parser)                              │
│   └── Program<'a>                                       │
└─────────────────────────────────────────────────────────┘
  │
  ▼
┌─────────────────────────────────────────────────────────┐
│ 阶段 2: 语义分析 (可选, oxc_semantic)                   │
│   └── 作用域绑定、符号表                                 │
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
│ 阶段 4: 代码生成 (oxc_codegen)                         │
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

---

## 3. 核心数据结构

### 3.1 编译器配置

```rust
// crates/compiler-core/src/jsx/config.rs

/// JSX 编译器配置
#[derive(Debug, Clone)]
pub struct JsxConfig {
    /// 运行时模块名，默认为 "zeus/runtime-dom"
    pub module_name: Atom,
    /// 生成目标: "dom" | "ssr" | "universal"
    pub generate: GenerateMode,
    /// 是否支持水合
    pub hydratable: bool,
    /// 是否启用事件委托
    pub delegate_events: bool,
    /// 额外的委托事件列表
    pub delegated_events: Vec<Atom>,
    /// 内置组件列表 (如 For, Show, Switch, Index)
    pub built_ins: Vec<Atom>,
    /// 是否要求 @jsxImportSource 注释
    pub require_import_source: Option<Atom>,
    /// 是否包装条件表达式为 memo
    pub wrap_conditionals: bool,
    /// 省略最后一个闭合标签
    pub omit_last_closing_tag: bool,
    /// 省略属性引号 (安全时)
    pub omit_quotes: bool,
    /// 静态标记注释，默认为 "@once"
    pub static_marker: Atom,
    /// 副作用包装函数名，默认为 "effect"
    pub effect_wrapper: Atom,
    /// 记忆化包装函数名，默认为 "memo"
    pub memo_wrapper: Atom,
    /// 是否验证模板有效性
    pub validate: bool,
    /// 是否内联静态样式
    pub inline_styles: bool,
}

impl Default for JsxConfig {
    fn default() -> Self {
        Self {
            module_name: Atom::new("zeus/runtime-dom"),
            generate: GenerateMode::Dom,
            hydratable: false,
            delegate_events: true,
            delegated_events: Vec::new(),
            built_ins: vec![
                Atom::new("For"),
                Atom::new("Show"),
                Atom::new("Switch"),
                Atom::new("Match"),
                Atom::new("Index"),
                Atom::new("Portal"),
            ],
            require_import_source: None,
            wrap_conditionals: true,
            omit_last_closing_tag: true,
            omit_quotes: true,
            static_marker: Atom::new("@once"),
            effect_wrapper: Atom::new("effect"),
            memo_wrapper: Atom::new("memo"),
            validate: true,
            inline_styles: true,
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum GenerateMode {
    Dom,
    Ssr,
    Universal,
}
```

### 3.2 编译器状态

```rust
// crates/compiler-core/src/jsx/state.rs

/// 编译器状态，在 AST 遍历过程中累积
pub struct JsxCompilerState<'a> {
    /// 合并后的配置
    pub config: JsxConfig,
    /// 文件路径 (用于错误报告)
    pub source_file: Option<Atom>,
    /// 收集的模板声明
    pub templates: Vec<TemplateDecl<'a>>,
    /// 需要注册的事件名集合
    pub delegated_events: Vec<Atom>,
    /// 已注册的 helper 导入
    pub registered_helpers: Vec<(Atom, Atom)>, // (helper_name, module_name)
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
    pub fn new(config: JsxConfig) -> Self {
        Self {
            config,
            source_file: None,
            templates: Vec::new(),
            delegated_events: Vec::new(),
            registered_helpers: Vec::new(),
            in_jsx: false,
            depth: 0,
            template_counter: 0,
            element_counter: 0,
            placeholder_counter: 0,
            component_counter: 0,
            errors: Vec::new(),
        }
    }

    pub fn generate_template_name(&mut self) -> Atom {
        let name = Atom::new(&format!("_tmpl${}", self.template_counter));
        self.template_counter += 1;
        name
    }

    pub fn generate_element_name(&mut self) -> Atom {
        let name = Atom::new(&format!("_el${}", self.element_counter));
        self.element_counter += 1;
        name
    }

    pub fn next_placeholder_index(&mut self) -> usize {
        let idx = self.placeholder_counter;
        self.placeholder_counter += 1;
        idx
    }

    pub fn register_helper(&mut self, name: Atom, module_name: Option<Atom>) {
        let module = module_name.unwrap_or_else(|| self.config.module_name.clone());
        if !self.registered_helpers.contains(&(name.clone(), module.clone())) {
            self.registered_helpers.push((name, module));
        }
    }

    pub fn register_delegated_event(&mut self, event_name: Atom) {
        if !self.delegated_events.contains(&event_name) {
            self.delegated_events.push(event_name);
        }
    }
}

/// JSX 编译器错误
#[derive(Debug)]
pub struct JsxError {
    pub code: JsxErrorCode,
    pub span: Span,
    pub message: String,
}

#[derive(Debug)]
pub enum JsxErrorCode {
    InvalidSpread,
    InvalidNamespace,
    UnsupportedElement,
    InvalidMarker,
    TemplateMismatch,
    HydrationKeyError,
}
```

### 3.3 IR (中间表示)

```rust
// crates/compiler-core/src/jsx/ir.rs

/// 模板声明
#[derive(Debug)]
pub struct TemplateDecl<'a> {
    /// 模板变量名 (如 "_tmpl$0")
    pub name: Atom,
    /// 完整 HTML 字符串 (包含占位符)
    pub html: String,
    /// 模板片段数组 (用于 SSR 或拆分渲染)
    pub template_parts: Vec<Atom>,
    /// 是否为 SVG 元素
    pub is_svg: bool,
    /// 是否为自定义元素
    pub is_custom_element: bool,
    /// 是否使用 importNode (img/srcset, iframe/srcdoc)
    pub is_import_node: bool,
    /// 渲染器类型
    pub renderer: Renderer,
    /// 子节点绑定
    pub child_bindings: Vec<ChildBinding<'a>>,
    /// 属性绑定
    pub attr_bindings: Vec<AttrBinding<'a>>,
    /// 后置表达式 (水合事件等)
    pub post_exprs: Vec<Expression<'a>>,
    /// 是否跳过模板
    pub skip_template: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Renderer {
    Dom,
    Ssr,
    Universal,
}

impl Renderer {
    pub fn as_str(&self) -> &'static str {
        match self {
            Renderer::Dom => "dom",
            Renderer::Ssr => "ssr",
            Renderer::Universal => "universal",
        }
    }
}

/// 子节点绑定
#[derive(Debug, Clone)]
pub struct ChildBinding<'a> {
    /// 占位符索引 (用于模板中的 `<!--[0]-->` 定位)
    pub index: usize,
    /// 表达式 AST
    pub expression: Expression<'a>,
    /// 是否为文本节点
    pub is_text: bool,
    /// 是否有多个相邻兄弟 (需要 marker)
    pub needs_marker: bool,
}

/// 属性绑定
#[derive(Debug, Clone)]
pub struct AttrBinding<'a> {
    /// 属性名
    pub name: Atom,
    /// 属性名空间 (class, style, on, use, prop, attr, bool)
    pub namespace: Option<Atom>,
    /// 表达式 AST
    pub expression: Expression<'a>,
    /// 属性类型
    pub kind: AttrBindingKind,
    /// 是否为静态 (可内联到模板)
    pub is_static: bool,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AttrBindingKind {
    /// 普通 HTML 属性
    Attribute,
    /// DOM 属性 (如 checked, value, className)
    Property,
    /// 事件处理器 (onClick, onInput)
    Event,
    /// className 设置
    ClassName,
    /// classList 切换
    ClassList,
    /// 行内样式
    Style,
    /// style: 前缀 (单个样式属性)
    StyleProperty,
    /// class: 前缀 (单个 class 切换)
    ClassToggle,
    /// bool: 前缀 (布尔属性)
    BoolAttribute,
    /// attr: 前缀 (强制作为属性)
    ForceAttribute,
    /// ref 引用
    Ref,
    /// use: 指令
    Use,
    /// prop: 指令
    Prop,
    /// 展开属性
    Spread,
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
}

/// 模板标记类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MarkerKind {
    /// 动态子节点开始 `<!--[N]-->`
    DynamicChildStart,
    /// 动态子节点结束 `<!--/[N]-->`
    DynamicChildEnd,
    /// 空白占位符 `<!---->`
    EmptyPlaceholder,
    /// 水合标记 `<!--$-->`
    HydrationStart,
    /// 水合结束标记 `<!--/$-->`
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
```

### 3.4 常量定义

```rust
// crates/compiler-core/src/jsx/constants.rs

/// 自闭合 (Void) HTML 元素列表
pub const VOID_ELEMENTS: &[&str] = &[
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "keygen", "link", "menuitem", "meta", "param", "source", "track", "wbr",
];

/// 需要始终闭合的元素
pub const ALWAYS_CLOSE_ELEMENTS: &[&str] = &[
    "title", "style", "a", "strong", "small", "b", "u", "i", "em", "s",
    "code", "object", "table", "button", "textarea", "select", "iframe",
    "script", "noscript", "template", "fieldset",
];

/// 内联元素
pub const INLINE_ELEMENTS: &[&str] = &[
    "a", "abbr", "acronym", "b", "bdi", "bdo", "big", "br", "button",
    "canvas", "cite", "code", "data", "datalist", "del", "dfn", "em",
    "embed", "i", "iframe", "img", "input", "ins", "kbd", "label", "map",
    "mark", "meter", "noscript", "object", "output", "picture", "progress",
    "q", "ruby", "s", "samp", "script", "select", "slot", "small", "span",
    "strong", "sub", "sup", "svg", "template", "textarea", "time", "u",
    "tt", "var", "video",
];

/// 块级元素
pub const BLOCK_ELEMENTS: &[&str] = &[
    "address", "article", "aside", "blockquote", "dd", "details", "dialog",
    "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
    "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "li",
    "main", "menu", "nav", "ol", "p", "pre", "section", "table", "ul",
];

/// DOM 属性集合 (需要通过 property 赋值而非 setAttribute)
pub const DOM_PROPERTIES: phf::Set<&str> = phf::phf_set! {
    "className", "value", "readOnly", "noValidate", "formNoValidate",
    "isMap", "noModule", "playsInline", "allowFullscreen", "defaultChecked",
    "disabled", "hidden", "indeterminate", "multiple", "muted", "open",
    "required", "selected",
};

/// 子节点属性 (会替换子节点内容)
pub const CHILD_PROPERTIES: phf::Set<&str> = phf::phf_set! {
    "innerHTML", "innerText", "textContent", "children",
};

/// 布尔 HTML 属性 (存在即为 true)
pub const BOOLEAN_ATTRIBUTES: phf::Set<&str> = phf::phf_set! {
    "allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls",
    "default", "defer", "disabled", "formnovalidate", "hidden", "indeterminate",
    "inert", "ismap", "loop", "multiple", "muted", "nomodule", "novalidate",
    "open", "playsinline", "readonly", "required", "reversed", "selected",
};

/// SVG 元素集合
pub const SVG_ELEMENTS: phf::Set<&str> = phf::phf_set! {
    "altGlyph", "altGlyphDef", "circle", "clipPath", "defs", "ellipse",
    "feBlend", "feColorMatrix", "feComposite", "feConvolveMatrix",
    "feDiffuseLighting", "feDisplacementMap", "feDistantLight",
    "feDropShadow", "feFlood", "feGaussianBlur", "feImage", "feMerge",
    "feMergeNode", "feMorphology", "feOffset", "fePointLight",
    "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence",
    "filter", "font", "foreignObject", "g", "glyph", "glyphRef",
    "hkern", "image", "line", "linearGradient", "marker", "mask",
    "metadata", "missing-glyph", "mpath", "path", "pattern", "polygon",
    "polyline", "radialGradient", "rect", "set", "stop", "svg",
    "switch", "symbol", "text", "textPath", "tref", "tspan", "use",
    "view", "vkern",
};

/// SVG 命名空间
pub const SVG_NAMESPACES: phf::Map<&'static str, &'static str> = phf::phf_map! {
    "xlink" => "http://www.w3.org/1999/xlink",
    "xml"   => "http://www.w3.org/XML/1998/namespace",
    "xmlns" => "http://www.w3.org/2000/xmlns/",
};

/// 委托事件集合
pub const DELEGATED_EVENTS: phf::Set<&str> = phf::phf_set! {
    "beforeinput", "click", "dblclick", "contextmenu",
    "focusin", "focusout", "input", "keydown", "keyup",
    "mousedown", "mousemove", "mouseout", "mouseover", "mouseup",
    "pointerdown", "pointermove", "pointerout", "pointerover", "pointerup",
    "touchend", "touchmove", "touchstart",
};

/// 保留的命名空间前缀
pub const RESERVED_NAMESPACES: phf::Set<&str> = phf::phf_set! {
    "class", "on", "oncapture", "style", "use", "prop", "attr", "bool",
};

/// 属性别名 (React 兼容)
pub const ATTR_ALIASES: phf::Map<&'static str, &'static str> = phf::phf_map! {
    "className" => "class",
    "htmlFor"   => "for",
};
```

---

## 4. 编译阶段详细设计

### 4.1 Preprocess 阶段

```rust
// crates/compiler-core/src/jsx/preprocess.rs

pub struct JsxPreprocessor<'a> {
    source: &'a str,
    allocator: &'a Allocator,
}

impl<'a> JsxPreprocessor<'a> {
    /// 执行预处理：合并配置、验证输入
    pub fn run(
        program: &mut Program<'a>,
        source: &'a str,
        allocator: &'a Allocator,
        user_config: JsxConfig,
    ) -> JsxCompilerState<'a> {
        // 1. 合并配置
        let mut config = JsxConfig::default();
        self.merge_config(&mut config, user_config);

        // 2. 检测 @jsxImportSource 注释
        if let Some(ref lib) = config.require_import_source {
            let has_marker = /* 检查文件级注释 */;
            if !has_marker {
                return JsxCompilerState::new(config);
            }
        }

        // 3. 构建初始状态
        let mut state = JsxCompilerState::new(config);

        // 4. 检测 generate 模式
        self.detect_generate_mode(&mut state, program);

        state
    }
}
```

### 4.2 JSXElement/Fragment 转换

#### 4.2.1 核心转换入口

```rust
// crates/compiler-core/src/jsx/transform.rs

pub struct JsxTransformer<'a, 'ctx> {
    pub source: &'a str,
    pub allocator: &'a Allocator,
    pub ctx: &'ctx mut TraverseCtx<'a>,
    pub state: &'ctx mut JsxCompilerState<'a>,
}

impl<'a, 'ctx> JsxTransformer<'a, 'ctx> {
    /// 入口：处理 JSXElement
    pub fn transform_jsx_element(&mut self, node: &mut JSXElement) {
        let config = &self.state.config;
        let tag_name = self.get_jsx_tag_name(&node.opening_element.name);

        if self.is_component(&tag_name) {
            // 组件处理
            let result = transform_component(self, node);
            // 用组件调用替换
        } else {
            // 原生元素处理
            match config.generate {
                GenerateMode::Dom => {
                    let result = transform_element_dom(self, node);
                    self.finish_element_transform(node, result);
                }
                GenerateMode::Ssr => {
                    let result = transform_element_ssr(self, node);
                    self.finish_ssr_transform(node, result);
                }
                GenerateMode::Universal => {
                    let result = transform_element_universal(self, node);
                    self.finish_element_transform(node, result);
                }
            }
        }
    }

    /// 判断是否为组件
    fn is_component(&self, tag_name: &str) -> bool {
        // 规则1: 首字母大写
        if tag_name.chars().next().map(|c| c.is_uppercase()).unwrap_or(false) {
            return true;
        }
        // 规则2: 包含点号 (如 Foo.Bar)
        if tag_name.contains('.') {
            return true;
        }
        // 规则3: 非字母开头 (如 $dynamic, _private)
        if tag_name.chars().next().map(|c| !c.is_alphabetic()).unwrap_or(false) {
            return true;
        }
        false
    }

    /// 获取 JSX 元素的标签名
    fn get_jsx_tag_name(&self, name: &JSXElementName) -> String {
        match name {
            JSXElementName::Identifier(ident) => ident.name.to_string(),
            JSXElementName::MemberExpression(member) => {
                // Foo.Bar.Baz → "Foo.Bar.Baz"
                let mut parts = Vec::new();
                let mut current: &JSXMemberExpression = member;
                loop {
                    match current {
                        JSXMemberExpression::Identifier(ident) => {
                            parts.push(ident.name.to_string());
                            break;
                        }
                        JSXMemberExpression::MemberExpression(inner) => {
                            parts.push(inner.property.name.to_string());
                            current = inner.object.as_ref();
                        }
                        _ => break,
                    }
                }
                parts.reverse();
                parts.join(".")
            }
            JSXElementName::NamespacedName(ns) => {
                format!("{}:{}", ns.namespace.name, ns.property.name)
            }
        }
    }
}

/// 元素转换结果
pub struct ElementResult<'a> {
    /// 模板 HTML 字符串 (包含占位符)
    pub template: String,
    /// 模板片段数组 (SSR 用)
    pub template_parts: Vec<Atom>,
    /// 模板片段对应的表达式 (SSR 用)
    pub template_values: Vec<Expression<'a>>,
    /// 唯一元素引用名 (如 "_el$0")
    pub element_id: Option<Atom>,
    /// 声明语句列表
    pub declarations: Vec<Statement<'a>>,
    /// 表达式语句列表
    pub exprs: Vec<Expression<'a>>,
    /// 动态属性列表 (需要 effect 包装)
    pub dynamics: Vec<DynamicAttr<'a>>,
    /// 后置表达式
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

/// 动态属性描述
pub struct DynamicAttr<'a> {
    pub elem: Atom,
    pub key: Atom,
    pub value: Expression<'a>,
    pub is_svg: bool,
    pub is_ce: bool,
    pub tag_name: String,
}
```

#### 4.2.2 DOM 元素转换

```rust
// crates/compiler-dom/src/jsx/element.rs

pub fn transform_element_dom<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    node: &mut JSXElement,
) -> ElementResult<'a> {
    let state = transformer.state;
    let tag_name = transformer.get_jsx_tag_name(&node.opening_element.name);
    let config = &state.config;

    // 1. 检测 SVG 包装需求
    let wrap_svg = node.opening_element.name.get_inline_qualified_name()
        .map(|q| q.namespace.is_none() && SVG_ELEMENTS.contains(tag_name.as_str()))
        .unwrap_or(false);

    // 2. 检测自定义元素
    let is_custom_element = tag_name.contains('-')
        || node.opening_element.attributes.iter().any(|attr| {
            matches!(attr, JSXAttributeItem::Attribute(attr)
                if attr.name.name.as_atom() == "is")
        });

    // 3. 检测 importNode 使用
    let is_import_node = IMPORT_NODE_ELEMENTS.contains(tag_name.as_str())
        && node.opening_element.attributes.iter().any(|attr| {
            matches!(attr, JSXAttributeItem::Attribute(attr)
                if attr.name.name.as_atom() == "loading")
        });

    // 4. 检测自闭合元素
    let is_void = VOID_ELEMENTS.contains(tag_name.as_str());

    let mut result = ElementResult {
        template: String::new(),
        template_parts: Vec::new(),
        template_values: Vec::new(),
        element_id: None,
        declarations: Vec::new(),
        exprs: Vec::new(),
        dynamics: Vec::new(),
        post_exprs: Vec::new(),
        is_svg: wrap_svg,
        is_custom_element,
        is_import_node,
        tag_name: tag_name.clone(),
        renderer: Renderer::Dom,
        child_bindings: Vec::new(),
        attr_bindings: Vec::new(),
        skip_template: false,
        has_hydratable_event: false,
    };

    // 5. SVG 包装
    if wrap_svg {
        result.template.push_str("<svg>");
    }

    // 6. 标签开始
    result.template.push('<');
    result.template.push_str(&tag_name);

    // 7. 生成元素 ID
    if !config.hydratable || !result.skip_template {
        result.element_id = Some(state.generate_element_name());
    }

    // 8. 处理属性
    transform_attributes(transformer, node, &mut result);

    // 9. 闭合标签
    result.template.push('>');

    // 10. 处理子节点
    if !is_void && tag_name != "noscript" {
        transform_children(transformer, node, &mut result);
    }

    // 11. 闭合标签
    if !is_void {
        result.template.push_str("</");
        result.template.push_str(&tag_name);
        result.template.push('>');
    }

    // 12. SVG 包装闭合
    if wrap_svg {
        result.template.push_str("</svg>");
    }

    result
}
```

### 4.3 属性处理系统

```rust
// crates/compiler-dom/src/jsx/attributes.rs

/// 处理元素的全部属性
pub fn transform_attributes<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    node: &mut JSXElement,
    result: &mut ElementResult<'a>,
) {
    let state = transformer.state;
    let attributes = &mut node.opening_element.attributes;

    // 1. 检测是否有 Spread 属性
    let has_spread = attributes.iter().any(|attr| attr.is_spread_element());
    if has_spread {
        handle_spread_attributes(transformer, node, result, attributes);
        return;
    }

    // 2. 预处理：合并多个 class 属性
    merge_class_attributes(attributes);

    // 3. 遍历处理每个属性
    for attr_item in attributes.iter_mut() {
        match attr_item {
            JSXAttributeItem::Attribute(attr) => {
                handle_normal_attribute(transformer, attr, result);
            }
            JSXAttributeItem::SpreadAttribute(_) => {
                // 已在上面处理
            }
        }
    }
}

/// 分类属性
fn classify_attribute(
    name: &str,
    namespace: Option<&str>,
    tag_name: &str,
    is_svg: bool,
) -> AttrBindingKind {
    // 1. 检测事件
    if name.starts_with("on") && !name.contains(':') {
        return AttrBindingKind::Event;
    }
    // 2. 检测 ref
    if name == "ref" {
        return AttrBindingKind::Ref;
    }
    // 3. 检测 namespace 前缀
    if let Some(ns) = namespace {
        match ns {
            "style"  => AttrBindingKind::StyleProperty,
            "class"  => AttrBindingKind::ClassToggle,
            "bool"   => AttrBindingKind::BoolAttribute,
            "attr"   => AttrBindingKind::ForceAttribute,
            "prop"   => AttrBindingKind::Prop,
            "use"    => AttrBindingKind::Use,
            _ => AttrBindingKind::Attribute,
        }
    }
    // 4. 检测 classList
    if name == "classList" {
        return AttrBindingKind::ClassList;
    }
    // 5. 检测 style
    if name == "style" {
        return AttrBindingKind::Style;
    }
    // 6. 检测 class
    if name == "class" || name == "className" {
        return AttrBindingKind::ClassName;
    }
    // 7. 检测子节点属性
    if CHILD_PROPERTIES.contains(name) {
        return AttrBindingKind::Property;
    }
    // 8. 检测 DOM 属性
    if !is_svg && DOM_PROPERTIES.contains(name) {
        return AttrBindingKind::Property;
    }
    // 9. 默认为普通属性
    AttrBindingKind::Attribute
}

/// 处理普通属性绑定
fn handle_normal_attr_binding<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    result: &mut ElementResult<'a>,
    name: &str,
    value_opt: Option<&mut JSXAttributeValue<'a>>,
    kind: AttrBindingKind,
) {
    let state = transformer.state;
    let config = &state.config;

    if let Some(value) = value_opt {
        if let JSXAttributeValue::ExpressionContainer(expr_container) = value {
            let expr = &mut expr_container.expression;

            if is_dynamic_expression(expr, CheckConfig::default_dom()) {
                // 动态属性
                if kind.needs_effect() {
                    result.dynamics.push(DynamicAttr {
                        elem: result.element_id.clone().unwrap(),
                        key: Atom::new(name),
                        value: expr.clone(),
                        is_svg: result.is_svg,
                        is_ce: result.is_custom_element,
                        tag_name: result.tag_name.clone(),
                    });
                } else {
                    let call = build_set_attr_call(transformer, result, name, expr, kind);
                    result.exprs.push(call);
                }
            } else {
                // 静态值 → 内联到模板
                inline_static_attribute(result, name, expr);
            }
        }
    } else {
        // 无值属性 (如 <div disabled />)
        if BOOLEAN_ATTRIBUTES.contains(name) {
            result.template.push(' ');
            result.template.push_str(name);
        }
    }
}
```

### 4.4 事件委托系统

```rust
// crates/compiler-dom/src/jsx/events.rs

/// 处理事件属性
pub fn handle_event_attribute<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    result: &mut ElementResult<'a>,
    name: &str,
    value_opt: Option<&mut JSXAttributeValue<'a>>,
) {
    let state = transformer.state;
    let config = &state.config;
    let elem_id = result.element_id.as_ref().unwrap();

    // 1. 提取事件名 (onClick → click)
    let event_name = name[2..].to_lowercase();
    let full_event_key = format!("${}", event_name);

    // 2. 获取处理函数表达式
    let handler = extract_handler_expression(value_opt);

    // 3. 检测强制非委托模式 (on:click)
    if name.starts_with("on:") {
        state.register_helper(Atom::new("addEventListener"), None);
        let call = /* addEventListener(elem, eventName, handler) */;
        result.exprs.insert(0, call);
        return;
    }

    // 4. 检测是否可委托
    let can_delegate = config.delegate_events
        && DELEGATED_EVENTS.contains(event_name.as_str());

    if can_delegate {
        // 委托模式：赋值给 $click 属性
        result.has_hydratable_event = true;
        state.register_delegated_event(Atom::new(&event_name));

        let handler_type = detect_handler_type(&handler);

        match handler_type {
            HandlerType::StaticFunction | HandlerType::Resolvable => {
                // 直接赋值
                let assignment = Expression::AssignmentExpression(AssignmentExpression {
                    left: MemberExpression::from((
                        elem_id.clone(),
                        IdentifierReference { name: Atom::new(&full_event_key), ..Default::default() },
                    )),
                    operator: AssignmentOperator::Assign,
                    right: handler,
                    ..Default::default()
                });
                result.exprs.insert(0, Statement::ExpressionStatement {
                    expression: assignment,
                    ..Default::default()
                }.into());
            }
            HandlerType::Array => {
                // [handler, data] → 分别赋值 $click 和 $clickData
            }
            HandlerType::Dynamic => {
                // 需要 addEventListener
                state.register_helper(Atom::new("addEventListener"), None);
            }
        }
    } else {
        // 非委托模式
        state.register_helper(Atom::new("addEventListener"), None);
    }
}

/// 检测处理函数类型
enum HandlerType {
    StaticFunction,  // 函数表达式
    Resolvable,     // 可解析的 const 声明
    Array,          // [handler, data]
    Dynamic,        // 动态表达式
}

fn detect_handler_type(expr: &Expression) -> HandlerType {
    match expr {
        Expression::FunctionExpression(_) | Expression::ArrowFunctionExpression(_) => {
            HandlerType::StaticFunction
        }
        Expression::ArrayExpression(arr) if arr.elements.len() >= 1 => {
            HandlerType::Array
        }
        Expression::Identifier(ident) => {
            // 尝试解析绑定
            HandlerType::Dynamic
        }
        _ => HandlerType::Dynamic,
    }
}
```

### 4.5 子节点处理系统

```rust
// crates/compiler-dom/src/jsx/children.rs

/// 处理元素的子节点
pub fn transform_children<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    node: &mut JSXElement,
    result: &mut ElementResult<'a>,
) {
    let state = transformer.state;
    let config = &state.config;

    // 1. 过滤空白和空表达式
    let filtered: Vec<_> = node.children.iter_mut()
        .filter(|child| !is_useless_child(child))
        .collect();

    // 2. 查找最后一个元素节点
    let last_element_index = find_last_element_index(&filtered, config.hydratable);

    // 3. 确定是否需要 marker
    let needs_markers = config.hydratable && filtered.len() > 1;

    // 4. 处理每个子节点
    let mut temp_path = result.element_id.clone().unwrap().as_str().to_string();

    for (index, child) in filtered.iter_mut().enumerate() {
        let is_last = index == last_element_index;

        match child {
            JSXChild::Element(elem) => {
                let child_result = transform_element_dom(transformer, elem, &ElementOptions {
                    top_level: false,
                    last_element: is_last,
                    skip_id: !result.element_id.is_some()
                        || !detect_expressions(&filtered, index, config),
                    parent_to_be_closed: result.to_be_closed.clone(),
                });
                merge_child_result(result, child_result, &mut temp_path, index);
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
                let content = normalize_whitespace(&text.value);
                result.template.push_str(&escape_html(&content, false));
            }
            _ => {}
        }
    }
}

/// 处理动态表达式子节点
fn transform_expression_child<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    container: &mut JSXExpressionContainer<'a>,
    result: &mut ElementResult<'a>,
    index: usize,
    needs_markers: bool,
) -> Option<ChildBinding<'a>> {
    let state = transformer.state;
    let config = &state.config;
    let expr = &mut container.expression;

    // 空表达式
    if matches!(expr, Expression::EmptyExpression(_)) {
        return None;
    }

    // 检测动态性
    let is_dynamic = is_dynamic_expression(expr, CheckConfig::default_dom());

    if !is_dynamic {
        // 静态值 → 直接输出
        if let Some(lit) = evaluate_static_expression(expr) {
            return Some(ChildBinding {
                index: state.next_placeholder_index(),
                expression: Expression::StringLiteral(StringLiteral { value: Atom::new(lit), ..Default::default() }),
                is_text: true,
                needs_marker: false,
            });
        }
        return None;
    }

    let placeholder_idx = state.next_placeholder_index();

    // 添加 marker
    if needs_markers || wrapped_by_text(result, index) {
        result.template.push_str(&MarkerKind::DynamicChildStart.to_html(Some(placeholder_idx)));
    }

    // 检测条件表达式
    if config.wrap_conditionals && config.generate == GenerateMode::Dom {
        if matches!(expr, Expression::ConditionalExpression(_))
            || matches!(expr, Expression::LogicalExpression(_))
        {
            let wrapped = wrap_conditional_expr(transformer, expr);
            return Some(ChildBinding {
                index: placeholder_idx,
                expression: wrapped,
                is_text: false,
                needs_marker: true,
            });
        }
    }

    // 普通动态表达式
    Some(ChildBinding {
        index: placeholder_idx,
        expression: expr.clone(),
        is_text: false,
        needs_marker: true,
    })
}
```

### 4.6 组件处理

```rust
// crates/compiler-core/src/jsx/component.rs

/// 转换组件 JSXElement
pub fn transform_component<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    node: &mut JSXElement,
) -> ComponentResult<'a> {
    let state = transformer.state;
    let config = &state.config;

    // 1. 获取组件标识符
    let tag_id = convert_component_identifier(&node.opening_element.name);

    // 2. 检查内置组件
    if let Expression::Identifier(ident) = &tag_id {
        if config.built_ins.contains(&ident.name) {
            return transform_builtin_component(transformer, ident, node);
        }
    }

    // 3. 构建 props 对象
    let (props_expr, has_dynamic) = transform_component_props(transformer, node);

    // 4. 处理 children
    let children_result = transform_component_children(transformer, node);
    let final_props = /* 合并 children */;

    // 5. 注册 helpers
    state.register_helper(Atom::new("createComponent"), None);
    if has_dynamic {
        state.register_helper(Atom::new("mergeProps"), None);
    }

    // 6. 生成 createComponent 调用
    let call = Expression::CallExpression(CallExpression {
        callee: Expression::Identifier(IdentifierReference {
            name: Atom::new("createComponent"),
            ..Default::default()
        }),
        arguments: vec![tag_id.into(), final_props.into()],
        ..Default::default()
    });

    ComponentResult {
        expression: ChildExpr::Dynamic(call),
        dynamic: has_dynamic,
    }
}

/// 转换组件的 props (生成 getter 实现延迟求值)
fn transform_component_props<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    node: &mut JSXElement,
) -> (Expression<'a>, bool) {
    let state = transformer.state;
    let mut properties: Vec<ObjectProperty<'a>> = Vec::new();
    let mut spread_args: Vec<Expression<'a>> = Vec::new();
    let mut has_dynamic = false;

    for attr in node.opening_element.attributes.iter_mut() {
        match attr {
            JSXAttributeItem::Attribute(attr) => {
                let (key, value, is_dynamic) = transform_prop_attr(transformer, attr);
                has_dynamic = has_dynamic || is_dynamic;
                properties.push(ObjectProperty {
                    key: PropertyKey::Identifier(IdentifierReference { name: key, ..Default::default() }),
                    value: value.into(),
                    ..Default::default()
                });
            }
            JSXAttributeItem::SpreadAttribute(spread) => {
                spread_args.push(transform_spread_expression(transformer, spread));
            }
        }
    }

    // 合并 spread
    if !spread_args.is_empty() {
        /* ... */
        (merged, true)
    } else {
        (Expression::ObjectExpression(ObjectExpression {
            properties: properties.into_iter().map(|p| p.into()).collect(),
            ..Default::default()
        }), has_dynamic)
    }
}

/// 转换单个 prop 属性为 getter (延迟求值)
/// 例如: title={title} → { get title() { return title; } }
fn transform_prop_attr<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    attr: &mut JSXAttribute<'a>,
) -> (Atom, Expression<'a>, bool) {
    let key = attr.name.name.clone();
    let value_opt = attr.value.as_mut();

    if let Some(value) = value_opt {
        if let JSXAttributeValue::ExpressionContainer(expr_container) = value {
            let expr = &mut expr_container.expression;

            if is_dynamic_expression(expr, CheckConfig { check_member: true, check_tags: true, .. }) {
                // 动态属性 → 生成 getter
                let getter_expr = Expression::ObjectExpression(ObjectExpression {
                    properties: vec![ObjectProperty {
                        key: PropertyKey::Identifier(IdentifierReference { name: key, ..Default::default() }),
                        value: Expression::Getter(Getter {
                            body: FunctionBody {
                                statements: vec![Statement::ReturnStatement(ReturnStatement {
                                    argument: Some(expr.clone()),
                                    ..Default::default()
                                })],
                                ..Default::default()
                            },
                            ..Default::default()
                        }),
                        ..Default::default()
                    }.into()],
                    ..Default::default()
                });
                return (key, getter_expr, true);
            } else {
                return (key, expr.clone(), false);
            }
        }
    }

    (key, Expression::BooleanLiteral(BooleanLiteral { value: true, ..Default::default() }), false)
}
```

### 4.7 条件与循环处理

```rust
// crates/compiler-core/src/jsx/condition.rs

/// 包装条件表达式
/// 输入: {flag ? <A/> : <B/>}
/// 输出:
/// (() => {
///   const _c$0 = memo(() => flag);
///   return _c$0() ? <A/> : <B/>;
/// })()
pub fn wrap_conditional_expr<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    expr: &mut Expression<'a>,
) -> Expression<'a> {
    let state = transformer.state;
    let config = &state.config;

    match expr {
        Expression::ConditionalExpression(cond) => {
            let test = &mut cond.test;

            let d_test = is_dynamic_expression(test, CheckConfig { check_member: true, .. });

            if d_test {
                let memo_id = Atom::new(&format!("_c${}", state.component_counter));
                state.component_counter += 1;
                state.register_helper(Atom::new("memo"), None);

                // 创建 memo 包装
                let memo_call = Expression::CallExpression(CallExpression {
                    callee: Expression::Identifier(IdentifierReference {
                        name: config.memo_wrapper.clone(),
                        ..Default::default()
                    }),
                    arguments: vec![
                        Expression::ArrowFunctionExpression(ArrowFunctionExpression {
                            body: Box::new(test.clone().into()),
                            ..Default::default()
                        }).into(),
                    ],
                    ..Default::default()
                });

                // 变量声明
                let var_decl = Statement::VariableDeclaration(VariableDeclaration {
                    declarations: vec![VariableDeclarator {
                        id: BindingIdentifier { name: memo_id.clone(), ..Default::default() },
                        init: Some(memo_call.into()),
                        ..Default::default()
                    }],
                    ..Default::default()
                });

                // 用 _c$0() 替换测试条件
                let replacement_test = Expression::CallExpression(CallExpression {
                    callee: Expression::Identifier(IdentifierReference {
                        name: memo_id,
                        ..Default::default()
                    }),
                    arguments: vec![],
                    ..Default::default()
                });
                cond.test = replacement_test;

                // 包装函数
                let arrow_fn = Expression::ArrowFunctionExpression(ArrowFunctionExpression {
                    body: Box::new(Statement::BlockStatement(BlockStatement {
                        statements: vec![
                            var_decl,
                            Statement::ReturnStatement(ReturnStatement {
                                argument: Some(expr.clone().into()),
                                ..Default::default()
                            }),
                        ],
                        ..Default::default()
                    }).into()),
                    ..Default::default()
                });

                // 立即调用
                Expression::CallExpression(CallExpression {
                    callee: arrow_fn,
                    arguments: vec![],
                    ..Default::default()
                })
            } else {
                expr.clone()
            }
        }
        _ => expr.clone(),
    }
}
```

### 4.8 Postprocess 阶段

```rust
// crates/compiler-core/src/jsx/postprocess.rs

/// 执行后处理
pub fn postprocess<'a, 'ctx>(
    program: &mut Program<'a>,
    state: &mut JsxCompilerState<'a>,
    ctx: &mut TraverseCtx<'a>,
) {
    let allocator = ctx.ast.allocator;

    // 1. 注册 delegateEvents 调用
    if !state.delegated_events.is_empty() {
        let delegate_call = build_delegate_events_call(state, allocator);
        program.body.push(delegate_call);
    }

    // 2. 注册模板声明
    if !state.templates.is_empty() {
        let dom_templates: Vec<_> = state.templates.iter()
            .filter(|t| t.renderer == Renderer::Dom)
            .collect();
        let ssr_templates: Vec<_> = state.templates.iter()
            .filter(|t| t.renderer == Renderer::Ssr)
            .collect();

        if !dom_templates.is_empty() {
            let template_decls = generate_template_declarations(dom_templates, state, allocator);
            program.body.splice(0..0, template_decls);
        }
        if !ssr_templates.is_empty() {
            let template_decls = generate_ssr_template_declarations(ssr_templates, state, allocator);
            program.body.splice(0..0, template_decls);
        }
    }
}

/// 生成 delegateEvents 调用
fn build_delegate_events_call<'a>(
    state: &JsxCompilerState<'a>,
    allocator: &'a Allocator,
) -> Statement<'a> {
    let events: Vec<Expression<'a>> = state.delegated_events.iter()
        .map(|name| {
            Expression::StringLiteral(StringLiteral {
                value: name.clone(),
                ..Default::default()
            }).into()
        })
        .collect();

    Statement::ExpressionStatement {
        expression: Expression::CallExpression(CallExpression {
            callee: Expression::Identifier(IdentifierReference {
                name: Atom::new("delegateEvents"),
                ..Default::default()
            }),
            arguments: vec![
                Expression::ArrayExpression(ArrayExpression {
                    elements: events,
                    ..Default::default()
                }).into(),
            ],
            ..Default::default()
        }),
        ..Default::default()
    }
}
```

---

## 5. 代码生成器设计

```rust
// crates/compiler-core/src/jsx/codegen/mod.rs

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
                name: result.template_name.clone(),
                ..Default::default()
            }),
            arguments: vec![],
            ..Default::default()
        });
    }

    // 2. 收集所有语句
    let mut statements: Vec<Statement<'a>> = Vec::new();
    statements.extend(result.declarations);
    statements.extend(result.exprs.into_iter().map(|e| {
        Statement::ExpressionStatement { expression: e, ..Default::default() }
    }));

    // 3. 包装动态属性为 effect
    if !result.dynamics.is_empty() {
        let effect_stmt = generate_effect_wrapper(state, result.dynamics, allocator);
        statements.push(effect_stmt);
    }

    // 4. 后置表达式
    statements.extend(result.post_exprs.into_iter().map(|e| {
        Statement::ExpressionStatement { expression: e, ..Default::default() }
    }));

    // 5. 返回元素
    if let Some(elem_id) = &result.element_id {
        statements.push(Statement::ReturnStatement {
            argument: Some(elem_id.clone().into()),
            ..Default::default()
        });
    }

    // 6. 包装为立即执行的箭头函数
    let fn_expr = Expression::ArrowFunctionExpression(ArrowFunctionExpression {
        expression: true,
        body: Box::new(Statement::BlockStatement(BlockStatement {
            statements,
            ..Default::default()
        }).into()),
        ..Default::default()
    });

    Expression::CallExpression(CallExpression {
        callee: fn_expr,
        arguments: vec![],
        ..Default::default()
    })
}

/// 生成 effect 包装
/// 单个动态属性:
/// ```js
/// effect(() => className(_el$, name()));
/// ```
/// 多个动态属性 (批量优化):
/// ```js
/// effect(
///   (_p$) => {
///     const v$0 = value1();
///     _p$._$0 !== v$0 && className(_el$, (_p$._$0 = v$0));
///     const v$1 = value2();
///     _p$._$1 !== v$1 && className(_el$, (_p$._$1 = v$1));
///     return _p$;
///   },
///   { _$0: undefined, _$1: undefined }
/// );
/// ```
fn generate_effect_wrapper<'a>(
    state: &JsxCompilerState<'a>,
    dynamics: Vec<DynamicAttr<'a>>,
    allocator: &'a Allocator,
) -> Statement<'a> {
    let config = &state.config;

    if dynamics.len() == 1 {
        let dyn = &dynamics[0];
        let effect_fn = /* 构建单个属性的 effect 函数 */;
        let effect_call = Expression::CallExpression(CallExpression {
            callee: Expression::Identifier(IdentifierReference {
                name: config.effect_wrapper.clone(),
                ..Default::default()
            }),
            arguments: vec![effect_fn.into()],
            ..Default::default()
        });
        Statement::ExpressionStatement { expression: effect_call, ..Default::default() }
    } else {
        let effect_fn = /* 构建批量 effect 函数 */;
        let init_obj = /* 构建初始值对象 */;
        let effect_call = Expression::CallExpression(CallExpression {
            callee: Expression::Identifier(IdentifierReference {
                name: config.effect_wrapper.clone(),
                ..Default::default()
            }),
            arguments: vec![effect_fn.into(), init_obj.into()],
            ..Default::default()
        });
        Statement::ExpressionStatement { expression: effect_call, ..Default::default() }
    }
}

/// 生成 DOM 模板声明
/// ```js
/// const _tmpl$0 = /*#__PURE__* / template(`<div class="container"><!----></div>`);
/// const _tmpl$1 = /*#__PURE__* / template(`<ul><li></li></ul>`, false, true); // isSVG
/// ```
pub fn generate_template_declarations<'a>(
    templates: &[TemplateDecl<'a>],
    state: &JsxCompilerState<'a>,
    allocator: &'a Allocator,
) -> Vec<Statement<'a>> {
    templates.iter().map(|tmpl| {
        let args = if tmpl.is_svg || tmpl.is_custom_element || tmpl.is_import_node {
            vec![
                template_literal(&tmpl.html, allocator),
                Expression::BooleanLiteral(BooleanLiteral { value: tmpl.is_import_node, ..Default::default() }).into(),
                Expression::BooleanLiteral(BooleanLiteral { value: tmpl.is_svg, ..Default::default() }).into(),
            ]
        } else {
            vec![template_literal(&tmpl.html, allocator).into()]
        };

        let pure_template_call = add_pure_annotation(
            Expression::CallExpression(CallExpression {
                callee: Expression::Identifier(IdentifierReference {
                    name: Atom::new("template"),
                    ..Default::default()
                }),
                arguments: args,
                ..Default::default()
            }),
            allocator,
        );

        Statement::VariableDeclaration(VariableDeclaration {
            declarations: vec![VariableDeclarator {
                id: BindingIdentifier { name: tmpl.name.clone(), ..Default::default() },
                init: Some(pure_template_call.into()),
                ..Default::default()
            }],
            kind: VariableDeclarationKind::Const,
            ..Default::default()
        })
    }).collect()
}
```

---

## 6. SSR 编译模式

```rust
// crates/compiler-ssr/src/jsx/element.rs

/// SSR 元素转换
pub fn transform_element_ssr<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    node: &mut JSXElement,
) -> SsrElementResult<'a> {
    let state = transformer.state;
    let tag_name = transformer.get_jsx_tag_name(&node.opening_element.name);

    let mut result = SsrElementResult {
        template_parts: Vec::new(),
        template_values: Vec::new(),
        declarations: Vec::new(),
        exprs: Vec::new(),
        tag_name: tag_name.clone(),
    };

    // SSR 模板构建：交替的字符串和表达式
    // 例如: ["<div class=\"", escape(class, true), "\">", content, "</div>"]
    result.template_parts.push(Atom::new(&format!("<{}", tag_name)));

    // 处理属性
    transform_ssr_attributes(transformer, node, &mut result);

    // 闭合标签
    result.template_parts.push(Atom::new(">").into());

    // 处理子节点
    transform_ssr_children(transformer, node, &mut result);

    // 闭合标签
    result.template_parts.push(Atom::new(&format!("</{}>", tag_name)).into());

    result
}

/// SSR 属性处理
fn transform_ssr_attributes<'a, 'ctx>(
    transformer: &mut JsxTransformer<'a, 'ctx>,
    node: &mut JSXElement,
    result: &mut SsrElementResult<'a>,
) {
    let state = transformer.state;

    for attr in node.opening_element.attributes.iter_mut() {
        // 类似 DOM 模式，但生成 SSR 特有的代码
        match attr {
            JSXAttributeItem::Attribute(attr) => {
                let name = attr.name.name.to_string();
                let value_opt = attr.value.as_mut();

                if let Some(value) = value_opt {
                    if let JSXAttributeValue::ExpressionContainer(expr_container) = value {
                        let expr = &mut expr_container.expression;

                        if name == "style" {
                            // ssrStyle()
                            let ssr_call = Expression::CallExpression(CallExpression {
                                callee: Expression::Identifier(IdentifierReference {
                                    name: Atom::new("ssrStyle"),
                                    ..Default::default()
                                }),
                                arguments: vec![expr.clone().into()],
                                ..Default::default()
                            });
                            result.template_parts.push(Atom::new(" style=\"").into());
                            result.template_values.push(ssr_call);
                        } else {
                            // escape()
                            let escaped = escape_expression(expr);
                            result.template_parts.push(Atom::new(&format!(" {}=\"", name)).into());
                            result.template_values.push(escaped);
                        }
                    }
                }
            }
            JSXAttributeItem::SpreadAttribute(_) => {
                // 使用 ssrElement() 处理 spread
            }
        }
    }
}

/// 生成 ssr() 调用
/// 输入: ["<div>", value, "</div>"]
/// 输出: ssr(_tmpl$0, () => value())
pub fn generate_ssr_template_call<'a>(
    state: &mut JsxCompilerState<'a>,
    parts: Vec<Atom>,
    values: Vec<Expression<'a>>,
    allocator: &'a Allocator,
) -> Expression<'a> {
    // 1. 注册模板
    let tmpl_name = state.generate_template_name();

    // 2. 生成 ssr() 调用
    let args: Vec<Expression<'a>> = std::iter::once(tmpl_name.clone().into())
        .chain(values.into_iter().map(|v| v.into()))
        .collect();

    Expression::CallExpression(CallExpression {
        callee: Expression::Identifier(IdentifierReference {
            name: Atom::new("ssr"),
            ..Default::default()
        }),
        arguments: args,
        ..Default::default()
    })
}
```

---

## 7. 水合支持

```rust
// crates/compiler-dom/src/jsx/hydration.rs

/// 生成水合兼容的模板声明
/// ```js
/// const _tmpl$0 = template(`<div><!--$--><!----><!--/$--></div>`);
/// const _el$ = getNextElement(_tmpl$0);
/// ```
pub fn generate_hydration_template<'a>(
    state: &mut JsxCompilerState<'a>,
    decl: &mut TemplateDecl<'a>,
    allocator: &'a Allocator,
) -> Vec<Statement<'a>> {
    let config = &state.config;

    // 1. 注册 getNextElement helper
    state.register_helper(Atom::new("getNextElement"), None);

    // 2. 添加水合标记到模板 HTML
    // 在动态子节点位置添加 <!--$--> 和 <!--/$-->
    let hydrated_html = add_hydration_markers_to_html(&decl.html);

    // 3. 生成声明
    let template_call = Expression::CallExpression(CallExpression {
        callee: Expression::Identifier(IdentifierReference {
            name: Atom::new("template"),
            ..Default::default()
        }),
        arguments: vec![template_literal(&hydrated_html, allocator).into()],
        ..Default::default()
    });

    let pure_template = add_pure_annotation(template_call, allocator);
    let elem_name = Atom::new(&format!("_el${}", state.element_counter));
    state.element_counter += 1;

    let element_call = Expression::CallExpression(CallExpression {
        callee: Expression::Identifier(IdentifierReference {
            name: Atom::new("getNextElement"),
            ..Default::default()
        }),
        arguments: vec![pure_template.into()],
        ..Default::default()
    });

    vec![
        Statement::VariableDeclaration(VariableDeclaration {
            declarations: vec![VariableDeclarator {
                id: BindingIdentifier { name: decl.name.clone(), ..Default::default() },
                init: Some(pure_template.into()),
                ..Default::default()
            }],
            kind: VariableDeclarationKind::Var,
            ..Default::default()
        }),
        Statement::VariableDeclaration(VariableDeclaration {
            declarations: vec![VariableDeclarator {
                id: BindingIdentifier { name: elem_name, ..Default::default() },
                init: Some(element_call.into()),
                ..Default::default()
            }],
            kind: VariableDeclarationKind::Var,
            ..Default::default()
        }),
    ]
}

/// 添加水合标记到 HTML
fn add_hydration_markers_to_html(html: &str) -> String {
    let mut result = html.to_string();

    // 查找所有 <!--[N]--> 占位符，在其前后添加水合标记
    // <div><!--[0]-->  →  <div><!--$[0]-->
    // <!--/[0]--></div>  →  <!--/[0]/$--></div>
    // ...
    // 或者更简单：在每个动态子节点位置添加 <!--$--> 和 <!--/$-->

    result
}
```

---

## 8. 实现路线图

### Phase 1: 基础设施 (1-2 周)

| 任务 | 描述 | 文件 |
|------|------|------|
| 常量定义迁移 | 将 JS/TS 常量转为 Rust phf 常量集 | `jsx/constants.rs` |
| 配置系统 | 实现 `JsxConfig`、`GenerateMode` | `jsx/config.rs` |
| 状态结构 | 实现 `JsxCompilerState` | `jsx/state.rs` |
| IR 定义 | 实现 `TemplateDecl`、`AttrBinding`、`ChildBinding` | `jsx/ir.rs` |
| 工具函数 | `is_component`、`get_tag_name`、`escape_html`、`to_event_name` | `jsx/utils.rs` |
| Preprocess | 配置合并、模式检测 | `jsx/preprocess.rs` |
| Postprocess | delegateEvents 生成、模板声明追加 | `jsx/postprocess.rs` |

### Phase 2: DOM 核心 (2-3 周)

| 任务 | 描述 | 依赖 |
|------|------|------|
| 元素转换 | `transform_element_dom` | Phase 1 |
| 属性处理 | 静态/动态属性分类和处理 | Phase 2.1 |
| 事件处理 | 委托/非委托事件 | Phase 2.2 |
| 子节点处理 | 静态文本、动态表达式、marker | Phase 2.3 |
| 代码生成 | `generate_element_code`、`generate_effect_wrapper` | Phase 2 |
| 模板生成 | `generate_template_declarations` | Phase 2 |
| Fragment 支持 | `<>...</>` 和 `<React.Fragment>` | Phase 2 |

### Phase 3: 高级特性 (2-3 周)

| 任务 | 描述 | 依赖 |
|------|------|------|
| 组件处理 | `transform_component`、`getter props` | Phase 2 |
| 条件包装 | 条件/逻辑表达式 memo 包装 | Phase 3.1 |
| Spread 属性 | `processSpreads`、`spread()` | Phase 2 |
| classList 处理 | 对象展开为 `class:` 前缀 | Phase 2 |
| 样式内联 | 静态样式对象内联到模板 | Phase 2 |
| 合并 class 属性 | 多个 `class` 属性合并 | Phase 2 |
| 静态值内联 | 编译期常量折叠 | Phase 1 |

### Phase 4: SSR 支持 (1-2 周)

| 任务 | 描述 | 依赖 |
|------|------|------|
| SSR 编译器 crate | 创建 `compiler-ssr` | Phase 1 |
| SSR 元素转换 | `transform_element_ssr` | Phase 4.1 |
| SSR 属性处理 | `ssrAttribute`、`ssrClassList`、`escape` | Phase 4.1 |
| SSR 模板生成 | `generate_ssr_template_declarations` | Phase 4.1 |
| SSR 水合 | `data-hk` 生成、`getNextElement` | Phase 4.2 |

### Phase 5: 优化与测试 (1-2 周)

| 任务 | 描述 | 依赖 |
|------|------|------|
| 模板复用 | 相同模板合并 | Phase 2 |
| 空标记优化 | 移除不必要的 `<!---->` | Phase 2 |
| 单元测试 | 核心转换逻辑测试 | Phase 1-4 |
| 集成测试 | 端到端编译测试 | Phase 5.1 |
| 模板验证 | `isInvalidMarkup` | Phase 1 |

### 预估时间汇总

| Phase | 时间 | 累计 |
|-------|------|------|
| Phase 1 | 1-2 周 | 1-2 周 |
| Phase 2 | 2-3 周 | 3-5 周 |
| Phase 3 | 2-3 周 | 5-8 周 |
| Phase 4 | 1-2 周 | 6-10 周 |
| Phase 5 | 1-2 周 | 7-12 周 |

**总计：约 7-12 周**（可并行 Phase 3 与 Phase 4，实际约 6-8 周）

---

## 9. 关键算法详解

### 9.1 动态性检测 (Rust 实现)

```rust
// crates/compiler-core/src/jsx/utils.rs

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
            check_member: false,  // SSR 中成员访问通常是静态的
            check_tags: true,
            check_call_expressions: false,
            native: true,
        }
    }
}

/// 检测表达式是否为动态
pub fn is_dynamic_expression<'a>(
    expr: &Expression<'a>,
    config: CheckConfig,
) -> bool {
    match expr {
        // 函数表达式 → 静态
        Expression::FunctionExpression(_)
        | Expression::ArrowFunctionExpression(_)
        | Expression::ClassExpression(_) => false,

        // 静态标记 → 静态
        Expression::TaggedTemplateExpression(tag)
            if has_static_marker(tag) => false,

        // 调用表达式 → 动态
        Expression::CallExpression(_)
        | Expression::OptionalCallExpression(_)
        | Expression::TaggedTemplateExpression(_) => {
            config.check_call_expressions
        }

        // 成员访问 → 动态
        Expression::MemberExpression(_)
        | Expression::OptionalMemberExpression(_)
        | Expression::PrivateMemberExpression(_) => {
            config.check_member
        }

        // JSX → 动态
        Expression::JSXElement(_) | Expression::JSXFragment(_) => {
            config.check_tags
        }

        // 关键字 → 静态
        Expression::ThisExpression(_)
        | Expression::Super(_)
        | Expression::MetaProperty(_) => false,

        // 字面量 → 静态
        Expression::NullLiteral(_)
        | Expression::BooleanLiteral(_)
        | Expression::NumberLiteral(_)
        | Expression::BigIntLiteral(_)
        | Expression::RegExpLiteral(_)
        | Expression::StringLiteral(_) => false,

        // 二元/一元/三元 → 递归检测操作数
        Expression::BinaryExpression(bin) => {
            is_dynamic_expression(&bin.left, config.clone())
                || is_dynamic_expression(&bin.right, config.clone())
        }
        Expression::UnaryExpression(unary) => {
            is_dynamic_expression(&unary.argument, config.clone())
        }
        Expression::ConditionalExpression(cond) => {
            is_dynamic_expression(&cond.test, config.clone())
                || is_dynamic_expression(&cond.consequent, config.clone())
                || is_dynamic_expression(&cond.alternate, config.clone())
        }
        Expression::LogicalExpression(logical) => {
            is_dynamic_expression(&logical.left, config.clone())
                || is_dynamic_expression(&logical.right, config.clone())
        }

        // 数组/对象 → 检测任意元素
        Expression::ArrayExpression(arr) => {
            arr.elements.iter().any(|e| {
                match e {
                    ArrayExpressionElement::Expression(expr) => {
                        is_dynamic_expression(expr, config.clone())
                    }
                    _ => false,
                }
            })
        }
        Expression::ObjectExpression(obj) => {
            obj.properties.iter().any(|p| {
                match p {
                    ObjectPropertyKind::ObjectProperty(prop) => {
                        is_dynamic_expression(&prop.value, config.clone())
                    }
                    ObjectPropertyKind::SpreadProperty(spread) => {
                        is_dynamic_expression(&spread.argument, config.clone())
                    }
                }
            })
        }

        // 模板字符串 → 检测表达式部分
        Expression::TemplateLiteral(tmpl) => {
            tmpl.expressions.iter().any(|e| {
                is_dynamic_expression(e, config.clone())
            })
        }

        // 其他 → 保守地视为动态
        _ => true,
    }
}
```

### 9.2 模板 HTML 生成

```rust
// crates/compiler-core/src/jsx/utils.rs

/// HTML 转义
pub fn escape_html(s: &str, for_attr: bool) -> String {
    let delim = if for_attr { '"' } else { '<' };
    let esc_delim = if for_attr { "&quot;" } else { "&lt;" };
    let mut result = String::with_capacity(s.len());

    for ch in s.chars() {
        match ch {
            '<'  => result.push_str("&lt;"),
            '>'  => result.push_str("&gt;"),
            '&'  => {
                // 避免双重转义
                result.push_str("&amp;");
            }
            '"' if for_attr => result.push_str("&quot;"),
            '\'' if for_attr => result.push_str("&#39;"),
            '\n' if !for_attr => result.push_str("&#10;"),
            '\r' => {} // CR 通常不需要
            c => result.push(c),
        }
    }

    result
}

/// 规范化空白文本
pub fn normalize_whitespace(text: &str) -> String {
    let text = text.replace('\r', "");

    if text.contains('\n') {
        // 跨行文本：去缩进并合并为单个空格
        text.split('\n')
            .enumerate()
            .map(|(i, line)| {
                if i == 0 {
                    line.trim_end()
                } else {
                    line.trim_start()
                }
            })
            .filter(|s| !s.is_empty())
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        // 单行：压缩空白
        text.split_whitespace().collect::<Vec<_>>().join(" ")
    }
}

/// 过滤无用的 JSX 子节点
pub fn is_useless_child(child: &JSXChild) -> bool {
    match child {
        // 空表达式 {}{% 空 %}
        JSXChild::ExpressionContainer(expr) => {
            matches!(expr.expression, Expression::EmptyExpression(_))
        }
        // 仅空白文本
        JSXChild::Text(text) => {
            text.value.chars().all(|c| c.is_whitespace())
        }
        _ => false,
    }
}
```

### 9.3 事件名转换

```rust
// crates/compiler-core/src/jsx/utils.rs

/// 将 JSX 事件属性名转换为 DOM 事件名
/// onClick → click
/// onMouseEnter → mouseenter
/// onFocus → focus
pub fn to_event_name(name: &str) -> String {
    // 去掉 "on" 前缀，转为小写
    name[2..].to_lowercase()
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

        // 应该有模板声明
        assert!(!result.state.templates.is_empty());
        assert_eq!(result.state.templates[0].html, "<div class=\"container\">Hello</div>");

        // 静态元素不需要 helpers
        assert!(!result.state.registered_helpers.iter().any(|(n, _)| n == "insert"));
        assert!(!result.state.registered_helpers.iter().any(|(n, _)| n == "effect"));
    }

    #[test]
    fn test_dynamic_attribute() {
        let result = parse_and_transform(r#"<div class={name}>Hello</div>"#);

        // 应该注册 effect 和 setAttribute/className
        assert!(result.state.registered_helpers.iter().any(|(n, _)| n == "effect"));
        assert!(result.state.templates[0].attr_bindings.iter().any(|a| {
            matches!(a.kind, AttrBindingKind::ClassName)
        }));
    }

    #[test]
    fn test_event_delegation() {
        let result = parse_and_transform(r#"<button onClick={handle}>Click</button>"#);

        // 应该注册 click 事件
        assert!(result.state.delegated_events.iter().any(|e| e.as_str() == "click"));
        // 应该注册 delegateEvents
        assert!(result.state.registered_helpers.iter().any(|(n, _)| n == "delegateEvents"));
    }

    #[test]
    fn test_dynamic_child() {
        let result = parse_and_transform(r#"<div>{count}</div>"#);

        // 应该注册 insert helper
        assert!(result.state.registered_helpers.iter().any(|(n, _)| n == "insert"));
        // 模板中应该有占位符
        assert!(result.state.templates[0].html.contains("<!--["));
        assert!(!result.state.templates[0].child_bindings.is_empty());
    }

    #[test]
    fn test_component() {
        let result = parse_and_transform("<MyComponent title={title} />");

        // 应该注册 createComponent
        assert!(result.state.registered_helpers.iter().any(|(n, _)| n == "createComponent"));
    }

    #[test]
    fn test_ssr_mode() {
        let mut config = JsxConfig::default();
        config.generate = GenerateMode::Ssr;

        let result = parse_and_transform_with_config("<div>{count}</div>", config);

        // SSR 不应该有 DOM helpers
        assert!(!result.state.registered_helpers.iter().any(|(n, _)| n == "insert"));
        assert!(!result.state.registered_helpers.iter().any(|(n, _)| n == "effect"));
        assert!(result.state.registered_helpers.iter().any(|(n, _)| n == "ssr"));
    }

    #[test]
    fn test_conditional_wrapper() {
        let result = parse_and_transform("<div>{flag ? <A/> : <B/>}</div>");

        // 应该注册 memo
        assert!(result.state.registered_helpers.iter().any(|(n, _)| n == "memo"));
    }

    #[test]
    fn test_classlist() {
        let result = parse_and_transform(
            r#"<div classList={{ active: isActive, disabled: isDisabled }}>Hi</div>"#
        );

        // 应该注册 classList helper
        assert!(result.state.registered_helpers.iter().any(|(n, _)| n == "classList"));
    }

    #[test]
    fn test_ref() {
        let result = parse_and_transform(r#"<div ref={el => console.log(el)} />"#);

        // 应该注册 use helper
        assert!(result.state.registered_helpers.iter().any(|(n, _)| n == "use"));
    }

    #[test]
    fn test_spread_attributes() {
        let result = parse_and_transform(r#"<div {...props} class="static" />"#);

        // 应该注册 spread 和 mergeProps helpers
        assert!(result.state.registered_helpers.iter().any(|(n, _)| n == "spread"));
        assert!(result.state.registered_helpers.iter().any(|(n, _)| n == "mergeProps"));
    }

    #[test]
    fn test_list_rendering() {
        let result = parse_and_transform(
            r#"<ul>{items.map(item => <li>{item}</li>)}</ul>"#
        );

        // 每个列表项应该有自己的模板
        assert!(result.state.templates.len() >= 2);
    }

    #[test]
    fn test_void_elements() {
        // 自闭合元素不应有闭合标签
        let result = parse_and_transform("<input type=\"text\" value={val} />");
        assert!(!result.state.templates[0].html.contains("</input>"));
    }

    #[test]
    fn test_svg_elements() {
        let result = parse_and_transform("<svg><circle cx={x} cy={y} r={r} /></svg>");
        assert!(result.state.templates[0].is_svg);
    }

    #[test]
    fn test_namespace_attributes() {
        let result = parse_and_transform(r#"<div style:color={color} />"#);
        // style: 前缀的属性应该有对应的 runtime 处理
    }
}
```

### 10.2 快照测试

```rust
#[test]
fn test_snapshot_simple() {
    let source = r#"
        import { render } from "@zeus-js/runtime-dom";
        function App() {
            const [count, setCount] = createSignal(0);
            return (
                <div class="container">
                    <h1>Count: {count()}</h1>
                    <button onClick={() => setCount(c => c + 1)}>
                        Increment
                    </button>
                </div>
            );
        }
        render(() => <App />, document.getElementById("root"));
    "#;

    let result = compile_jsx(source, JsxConfig::default());
    let output = generate_code(&result);

    // 使用 insta 进行快照测试
    assert_snapshot!("simple_counter", output);
}
```

### 10.3 集成测试

```rust
#[test]
fn test_end_to_end_ssr() {
    let source = r#"<div>{message}</div>"#;

    // DOM 编译
    let dom_result = compile_jsx_with_mode(source, GenerateMode::Dom);
    assert!(dom_result.templates.iter().any(|t| t.renderer == Renderer::Dom));

    // SSR 编译
    let ssr_result = compile_jsx_with_mode(source, GenerateMode::Ssr);
    assert!(ssr_result.templates.iter().any(|t| t.renderer == Renderer::Ssr));

    // 两者生成的代码应该不同，但语义等价
    let dom_output = generate_code(&dom_result);
    let ssr_output = generate_code(&ssr_result);

    assert!(dom_output.contains("template("));
    assert!(dom_output.contains("insert("));
    assert!(ssr_output.contains("ssr("));
}
```

---

## 附录：参考对照表

### A.1 dom-expressions → Zeus 命名映射

| dom-expressions (JS) | Zeus (Rust) |
|----------------------|-------------|
| `transformElement` | `transform_element_dom` |
| `transformComponent` | `transform_component` |
| `createTemplate` | `generate_element_code` |
| `registerImportMethod` | `state.register_helper` |
| `DelegatedEvents` | `DELEGATED_EVENTS` (phf::Set) |
| `VoidElements` | `VOID_ELEMENTS` (`&[&str]`) |
| `BooleanAttributes` | `BOOLEAN_ATTRIBUTES` (phf::Set) |
| `Properties` | `DOM_PROPERTIES` (phf::Set) |
| `ChildProperties` | `CHILD_PROPERTIES` (phf::Set) |
| `SVGElements` | `SVG_ELEMENTS` (phf::Set) |
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

### A.2 关键 Rust crates

| Crate | 用途 |
|-------|------|
| `oxc_allocator` | 内存分配器，AST 节点都通过它分配 |
| `oxc_ast` | AST 节点定义 |
| `oxc_span` | 源码位置（Span）和文件信息 |
| `oxc_traverse` | AST 遍历框架（`Traverse` trait） |
| `oxc_parser` | JSX/TS 解析器 |
| `oxc_semantic` | 语义分析（作用域、绑定） |
| `oxc_codegen` | 代码生成器 |
| `oxc_diagnostics` | 诊断信息 |
| `phf` | 编译期初始化的 HashMap/Set（高效静态查找） |

### A.3 核心 oxc_traverse 用法

> ⚠️ **版本迁移提示**：oxc 0.122+ 版本对 `traverse_mut` API 进行了重大重构。如果遇到编译错误，请参考附录 A.4。

```rust
use oxc_traverse::{traverse_mut, ReusableTraverseCtx, Traverse, TraverseCtx};

pub struct DomCompilerPass<'a, 'ctx> {
    source: &'a str,
    state: &'ctx mut JsxCompilerState<'a>,
}

impl<'a, 'ctx> Traverse<'a, JsxCompilerState<'a>> for DomCompilerPass<'a, 'ctx> {
    fn enter_program(
        &mut self,
        node: &mut Program<'a>,
        ctx: &mut TraverseCtx<'a, JsxCompilerState<'a>>,
    ) {
        self.preprocess(node, ctx);
    }

    fn enter_return_statement(
        &mut self,
        node: &mut ReturnStatement<'a>,
        ctx: &mut TraverseCtx<'a, JsxCompilerState<'a>>,
    ) {
        if let Some(arg) = node.argument.as_mut() {
            self.transform_jsx_in_expression(arg, ctx);
        }
    }

    fn enter_jsx_element(
        &mut self,
        node: &mut JSXElement<'a>,
        ctx: &mut TraverseCtx<'a, JsxCompilerState<'a>>,
    ) {
        self.collect_event_info(node);
    }

    fn exit_jsx_element(
        &mut self,
        node: &mut JSXElement<'a>,
        ctx: &mut TraverseCtx<'a, JsxCompilerState<'a>>,
    ) {
        self.transform_jsx_element(node, ctx);
    }
}

// 使用方式
pub fn compile(source: &str, config: JsxConfig) -> CompileResult {
    let allocator = Allocator::default();
    let ret = Parser::new(&allocator, source, SourceType::jsx()).parse();
    let mut program = ret.program;

    let mut state = JsxCompilerState::new(config);
    let mut pass = DomCompilerPass { source, state: &mut state };

    // 执行遍历（oxc 0.122+：traverse_mut 签名已变更为需要 Scoping）
    // 需要先通过 SemanticBuilder 构建 scoping
    let semantic = SemanticBuilder::new()
        .with_cfg(config.generate == GenerateMode::Universal)
        .build(&program);

    let scoping = semantic.scoping;

    // traverse_mut 返回更新后的 Scoping
    let scoping = traverse_mut(
        &mut pass,
        &allocator,
        &mut program,
        scoping,
        JsxCompilerState::new(config),
    );

    // postprocess
    postprocess(&mut program, &mut state);

    generate_code(&program, &state)
}
```

---

## 附录 A.4 oxc 0.122+ 版本迁移指南

### A.4.1 版本信息总览

> 📅 数据来源：[crates.io](https://crates.io/crates/oxc/versions) | 更新日期：2026-03-30

| Crate | 最新版本 | 发布日期 | MSRV | 备注 |
|-------|---------|---------|------|------|
| `oxc` | **0.123.0** | 2026-03-30 | **Rust 1.92** | 全量特性合集 |
| `oxc_allocator` | **0.123.0** | 2026-03-30 | Rust 1.92 | 内存分配器 |
| `oxc_ast` | **0.123.0** | 2026-03-30 | Rust 1.92 | AST 节点定义 |
| `oxc_span` | **0.123.0** | 2026-03-30 | Rust 1.92 | 源码位置管理 |
| `oxc_traverse` | **0.123.0** | 2026-03-30 | Rust 1.92 | AST 遍历框架（**有破坏性变更**） |
| `oxc_parser` | **0.123.0** | 2026-03-30 | Rust 1.92 | JSX/TS 解析器 |
| `oxc_semantic` | **0.123.0** | 2026-03-30 | Rust 1.92 | 语义分析 |
| `oxc_codegen` | **0.123.0** | 2026-03-30 | Rust 1.92 | 代码生成器 |
| `oxc_diagnostics` | **0.123.0** | 2026-03-30 | Rust 1.92 | 诊断信息 |
| `oxc_ecmascript` | **0.123.0** | 2026-03-30 | Rust 1.92 | ECMAScript 工具 |
| `oxc_transform_napi` | **0.123.0** | 2026-03-30 | Rust 1.92 | Transformer NAPI |
| `oxc_parser_napi` | **0.123.0** | 2026-03-30 | Rust 1.92 | Parser NAPI |
| `oxc_minify_napi` | **0.123.0** | 2026-03-30 | Rust 1.92 | Minifier NAPI |

> ⚠️ **MSRV 变更**：所有 oxc 0.122+ crate 的 MSRV（最低支持 Rust 版本）已从 `1.70` 大幅提升至 **`1.92`**。请确保开发环境的 Rust 版本 >= 1.92。

### A.4.2 oxc_traverse 0.122+ 破坏性变更详解

#### 变更 1：`traverse_mut` 签名变更

**旧签名（< 0.122）**：
```rust
// 不需要 Scoping 参数
traverse_mut(&mut pass, &allocator, &mut program, &mut state);
```

**新签名（>= 0.122）**：
```rust
// 需要显式传入 Scoping（从 SemanticBuilder 获取）
pub fn traverse_mut<'a, State, Tr: Traverse<'a, State>>(
    traverser: &mut Tr,
    allocator: &'a Allocator,
    program: &mut Program<'a>,
    scoping: Scoping,
    state: State,
) -> Scoping
```

**迁移方法**：需要先通过 `SemanticBuilder` 构建 `scoping`，再传入 `traverse_mut`：

```rust
use oxc_semantic::SemanticBuilder;

// 1. 构建语义分析（获取 Scoping）
let semantic = SemanticBuilder::new()
    .with_cfg(true)  // 按需开启 CFG 构建
    .build(&program);

let scoping = semantic.scoping;

// 2. 传入 Scoping 执行遍历
let new_scoping = traverse_mut(
    &mut pass,
    &allocator,
    &mut program,
    scoping,
    state,
);
```

#### 变更 2：`TraverseCtx::new` 已移除（不安全 API）

**旧代码（< 0.122，不推荐）**：
```rust
// ❌ 已移除：TraverseCtx::new 是 unsafe 的
let ctx = TraverseCtx::new(/* ... */);
```

**新方式**：使用 `ReusableTraverseCtx`：

```rust
use oxc_traverse::ReusableTraverseCtx;

// 创建可复用的 TraverseCtx 包装器
let reusable_ctx = ReusableTraverseCtx::new(state, scoping, allocator);

// 通过 traverse_mut_with_ctx 使用（如果需要多次遍历同一 AST）
// traverse_mut_with_ctx(&mut pass, &mut program, reusable_ctx);
```

> ⚠️ `TraverseCtx::new` 已被移除是因为直接创建 `TraverseCtx` 可能违反 `TraverseAncestry` 的安全不变量。如果确实需要在测试中访问原始 `TraverseCtx`，可以使用 `unsafe fn unwrap(self) -> TraverseCtx<'a, State>`，但必须确保不违反 Rust 的别名规则。

#### 变更 3：`TraverseCtx` 新增 scope 相关方法

`TraverseCtx` 在 0.122+ 新增了 scope 标志支持：

```rust
// 新增方法（0.122+）
ctx.scope()              // 获取当前 scope
ctx.ancestor_scope(n)    // 获取第 n 层祖先 scope
ctx.find_scope(...)      // 查找匹配的 scope
```

#### 变更 4：visitation order 对齐

oxc 0.122+ 对 `Traverse` 的访问顺序与 `Visit`/`VisitMut` 进行了对齐。如果之前依赖特定的访问顺序，可能需要调整代码。

### A.4.3 oxc_codegen 0.123.0 变更

**修复**：`JSXElement` 名称为空时（如 `<></>`），codegen 不会再错误输出 `<<>>`，而是正确输出 `<></>`。

### A.4.4 oxc_parser 0.123.0 变更

- **性能优化**：大量 parser 性能优化，包括 `Modifiers` 相关操作分支消除、栈上存储等
- **纯注释标记**：标记无法应用的纯注释（`/*#__PURE__*/` 等）

### A.4.5 oxc minifier 0.123.0 变更

- **新优化**：`x ? 1 : 0` → `+x` 或 `+!!x`（零成本布尔转换）
- **单次使用变量内联**：优化跨越非计算属性键的内联

### A.4.6 Cargo.toml 依赖升级建议

```toml
[workspace.dependencies]
# oxc crates — 统一使用 0.123.0（所有子 crate 版本同步）
oxc = { version = "0.123.0", features = [
  "ast_visit",
  "transformer",
  "minifier",
  "mangler",
  "semantic",
  "codegen",
  "serialize",
  "isolated_declarations",
  "regular_expression",
  "cfg",
] }
oxc_allocator    = { version = "0.123.0", features = ["pool"] }
oxc_ecmascript   = { version = "0.123.0" }
oxc_semantic     = { version = "0.123.0" }
oxc_minify_napi  = { version = "0.123.0" }
oxc_parser_napi  = { version = "0.123.0" }
oxc_span         = { version = "0.123.0" }
oxc_transform_napi = { version = "0.123.0" }
oxc_traverse     = { version = "0.123.0" }
oxc_ast          = { version = "0.123.0" }
oxc_parser       = { version = "0.123.0" }
oxc_codegen      = { version = "0.123.0" }
oxc_diagnostics  = { version = "0.123.0" }
```

> 💡 所有 oxc 子 crate 版本严格同步，发布时一起发版。升级时应将所有 crate 同步升级到同一版本号。
```
