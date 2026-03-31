//! Babel 风格的代码生成器
//!
//! 生成与 babel-plugin-jsx-dom-expressions 相同格式的代码：
//! ```javascript
//! const _tmpl$ = template('<div>...</div>');
//!
//! function App() {
//!   return (() => {
//!     var _el$ = _tmpl$(), _el$2 = _el$.firstChild;
//!     var _el$5 = _el$2.nextSibling;
//!     insert(_el$2, () => NAV_ITEMS.map(function(item) {
//!       return NavLink(item);
//!     }), null);
//!     insert(_el$5, createComponent(RouterView, {}));
//!     return _el$;
//!   })();
//! }
//! ```

use std::collections::HashMap;
use zeus_compiler_core::traverse::{TemplateDecl, AttrBinding, AttrBindingKind};

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
                    // 紧邻的节点，不需要 nextSibling
                    format!("{}.nextSibling", var)
                } else if steps == 1 {
                    // 跳过 1 个兄弟节点
                    format!("{}.nextSibling", var)
                } else {
                    // 多步跳转 - 生成多个变量
                    let mut nav = var.clone();
                    for _ in 0..steps {
                        let next_var = self.ctx.gen_element_var();
                        code.push_str(&format!("var {} = {}.nextSibling;\n", next_var, nav));
                        nav = next_var;
                    }
                    nav
                }
            } else {
                // 最后一个节点，尝试获取 nextSibling 作为 anchor
                format!("{}.nextSibling", var)
            };

            current_var = next_var;
        }

        // 如果只有一个子节点，使用更简单的模式
        if child_vars.is_empty() && template.child_bindings.is_empty() {
            // 没有动态子节点，直接返回
            code.push_str(&format!("return {};\n", tmpl_var));
            return code;
        }

        // 生成 insert 调用
        for (i, child) in template.child_bindings.iter().enumerate() {
            let anchor = if i < template.child_bindings.len() - 1 {
                // 有下一个兄弟节点作为 anchor
                if let Some(next_var) = child_vars.get(i + 1) {
                    next_var.clone()
                } else {
                    "null".to_string()
                }
            } else {
                // 最后一个，没有 anchor
                "null".to_string()
            };

            let parent_var = if i == 0 {
                // 第一个子节点在 firstChild
                format!("{}.firstChild", tmpl_var)
            } else if let Some(prev_var) = child_vars.get(i - 1) {
                // 使用前一个变量作为 parent
                prev_var.clone()
            } else {
                tmpl_var.clone()
            };

            self.ctx.add_helper("insert");
            code.push_str(&format!(
                "insert({}, () => {}, {});\n",
                parent_var,
                child.expression,
                anchor
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
            AttrBindingKind::Event => {
                // 事件不生成 effect，在 delegateEvents 中处理
            }
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
            // 查找 <!--[数字]-->
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
            // 从子节点收集 helpers
            for child in &template.child_bindings {
                if child.expression.contains("map") || child.expression.contains("NavLink") {
                    self.ctx.add_helper("insert");
                }
                if child.expression.contains("createComponent") || child.expression.contains("Component") {
                    self.ctx.add_helper("createComponent");
                }
            }

            // 从属性收集 helpers
            for attr in &template.attr_bindings {
                match attr.kind {
                    AttrBindingKind::ClassName => {
                        self.ctx.add_helper("effect");
                    }
                    AttrBindingKind::Style => {
                        self.ctx.add_helper("effect");
                    }
                    AttrBindingKind::Property => {
                        self.ctx.add_helper("effect");
                    }
                    AttrBindingKind::Spread => {
                        self.ctx.add_helper("effect");
                    }
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

        // 添加必要的 helpers
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

            let cleaned_html = self.cleanup_template_html(&template.html);
            let escaped_html = Self::escape_template_string(&cleaned_html);
            code.push_str(&format!(
                "const {} = /* @__PURE__ */ template(`{}`);\n",
                template.name, escaped_html
            ));
        }
        code.push('\n');

        // 生成委托事件注册
        code.push_str(&self.ctx.generate_delegated_events());
        if !self.ctx.delegated_events.is_empty() {
            code.push('\n');
        }

        code
    }

    /// 清理模板 HTML
    fn cleanup_template_html(&self, html: &str) -> String {
        let mut result = String::with_capacity(html.len());
        let chars: Vec<char> = html.chars().collect();
        let len = chars.len();
        let mut i = 0;
        let mut in_tag = false;

        while i < len {
            let c = chars[i];

            // 检测 <!--[数字]--> 注释，保留作为 marker
            if i + 7 < len
                && chars[i] == '<'
                && chars[i + 1] == '!'
                && chars[i + 2] == '-'
                && chars[i + 3] == '-'
                && chars[i + 4] == '['
            {
                let mut j = i + 5;
                while j < len && chars[j].is_ascii_digit() {
                    j += 1;
                }
                if j > i + 5 && j + 3 <= len
                    && chars[j] == ']'
                    && chars[j + 1] == '-'
                    && chars[j + 2] == '-'
                    && chars[j + 3] == '>'
                {
                    result.push_str(&chars[i..=j + 3].iter().collect::<String>());
                    i = j + 4;
                    continue;
                }
            }

            if c == '<' {
                in_tag = true;
            } else if c == '>' {
                in_tag = false;
            }

            // 最小化空白
            if c.is_whitespace() && !in_tag {
                // 检查是否需要保留
                let prev = result.chars().last();
                let next = chars.get(i + 1);

                let should_keep = match (prev, next) {
                    (Some('<'), _) | (_, Some('<')) => false,
                    (Some('>'), Some(c)) if !c.is_whitespace() => true,
                    (Some(c), Some('>')) if !c.is_whitespace() => true,
                    (None, _) => false,
                    _ => true,
                };

                if should_keep && !result.ends_with(' ') {
                    result.push(' ');
                }
            } else if c != '\r' && c != '\t' {
                result.push(c);
            }

            i += 1;
        }

        // 清理连续空格
        let html = result;
        let mut result = String::new();
        let mut prev_was_space = false;

        for c in html.chars() {
            if c == ' ' {
                if !prev_was_space {
                    result.push(c);
                    prev_was_space = true;
                }
            } else {
                result.push(c);
                prev_was_space = false;
            }
        }

        result.trim().to_string()
    }

    /// 转义模板字符串
    fn escape_template_string(s: &str) -> String {
        let mut result = String::with_capacity(s.len());
        for c in s.chars() {
            match c {
                '\\' => result.push_str("\\\\"),
                '`' => result.push_str("\\`"),
                '$' => result.push_str("\\$"),
                '\n' => result.push_str("\\n"),
                '\r' => result.push_str("\\r"),
                '\t' => result.push_str("\\t"),
                _ => result.push(c),
            }
        }
        result
    }

    /// 生成组件函数的完整代码
    pub fn generate_component(&mut self, template: &TemplateDecl, function_name: &str) -> String {
        // 确保有必要的 helpers
        self.ctx.add_helper("template");
        self.ctx.add_helper("insert");
        self.ctx.add_helper("effect");

        let mut code = String::new();

        // 生成函数签名
        code.push_str(&format!("function {}(props) {{\n", function_name));

        // 生成 IIFE 包装的返回语句
        code.push_str("  return (() => {\n");

        // 生成函数体
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
    fn test_escape_template() {
        assert_eq!(
            BabelStyleCodegen::new("").escape_template_string("<div class=\"test\">"),
            "<div class=\\\"test\\\">"
        );
    }

    #[test]
    fn test_find_markers() {
        let html = "<div><!--[0]--></div><span><!--[1]--></span>";
        let codegen = BabelStyleCodegen::new("");
        let markers = codegen.find_markers(html);
        assert_eq!(markers.len(), 2);
    }
}
