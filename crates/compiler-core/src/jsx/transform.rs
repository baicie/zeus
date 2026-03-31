//! JSX 编译器核心转换模块
//!
//! 提供 JSX 元素和表达式的转换逻辑

use std::cell::Cell;

use oxc_allocator::{Allocator, Box, CloneIn, Vec as OxcVec};
use oxc_ast::ast::*;
use oxc_ast::AstBuilder;
use oxc_span::SPAN;
use oxc_syntax::node::NodeId;

// Type alias for oxc_allocator::Vec with lifetime
type Vec<'a, T> = OxcVec<'a, T>;
use crate::jsx::config::GenerateMode;
use crate::jsx::ir::{ChildBinding, ElementResult, Renderer};
use crate::jsx::state::JsxCompilerState;
use crate::jsx::utils::{
    get_jsx_tag_name, is_component, is_custom_element, is_dynamic_expression,
    is_svg_element, is_void_element, CheckConfig,
};

/// JSX 转换器
pub struct JsxTransformer<'a, 'ctx> {
    /// 源代码
    pub source: &'a str,
    /// 内存分配器
    pub allocator: &'a Allocator,
    /// AST 构建器
    builder: AstBuilder<'a>,
    /// 编译器状态
    pub state: &'ctx mut JsxCompilerState<'a>,
}

impl<'a, 'ctx> JsxTransformer<'a, 'ctx> {
    /// 创建新的 JSX 转换器
    pub fn new(source: &'a str, allocator: &'a Allocator, state: &'ctx mut JsxCompilerState<'a>) -> Self {
        Self { source, allocator, builder: AstBuilder::new(allocator), state }
    }

