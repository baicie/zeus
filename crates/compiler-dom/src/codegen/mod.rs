//! Babel 风格代码生成器
//!
//! 生成与 babel-plugin-jsx-dom-expressions 相同格式的代码

pub mod context;
pub mod template;
pub mod legacy;

pub use context::CodegenContext;
pub use template::{cleanup_template_html, escape_template_string};

// Re-export legacy types for backwards compatibility
pub use legacy::{
    CodegenState, CodegenConfig, TemplateGen, ChildGen, AttrGen, AttrKind, EventGen,
    CodeGenerator, generate_from_template, html_escape,
};

use std::collections::HashMap;
use zeus_compiler_core::traverse::{TemplateDecl, AttrBinding, AttrBindingKind};

/// 代码生成器
pub struct BabelStyleCodegen<'a> {
    /// 源代码
    source: &'a str,
    /// 上下文
    ctx: CodegenContext,
}

impl<'a> BabelStyleCodegen<'a> {
    /// 创建新的代码生成器
    pub fn new(source: &'a str) -> Self {
        Self {
            source,
            ctx: CodegenContext::new(),
        }
    }

    /// 从模板生成 Babel 风格的函数体
    pub fn generate_function_body(&mut self, template: &TemplateDecl) -> String {
        let mut code = String::new();

        // 获取模板变量
        let tmpl_var = self.ctx.get_template_var(&template.name);

        // 生成根元素引用
        code.push_str(&format!("var {} = {}();\n", tmpl_var, template.name));

        // 生成子节点引用
        let mut child_vars: Vec<String> = Vec::new();
        let mut current_var = format!("{}.firstChild", tmpl_var);

        // 分析 HTML 找出需要引用的节点位置
        let markers = self.find_markers(&template.html);
        let markers_len = markers.len();
        
        // 遍历所有 markers，生成对应的元素引用变量
        for idx in 0..markers_len {
            let marker = markers[idx];
            let var = self.ctx.gen_element_var();
            code.push_str(&format!("var {} = {};\n", var, current_var));
            child_vars.push(var.clone());

            // 计算到下一个 marker 需要跳过的兄弟节点数量
            let next_var = if idx < markers_len - 1 {
                let next_marker = markers[idx + 1];
                let steps = next_marker - marker - 1;
                if steps <= 0 {
                    format!("{}.nextSibling", var)
                } else if steps == 1 {
                    format!("{}.nextSibling", var)
                } else {
                    let mut nav = var.clone();
                    for _ in 0..steps {
                        let next_var = self.ctx.gen_element_var();
                        code.push_str(&format!("var {} = {}.nextSibling;\n", next_var, nav));
                        nav = next_var;
                    }
                    nav
                }
            } else {
                format!("{}.nextSibling", var)
            };

            current_var = next_var;
        }

        // 如果只有一个子节点，使用更简单的模式
        if child_vars.is_empty() && template.child_bindings.is_empty() {
            code.push_str(&format!("return {};\n", tmpl_var));
            return code;
        }

        // 生成 insert 调用
        for (i, child) in template.child_bindings.iter().enumerate() {
            let anchor = if i < template.child_bindings.len() - 1 {
                child_vars.get(i + 1).cloned().unwrap_or_else(|| "null".to_string())
            } else {
                "null".to_string()
            };

            let parent_var = if i == 0 {
                format!("{}.firstChild", tmpl_var)
            } else {
                child_vars.get(i - 1).cloned().unwrap_or_else(|| tmpl_var.clone())
            };

            self.ctx.add_helper("insert");
            code.push_str(&format!(
                "insert({}, () => {}, {});\n",
                parent_var, child.expression, anchor
            ));
        }

        // 生成属性绑定
        for attr in &template.attr_bindings {
            let target = tmpl_var.clone();
            self.generate_attribute_effect(&mut code, &target, attr);
        }

        // 返回根元素
        code.push_str(&format!("return {};\n", tmpl_var));

        code
    }

    /// 生成属性效果
    fn generate_attribute_effect(&mut self, code: &mut String, target: &str, attr: &AttrBinding) {
        match attr.kind {
            AttrBindingKind::ClassName => {
                self.ctx.add_helper("effect");
                code.push_str(&format!(
                    "effect(() => {{ {}.className = {}; }});\n",
                    target, attr.expression
                ));
            }
            AttrBindingKind::Style => {
                self.ctx.add_helper("effect");
                code.push_str(&format!(
                    "effect(() => {{ {}.style.cssText = {}; }});\n",
                    target, attr.expression
                ));
            }
            AttrBindingKind::Event => {}
            AttrBindingKind::Property => {
                self.ctx.add_helper("effect");
                code.push_str(&format!(
                    "effect(() => {{ {}.{} = {}; }});\n",
                    target, attr.name, attr.expression
                ));
            }
            AttrBindingKind::Spread => {
                self.ctx.add_helper("effect");
                code.push_str(&format!(
                    "effect(() => {{ Object.assign({}, {}); }});\n",
                    target, attr.expression
                ));
            }
            AttrBindingKind::Attribute => {
                self.ctx.add_helper("effect");
                code.push_str(&format!(
                    "effect(() => {{ {}.setAttribute(\"{}\", {}); }});\n",
                    target, attr.name, attr.expression
                ));
            }
        }
    }

