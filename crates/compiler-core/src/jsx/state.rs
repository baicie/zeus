//! JSX 编译器状态模块
//!
//! 定义编译器状态和错误处理

use crate::jsx::config::JsxConfig;
use crate::jsx::ir::TemplateDecl;

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
    pub registered_helpers: Vec<(String, String)>,
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
    /// 创建新的编译器状态
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

    /// 生成模板名称
    pub fn generate_template_name(&mut self) -> String {
        let name = format!("_tmpl${}", self.template_counter);
        self.template_counter += 1;
        name
    }

    /// 生成元素名称
    pub fn generate_element_name(&mut self) -> String {
        let name = format!("_el${}", self.element_counter);
        self.element_counter += 1;
        name
    }

    /// 生成组件名称
    #[allow(dead_code)]
    pub fn generate_component_name(&mut self) -> String {
        let name = format!("_c${}", self.component_counter);
        self.component_counter += 1;
        name
    }

    /// 获取下一个占位符索引
    pub fn next_placeholder_index(&mut self) -> usize {
        let idx = self.placeholder_counter;
        self.placeholder_counter += 1;
        idx
    }

    /// 注册 helper
    pub fn register_helper(&mut self, name: String, module_name: Option<String>) {
        let module = module_name.unwrap_or_else(|| self.config.module_name.clone());
        if !self.registered_helpers.contains(&(name.clone(), module.clone())) {
            self.registered_helpers.push((name, module));
        }
    }

    /// 注册委托事件
    pub fn register_delegated_event(&mut self, event_name: String) {
        if !self.delegated_events.contains(&event_name) {
            self.delegated_events.push(event_name);
        }
    }

    /// 添加模板声明
    pub fn add_template(&mut self, template: TemplateDecl<'a>) {
        self.templates.push(template);
    }

    /// 添加错误
    #[allow(dead_code)]
    pub fn add_error(&mut self, code: JsxErrorCode, message: String) {
        self.errors.push(JsxError { code, message });
    }

    /// 检查是否有错误
    pub fn has_errors(&self) -> bool {
        !self.errors.is_empty()
    }

    /// 进入 JSX 上下文
    pub fn enter_jsx(&mut self) {
        self.in_jsx = true;
        self.depth += 1;
    }

    /// 退出 JSX 上下文
    pub fn exit_jsx(&mut self) {
        self.depth = self.depth.saturating_sub(1);
        if self.depth == 0 {
            self.in_jsx = false;
        }
    }
}

impl Default for JsxCompilerState<'_> {
    fn default() -> Self {
        Self::new(JsxConfig::default())
    }
}

/// JSX 编译器错误
#[derive(Debug)]
pub struct JsxError {
    /// 错误代码
    pub code: JsxErrorCode,
    /// 错误消息
    pub message: String,
}

/// JSX 错误代码
#[derive(Debug)]
pub enum JsxErrorCode {
    /// 无效的 Spread
    InvalidSpread,
    /// 无效的命名空间
    InvalidNamespace,
    /// 不支持的元素
    UnsupportedElement,
    /// 无效的标记
    InvalidMarker,
    /// 模板不匹配
    TemplateMismatch,
    /// 水合 Key 错误
    HydrationKeyError,
}
