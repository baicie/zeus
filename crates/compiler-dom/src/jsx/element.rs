//! JSX DOM 元素转换模块
//!
//! 提供 DOM 特定元素转换逻辑

use std::cell::Cell;

use oxc_allocator::CloneIn;
use oxc_allocator::Allocator;
use oxc_ast::ast::*;
use oxc_span::Str;
use zeus_compiler_core::jsx::config::GenerateMode;
use zeus_compiler_core::jsx::ir::{DynamicAttr, ElementResult, Renderer, MarkerKind, ChildBinding};
use zeus_compiler_core::jsx::state::JsxCompilerState;
use zeus_compiler_core::jsx::utils::{
    get_jsx_tag_name, is_custom_element, is_svg_element, is_void_element,
};

/// DOM 元素转换
#[allow(dead_code)]
pub struct DomElementTransformer<'a, 'ctx> {
    /// 源代码
    pub source: &'a str,
    /// 内存分配器
    pub allocator: &'a Allocator,
    /// 编译器状态
    pub state: &'ctx mut JsxCompilerState<'a>,
}

impl<'a, 'ctx> DomElementTransformer<'a, 'ctx> {
    /// 创建新的 DOM 元素转换器
    pub fn new(
        source: &'a str,
        allocator: &'a Allocator,
        state: &'ctx mut JsxCompilerState<'a>,
    ) -> Self {
        Self { source, allocator, state }
    }

    /// 转换 DOM 元素
    pub fn transform(&mut self, node: &mut JSXElement<'a>) -> ElementResult<'a> {
        let config = &self.state.config;
        let tag_name = get_jsx_tag_name(&node.opening_element.name);

        let wrap_svg = self.needs_svg_wrapper(&tag_name);
        let is_custom = is_custom_element(&tag_name);
        let is_void = is_void_element(&tag_name);

        let mut result = ElementResult::new(tag_name.clone(), Renderer::Dom);
        result.is_svg = wrap_svg;
        result.is_custom_element = is_custom;

        // SVG 包装
        if wrap_svg {
            result.template.push_str("<svg>");
        }

        // 标签开始
        result.template.push('<');
        result.template.push_str(&tag_name);

        // 生成元素 ID
        if !config.hydratable || !result.skip_template {
            result.element_id = Some(self.state.generate_element_name());
        }

        // 处理属性
        self.transform_attributes(node, &mut result);

        // 闭合标签
        result.template.push('>');

        // 处理子节点
        if !is_void && tag_name != "noscript" {
            self.transform_children(node, &mut result);
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

        // 注册模板
        self.register_template(&mut result);

        result
    }

    /// 检测是否需要 SVG 包装
    fn needs_svg_wrapper(&self, tag_name: &str) -> bool {
        if !is_svg_element(tag_name) {
            return false;
        }
        tag_name != "svg"
    }

    /// 处理属性
    fn transform_attributes(&mut self, node: &mut JSXElement<'a>, result: &mut ElementResult<'a>) {
        let attributes = &node.opening_element.attributes;

        for attr in attributes.iter() {
            if let JSXAttributeItem::Attribute(attr) = attr {
                self.handle_normal_attribute(attr, result);
            }
        }
    }

    /// 处理普通属性
    fn handle_normal_attribute(&mut self, attr: &JSXAttribute<'a>, result: &mut ElementResult<'a>) {
        let name = attr.name.as_identifier().map(|id| id.name.as_str()).unwrap_or("");
        let value_opt = attr.value.as_ref();

        if let Some(value) = value_opt {
            if let JSXAttributeValue::ExpressionContainer(expr_container) = value {
                let check_config = Default::default();

                if let Some(expr) = expr_container.expression.as_expression() {
                    let is_dynamic = self.is_dynamic_expr(expr, check_config);

                    if is_dynamic {
                        result.dynamics.push(DynamicAttr::new(
                            result.element_id.clone().unwrap_or_else(|| "_el$0".to_string()),
                            name.to_string(),
                            expr.clone_in(self.allocator),
                        ));
                    } else {
                        self.inline_static_attribute(result, name, expr);
                    }
                }
            }
        } else {
            self.inline_static_bool_attribute(result, name);
        }
    }

    /// 检测是否为动态表达式
    fn is_dynamic_expr(&self, _expr: &Expression, _config: ()) -> bool {
        // TODO: 实现动态性检测
        false
    }

    /// 内联静态属性到模板
    fn inline_static_attribute(&self, result: &mut ElementResult<'a>, name: &str, expr: &Expression<'a>) {
        if let Expression::StringLiteral(s) = expr {
            result.template.push(' ');
            result.template.push_str(name);
            result.template.push_str("=\"");
            result.template.push_str(s.value.as_str());
            result.template.push('"');
        }
    }

    /// 内联布尔属性
    fn inline_static_bool_attribute(&self, result: &mut ElementResult<'a>, name: &str) {
        result.template.push(' ');
        result.template.push_str(name);
    }

    /// 处理子节点
    fn transform_children(&mut self, node: &JSXElement<'a>, result: &mut ElementResult<'a>) {
        let config = &self.state.config;
        let filtered: Vec<_> = node.children.iter().collect();

        let _last_element_index = self.find_last_element_index(&filtered);
        let needs_markers = config.hydratable && filtered.len() > 1;

        for (index, child) in filtered.iter().enumerate() {
            match child {
                JSXChild::Text(text) => {
                    result.template.push_str(text.value.as_str());
                }
                JSXChild::ExpressionContainer(expr_container) => {
                    let binding = self.transform_expression_child(expr_container, result, index, needs_markers);
                    if let Some(binding) = binding {
                        result.child_bindings.push(binding);
                    }
                }
                _ => {}
            }
        }
    }

    /// 处理动态表达式子节点
    fn transform_expression_child(
        &mut self,
        _expr_container: &JSXExpressionContainer<'a>,
        result: &mut ElementResult<'a>,
        _index: usize,
        needs_markers: bool,
    ) -> Option<ChildBinding<'a>> {
        let placeholder_idx = self.state.next_placeholder_index();

        if needs_markers {
            result.template.push_str(&MarkerKind::DynamicChildStart.to_html(Some(placeholder_idx)));
        }

        let null_expr = Expression::NullLiteral(oxc_allocator::Box::new_in(NullLiteral {
            node_id: Cell::new(oxc_syntax::node::NodeId::DUMMY),
            span: Default::default(),
        }, self.allocator));

        Some(ChildBinding::new(placeholder_idx, null_expr, false))
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

    /// 注册模板
    fn register_template(&mut self, result: &mut ElementResult<'a>) {
        if !result.dynamics.is_empty() {
            self.state.register_helper(self.state.config.effect_wrapper.clone(), None);
        }
        if !result.child_bindings.is_empty() {
            self.state.register_helper("insert".to_string(), None);
        }
    }
}
