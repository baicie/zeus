//! 旧版代码生成器类型（保持向后兼容）
//!
//! 这些类型来自原始的 codegen.rs，用于兼容旧代码

use std::collections::HashMap;

/// 代码生成器状态
#[allow(dead_code)]
pub struct CodegenState {
    /// 模板计数器
    pub template_counter: usize,
    /// 元素引用计数器
    pub element_counter: usize,
    /// 模板声明列表
    pub templates: Vec<TemplateGen>,
    /// 导入的 helpers
    pub helpers: Vec<String>,
    /// 委托事件列表
    pub delegated_events: Vec<String>,
    /// 模板名称缓存（用于去重）
    template_cache: HashMap<String, String>,
}

/// 模板生成信息
#[derive(Clone, Debug)]
pub struct TemplateGen {
    /// 模板变量名
    pub name: String,
    /// HTML 内容
    pub html: String,
    /// 动态子节点
    pub children: Vec<ChildGen>,
    /// 动态属性
    pub attributes: Vec<AttrGen>,
    /// 事件处理
    pub events: Vec<EventGen>,
}

/// 子节点生成信息
#[derive(Clone, Debug)]
pub struct ChildGen {
    /// 索引
    pub index: usize,
    /// 表达式源代码
    pub expression: String,
    /// 是否是文本插值
    pub is_text: bool,
    /// 下一个兄弟节点选择器
    pub next_sibling: Option<String>,
}

/// 属性生成信息
#[derive(Clone, Debug)]
pub struct AttrGen {
    /// 属性名
    pub name: String,
    /// 表达式源代码
    pub expression: String,
    /// 属性类型
    pub kind: AttrKind,
}

/// 属性类型
#[derive(Clone, Debug, PartialEq)]
pub enum AttrKind {
    /// 普通属性
    Attribute,
    /// 类名
    ClassName,
    /// 样式
    Style,
    /// 布尔属性
    Bool,
    /// DOM Property
    Property,
    /// 展开
    Spread,
}

/// 事件生成信息
#[derive(Clone, Debug)]
pub struct EventGen {
    /// 事件名
    pub event: String,
    /// 处理函数表达式
    pub handler: String,
    /// 是否委托
    pub delegated: bool,
}

impl CodegenState {
    /// 创建新的代码生成状态
    pub fn new() -> Self {
        Self {
            template_counter: 0,
            element_counter: 0,
            templates: Vec::new(),
            helpers: Vec::new(),
            delegated_events: Vec::new(),
            template_cache: HashMap::new(),
        }
    }

    /// 生成唯一的模板名
    pub fn gen_template_name(&mut self) -> String {
        self.template_counter += 1;
        format!("_tmpl${}", self.template_counter)
    }

    /// 生成唯一的元素引用名
    pub fn gen_element_name(&mut self) -> String {
        self.element_counter += 1;
        format!("_el${}", self.element_counter)
    }

    /// 获取或创建模板名
    #[allow(dead_code)]
    pub fn get_or_create_template(&mut self, html: &str) -> String {
        if let Some(name) = self.template_cache.get(html) {
            return name.clone();
        }
        let name = self.gen_template_name();
        self.template_cache.insert(html.to_string(), name.clone());
        name
    }

    /// 添加 helper
    pub fn add_helper(&mut self, helper: &str) {
        if !self.helpers.contains(&helper.to_string()) {
            self.helpers.push(helper.to_string());
        }
    }

    /// 添加委托事件
    pub fn add_delegated_event(&mut self, event: &str) {
        if !self.delegated_events.contains(&event.to_string()) {
            self.delegated_events.push(event.to_string());
        }
    }

    /// 添加模板
    #[allow(dead_code)]
    pub fn add_template(&mut self, template: TemplateGen) {
        self.templates.push(template);
    }
}

impl Default for CodegenState {
    fn default() -> Self {
        Self::new()
    }
}

/// 生成器配置
#[derive(Clone, Debug)]
pub struct CodegenConfig {
    /// 是否启用 hydrate 模式
    pub hydratable: bool,
    /// 运行时模块
    pub runtime_module: String,
}

impl Default for CodegenConfig {
    fn default() -> Self {
        Self {
            hydratable: false,
            runtime_module: "@zeus-js/runtime-dom".to_string(),
        }
    }
}

/// 代码生成器
pub struct CodeGenerator<'a> {
    state: CodegenState,
    config: CodegenConfig,
    source: &'a str,
}

impl<'a> CodeGenerator<'a> {
    /// 创建新的代码生成器
    pub fn new(source: &'a str) -> Self {
        Self {
            state: CodegenState::new(),
            config: CodegenConfig::default(),
            source,
        }
    }

    /// 获取状态
    pub fn state(&self) -> &CodegenState {
        &self.state
    }