    /// 从 HTML 中找到所有 marker 的位置
    fn find_markers(&self, html: &str) -> Vec<usize> {
        let mut markers = Vec::new();
        let html_bytes = html.as_bytes();
        let mut i = 0;

        while i < html_bytes.len() {
            if i + 7 < html_bytes.len()
                && html_bytes[i] == b'<'
                && html_bytes[i + 1] == b'!'
                && html_bytes[i + 2] == b'-'
                && html_bytes[i + 3] == b'-'
                && html_bytes[i + 4] == b'['
            {
                let mut j = i + 5;
                while j < html_bytes.len() && html_bytes[j].is_ascii_digit() {
                    j += 1;
                }
                if j > i + 5 && j + 3 <= html_bytes.len()
                    && html_bytes[j] == b']'
                    && html_bytes[j + 1] == b'-'
                    && html_bytes[j + 2] == b'-'
                    && html_bytes[j + 3] == b'>'
                {
                    markers.push(i);
                    i = j + 4;
                    continue;
                }
            }
            i += 1;
        }

        markers
    }

    /// 生成完整的 Babel 风格代码
    pub fn generate(&mut self, templates: Vec<TemplateDecl>) -> String {
        let mut code = String::new();

        // 收集所有 helpers 和 delegated_events
        for template in &templates {
            for child in &template.child_bindings {
                if child.expression.contains("map") || child.expression.contains("NavLink") {
                    self.ctx.add_helper("insert");
                }
                if child.expression.contains("createComponent") || child.expression.contains("Component") {
                    self.ctx.add_helper("createComponent");
                }
            }

            for attr in &template.attr_bindings {
                match attr.kind {
                    AttrBindingKind::ClassName |
                    AttrBindingKind::Style |
                    AttrBindingKind::Property |
                    AttrBindingKind::Spread |
                    AttrBindingKind::Attribute => {
                        self.ctx.add_helper("effect");
                    }
                    AttrBindingKind::Event => {
                        self.ctx.add_delegated_event(&attr.name);
                        self.ctx.add_helper("delegateEvents");
                    }
                }
            }
        }

        self.ctx.add_helper("template");
        self.ctx.add_helper("effect");

        // 生成 import
        code.push_str(&self.ctx.generate_imports());
        code.push('\n');

        // 生成模板声明
        let mut seen_templates = HashMap::new();
        for template in &templates {
            if seen_templates.contains_key(&template.name) {
                continue;
            }
            seen_templates.insert(template.name.clone(), true);

            let cleaned_html = cleanup_template_html(&template.html);
            let escaped_html = escape_template_string(&cleaned_html);
            code.push_str(&format!(
                "const {} = /* @__PURE__ */ template(`{}`);\n",
                template.name, escaped_html
            ));
        }
        code.push('\n');

        // 生成委托事件注册
        code.push_str(&self.ctx.generate_delegated_events());
        if !self.ctx.delegated_events().is_empty() {
            code.push('\n');
        }

        code
    }

    /// 生成组件函数的完整代码
    pub fn generate_component(&mut self, template: &TemplateDecl, function_name: &str) -> String {
        self.ctx.add_helper("template");
        self.ctx.add_helper("insert");
        self.ctx.add_helper("effect");

        let mut code = String::new();

        code.push_str(&format!("function {}(props) {{\n", function_name));
        code.push_str("  return (() => {\n");

        let body = self.generate_function_body(template);
        for line in body.lines() {
            code.push_str("    ");
            code.push_str(line);
            code.push('\n');
        }

        code.push_str("  })();\n");
        code.push_str("}\n");

        code
    }

    /// 转义模板字符串
    pub fn escape_template_string(s: &str) -> String {
        escape_template_string(s)
    }
}

/// 生成 Babel 风格的模板代码
pub fn generate_babel_style_template(templates: Vec<TemplateDecl>) -> String {
    let mut codegen = BabelStyleCodegen::new("");
    codegen.generate(templates)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_find_markers() {
        let html = "<div><!--[0]--></div><span><!--[1]--></span>";
        let codegen = BabelStyleCodegen::new("");
        let markers = codegen.find_markers(html);
        assert_eq!(markers.len(), 2);
    }
}
