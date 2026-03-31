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
}

impl<'a> JsxTransformer<'a> {
    /// 创建新的 JSX 转换器
    pub fn new(source: &'a str) -> Self {
        Self { source }
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
                    let placeholder = format!("<!--[{}]-->", child_idx);
                    html.push_str(&placeholder);

                    if let Some(expr) = expr_container.expression.as_expression() {
                        let expr_source = self.expression_to_source(expr);
                        child_bindings.push(ChildBinding {
                            index: child_idx,
                            expression: expr_source,
                            is_text: true,
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
                    let placeholder = format!("<!--[{}]-->", child_idx);
                    out.push_str(&placeholder);

                    if let Some(expr) = expr_container.expression.as_expression() {
                        let is_text = matches!(expr, Expression::StringLiteral(_) | Expression::TemplateLiteral(_));
                        let expr_source = self.expression_to_source(expr);

                        child_bindings.push(ChildBinding {
                            index: child_idx,
                            expression: expr_source,
                            is_text,
                        });
                    }
                    child_idx += 1;
                }
                _ => {
                    out.push_str("<!---->");
                }
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