    /// 获取可变状态
    pub fn state_mut(&mut self) -> &mut CodegenState {
        &mut self.state
    }

    /// 生成完整的模块代码
    pub fn generate_module(
        &mut self,
        templates: Vec<TemplateGen>,
        helpers: Vec<String>,
        delegated_events: Vec<String>,
    ) -> String {
        let mut code = String::new();

        self.state.helpers = helpers;
        self.state.delegated_events = delegated_events;
        self.state.templates = templates;

        self.generate_imports(&mut code);
        self.generate_templates(&mut code);
        self.generate_delegated_events(&mut code);

        code
    }

    /// 生成导入语句
    fn generate_imports(&self, out: &mut String) {
        if self.state.helpers.is_empty() {
            return;
        }

        out.push_str("import { ");
        out.push_str(&self.state.helpers.join(", "));
        out.push_str(&format!(" }} from \"{}\";\n", self.config.runtime_module));
    }

    /// 生成模板声明
    fn generate_templates(&self, out: &mut String) {
        let mut seen = std::collections::HashSet::new();

        for template in &self.state.templates {
            if seen.contains(&template.name) {
                continue;
            }
            seen.insert(template.name.clone());

            let escaped_html = escape_js_string(&template.html);
            out.push_str(&format!("const {} = template(`{}`);\n", template.name, escaped_html));
        }
    }

    /// 生成委托事件注册
    fn generate_delegated_events(&self, out: &mut String) {
        if self.state.delegated_events.is_empty() {
            return;
        }

        out.push_str("delegateEvents([");
        for (i, event) in self.state.delegated_events.iter().enumerate() {
            if i > 0 {
                out.push_str(", ");
            }
            out.push_str(&format!("\"{}\"", event));
        }
        out.push_str("]);\n");
    }
}

/// 简化版代码生成
pub fn generate_from_template(template: &TemplateGen, state: &mut CodegenState) -> String {
    let mut code = String::new();

    let tmpl_name = &template.name;
    let root_var = state.gen_element_name();
    let root_placeholder = "{root}";
    let child_placeholder = "{child}";

    code.push_str(&format!("(() => {{\n  var {} = {}(),\n", root_var, tmpl_name));

    if template.children.is_empty() && template.attributes.is_empty() && template.events.is_empty() {
        code.push_str(&format!("    {};\n  return {};\n}})()", root_placeholder, root_var));
    } else {
        code.push_str(&format!("    {} = {}.firstChild;\n", child_placeholder, root_var));

        for child in &template.children {
            let next = child.next_sibling.as_ref().map(|s| s.as_str()).unwrap_or("null");
            code.push_str(&format!("  insert({}, () => {}, {});\n", child_placeholder, child.expression, next));
        }

        for event in &template.events {
            if event.delegated {
                code.push_str(&format!("  {}${} = {};\n", child_placeholder, event.event, event.handler));
            } else {
                code.push_str(&format!("  {}.addEventListener(\"{}\", {});\n", child_placeholder, event.event, event.handler));
            }
        }

        for attr in &template.attributes {
            match attr.kind {
                AttrKind::ClassName => {
                    state.add_helper("effect");
                    code.push_str(&format!("  effect(() => {{ {}.className = {}; }});\n", child_placeholder, attr.expression));
                }
                AttrKind::Style => {
                    state.add_helper("effect");
                    code.push_str(&format!("  effect(() => {{ {}.style.cssText = {}; }});\n", child_placeholder, attr.expression));
                }
                _ => {
                    state.add_helper("effect");
                    code.push_str(&format!("  effect(() => {{ {}.setAttribute(\"{}\", {}); }});\n", child_placeholder, attr.name, attr.expression));
                }
            }
        }

        code.push_str(&format!("  return {};\n}})()", root_var));
    }

    code
}

/// 转义 JavaScript 字符串
pub fn escape_js_string(s: &str) -> String {
    s.replace('\\', "\\\\")
        .replace('`', "\\`")
        .replace('$', "${$'}")
        .replace('\n', "\\n")
        .replace('\r', "\\r")
        .replace('\t', "\\t")
}

/// HTML 转义（用于模板内容）
pub fn html_escape(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&#39;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_html_escape() {
        assert_eq!(html_escape("<div>"), "&lt;div&gt;");
        assert_eq!(html_escape("a & b"), "a &amp; b");
    }

    #[test]
    fn test_js_string_escape() {
        assert_eq!(escape_js_string("test"), "test");
        assert_eq!(escape_js_string("`code`"), "\\`code\\`");
        let escaped = escape_js_string("$var");
        assert!(escaped.contains(r#"$($'"'"')"#), "Dollar should be escaped: {}", escaped);
    }
}
