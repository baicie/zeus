//! JSX DOM 子节点处理模块
//!
//! 提供子节点转换和 marker 管理逻辑

use std::cell::Cell;

use oxc_allocator::{Allocator, CloneIn, Vec};
use oxc_ast::ast::*;
use oxc_span::GetSpan;
use oxc_span::{Ident, Str};
use oxc_syntax::node::NodeId;

use zeus_compiler_core::jsx::config::GenerateMode;
use zeus_compiler_core::jsx::ir::{ChildBinding, MarkerKind};
use zeus_compiler_core::jsx::state::JsxCompilerState;
use zeus_compiler_core::jsx::utils::{
    is_dynamic_expression, is_useless_child, normalize_whitespace,
    escape_html, CheckConfig, evaluate_static_expr, is_jsx_component,
};

/// 子节点处理器
pub struct ChildrenHandler<'a, 'ctx> {
    /// 源代码
    source: &'a str,
    /// 内存分配器
    allocator: &'a Allocator,
    /// 编译器状态
    state: &'ctx mut JsxCompilerState<'a>,
    /// 是否为水合模式
    is_hydratable: bool,
}

impl<'a, 'ctx> ChildrenHandler<'a, 'ctx> {
    /// 创建新的子节点处理器
    pub fn new(
        source: &'a str,
        allocator: &'a Allocator,
        state: &'ctx mut JsxCompilerState<'a>,
        is_hydratable: bool,
    ) -> Self {
        Self { source, allocator, state, is_hydratable }
    }

