//! JSX DOM 子节点处理模块
//!
//! 提供子节点转换和 marker 管理逻辑

use zeus_compiler_core::jsx::config::GenerateMode;
use zeus_compiler_core::jsx::state::JsxCompilerState;
use zeus_compiler_core::jsx::ir::{ChildBinding, MarkerKind};
use zeus_compiler_core::jsx::utils::{is_dynamic_expression, is_useless_child, normalize_whitespace, escape_html, CheckConfig};
use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_span::GetSpan;

/// 子节点处理器
pub struct ChildrenHandler<'a, 'ctx> {
    /// 源代码
    source: &'a str,
    /// 内存分配器
    allocator: &'a Allocator,
    /// 编译器状态
    state: &'ctx mut JsxCompilerState<'a>,
}

impl<'a, 'ctx> ChildrenHandler<'a, 'ctx> {
    /// 创建新的子节点处理器
    pub fn new(
        source: &'a str,
        allocator: &'a Allocator,
        state: &'ctx mut JsxCompilerState<'a>,
    ) -> Self {
        Self { source, allocator, state }
    }

    /// 处理子节点
    pub fn transform_children(
        &mut self,
        children: &[JSXChild<'a>],
        is_hydratable: bool,
    ) -> ChildrenResult<'a> {
        let mut result = ChildrenResult::new();

        // 过滤空白和空表达式
        let filtered: Vec<_> = children
            .iter()
            .filter(|child| !is_useless_child(child))
            .collect();

        // 查找最后一个元素节点
        let last_element_index = self.find_last_element_index(&filtered);

        // 确定是否需要 marker
        let needs_markers = is_hydratable && filtered.len() > 1;

        for (index, child) in filtered.iter().enumerate() {
            let is_last = index == last_element_index;

            match child {
                JSXChild::Element(elem) => {
                    let child_result = self.transform_child_element(elem, &mut result.template, is_last);
                    result.bindings.extend(child_result.bindings);
                }
                JSXChild::ExpressionContainer(expr_container) => {
                    let binding = self.transform_expression_child(expr_container, &mut result.template, index, needs_markers);
                    if let Some(binding) = binding {
                        result.bindings.push(binding);
                    }
                }
                JSXChild::Text(text) => {
                    let content = normalize_whitespace(text.value.as_str());
                    result.template.push_str(&escape_html(&content, false));
                }
                _ => {}
            }
        }

        result
    }

    /// 处理子元素
    fn transform_child_element(
        &mut self,
        elem: &JSXElement<'a>,
        template: &mut String,
        _is_last: bool,
    ) -> ChildrenResult<'a> {
        let mut result = ChildrenResult::new();
        let tag_name = crate::jsx::utils::get_jsx_tag_name(&elem.opening_element.name);

        template.push('<');
        template.push_str(&tag_name);

        // 处理属性
        for attr in &elem.opening_element.attributes {
            if let JSXAttributeItem::Attribute(attr) = attr {
                let name = attr.name.as_identifier().name.as_str();
                template.push(' ');
                template.push_str(name);

                if let Some(value) = attr.value.as_ref() {
                    if let JSXAttributeValue::StringLiteral(s) = value {
                        template.push_str("=\"");
                        template.push_str(s.value.as_str());
                        template.push('"');
                    }
                }
            }
        }

        template.push('>');

        // 递归处理子节点
        for child in &elem.children {
            match child {
                JSXChild::Text(text) => {
                    let content = normalize_whitespace(text.value.as_str());
                    template.push_str(&escape_html(&content, false));
                }
                JSXChild::ExpressionContainer(expr_container) => {
                    let placeholder_idx = self.state.next_placeholder_index();
                    template.push_str(&MarkerKind::DynamicChildStart.to_html(Some(placeholder_idx)));

                    if !expr_container.expression.is_null_literal() {
                        result.bindings.push(ChildBinding::new(
                            placeholder_idx,
                            expr_container.expression.clone(),
                            false,
                        ));
                    }
                }
                JSXChild::Element(child_elem) => {
                    let child_result = self.transform_child_element(child_elem, template, false);
                    result.bindings.extend(child_result.bindings);
                }
                _ => {}
            }
        }

        template.push_str("</");
        template.push_str(&tag_name);
        template.push('>');

        result
    }

    /// 处理动态表达式子节点
    fn transform_expression_child(
        &mut self,
        expr_container: &JSXExpressionContainer<'a>,
        template: &mut String,
        index: usize,
        needs_markers: bool,
    ) -> Option<ChildBinding<'a>> {
        let expr = &expr_container.expression;

        // 空表达式
        if expr_container.expression.is_null_literal() {
            return None;
        }

        let check_config = CheckConfig::default_dom();
        let is_dynamic = is_dynamic_expression(expr, check_config);

        if !is_dynamic {
            return None;
        }

        let placeholder_idx = self.state.next_placeholder_index();

        // 添加 marker
        if needs_markers {
            template.push_str(&MarkerKind::DynamicChildStart.to_html(Some(placeholder_idx)));
        }

        // 检测条件表达式并包装
        let config = &self.state.config;
        if config.wrap_conditionals && config.generate == GenerateMode::Dom {
            if matches!(expr, Expression::ConditionalExpression(_))
                || matches!(expr, Expression::LogicalExpression(_))
            {
                let wrapped = self.wrap_conditional_expr(expr);
                return Some(ChildBinding {
                    index: placeholder_idx,
                    expression: wrapped,
                    is_text: false,
                    needs_marker: needs_markers,
                });
            }
        }

        Some(ChildBinding {
            index: placeholder_idx,
            expression: expr.clone(),
            is_text: false,
            needs_marker: needs_markers,
        })
    }

    /// 包装条件表达式
    fn wrap_conditional_expr(&mut self, expr: &Expression<'a>) -> Expression<'a> {
        let mut transformer = crate::jsx::transform::JsxTransformer::new(
            self.source,
            self.allocator,
            self.state,
        );
        transformer.wrap_conditional_expr(expr)
    }

    /// 查找最后一个元素索引
    fn find_last_element_index(&self, children: &[&JSXChild<'a>]) -> usize {
        let mut last_idx = 0;
        for (i, child) in children.iter().enumerate() {
            if matches!(child, JSXChild::Element(_)) {
                last_idx = i;
            }
        }
        last_idx
    }
}

/// 子节点处理结果
pub struct ChildrenResult<'a> {
    /// 模板 HTML
    pub template: String,
    /// 子节点绑定
    pub bindings: Vec<ChildBinding<'a>>,
}

impl<'a> ChildrenResult<'a> {
    /// 创建新的结果
    pub fn new() -> Self {
        Self {
            template: String::new(),
            bindings: Vec::new(),
        }
    }
}

impl Default for ChildrenResult<'a> {
    fn default() -> Self {
        Self::new()
    }
}
