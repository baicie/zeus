//! JSX Fragment 转换模块
//!
//! 提供 JSX Fragment 的转换逻辑

use std::vec::Vec;

use oxc_allocator::{Allocator, CloneIn};
use oxc_ast::ast::*;
use oxc_ast::AstBuilder;
use crate::jsx::config::GenerateMode;
use crate::jsx::ir::{ChildBinding, MarkerKind};
use crate::jsx::state::JsxCompilerState;
use crate::jsx::utils::is_useless_child;

/// JSX Fragment 转换器
pub struct FragmentTransformer<'a, 'ctx> {
    /// 源代码
    pub source: &'a str,
    /// 内存分配器
    pub allocator: &'a Allocator,
    /// AST 构建器
    builder: AstBuilder<'a>,
    /// 编译器状态
    pub state: &'ctx mut JsxCompilerState<'a>,
}

impl<'a, 'ctx> FragmentTransformer<'a, 'ctx> {
    /// 创建新的 Fragment 转换器
    pub fn new(
        source: &'a str,
        allocator: &'a Allocator,
        state: &'ctx mut JsxCompilerState<'a>,
    ) -> Self {
        Self { source, allocator, builder: AstBuilder::new(allocator), state }
    }

    /// 转换 JSXFragment
    pub fn transform_fragment(
        &mut self,
        node: &'a JSXFragment<'a>,
    ) -> FragmentResult<'a> {
        let config = &self.state.config;
        let mut result = FragmentResult::new();

        // 过滤无用的子节点
        let filtered: Vec<&JSXChild<'a>> = node.children.iter()
            .filter(|child| !is_useless_child(child))
            .collect();

        // 查找最后一个元素节点
        let last_element_index = self.find_last_element_index(&filtered);

        // 确定是否需要 marker
        let needs_markers = config.hydratable && filtered.len() > 1;

        for (index, child) in filtered.iter().enumerate() {
            let is_last = index == last_element_index;

            match child {
                JSXChild::Element(elem) => {
                    self.transform_child_element(elem, &mut result, is_last);
                }
                JSXChild::ExpressionContainer(expr_container) => {
                    let binding = self.transform_expression_child(expr_container, &mut result, index, needs_markers);
                    if let Some(binding) = binding {
                        result.child_bindings.push(binding);
                    }
                }
                JSXChild::Text(text) => {
                    result.template.push_str(text.value.as_str());
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
        result: &mut FragmentResult<'a>,
        _is_last: bool,
    ) {
        let tag_name = crate::jsx::utils::get_jsx_tag_name(&elem.opening_element.name);

        result.template.push('<');
        result.template.push_str(&tag_name);

        // 处理属性
        for attr in &elem.opening_element.attributes {
            if let JSXAttributeItem::Attribute(attr) = attr {
                let name = attr.name.as_identifier().map(|id| id.name.as_str()).unwrap_or("");
                result.template.push(' ');
                result.template.push_str(name);

                if let Some(value) = attr.value.as_ref() {
                    if let JSXAttributeValue::StringLiteral(s) = value {
                        result.template.push_str("=\"");
                        result.template.push_str(s.value.as_str());
                        result.template.push('"');
                    }
                }
            }
        }

        result.template.push('>');

        // 递归处理子节点
        for child in &elem.children {
            match child {
                JSXChild::Text(text) => {
                    result.template.push_str(text.value.as_str());
                }
                JSXChild::ExpressionContainer(expr_container) => {
                    let placeholder_idx = self.state.next_placeholder_index();
                    result.template.push_str(&MarkerKind::DynamicChildStart.to_html(Some(placeholder_idx)));

                    if !matches!(expr_container.expression, JSXExpression::EmptyExpression(_)) {
                        if let Some(expr) = expr_container.expression.as_expression() {
                            let check_config = crate::jsx::utils::CheckConfig::default_dom();
                            let is_dynamic = crate::jsx::utils::is_dynamic_expression(expr, check_config);
                            if is_dynamic {
                                result.child_bindings.push(ChildBinding {
                                    index: placeholder_idx,
                                    expression: expr.clone_in(self.allocator),
                                    is_text: false,
                                    needs_marker: false,
                                });
                            }
                        }
                    }
                }
                JSXChild::Element(child_elem) => {
                    self.transform_child_element(child_elem, result, false);
                }
                _ => {}
            }
        }

        result.template.push_str("</");
        result.template.push_str(&tag_name);
        result.template.push('>');
    }

    /// 处理动态表达式子节点
    fn transform_expression_child(
        &mut self,
        expr_container: &JSXExpressionContainer<'a>,
        result: &mut FragmentResult<'a>,
        _index: usize,
        needs_markers: bool,
    ) -> Option<ChildBinding<'a>> {
        let expr = &expr_container.expression;

        // 空表达式
        if matches!(expr, JSXExpression::EmptyExpression(_)) {
            return None;
        }

        let check_config = crate::jsx::utils::CheckConfig::default_dom();
        let expr = expr.as_expression()?;
        let is_dynamic = crate::jsx::utils::is_dynamic_expression(expr, check_config);

        if !is_dynamic {
            return None;
        }

        let placeholder_idx = self.state.next_placeholder_index();

        // 添加 marker
        if needs_markers {
            result.template.push_str(&MarkerKind::DynamicChildStart.to_html(Some(placeholder_idx)));
        }

        // 检测条件表达式并包装
        let config = &self.state.config;
        if config.wrap_conditionals && config.generate == GenerateMode::Dom {
            if matches!(expr, Expression::ConditionalExpression(_))
                || matches!(expr, Expression::LogicalExpression(_))
            {
                // 使用 ConditionWrapper 进行包装
                let mut wrapper = crate::jsx::condition::ConditionWrapper::new(self.allocator, self.state);
                let wrapped = wrapper.wrap(expr);
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
            expression: expr.clone_in(self.allocator),
            is_text: false,
            needs_marker: needs_markers,
        })
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

/// Fragment 转换结果
pub struct FragmentResult<'a> {
    /// 模板 HTML 字符串
    pub template: String,
    /// 子节点绑定 (使用 oxc_allocator::Vec 来持有 Expression)
    pub child_bindings: Vec<ChildBinding<'a>>,
    /// 是否为空
    pub is_empty: bool,
}

impl<'a> FragmentResult<'a> {
    /// 创建新的 Fragment 结果
    pub fn new() -> Self {
        Self {
            template: String::new(),
            child_bindings: Vec::new(),
            is_empty: true,
        }
    }
}

impl Default for FragmentResult<'_> {
    fn default() -> Self {
        Self::new()
    }
}