    /// 处理子节点
    pub fn transform_children(
        &mut self,
        children: &'a [JSXChild<'a>],
    ) -> ChildrenResult<'a> {
        let mut result = ChildrenResult::new();

        // 1. 过滤空白和空表达式
        let filtered: Vec<_> = children
            .iter()
            .filter(|child| !is_useless_child(child))
            .collect();

        // 2. 查找最后一个元素节点
        let last_element_index = self.find_last_element_index(&filtered);

        // 3. 确定是否需要 marker
        let needs_markers = self.is_hydratable && filtered.len() > 1;

        for (index, child) in filtered.iter().enumerate() {
            let is_last = index == last_element_index;

            match child {
                JSXChild::Element(elem) => {
                    let child_result = self.transform_child_element(elem, is_last, needs_markers);
                    result.template.push_str(&child_result.template);
                    result.bindings.extend(child_result.bindings);
                }
                JSXChild::ExpressionContainer(expr_container) => {
                    let binding =
                        self.transform_expression_child(expr_container, index, needs_markers);
                    if let Some(binding) = binding {
                        result.template.push_str(&binding.html);
                        result.bindings.push(binding.binding);
                    }
                }
                JSXChild::Text(text) => {
                    let content = normalize_whitespace(text.value.as_str());
                    if !content.is_empty() {
                        result.template.push_str(&escape_html(&content, false));
                    }
                }
                JSXChild::Fragment(fragment) => {
                    let frag_result = self.transform_fragment(fragment, needs_markers);
                    result.template.push_str(&frag_result.template);
                    result.bindings.extend(frag_result.bindings);
                }
                _ => {}
            }
        }

        result
    }

    /// 处理子元素
    fn transform_child_element(
        &mut self,
        elem: &'a JSXElement<'a>,
        is_last: bool,
        needs_markers: bool,
    ) -> ChildrenResult<'a> {
        let mut result = ChildrenResult::new();
        let tag_name = crate::jsx::utils::get_jsx_tag_name(&elem.opening_element.name);
        let is_void = crate::jsx::constants::is_void_element(&tag_name);

        // 检测是否需要 SVG 包装
        let wrap_svg = self.needs_svg_wrapper(&tag_name);

        // 开始标签
        if wrap_svg {
            result.template.push_str("<svg>");
        }

        result.template.push('<');
        result.template.push_str(&tag_name);

        // 处理属性
        let elem_id = self.state.generate_element_name();
        self.handle_element_attributes(elem, &mut result, &elem_id);

        result.template.push('>');

        // 处理子节点
        if !is_void && tag_name != "noscript" {
            let child_result = self.transform_children(elem.children);
            result.template.push_str(&child_result.template);
            result.bindings.extend(child_result.bindings);
        }

        // 闭合标签
        if !is_void {
            result.template.push_str("</");
            result.template.push_str(&tag_name);
            result.template.push('>');
        }

        // SVG 包装闭合
        if wrap_svg {
            result.template.push_str("</svg>");
        }

        // 添加 marker（用于水合）
        if needs_markers && !is_last {
            let marker_idx = self.state.next_placeholder_index();
            result.template.push_str(&MarkerKind::EmptyPlaceholder.to_html(Some(marker_idx)));
        }

        result
    }

    /// 处理元素的属性
    fn handle_element_attributes(
        &mut self,
        elem: &'a JSXElement<'a>,
        result: &mut ChildrenResult<'a>,
        elem_id: &str,
    ) {
        for attr in &elem.opening_element.attributes {
            if let JSXAttributeItem::Attribute(normal_attr) = attr {
                let name = normal_attr.name.as_identifier().map(|id| id.name.as_str()).unwrap_or("");
                result.template.push(' ');
                result.template.push_str(name);

                if let Some(value) = normal_attr.value.as_ref() {
                    if let JSXAttributeValue::StringLiteral(s) = value {
                        result.template.push_str("=\"");
                        result.template.push_str(s.value.as_str());
                        result.template.push('"');
                    } else if let JSXAttributeValue::ExpressionContainer(expr_container) =
                        value
                    {
                        let placeholder_idx = self.state.next_placeholder_index();
                        result.template.push_str("=\"");
                        result.template.push_str(&MarkerKind::DynamicChildStart.to_html(Some(placeholder_idx)));
                        result.template.push('"');

                        if !expr_container.expression.is_null_literal() {
                            result.bindings.push(ChildBinding {
                                index: placeholder_idx,
                                expression: expr_container.expression.clone_in(self.allocator),
                                is_text: false,
                                needs_marker: self.is_hydratable,
                            });
                        }
                    }
                }
            }
        }
    }

    /// 检测是否需要 SVG 包装
    fn needs_svg_wrapper(&self, tag_name: &str) -> bool {
        if !crate::jsx::constants::is_svg_element(tag_name) {
            return false;
        }
        if tag_name == "svg" {
            return false;
        }
        true
    }

    /// 处理动态表达式子节点
    fn transform_expression_child(
        &mut self,
        expr_container: &'a JSXExpressionContainer<'a>,
        index: usize,
        needs_markers: bool,
    ) -> Option<DynamicChildResult<'a>> {
        let expr = &expr_container.expression;

        // 空表达式
        if matches!(expr, JSXExpression::EmptyExpression(_)) {
            return None;
        }

        let check_config = CheckConfig::default_dom();
        let is_dynamic = is_dynamic_expression(expr, check_config);

        if !is_dynamic {
            // 尝试静态求值
            if let Some(lit) = evaluate_static_expr(expr) {
                return Some(DynamicChildResult {
                    html: escape_html(&lit, false),
                    binding: ChildBinding {
                        index: self.state.next_placeholder_index(),
                        expression: self.str_literal(&lit),
                        is_text: true,
                        needs_marker: false,
                    },
                });
            }
            return None;
        }

        let placeholder_idx = self.state.next_placeholder_index();
        let mut html = String::new();

        // 添加开始 marker
        if needs_markers || index > 0 {
            html.push_str(&MarkerKind::DynamicChildStart.to_html(Some(placeholder_idx)));
        }

        // 检测条件表达式并包装
        let config = &self.state.config;
        let expression = if config.wrap_conditionals && config.generate == GenerateMode::Dom {
            if matches!(
                expr,
                JSXExpression::ConditionalExpression(_)
                    | JSXExpression::LogicalExpression(_)
            ) {
                let wrapped = self.wrap_conditional_expr(expr);
                ChildBinding {
                    index: placeholder_idx,
                    expression: wrapped,
                    is_text: false,
                    needs_marker: true,
                }
            } else {
                ChildBinding {
                    index: placeholder_idx,
                    expression: expr.clone_in(self.allocator),
                    is_text: false,
                    needs_marker: true,
                }
            }
        } else {
            ChildBinding {
                index: placeholder_idx,
                expression: expr.clone_in(self.allocator),
                is_text: false,
                needs_marker: true,
            }
        };

        Some(DynamicChildResult { html, binding: expression })
    }

    /// 处理 Fragment
    fn transform_fragment(
        &mut self,
        fragment: &'a JSXFragment<'a>,
        needs_markers: bool,
    ) -> ChildrenResult<'a> {
        let mut result = ChildrenResult::new();

        // Fragment 本身不生成 HTML 标签，直接处理子节点
        let child_result = self.transform_children(fragment.children);
        result.template.push_str(&child_result.template);
        result.bindings.extend(child_result.bindings);

        // 如果是最后一个元素，不需要结束 marker
        // 如果不是，需要添加 marker 来分隔多个子节点
        if needs_markers {
            let marker_idx = self.state.next_placeholder_index();
            result.template.push_str(&MarkerKind::EmptyPlaceholder.to_html(Some(marker_idx)));
        }

        result
    }

    /// 包装条件表达式
    fn wrap_conditional_expr(&mut self, expr: &'a Expression<'a>) -> Expression<'a> {
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
            if matches!(child, JSXChild::Element(_) | JSXChild::Fragment(_)) {
                last_idx = i;
            }
        }
        last_idx
    }

    /// 创建字符串字面量
    fn str_literal(&self, value: &str) -> Expression<'a> {
        Expression::StringLiteral(StringLiteral {
            value: Str::from_in(value, self.allocator),
            span: GetSpan::SPAN,
            node_id: Cell::new(NodeId::DUMMY),
            lone_surrogates: Default::default(),
            raw: Default::default(),
        })
    }
}

/// 子节点处理结果
pub struct ChildrenResult<'a> {
    /// 模板 HTML
    pub template: String,
    /// 子节点绑定
    pub bindings: Vec<'a, ChildBinding<'a>>,
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

impl Default for ChildrenResult<'_> {
    fn default() -> Self {
        Self::new()
    }
}

/// 动态子节点结果
pub struct DynamicChildResult<'a> {
    /// HTML 片段
    pub html: String,
    /// 绑定信息
    pub binding: ChildBinding<'a>,
}
