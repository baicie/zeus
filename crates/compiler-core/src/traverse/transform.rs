//! JSX 模板转换模块
//!
//! 负责将 JSX 转换为模板 HTML

use super::state::{
    AttrBinding, AttrBindingKind, ChildBinding, StaticNode, TemplateDecl,
};
use oxc_ast::ast::*;
use oxc_span::GetSpan;

/// JSX 转换器
pub struct JsxTransformer<'a> {
    source: &'a str,
    /// 用于存储嵌套的模板声明
    nested_templates: Vec<TemplateDecl>,
}

impl<'a> JsxTransformer<'a> {
    /// 创建新的 JSX 转换器
    pub fn new(source: &'a str) -> Self {
        Self { source, nested_templates: Vec::new() }
    }

    /// 获取嵌套模板
    pub fn take_nested_templates(&mut self) -> Vec<TemplateDecl> {
        std::mem::take(&mut self.nested_templates)
    }

    /// 将 JSX 元素转换为模板 HTML 和绑定信息
    pub fn jsx_element_to_template_ir(
        &mut self,
        node: &JSXElement<'a>,
    ) -> (String, Vec<ChildBinding>, Vec<AttrBinding>) {
        let mut html = String::new();
        let mut child_bindings = Vec::new();
        let mut attr_bindings = Vec::new();

        self.write_jsx_element_html(node, &mut html, &mut child_bindings, &mut attr_bindings);

        (html, child_bindings, attr_bindings)
    }

    /// 将表达式转换为源代码
    #[allow(dead_code)]
    pub fn expression_to_source(&self, expr: &Expression) -> String {
        let span = expr.span();
        let source = self.source;
        let start = span.start;
        let end = span.end;
        source[start as usize..end as usize].to_string()
    }

    /// 写入 JSX 元素的 HTML
    fn write_jsx_element_html(
        &mut self,
        node: &JSXElement<'a>,
        out: &mut String,
        child_bindings: &mut Vec<ChildBinding>,
        attr_bindings: &mut Vec<AttrBinding>,
    ) {
        let tag = self.get_jsx_tag_name(&node.opening_element.name);
        out.push('<');
        out.push_str(&tag);

        self.write_jsx_attributes(node, out, attr_bindings);
        out.push('>');

        self.write_jsx_children(node, out, child_bindings);

        out.push_str("</");
        out.push_str(&tag);
        out.push('>');
    }

    /// 将 JSX Fragment 转换为模板 HTML 和绑定信息
    #[allow(dead_code)]
    pub fn jsx_fragment_to_template_ir(
        &mut self,
        node: &JSXFragment<'a>,
    ) -> (String, Vec<ChildBinding>) {
        let mut html = String::new();
        let mut child_bindings = Vec::new();

        let mut child_idx = 0;
        for child in &node.children {
            match child {
                JSXChild::Text(t) => html.push_str(t.value.as_str()),
                JSXChild::Element(e) => {
                    self.write_jsx_element_html(e, &mut html, &mut child_bindings, &mut Vec::new());
                }
                JSXChild::ExpressionContainer(expr_container) => {
                    // SolidJS 风格：不使用占位符，直接记录绑定
                    // 节点位置通过 firstChild/nextSibling 遍历确定

                    if let Some(expr) = expr_container.expression.as_expression() {
                        let expr_source = self.expression_to_source(expr);
                        child_bindings.push(ChildBinding {
                            index: child_idx,
                            expression: expr_source,
                            is_text: true,
                            placeholder_index: child_idx,
                        });
                    }
                    child_idx += 1;
                }
                JSXChild::Spread(_) | JSXChild::Fragment(_) => {
                    html.push_str("<!---->");
                }
            }
        }

        (html, child_bindings)
    }

    /// 获取 JSX 标签名
    fn get_jsx_tag_name(&self, name: &JSXElementName) -> String {
        match name {
            JSXElementName::Identifier(id) => id.name.to_string(),
            JSXElementName::NamespacedName(ns) => {
                format!("{}:{}", ns.namespace.name, ns.name.name)
            }
            _ => "div".to_string(), // 简化处理
        }
    }

