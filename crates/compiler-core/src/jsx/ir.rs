//! JSX 编译器中间表示 (IR) 模块
//!
//! 定义模板声明、属性绑定，子节点绑定等核心数据结构

use oxc_ast::ast::Expression;

/// 渲染器类型
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Renderer {
    /// DOM 渲染器
    #[default]
    Dom,
    /// SSR 渲染器
    Ssr,
    /// Universal 渲染器
    Universal,
}

impl Renderer {
    /// 转换为字符串
    #[allow(dead_code)]
    pub fn as_str(&self) -> &'static str {
        match self {
            Renderer::Dom => "dom",
            Renderer::Ssr => "ssr",
            Renderer::Universal => "universal",
        }
    }
}

/// 模板标记类型
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum MarkerKind {
    /// 动态子节点开始
    DynamicChildStart,
    /// 动态子节点结束
    DynamicChildEnd,
    /// 空白占位符
    EmptyPlaceholder,
    /// 水合标记
    HydrationStart,
    /// 水合结束标记
    HydrationEnd,
}

impl MarkerKind {
    /// 转换为 HTML 字符串
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
    #[inline]
    pub fn needs_effect(&self) -> bool {
        matches!(
            self,
            Self::Property
            | Self::ClassName
            | Self::ClassList
            | Self::Style
            | Self::Event
            | Self::Ref
            | Self::Use
            | Self::StyleProperty
            | Self::ClassToggle
        )
    }

    /// 是否需要运行时 helper
    #[inline]
    #[allow(dead_code)]
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

/// 属性绑定
pub struct AttrBinding<'a> {
    /// 属性名
    pub name: String,
    /// 属性名空间 (class, style, on, use, prop, attr, bool)
    pub namespace: Option<String>,
    /// 表达式 AST
    pub expression: Expression<'a>,
    /// 属性类型
    pub kind: AttrBindingKind,
    /// 是否为静态 (可内联到模板)
    pub is_static: bool,
}

impl<'a> AttrBinding<'a> {
    /// 创建新的属性绑定
    #[allow(dead_code)]
    pub fn new(
        name: String,
        expression: Expression<'a>,
        kind: AttrBindingKind,
        is_static: bool,
    ) -> Self {
        Self {
            name,
            namespace: None,
            expression,
            kind,
            is_static,
        }
    }
}

/// 子节点绑定
pub struct ChildBinding<'a> {
    /// 占位符索引 (用于模板中的 `<!--[N]-->` 定位)
    pub index: usize,
    /// 表达式 AST
    pub expression: Expression<'a>,
    /// 是否为文本节点
    pub is_text: bool,
    /// 是否有多个相邻兄弟 (需要 marker)
    pub needs_marker: bool,
}

impl<'a> ChildBinding<'a> {
    /// 创建新的子节点绑定
    #[allow(dead_code)]
    pub fn new(index: usize, expression: Expression<'a>, is_text: bool) -> Self {
        Self {
            index,
            expression,
            is_text,
            needs_marker: false,
        }
    }
}

/// 模板声明
pub struct TemplateDecl<'a> {
    /// 模板变量名 (如 "_tmpl$0")
    pub name: String,
    /// 完整 HTML 字符串 (包含占位符)
    pub html: String,
    /// 模板片段数组 (用于 SSR 或拆分渲染)
    pub template_parts: Vec<String>,
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

impl<'a> TemplateDecl<'a> {
    /// 创建新的模板声明
    #[allow(dead_code)]
    pub fn new(name: String, html: String, renderer: Renderer) -> Self {
        Self {
            name,
            html,
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

    /// 检查是否有动态内容
    pub fn has_dynamic_content(&self) -> bool {
        !self.child_bindings.is_empty()
            || self.attr_bindings.iter().any(|b| !b.is_static && b.kind.needs_effect())
    }

    /// 检查是否有需要 effect 的属性
    #[allow(dead_code)]
    pub fn has_effect_attrs(&self) -> bool {
        self.attr_bindings.iter().any(|b| !b.is_static && b.kind.needs_effect())
    }
}

/// 元素转换结果
pub struct ElementResult<'a> {
    /// 模板 HTML 字符串 (包含占位符)
    pub template: String,
    /// 模板片段数组 (SSR 用)
    pub template_parts: Vec<String>,
    /// 模板片段对应的表达式 (SSR 用)
    pub template_values: Vec<Expression<'a>>,
    /// 唯一元素引用名 (如 "_el$0")
    pub element_id: Option<String>,
    /// 声明语句列表
    pub declarations: Vec<Expression<'a>>,
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

impl<'a> ElementResult<'a> {
    /// 创建默认的元素结果
    #[allow(dead_code)]
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

    /// 检查是否有动态内容
    pub fn has_dynamic(&self) -> bool {
        !self.dynamics.is_empty() || !self.child_bindings.is_empty() || !self.exprs.is_empty()
    }
}

/// 动态属性描述
pub struct DynamicAttr<'a> {
    /// 元素 ID
    pub elem: String,
    /// 属性名
    pub key: String,
    /// 值表达式 AST
    pub value: Expression<'a>,
    /// 是否为 SVG 元素
    pub is_svg: bool,
    /// 是否为自定义元素
    pub is_ce: bool,
    /// 标签名
    pub tag_name: String,
}

impl<'a> DynamicAttr<'a> {
    /// 创建新的动态属性
    #[allow(dead_code)]
    pub fn new(elem: String, key: String, value: Expression<'a>) -> Self {
        Self {
            elem,
            key,
            value,
            is_svg: false,
            is_ce: false,
            tag_name: String::new(),
        }
    }
}

/// 组件转换结果
pub struct ComponentResult<'a> {
    /// 生成的表达式
    pub expression: Expression<'a>,
    /// 是否有动态内容
    pub dynamic: bool,
}

impl<'a> ComponentResult<'a> {
    /// 创建新的组件结果
    #[allow(dead_code)]
    pub fn new(expression: Expression<'a>, dynamic: bool) -> Self {
        Self { expression, dynamic }
    }
}
