//! JSX DOM 元素转换模块
//!
//! 提供 DOM 特定元素转换逻辑

use zeus_compiler_core::jsx::config::GenerateMode;
use zeus_compiler_core::jsx::state::JsxCompilerState;
use zeus_compiler_core::jsx::transform::JsxTransformer;
use zeus_compiler_core::jsx::utils::{get_jsx_tag_name, is_custom_element, is_svg_element, is_void_element};
use zeus_compiler_core::jsx::ir::{ElementResult, Renderer, MarkerKind};
use zeus_compiler_core::jsx::constants;
use oxc_allocator::{Allocator, CloneIn};
use oxc_ast::ast::*;
use oxc_span::GetSpan;
use oxc_span::{Ident, Str};

/// DOM 元素转换
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

    /// 创建 IdentifierReference
    fn ident_ref(&self, name: &str) -> IdentifierReference<'a> {
        IdentifierReference {
            name: Ident::from_in(name, self.allocator),
            span: Default::default(),
            node_id: Default::default(),
            reference_id: Default::default(),
        }
    }

    /// 创建 CallExpression
    fn call(&self, callee: IdentifierReference<'a>, args: Vec<Argument<'a>>) -> Expression<'a> {
        Expression::CallExpression(CallExpression {
            callee: Expression::Identifier(callee),
            arguments: self.allocator.vec(args),
            span: Default::default(),
            node_id: Default::default(),
            optional: false,
            pure: false,
        })
    }

    /// 转换 DOM 元素
    pub fn transform(&mut self, node: &mut JSXElement<'a>) -> ElementResult<'a> {
        let config = &self.state.config;
        let tag_name = get_jsx_tag_name(&node.opening_element.name);

        // 检测 SVG 包装需求
        let wrap_svg = self.needs_svg_wrapper(&tag_name);

        // 检测自定义元素
        let is_custom = is_custom_element(&tag_name);

        // 检测 importNode 使用
        let is_import_node = self.needs_import_node(node, &tag_name);

        // 检测自闭合元素
        let is_void = is_void_element(&tag_name);

        let mut result = ElementResult::new(tag_name.clone(), Renderer::Dom);
        result.is_svg = wrap_svg;
        result.is_custom_element = is_custom;
        result.is_import_node = is_import_node;

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
        if tag_name == "svg" {
            return false;
        }
        true
    }

    /// 检测是否需要 importNode
    fn needs_import_node(&self, node: &JSXElement<'a>, tag_name: &str) -> bool {
        if !constants::is_import_node_element(tag_name) {
            return false;
        }

        node.opening_element.attributes.iter().any(|attr| {
            if let JSXAttributeItem::Attribute(attr) = attr {
                attr.name.as_identifier().name.as_str() == "loading"
            } else {
                false
            }
        })
    }

    /// 处理属性
    fn transform_attributes(&mut self, node: &mut JSXElement<'a>, result: &mut ElementResult<'a>) {
        let attributes = &node.opening_element.attributes;

        let has_spread = attributes.iter().any(|attr| attr.as_spread().is_some());

        if has_spread {
            self.handle_spread_attributes(result);
            return;
        }

        for attr in attributes.iter() {
            match attr {
                JSXAttributeItem::Attribute(attr) => {
                    self.handle_normal_attribute(attr, result);
                }
                JSXAttributeItem::SpreadAttribute(_) => {}
            }
        }
    }

    /// 处理普通属性
    fn handle_normal_attribute(&mut self, attr: &JSXAttribute<'a>, result: &mut ElementResult<'a>) {
        let name = attr.name.as_identifier().name.as_str();
        let value_opt = attr.value.as_ref();

        let (namespace, attr_name) = crate::jsx::utils::parse_namespace(name);
        let kind = crate::jsx::utils::classify_attribute(
            attr_name,
            namespace,
            &result.tag_name,
            result.is_svg,
        );

        if let Some(value) = value_opt {
            if let JSXAttributeValue::ExpressionContainer(expr_container) = value {
                let expr = &expr_container.expression;
                let check_config = crate::jsx::utils::CheckConfig::default_dom();

                if crate::jsx::utils::is_dynamic_expression(expr, check_config) {
                    if kind.needs_effect() {
                        result.dynamics.push(crate::jsx::ir::DynamicAttr::new(
                            result.element_id.clone().unwrap_or_else(|| "_el$0".to_string()),
                            attr_name.to_string(),
                            expr.clone(),
                        ));

                        if let Some(helper) = kind.helper_name() {
                            self.state.register_helper(helper.to_string(), None);
                        }
                    } else {
                        let call = self.build_set_attr_call(result, attr_name, expr, kind);
                        result.exprs.push(call);
                    }
                } else {
                    self.inline_static_attribute(result, attr_name, expr);
                }
            }
        } else {
            if constants::is_boolean_attribute(attr_name) {
                result.template.push(' ');
                result.template.push_str(attr_name);
            }
        }
    }

    /// 处理 Spread 属性
    fn handle_spread_attributes(&mut self, result: &mut ElementResult<'a>) {
        self.state.register_helper("spread".to_string(), None);
        self.state.register_helper("mergeProps".to_string(), None);
    }

    /// 内联静态属性到模板
    fn inline_static_attribute(
        &mut self,
        result: &mut ElementResult<'a>,
        name: &str,
        expr: &Expression<'a>,
    ) {
        match expr {
            Expression::StringLiteral(s) => {
                result.template.push(' ');
                result.template.push_str(name);
                result.template.push_str("=\"");
                result.template.push_str(s.value.as_str());
                result.template.push('"');
            }
            Expression::BooleanLiteral(b) if b.value => {
                result.template.push(' ');
                result.template.push_str(name);
            }
            Expression::NumericLiteral(n) => {
                result.template.push(' ');
                result.template.push_str(name);
                result.template.push_str("=\"");
                result.template.push_str(&n.value.to_string());
                result.template.push('"');
            }
            _ => {}
        }
    }

    /// 构建 setAttribute 调用
    fn build_set_attr_call(
        &mut self,
        result: &mut ElementResult<'a>,
        name: &str,
        expr: &Expression<'a>,
        kind: crate::jsx::ir::AttrBindingKind,
    ) -> Expression<'a> {
        let elem_id = result.element_id.clone().unwrap_or_else(|| "_el$0".to_string());
        let attr_name_str = Str::from_in(name, self.allocator);
        match kind {
            crate::jsx::ir::AttrBindingKind::ClassName => {
                self.call(
                    self.ident_ref("className"),
                    vec![
                        elem_id.clone().clone_in(self.allocator).into(),
                        expr.clone().into(),
                    ],
                )
            }
            _ => {
                self.call(
                    self.ident_ref("setAttribute"),
                    vec![
                        elem_id.clone().clone_in(self.allocator).into(),
                        attr_name_str.into(),
                        expr.clone().into(),
                    ],
                )
            }
        }
    }

    /// 处理子节点
    fn transform_children(&mut self, node: &JSXElement<'a>, result: &mut ElementResult<'a>) {
        let config = &self.state.config;

        let filtered: Vec<_> = node
            .children
            .iter()
            .filter(|child| !crate::jsx::utils::is_useless_child(child))
            .collect();

        let last_element_index = self.find_last_element_index(&filtered);
        let needs_markers = config.hydratable && filtered.len() > 1;

        for (index, child) in filtered.iter().enumerate() {
            let is_last = index == last_element_index;

            match child {
                JSXChild::Element(elem) => {
                    self.transform_child_element(elem, result, is_last);
                }
                JSXChild::ExpressionContainer(expr_container) => {
                    let binding = self.transform_expression_child(expr_container, result, index, needs_markers);
                    if let Some(binding) = binding {
                        result.child_bindings.push(binding);
                    }
                }
                JSXChild::Text(text) => {
                    let content = crate::jsx::utils::normalize_whitespace(text.value.as_str());
                    result.template.push_str(&crate::jsx::utils::escape_html(&content, false));
                }
                _ => {}
            }
        }
    }

    /// 处理子元素
    fn transform_child_element(
        &mut self,
        elem: &JSXElement<'a>,
        result: &mut ElementResult<'a>,
        _is_last: bool,
    ) {
        let tag_name = get_jsx_tag_name(&elem.opening_element.name);

        result.template.push('<');
        result.template.push_str(&tag_name);

        for attr in &elem.opening_element.attributes {
            if let JSXAttributeItem::Attribute(attr) = attr {
                let name = attr.name.as_identifier().name.as_str();
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

        if !is_void_element(&tag_name) {
            for child in &elem.children {
                match child {
                    JSXChild::Text(text) => {
                        let content = crate::jsx::utils::normalize_whitespace(text.value.as_str());
                        result.template.push_str(&crate::jsx::utils::escape_html(&content, false));
                    }
                    JSXChild::ExpressionContainer(expr_container) => {
                        let placeholder_idx = self.state.next_placeholder_index();
                        result.template.push_str(&MarkerKind::DynamicChildStart.to_html(Some(placeholder_idx)));

                        if !expr_container.expression.is_null_literal() {
                            result.child_bindings.push(crate::jsx::ir::ChildBinding {
                                index: placeholder_idx,
                                expression: expr_container.expression.clone(),
                                is_text: false,
                                needs_marker: false,
                            });
                        }
                    }
                    JSXChild::Element(child_elem) => {
                        self.transform_child_element(child_elem, result, false);
                    }
                    _ => {}
                }
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
        result: &mut ElementResult<'a>,
        index: usize,
        needs_markers: bool,
    ) -> Option<crate::jsx::ir::ChildBinding<'a>> {
        let expr = &expr_container.expression;

        if expr_container.expression.is_null_literal() {
            return None;
        }

        let check_config = crate::jsx::utils::CheckConfig::default_dom();
        let is_dynamic = crate::jsx::utils::is_dynamic_expression(expr, check_config);

        if !is_dynamic {
            if let Some(lit) = self.evaluate_static_expression(expr) {
                return Some(crate::jsx::ir::ChildBinding::new(
                    self.state.next_placeholder_index(),
                    Expression::StringLiteral(StringLiteral {
                        value: Str::from_in(&lit, self.allocator),
                        span: Default::default(),
                        node_id: Default::default(),
                        lone_surrogates: Default::default(),
                        raw: Default::default(),
                    }),
                    true,
                ));
            }
            return None;
        }

        let placeholder_idx = self.state.next_placeholder_index();

        if needs_markers {
            result.template.push_str(&MarkerKind::DynamicChildStart.to_html(Some(placeholder_idx)));
        }

        let config = &self.state.config;
        if config.wrap_conditionals && config.generate == GenerateMode::Dom {
            if matches!(expr, Expression::ConditionalExpression(_))
                || matches!(expr, Expression::LogicalExpression(_))
            {
                let wrapped = self.wrap_conditional_expr(expr);
                return Some(crate::jsx::ir::ChildBinding::new(placeholder_idx, wrapped, false));
            }
        }

        Some(crate::jsx::ir::ChildBinding::new(placeholder_idx, expr.clone(), false))
    }

    /// 包装条件表达式
    fn wrap_conditional_expr(&mut self, expr: &Expression<'a>) -> Expression<'a> {
        let mut transformer = JsxTransformer::new(self.source, self.allocator, self.state);
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

    /// 评估静态表达式
    fn evaluate_static_expression(&self, expr: &Expression<'a>) -> Option<String> {
        match expr {
            Expression::StringLiteral(s) => Some(s.value.as_str().to_string()),
            Expression::TemplateLiteral(t) if t.expressions.is_empty() => {
                Some(t.quasis.first()?.value.cooked.as_str().to_string())
            }
            _ => None,
        }
    }

    /// 注册模板
    fn register_template(&self, result: &mut ElementResult<'a>) {
        if !result.dynamics.is_empty() || !result.child_bindings.is_empty() {
            self.state.register_helper("template".to_string(), None);
        }
        if !result.child_bindings.is_empty() {
            self.state.register_helper("insert".to_string(), None);
        }
        if !result.dynamics.is_empty() {
            self.state.register_helper(self.state.config.effect_wrapper.clone(), None);
        }

        if result.attr_bindings.iter().any(|b| matches!(b.kind, crate::jsx::ir::AttrBindingKind::Event)) {
            self.state.register_helper("delegateEvents".to_string(), None);
        }
    }
}
