//! JSX 编译器状态模块
//!
//! 定义 DOM 编译器状态和相关数据结构

use zeus_compiler_common::{BindingKind, CompilerOptions, TemplateDecl};

/// DOM 编译器状态
pub struct DomCompilerState {
    /// 模板计数器
    pub template_counter: usize,
    /// 收集的模板声明
    pub templates: Vec<TemplateDecl>,
    /// 委托事件列表
    pub delegated_events: Vec<String>,
    /// 使用的 helpers
    pub used_helpers: Vec<String>,
    /// 警告信息
    pub warnings: Vec<String>,
}

impl DomCompilerState {
    /// 创建新的编译器状态
    pub fn new() -> Self {
        Self {
            template_counter: 0,
            templates: Vec::new(),
            delegated_events: Vec::new(),
            used_helpers: Vec::new(),
            warnings: Vec::new(),
        }
    }

    /// 生成唯一的模板变量名
    pub fn generate_template_name(&mut self) -> String {
        let name = format!("_tmpl${}", self.template_counter);
        self.template_counter += 1;
        name
    }

    /// 添加模板声明
    pub fn add_template(&mut self, decl: TemplateDecl) {
        self.templates.push(decl);
    }

    /// 添加使用的 helper
    pub fn add_helper(&mut self, helper: &str) {
        if !self.used_helpers.contains(&helper.to_string()) {
            self.used_helpers.push(helper.to_string());
        }
    }

    /// 添加委托事件
    pub fn add_delegated_event(&mut self, event: &str) {
        if !self.delegated_events.contains(&event.to_string()) {
            self.delegated_events.push(event.to_string());
        }
    }
}

impl Default for DomCompilerState {
    fn default() -> Self {
        Self::new()
    }
}

/// DOM 编译器 Pass
pub struct DomCompilerPass<'a> {
    /// 编译器状态
    pub state: DomCompilerState,
    /// 源代码
    pub source: &'a str,
    /// 编译器选项
    pub options: CompilerOptions,
}

impl<'a> DomCompilerPass<'a> {
    /// 创建新的 DOM 编译器
    pub fn new(source: &'a str, options: CompilerOptions) -> Self {
        Self {
            state: DomCompilerState::new(),
            source,
            options,
        }
    }

    /// 创建使用默认选项的编译器
    pub fn new_with_defaults(source: &'a str) -> Self {
        Self::new(source, CompilerOptions::default())
    }
}
