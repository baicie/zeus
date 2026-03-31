//! Babel 风格代码生成器上下文
//!
//! 管理代码生成过程中的状态和计数器

use std::collections::HashMap;

/// 代码生成上下文
pub struct CodegenContext {
    /// 元素引用计数器
    element_counter: usize,
    /// 当前生成的元素变量
    element_vars: Vec<String>,
    /// 模板到变量映射
    template_vars: HashMap<String, String>,
    /// 需要的 helpers
    helpers: Vec<String>,
    /// 委托事件
    delegated_events: Vec<String>,
    /// 运行时模块
    runtime_module: String,
}

impl CodegenContext {
    /// 创建新的上下文
    pub fn new() -> Self {
        Self {
            element_counter: 0,
            element_vars: Vec::new(),
            template_vars: HashMap::new(),
            helpers: Vec::new(),
            delegated_events: Vec::new(),
            runtime_module: "@zeus-js/runtime-dom".to_string(),
        }
    }

    /// 生成新的元素引用变量
    pub fn gen_element_var(&mut self) -> String {
        self.element_counter += 1;
        let var = format!("_el${}", self.element_counter);
        self.element_vars.push(var.clone());
        var
    }

    /// 获取模板对应的变量
    pub fn get_template_var(&mut self, template_name: &str) -> String {
        if let Some(var) = self.template_vars.get(template_name) {
            return var.clone();
        }
        let var = self.gen_element_var();
        self.template_vars.insert(template_name.to_string(), var.clone());
        var
    }

    /// 添加 helper
    pub fn add_helper(&mut self, helper: &str) {
        if !self.helpers.iter().any(|h| h == helper) {
            self.helpers.push(helper.to_string());
        }
    }

    /// 添加委托事件
    pub fn add_delegated_event(&mut self, event: &str) {
        if !self.delegated_events.iter().any(|e| e == event) {
            self.delegated_events.push(event.to_string());
        }
    }

    /// 获取委托事件列表
    pub fn delegated_events(&self) -> &[String] {
        &self.delegated_events
    }

    /// 生成 import 语句
    pub fn generate_imports(&self) -> String {
        if self.helpers.is_empty() {
            return String::new();
        }

        let imports: Vec<&str> = self.helpers.iter().map(|s| s.as_str()).collect();
        format!(
            "import {{ {} }} from \"{}\";\n",
            imports.join(", "),
            self.runtime_module
        )
    }

    /// 生成委托事件注册
    pub fn generate_delegated_events(&self) -> String {
        if self.delegated_events.is_empty() {
            return String::new();
        }

        let events: Vec<String> = self.delegated_events
            .iter()
            .map(|e| format!("\"{}\"", e))
            .collect();

        format!("delegateEvents([{}]);\n", events.join(", "))
    }
}

impl Default for CodegenContext {
    fn default() -> Self {
        Self::new()
    }
}
