//! 编译器通用类型定义

/// DOM 遍历步骤
#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub enum TraversalStep {
    /// 获取第一个子节点
    FirstChild,
    /// 获取下一个兄弟节点
    NextSibling,
}

impl TraversalStep {
    /// 转换为代码字符串
    pub fn to_code(&self) -> &'static str {
        match self {
            Self::FirstChild => ".firstChild",
            Self::NextSibling => ".nextSibling",
        }
    }
}

/// DOM 路径 - 用于定位 DOM 树中的元素节点
#[derive(Clone, Debug, PartialEq, Eq, Hash, Default)]
pub struct DomPath {
    /// 从根节点到目标节点的遍历步骤
    pub steps: Vec<TraversalStep>,
}

impl DomPath {
    /// 创建新的 DOM 路径
    pub fn new() -> Self {
        Self { steps: Vec::new() }
    }

    /// 添加第一个子节点步骤
    pub fn first_child(&mut self) {
        self.steps.push(TraversalStep::FirstChild);
    }

    /// 添加下一个兄弟节点步骤
    pub fn next_sibling(&mut self) {
        self.steps.push(TraversalStep::NextSibling);
    }

    /// 转换为代码字符串
    pub fn to_code(&self) -> String {
        let mut code = String::new();
        for step in &self.steps {
            code.push_str(step.to_code());
        }
        code
    }
}

/// 绑定类型
#[derive(Clone, Debug)]
pub enum BindingKind {
    /// 动态内容插入
    Insert {
        /// 表达式源代码
        expression_source: String,
    },
    /// 委托事件（绑定到元素属性）
    DelegatedEvent {
        /// 事件名称
        event_name: String,
        /// 处理函数源代码
        handler_source: String,
    },
    /// 直接事件（使用 addEventListener）
    DirectEvent {
        /// 事件名称
        event_name: String,
        /// 处理函数源代码
        handler_source: String,
    },
    /// HTML 属性
    Attribute {
        /// 属性名称
        name: String,
        /// 值源代码
        value_source: String,
        /// 是否为动态
        is_dynamic: bool,
    },
    /// 类名
    ClassName {
        /// 值源代码
        value_source: String,
        /// 是否为动态
        is_dynamic: bool,
    },
    /// 样式
    Style {
        /// 值源代码
        value_source: String,
        /// 是否为动态
        is_dynamic: bool,
    },
    /// DOM 引用
    Ref {
        /// 引用源代码
        ref_source: String,
        /// 是否为 DOM 引用
        is_dom_ref: bool,
    },
    /// 属性展开
    Spread {
        /// 属性对象源代码
        props_source: String,
    },
}

impl BindingKind {
    /// 检查是否为需要追踪的响应式依赖
    pub fn is_reactive(&self) -> bool {
        match self {
            Self::Insert { expression_source } => !expression_source.is_empty(),
            Self::DelegatedEvent { .. } => true,
            Self::DirectEvent { .. } => true,
            Self::Attribute { is_dynamic, .. } => *is_dynamic,
            Self::ClassName { is_dynamic, .. } => *is_dynamic,
            Self::Style { is_dynamic, .. } => *is_dynamic,
            Self::Ref { .. } => false,
            Self::Spread { .. } => true,
        }
    }
}

/// 绑定 - 描述一个动态更新
#[derive(Clone, Debug)]
pub struct Binding {
    /// DOM 路径
    pub path: DomPath,
    /// 绑定类型
    pub kind: BindingKind,
}

impl Binding {
    /// 创建新的绑定
    pub fn new(path: DomPath, kind: BindingKind) -> Self {
        Self { path, kind }
    }

    /// 创建动态内容插入绑定
    pub fn insert(path: DomPath, expression_source: String) -> Self {
        Self::new(path, BindingKind::Insert { expression_source })
    }

    /// 创建委托事件绑定
    pub fn delegated_event(path: DomPath, event_name: String, handler_source: String) -> Self {
        Self::new(path, BindingKind::DelegatedEvent { event_name, handler_source })
    }

    /// 创建直接事件绑定
    pub fn direct_event(path: DomPath, event_name: String, handler_source: String) -> Self {
        Self::new(path, BindingKind::DirectEvent { event_name, handler_source })
    }

    /// 创建属性绑定
    pub fn attribute(path: DomPath, name: String, value_source: String, is_dynamic: bool) -> Self {
        Self::new(path, BindingKind::Attribute { name, value_source, is_dynamic })
    }

    /// 创建类名绑定
    pub fn class_name(path: DomPath, value_source: String, is_dynamic: bool) -> Self {
        Self::new(path, BindingKind::ClassName { value_source, is_dynamic })
    }

    /// 创建样式绑定
    pub fn style(path: DomPath, value_source: String, is_dynamic: bool) -> Self {
        Self::new(path, BindingKind::Style { value_source, is_dynamic })
    }

    /// 创建引用绑定
    pub fn r#if(path: DomPath, ref_source: String, is_dom_ref: bool) -> Self {
        Self::new(path, BindingKind::Ref { ref_source, is_dom_ref })
    }

    /// 创建展开绑定
    pub fn spread(path: DomPath, props_source: String) -> Self {
        Self::new(path, BindingKind::Spread { props_source })
    }
}

/// 模板声明
#[allow(dead_code)]
#[derive(Clone, Debug)]
pub struct TemplateDecl {
    /// 模板变量名（如 "_tmpl$1"）
    pub name: String,
    /// HTML 内容
    pub html: String,
    /// 绑定列表
    pub bindings: Vec<Binding>,
}

impl TemplateDecl {
    /// 创建新的模板声明
    #[allow(dead_code)]
    pub fn new(name: impl Into<String>, html: impl Into<String>) -> Self {

        Self {
            name: name.into(),
            html: html.into(),
            bindings: Vec::new(),
        }
    }

    /// 添加绑定
    #[allow(dead_code)]
    pub fn add_binding(&mut self, binding: Binding) {
        self.bindings.push(binding);
    }
}

/// 模板中间表示（TemplateIR）
///
/// 连接模板分析和代码生成的核心数据结构
#[derive(Clone, Debug, Default)]
pub struct TemplateIR {
    /// 静态 HTML 模板字符串
    pub html: String,
    /// 模板变量名（如 "_tmpl$1"）
    pub template_var: String,
    /// 动态绑定列表
    pub bindings: Vec<Binding>,
    /// 委托事件名称列表
    pub delegated_events: Vec<String>,
}

impl TemplateIR {
    /// 创建新的模板 IR
    pub fn new() -> Self {
        Self::default()
    }

    /// 添加绑定
    pub fn add_binding(&mut self, binding: Binding) {
        self.bindings.push(binding);
    }

    /// 添加委托事件
    pub fn add_delegated_event(&mut self, event: impl Into<String>) {
        let event = event.into();
        if !self.delegated_events.contains(&event) {
            self.delegated_events.push(event);
        }
    }
}