    /// 创建 IdentifierReference
    fn ident_ref(&self, name: &str) -> IdentifierReference<'a> {
        self.builder.identifier_reference(SPAN, self.builder.ident(name))
    }

    /// 创建 BindingIdentifier
    fn binding_pat(&self, name: &str) -> BindingPattern<'a> {
        BindingPattern::BindingIdentifier(self.builder.alloc(BindingIdentifier {
            name: self.builder.ident(name),
            span: SPAN,
            node_id: Cell::new(NodeId::DUMMY),
            symbol_id: Cell::new(None),
        }))
    }

    /// 创建空参数列表
    fn empty_params(&self) -> Box<'a, FormalParameters<'a>> {
        self.builder.alloc(FormalParameters {
            node_id: Cell::new(NodeId::DUMMY),
            span: SPAN,
            kind: FormalParameterKind::FormalParameter,
            items: self.builder.vec(),
            rest: None,
        })
    }

    /// 创建 ArrowFunctionExpression（隐式返回）
    fn arrow_fn(&self, body: Expression<'a>) -> Expression<'a> {
        Expression::ArrowFunctionExpression(self.builder.alloc(
            ArrowFunctionExpression {
                node_id: Cell::new(NodeId::DUMMY),
                span: SPAN,
                expression: true,
                r#async: false,
                type_parameters: None,
                params: self.empty_params(),
                return_type: None,
                body: self.builder.alloc(FunctionBody {
                    node_id: Cell::new(NodeId::DUMMY),
                    span: SPAN,
                    directives: self.builder.vec(),
                    statements: self.builder.vec_from_iter([Statement::ExpressionStatement(
                        self.builder.alloc(ExpressionStatement {
                            node_id: Cell::new(NodeId::DUMMY),
                            span: SPAN,
                            expression: body,
                        })
                    )]),
                }),
                scope_id: Cell::new(None),
                pure: false,
                pife: false,
            },
        ))
    }

    /// 创建 CallExpression
    fn call(&self, callee: IdentifierReference<'a>, args: Vec<'a, Argument<'a>>) -> Expression<'a> {
        Expression::CallExpression(self.builder.alloc(CallExpression {
            node_id: Cell::new(NodeId::DUMMY),
            span: SPAN,
            callee: Expression::Identifier(self.builder.alloc(callee)),
            type_arguments: None,
            arguments: args,
            optional: false,
            pure: false,
        }))
    }

    /// 创建 CallExpression（无参数）
    fn call0(&self, name: &str) -> Expression<'a> {
        self.call(self.ident_ref(name), self.builder.vec())
    }

    /// 入口：处理 JSXElement
    pub fn transform_jsx_element(&mut self, node: &mut JSXElement<'a>) {
        let config = &self.state.config;
        let tag_name = get_jsx_tag_name(&node.opening_element.name);

        if is_component(&tag_name) {
            return;
        }

        match config.generate {
            GenerateMode::Dom => {
                let result = self.transform_element_dom(node);
                self.finish_element_transform(node, result);
            }
            GenerateMode::Ssr => {
                let result = self.transform_element_ssr(node);
                self.finish_ssr_transform(node, result);
            }
            GenerateMode::Universal => {
                let result = self.transform_element_universal(node);
                self.finish_element_transform(node, result);
            }
        }
    }

    /// DOM 元素转换
    fn transform_element_dom(&mut self, node: &mut JSXElement<'a>) -> ElementResult<'a> {
        let tag_name = get_jsx_tag_name(&node.opening_element.name);
        let config = &self.state.config;

        let wrap_svg = self.needs_svg_wrapper(&tag_name);
        let is_custom = is_custom_element(&tag_name);
        let is_import_node = self.needs_import_node(node, &tag_name);
        let is_void = is_void_element(&tag_name);

        let mut result = ElementResult::new(tag_name.clone(), Renderer::Dom);
        result.is_svg = wrap_svg;
        result.is_custom_element = is_custom;
        result.is_import_node = is_import_node;

        if wrap_svg {
            result.template.push_str("<svg>");
        }

        result.template.push('<');
        result.template.push_str(&tag_name);
        result.element_id = Some(self.state.generate_element_name());
        self.transform_attributes(node, &mut result);
        result.template.push('>');

        if !is_void && tag_name != "noscript" {
            self.transform_children(node, &mut result);
        }

        if !is_void {
            result.template.push_str("</");
            result.template.push_str(&tag_name);
            result.template.push('>');
        }

        if wrap_svg {
            result.template.push_str("</svg>");
        }

        result
    }

    /// SSR 元素转换
    fn transform_element_ssr(&mut self, node: &mut JSXElement<'a>) -> ElementResult<'a> {
        let tag_name = get_jsx_tag_name(&node.opening_element.name);
        let mut result = ElementResult::new(tag_name.clone(), Renderer::Ssr);

        result.template_parts.push(format!("<{}", tag_name));
        self.transform_ssr_attributes(node, &mut result);
        result.template_parts.push(">".to_string());
        self.transform_ssr_children(node, &mut result);
        result.template_parts.push(format!("</{}>", tag_name));

        result
    }

    /// Universal 元素转换
    fn transform_element_universal(&mut self, node: &mut JSXElement<'a>) -> ElementResult<'a> {
        let tag_name = get_jsx_tag_name(&node.opening_element.name);
        let mut result = ElementResult::new(tag_name.clone(), Renderer::Universal);

        self.transform_attributes(node, &mut result);
        self.transform_children(node, &mut result);

        result
    }

    /// 检测是否需要 SVG 包装
    fn needs_svg_wrapper(&self, tag_name: &str) -> bool {
        if !is_svg_element(tag_name) {
            return false;
        }
        true
    }

    /// 检测是否需要 importNode
    fn needs_import_node(&self, node: &JSXElement<'a>, tag_name: &str) -> bool {
        if !crate::jsx::constants::is_import_node_element(tag_name) {
            return false;
        }

        node.opening_element.attributes.iter().any(|attr| {
            if let JSXAttributeItem::Attribute(attr) = attr {
                if let Some(ident) = attr.name.as_identifier() {
                    ident.name.as_str() == "loading"
                } else {
                    false
                }
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
            self.handle_spread_attributes(attributes, result);
            return;
        }

        let merged_attributes = self.merge_class_attributes(attributes);

        for attr in merged_attributes.iter() {
            self.handle_normal_attribute(attr, result);
        }
    }

    /// 处理普通属性
    fn handle_normal_attribute(&mut self, attr: &JSXAttributeItem<'a>, result: &mut ElementResult<'a>) {
        if let JSXAttributeItem::Attribute(attr) = attr {
            let name = attr.name.as_identifier().unwrap().name.as_str();
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
                    let jsx_expr = &expr_container.expression;
                    let check_config = CheckConfig::default_dom();

                    let is_dynamic = if let Some(expr) = jsx_expr.as_expression() {
                        is_dynamic_expression(expr, check_config)
                    } else {
                        false
                    };

                    if is_dynamic {
                        if kind.needs_effect() {
                            if let Some(expr) = jsx_expr.as_expression() {
                                result.dynamics.push(crate::jsx::ir::DynamicAttr::new(
                                    result.element_id.clone().unwrap_or_else(|| "_el$0".to_string()),
                                    attr_name.to_string(),
                                    expr.clone_in(self.allocator),
                                ));
                            }
                        } else {
                            self.inline_static_jsx_expression(result, attr_name, jsx_expr);
                        }
                    } else {
                        self.inline_static_jsx_expression(result, attr_name, jsx_expr);
                    }
                }
            } else {
                if crate::jsx::constants::is_boolean_attribute(attr_name) {
                    result.template.push(' ');
                    result.template.push_str(attr_name);
                }
            }
        }
    }

    /// 内联静态 JSX 表达式到模板
    fn inline_static_jsx_expression(&mut self, result: &mut ElementResult<'a>, name: &str, expr: &JSXExpression<'a>) {
        if let Some(expr) = expr.as_expression() {
            self.inline_static_attribute(result, name, expr);
        }
    }

    /// 内联静态属性到模板
    fn inline_static_attribute(&mut self, result: &mut ElementResult<'a>, name: &str, expr: &Expression<'a>) {
        if let Expression::StringLiteral(s) = expr {
            result.template.push(' ');
            result.template.push_str(name);
            result.template.push_str("=\"");
            result.template.push_str(s.value.as_str());
            result.template.push('"');
        } else if let Expression::BooleanLiteral(b) = expr {
            if b.value {
                result.template.push(' ');
                result.template.push_str(name);
            }
        } else if let Expression::NumericLiteral(n) = expr {
            result.template.push(' ');
            result.template.push_str(name);
            result.template.push_str("=\"");
            result.template.push_str(&n.value.to_string());
            result.template.push('"');
        }
    }

    /// 处理 Spread 属性
    fn handle_spread_attributes(&mut self, attributes: &[JSXAttributeItem<'a>], result: &mut ElementResult<'a>) {
        self.state.register_helper("spread".to_string(), None);
        self.state.register_helper("mergeProps".to_string(), None);
    }

    /// 合并多个 class 属性
    fn merge_class_attributes(&self, attributes: &[JSXAttributeItem<'a>]) -> Vec<'a, JSXAttributeItem<'a>> {
        let mut result: Vec<'a, JSXAttributeItem<'a>> = self.builder.vec();
        let mut class_values: Vec<'a, String> = self.builder.vec();

        for attr in attributes {
            if let JSXAttributeItem::Attribute(attr) = attr {
                let name = attr.name.as_identifier().map(|id| id.name.as_str()).unwrap_or("");
                if name == "class" || name == "className" {
                    if let Some(value) = attr.value.as_ref() {
                        if let JSXAttributeValue::StringLiteral(s) = value {
                            class_values.push(s.value.as_str().to_string());
                            continue;
                        }
                    }
                }
            }
            result.push(attr.clone_in(self.allocator));
        }

        if !class_values.is_empty() {
            let _merged = class_values.join(" ");
        }

        result
    }

    /// 处理子节点
    fn transform_children(&mut self, node: &JSXElement<'a>, result: &mut ElementResult<'a>) {
        use std::vec::Vec;
        let config = &self.state.config;

        let filtered: Vec<&JSXChild<'a>> = node.children.iter()
            .filter(|child| !crate::jsx::utils::is_useless_child(child))
            .collect();
        let last_element_index = self.find_last_element_index(&filtered);
        let needs_markers = config.hydratable && filtered.len() > 1;

        for (index, child) in filtered.iter().enumerate() {
            let is_last = index == last_element_index;

            match child {
                JSXChild::Element(elem) => {
                    self.transform_child_element(elem, result, is_last, index);
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
    #[allow(clippy::too_many_arguments)]
    fn transform_child_element(
        &mut self,
        elem: &JSXElement<'a>,
        result: &mut ElementResult<'a>,
        _is_last: bool,
        _index: usize,
    ) {
        let tag_name = get_jsx_tag_name(&elem.opening_element.name);

        result.template.push('<');
        result.template.push_str(&tag_name);

        for attr in &elem.opening_element.attributes {
            self.handle_normal_attribute(attr, result);
        }

        result.template.push('>');

        if !is_void_element(&tag_name) {
            for child in &elem.children {
                match child {
                    JSXChild::Text(text) => {
                        let content = crate::jsx::utils::normalize_whitespace(text.value.as_str());
                        result.template.push_str(&crate::jsx::utils::escape_html(&content, false));
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
        _index: usize,
        needs_markers: bool,
    ) -> Option<ChildBinding<'a>> {
        let expr = &expr_container.expression;

        if matches!(expr, JSXExpression::EmptyExpression(_)) {
            return None;
        }

        let check_config = CheckConfig::default_dom();
        let Some(inner_expr) = expr.as_expression() else {
            return None;
        };

        let is_dynamic = is_dynamic_expression(inner_expr, check_config);

        if !is_dynamic {
            if let Some(lit) = self.evaluate_static_expression(inner_expr) {
                return Some(ChildBinding::new(
                    self.state.next_placeholder_index(),
                    Expression::StringLiteral(self.builder.alloc(StringLiteral {
                        value: self.builder.str(&lit),
                        span: SPAN,
                        node_id: Cell::new(NodeId::DUMMY),
                        raw: Default::default(),
                        lone_surrogates: Default::default(),
                    })),
                    true,
                ));
            }
            return None;
        }

        let placeholder_idx = self.state.next_placeholder_index();

        if needs_markers {
            result.template.push_str(&crate::jsx::ir::MarkerKind::DynamicChildStart.to_html(Some(placeholder_idx)));
        }

        let config = &self.state.config;
        if config.wrap_conditionals && config.generate == GenerateMode::Dom {
            if matches!(inner_expr, Expression::ConditionalExpression(_))
                || matches!(inner_expr, Expression::LogicalExpression(_))
            {
                let wrapped = self.wrap_conditional_expr(inner_expr);
                return Some(ChildBinding::new(placeholder_idx, wrapped, false));
            }
        }

        Some(ChildBinding::new(placeholder_idx, inner_expr.clone_in(self.allocator), false))
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
                Some(t.quasis.first()?.value.cooked?.as_str().to_string())
            }
            _ => None,
        }
    }

    /// 完成元素转换
    fn finish_element_transform(&mut self, _node: &mut JSXElement<'a>, result: ElementResult<'a>) {
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

        let mut template = crate::jsx::ir::TemplateDecl::new(
            self.state.generate_template_name(),
            result.template,
            result.renderer,
        );
        template.is_svg = result.is_svg;
        template.is_custom_element = result.is_custom_element;
        template.is_import_node = result.is_import_node;
        template.child_bindings = result.child_bindings;
        template.attr_bindings = result.attr_bindings;

        self.state.add_template(template);
    }

    /// 完成 SSR 转换
    fn finish_ssr_transform(&mut self, _node: &mut JSXElement<'a>, result: ElementResult<'a>) {
        self.state.register_helper("ssr".to_string(), None);

        let mut template = crate::jsx::ir::TemplateDecl::new(
            self.state.generate_template_name(),
            String::new(),
            result.renderer,
        );
        template.template_parts = result.template_parts;

        self.state.add_template(template);
    }

    /// 包装条件表达式
    fn wrap_conditional_expr(&mut self, expr: &Expression<'a>) -> Expression<'a> {
        match expr {
            Expression::ConditionalExpression(cond) => {
                let test = &cond.test;
                let check_config = CheckConfig { check_member: true, ..CheckConfig::default_dom() };

                if is_dynamic_expression(test, check_config) {
                    let memo_id = self.state.generate_component_name();
                    self.state.register_helper(self.state.config.memo_wrapper.clone(), None);

                    let memo_call = self.call(
                        self.ident_ref(&self.state.config.memo_wrapper),
                        self.builder.vec_from_iter([self.arrow_fn(test.clone_in(self.allocator)).into()]),
                    );

                    let var_decl = Statement::VariableDeclaration(self.builder.alloc(
                        VariableDeclaration {
                            node_id: Cell::new(NodeId::DUMMY),
                            span: SPAN,
                            kind: VariableDeclarationKind::Const,
                            declare: false,
                            declarations: self.builder.vec_from_iter([VariableDeclarator {
                                node_id: Cell::new(NodeId::DUMMY),
                                span: SPAN,
                                id: self.binding_pat(&memo_id),
                                init: Some(memo_call.into()),
                                definite: false,
                                kind: VariableDeclarationKind::Const,
                                type_annotation: None,
                            }]),
                        },
                    ));

                    let mut new_cond = cond.clone_in(self.allocator);
                    new_cond.test = self.call0(&memo_id);

                    let arrow_fn = Expression::ArrowFunctionExpression(self.builder.alloc(
                        ArrowFunctionExpression {
                            node_id: Cell::new(NodeId::DUMMY),
                            span: SPAN,
                            expression: false,
                            r#async: false,
                            type_parameters: None,
                            params: self.empty_params(),
                            return_type: None,
                            body: self.builder.alloc(FunctionBody {
                                node_id: Cell::new(NodeId::DUMMY),
                                span: SPAN,
                                directives: self.builder.vec(),
                                statements: self.builder.vec_from_iter([
                                    var_decl,
                                    Statement::ReturnStatement(self.builder.alloc(ReturnStatement {
                                        node_id: Cell::new(NodeId::DUMMY),
                                        span: SPAN,
                                        argument: Some(Expression::ConditionalExpression(new_cond)),
                                    })),
                                ]),
                            }),
                            scope_id: Cell::new(None),
                            pure: false,
                            pife: false,
                        },
                    ));

                    self.call(
                        self.ident_ref("_"),
                        self.builder.vec_from_iter([arrow_fn.into()]),
                    )
                } else {
                    expr.clone_in(self.allocator)
                }
            }
            _ => expr.clone_in(self.allocator),
        }
    }

    /// 处理 SSR 属性
    fn transform_ssr_attributes(&mut self, node: &mut JSXElement<'a>, result: &mut ElementResult<'a>) {
        for attr in &node.opening_element.attributes {
            if let JSXAttributeItem::Attribute(attr) = attr {
                let name = attr.name.as_identifier().map(|id| id.name.as_str()).unwrap_or("");
                let value_opt = attr.value.as_ref();

                if let Some(value) = value_opt {
                    if let JSXAttributeValue::ExpressionContainer(expr_container) = value {
                        if let Some(expr) = expr_container.expression.as_expression() {
                            if name == "style" {
                                let ssr_call = self.call(
                                    self.ident_ref("ssrStyle"),
                                    self.builder.vec_from_iter([expr.clone_in(self.allocator).into()]),
                                );
                                result.template_parts.push(" style=\"".to_string());
                                result.template_values.push(ssr_call);
                            } else {
                                result.template_parts.push(format!(" {}=\"", name));
                                result.template_values.push(expr.clone_in(self.allocator));
                            }
                        }
                    }
                }
            }
        }
    }

    /// 处理 SSR 子节点
    fn transform_ssr_children(&mut self, node: &JSXElement<'a>, result: &mut ElementResult<'a>) {
        for child in &node.children {
            match child {
                JSXChild::Text(text) => {
                    let content = crate::jsx::utils::escape_html(text.value.as_str(), false);
                    result.template_parts.push(content);
                }
                JSXChild::ExpressionContainer(expr_container) => {
                    if let Some(expr) = expr_container.expression.as_expression() {
                        result.template_values.push(expr.clone_in(self.allocator));
                    }
                }
                _ => {}
            }
        }
    }
}