    /// 写入 JSX 属性的 HTML
    fn write_jsx_attributes(
        &mut self,
        node: &JSXElement<'a>,
        out: &mut String,
        attr_bindings: &mut Vec<AttrBinding>,
    ) {
        for attr in &node.opening_element.attributes {
            if let JSXAttributeItem::Attribute(attr) = attr {
                let name = self.get_attr_name(&attr.name);
                if let Some(value) = &attr.value {
                    match value {
                        JSXAttributeValue::ExpressionContainer(expr) => {
                            if let Some(expr) = expr.expression.as_expression() {
                                let expr_source = self.expression_to_source(expr);
                                if self.is_event_attribute(&name) {
                                    let event_name = name.trim_start_matches("on").to_lowercase();
                                    attr_bindings.push(AttrBinding {
                                        kind: AttrBindingKind::Event,
                                        name: event_name,
                                        expression: expr_source,
                                    });
                                } else if name == "className" || name == "class" {
                                    attr_bindings.push(AttrBinding {
                                        kind: AttrBindingKind::ClassName,
                                        name,
                                        expression: expr_source,
                                    });
                                } else if name == "style" {
                                    attr_bindings.push(AttrBinding {
                                        kind: AttrBindingKind::Style,
                                        name,
                                        expression: expr_source,
                                    });
                                } else {
                                    attr_bindings.push(AttrBinding {
                                        kind: AttrBindingKind::Attribute,
                                        name,
                                        expression: expr_source,
                                    });
                                }
                            }
                        }
                        JSXAttributeValue::StringLiteral(s) => {
                            out.push(' ');
                            out.push_str(&name);
                            out.push_str("=\"");
                            out.push_str(s.value.as_str());
                            out.push('"');
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    /// 获取属性名
    fn get_attr_name(&self, name: &JSXAttributeName) -> String {
        match name {
            JSXAttributeName::Identifier(id) => id.name.to_string(),
            JSXAttributeName::NamespacedName(ns) => {
                format!("{}:{}", ns.namespace.name, ns.name.name)
            }
        }
    }

    /// 判断是否为事件属性
    fn is_event_attribute(&self, name: &str) -> bool {
        name.starts_with("on") && name.len() > 2
    }

    /// 写入 JSX 子节点的 HTML
    fn write_jsx_children(
        &mut self,
        node: &JSXElement<'a>,
        out: &mut String,
        child_bindings: &mut Vec<ChildBinding>,
    ) {
        let mut child_idx = 0;

        for child in &node.children {
            match child {
                JSXChild::Text(t) => out.push_str(t.value.as_str()),
                JSXChild::Element(e) => {
                    self.write_jsx_element_html(e, out, child_bindings, &mut Vec::new());
                }
                JSXChild::ExpressionContainer(expr_container) => {
                    // SolidJS 风格：不使用占位符
                    // 节点位置通过 firstChild/nextSibling 遍历确定

                    if let Some(expr) = expr_container.expression.as_expression() {
                        // 检查表达式是否包含 JSX 元素
                        if self.contains_jsx_element(expr) {
                            // 对于包含 JSX 的表达式，提取嵌套的 JSX 并生成子模板
                            let (replaced_expr, nested_tmpl) = self.extract_jsx_from_expression(expr, child_idx);
                            if let Some(tmpl) = nested_tmpl {
                                self.nested_templates.push(tmpl);
                            }
                            child_bindings.push(ChildBinding {
                                index: child_idx,
                                expression: replaced_expr,
                                is_text: false,
                                placeholder_index: child_idx,
                            });
                        } else {
                            let is_text = matches!(expr, Expression::StringLiteral(_) | Expression::TemplateLiteral(_));
                            let expr_source = self.expression_to_source(expr);

                            child_bindings.push(ChildBinding {
                                index: child_idx,
                                expression: expr_source,
                                is_text,
                                placeholder_index: child_idx,
                            });
                        }
                    }
                    child_idx += 1;
                }
                _ => {
                    out.push_str("<!---->");
                }
            }
        }
    }

    /// 检查表达式是否包含 JSX 元素
    fn contains_jsx_element(&self, expr: &Expression) -> bool {
        match expr {
            Expression::JSXElement(_) | Expression::JSXFragment(_) => true,
            Expression::LogicalExpression(logical) => {
                self.contains_jsx_element(&logical.left) || self.contains_jsx_element(&logical.right)
            }
            Expression::ConditionalExpression(cond) => {
                self.contains_jsx_element(&cond.test)
                    || self.contains_jsx_element(&cond.consequent)
                    || self.contains_jsx_element(&cond.alternate)
            }
            _ => false,
        }
    }

    /// 从表达式中提取 JSX，返回替换后的表达式和嵌套模板
    /// 注意：这个方法只是返回需要替换的表达式文本和模板信息
    /// 实际的 AST 替换需要在 traverse 阶段完成
    fn extract_jsx_from_expression(
        &self,
        expr: &Expression,
        child_idx: usize,
    ) -> (String, Option<TemplateDecl>) {
        match expr {
            Expression::JSXElement(jsx) => {
                // 内部 JSX 元素：生成一个新的模板
                let tmpl_name = format!("_tmpl$inner${}", child_idx);
                let tag = self.get_jsx_tag_name(&jsx.opening_element.name);
                let mut html = format!("<{}>", tag);
                html.push_str("</");
                html.push_str(&tag);
                html.push('>');

                let template = TemplateDecl {
                    name: tmpl_name.clone(),
                    html,
                    child_bindings: Vec::new(),
                    attr_bindings: Vec::new(),
                    marker_paths: Vec::new(),
                    needs_markers: false,
                };
                (format!("{}().firstChild", tmpl_name), Some(template))
            }
            Expression::JSXFragment(_frag) => {
                let tmpl_name = format!("_tmpl$inner${}", child_idx);
                let template = TemplateDecl {
                    name: tmpl_name.clone(),
                    html: "<!---->".to_string(),
                    child_bindings: Vec::new(),
                    attr_bindings: Vec::new(),
                    marker_paths: Vec::new(),
                    needs_markers: false,
                };
                (format!("{}().firstChild", tmpl_name), Some(template))
            }
            Expression::LogicalExpression(logical) => {
                let (left_expr, left_tmpl) = self.extract_jsx_from_expression(&logical.left, child_idx);
                let (right_expr, right_tmpl) = self.extract_jsx_from_expression(&logical.right, child_idx);
                let op = logical.operator.as_str();

                let mut templates = Vec::new();
                if let Some(t) = left_tmpl {
                    templates.push(t);
                }
                if let Some(t) = right_tmpl {
                    templates.push(t);
                }

                let result_expr = format!("{} {} {}", left_expr, op, right_expr);
                let result_tmpl = templates.into_iter().next();
                (result_expr, result_tmpl)
            }
            Expression::ConditionalExpression(cond) => {
                let (cons_expr, cons_tmpl) = self.extract_jsx_from_expression(&cond.consequent, child_idx);
                let (alt_expr, alt_tmpl) = self.extract_jsx_from_expression(&cond.alternate, child_idx);

                let mut templates = Vec::new();
                if let Some(t) = cons_tmpl {
                    templates.push(t);
                }
                if let Some(t) = alt_tmpl {
                    templates.push(t);
                }

                let test_source = self.expression_to_source(&cond.test);
                let result_expr = format!("{} ? {} : {}", test_source, cons_expr, alt_expr);
                let result_tmpl = templates.into_iter().next();
                (result_expr, result_tmpl)
            }
            _ => {
                (self.expression_to_source(expr), None)
            }
        }
    }
}

impl TemplateDecl {
    /// 从 JSX 元素生成模板声明
    #[allow(dead_code)]
    pub fn from_jsx(
        source: &str,
        node: &JSXElement,
        name: &str,
    ) -> (Self, Vec<ChildBinding>, Vec<AttrBinding>) {
        let mut transformer = JsxTransformer::new(source);
        let (html, child_bindings, attr_bindings) = transformer.jsx_element_to_template_ir(node);

        let template = Self {
            name: name.to_string(),
            html,
            child_bindings: child_bindings.clone(),
            attr_bindings: attr_bindings.clone(),
            marker_paths: Vec::new(),
            needs_markers: false,
        };

        (template, child_bindings, attr_bindings)
    }

    /// 生成渲染调用的静态节点
    #[allow(dead_code)]
    pub fn generate_static_node(&self) -> StaticNode {
        StaticNode {
            name: self.name.clone(),
            html: format!("{}(), ", self.name),
            hoistable: true,
        }
    }
}
