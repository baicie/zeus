//! 状态和数据结构模块
//!
//! 定义 AST 遍历和代码生成所需的中间数据结构

/// 编译目标（当前仅用于对齐设计文档）
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum Target {
    /// 浏览器 DOM
    #[default]
    Dom,
    /// 服务端渲染
    Ssr,
    /// Web Component
    WebComponent,
}

/// DOM 编译器状态
#[allow(dead_code)]
pub struct DomCompilerState {
    /// 模板计数器
    pub template_counter: usize,
    /// 收集的模板声明
    pub templates: Vec<TemplateDecl>,
    /// 委托事件
    pub delegated_events: Vec<String>,
    /// 使用的 helpers
    pub used_helpers: Vec<String>,
    /// 当前是否在 JSX 上下文中
    pub in_jsx: bool,
    /// 当前深度
    pub depth: usize,
    /// 当前正在处理的模板名（用于嵌套收集 binding）
    current_template: Option<String>,
    /// 当前模板的绑定（child 索引位置 → 表达式源码）
    current_child_bindings: Vec<ChildBinding>,
    /// 当前元素的子节点计数（用于生成 marker 路径）
    child_index: usize,
    /// 静态节点提升 - 静态 JSX 片段
    static_nodes: Vec<StaticNode>,
    /// 静态节点计数器
    static_node_counter: usize,
    /// 列表渲染信息
    list_renders: Vec<ListRender>,
    /// 待处理的转换（if → ternary）
    pub pending_transforms: Vec<PendingTransform>,
}

/// 待处理的转换信息
#[derive(Clone, Debug)]
pub struct PendingTransform {
    /// IfStatement 的位置
    pub if_span: Span,
    /// 转换后的三元表达式源代码
    pub ternary_code: String,
}

/// 静态节点（可提升到函数外部）
#[allow(dead_code)]
#[derive(Clone, Debug)]
pub struct StaticNode {
    /// 节点名称
    pub name: String,
    /// 静态 HTML 内容
    pub html: String,
    /// 是否可以提升
    pub hoistable: bool,
}

/// 列表渲染信息
#[derive(Clone, Debug)]
pub struct ListRender {
    /// 渲染名称
    pub name: String,
    /// 数组表达式
    pub array: String,
    /// 回调参数名（如 item, index）
    pub params: Vec<String>,
    /// JSX 模板
    pub template: String,
    /// 是否使用索引
    pub has_index: bool,
}

/// 子节点绑定
#[derive(Clone, Debug)]
pub struct ChildBinding {
    /// 在 children 数组中的索引
    pub index: usize,
    /// 表达式源代码
    pub expression: String,
    /// 是否为文本插值（如 `{count}`）
    pub is_text: bool,
}

impl DomCompilerState {
    /// 创建新的 DOM 编译器状态
    pub fn new() -> Self {
        Self {
            template_counter: 0,
            templates: Vec::new(),
            delegated_events: Vec::new(),
            used_helpers: Vec::new(),
            in_jsx: false,
            depth: 0,
            current_template: None,
            current_child_bindings: Vec::new(),
            child_index: 0,
            static_nodes: Vec::new(),
            static_node_counter: 0,
            list_renders: Vec::new(),
            pending_transforms: Vec::new(),
        }
    }

    /// 生成唯一的模板变量名
    pub fn generate_template_name(&mut self) -> String {
        self.template_counter += 1;
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut hasher = DefaultHasher::new();
        self.template_counter.hash(&mut hasher);
        std::time::Instant::now().hash(&mut hasher);
        let hash = (hasher.finish() % 10000) as usize;
        format!("_tmpl${}_{}", self.template_counter, hash)
    }

    /// 添加委托事件
    pub fn add_delegated_event(&mut self, event: &str) {
        if !self.delegated_events.contains(&event.to_string()) {
            self.delegated_events.push(event.to_string());
        }
    }

    /// 生成静态节点名称
    pub fn generate_static_node_name(&mut self) -> String {
        let name = format!("_static${}", self.static_node_counter);
        self.static_node_counter += 1;
        name
    }

    /// 检查是否可以提升为静态节点
    pub fn can_hoist(&self, html: &str) -> bool {
        !html.contains("<!--[") && !html.contains("${")
    }

    /// 添加列表渲染
    pub fn add_list_render(&mut self, render: ListRender) {
        self.list_renders.push(render);
        self.add_helper("renderList");
    }

    /// 检查是否是列表渲染模式
    pub fn is_list_pattern(&self, expr: &str) -> bool {
        expr.contains(".map(")
    }

    /// 添加使用的 helper
    pub fn add_helper(&mut self, helper: &str) {
        if !self.used_helpers.contains(&helper.to_string()) {
            self.used_helpers.push(helper.to_string());
        }
    }

    /// 开始处理一个新模板
    pub fn start_template(&mut self, name: String) {
        self.current_template = Some(name);
        self.current_child_bindings = Vec::new();
        self.child_index = 0;
    }

    /// 结束处理当前模板
    pub fn finish_template(&mut self) -> Vec<ChildBinding> {
        let bindings = std::mem::take(&mut self.current_child_bindings);
        self.current_template = None;
        bindings
    }

    /// 添加子节点绑定
    pub fn add_child_binding(&mut self, binding: ChildBinding) {
        self.current_child_bindings.push(binding);
    }

    /// 获取当前子节点索引并递增
    pub fn next_child_index(&mut self) -> usize {
        let idx = self.child_index;
        self.child_index += 1;
        idx
    }
}

impl Default for DomCompilerState {
    fn default() -> Self {
        Self::new()
    }
}

/// 单个模板声明
#[derive(Clone, Debug)]
pub struct TemplateDecl {
    /// 模板变量名
    pub name: String,
    /// HTML 内容
    pub html: String,
    /// 子节点绑定（用于 insert 调用）
    pub child_bindings: Vec<ChildBinding>,
    /// 属性绑定（用于 setAttribute/className/style）
    pub attr_bindings: Vec<AttrBinding>,
}

/// 属性绑定
#[derive(Clone, Debug)]
pub struct AttrBinding {
    /// 属性名
    pub name: String,
    /// 表达式源代码
    pub expression: String,
    /// 绑定类型
    pub kind: AttrBindingKind,
}

#[derive(Clone, Debug)]
pub enum AttrBindingKind {
    /// 普通属性
    Attribute,
    /// DOM property（如 value, checked, disabled）
    Property,
    /// 类名
    ClassName,
    /// 样式
    Style,
    /// 事件处理
    Event,
    /// 展开
    Spread,
}

/// 重新导出 oxc_span::Span
pub use oxc_span::Span;
