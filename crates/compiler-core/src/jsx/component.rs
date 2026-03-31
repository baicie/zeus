//! JSX 组件转换模块
//!
//! 提供组件 JSX 元素的转换逻辑

use std::cell::Cell;

use oxc_allocator::{Allocator, CloneIn, Vec};
use oxc_ast::ast::*;
use oxc_ast::AstBuilder;
use oxc_span::{GetSpan, SPAN};
use oxc_syntax::node::NodeId;
use crate::jsx::ir::ComponentResult;
use crate::jsx::utils::{is_dynamic_expression, CheckConfig};

/// JSX 组件转换器
pub struct ComponentTransformer<'a, 'ctx> {
    /// 源代码
    pub source: &'a str,
    /// 内存分配器
    pub allocator: &'a Allocator,
    /// AST 构建器
    builder: AstBuilder<'a>,
    /// 编译器状态
    pub state: &'ctx mut crate::jsx::state::JsxCompilerState<'a>,
}

impl<'a, 'ctx> ComponentTransformer<'a, 'ctx> {
    /// 创建新的组件转换器
    pub fn new(
        source: &'a str,
        allocator: &'a Allocator,
        state: &'ctx mut crate::jsx::state::JsxCompilerState<'a>,
    ) -> Self {
        Self { source, allocator, builder: AstBuilder::new(allocator), state }
    }

    /// 创建 IdentifierReference
    fn ident_ref(&self, name: &str) -> IdentifierReference<'a> {
        self.builder.identifier_reference(SPAN, self.builder.ident(name))
    }

    /// 创建 IdentifierName
    fn ident_name(&self, name: &str) -> IdentifierName<'a> {
        IdentifierName { name: self.builder.ident(name), span: SPAN, node_id: Cell::new(NodeId::DUMMY) }
    }

    /// 创建 BindingIdentifier 并包装为 BindingPattern
    fn binding_pat(&self, name: &str) -> BindingPattern<'a> {
        BindingPattern::BindingIdentifier(self.builder.alloc(BindingIdentifier {
            name: self.builder.ident(name),
            span: SPAN,
            node_id: Cell::new(NodeId::DUMMY),
            symbol_id: Cell::new(None),
        }))
    }

    /// 创建 CallExpression
    fn call(&self, callee: IdentifierReference<'a>, args: Vec<'a, Argument<'a>>) -> Expression<'a> {
        Expression::CallExpression(self.builder.alloc(CallExpression {
            node_id: Cell::new(NodeId::DUMMY),
            span: SPAN,
            callee: Expression::Identifier(self.builder.alloc(callee)),
            arguments: args,
            optional: false,
            type_arguments: None,
            pure: false,
        }))
    }

    /// 创建 CallExpression（使用 identifier 名称）
    fn call_by_name(&self, name: &str, args: Vec<'a, Argument<'a>>) -> Expression<'a> {
        self.call(self.ident_ref(name), args)
    }

    /// 创建 BooleanLiteral
    fn bool_lit(&self, value: bool) -> Expression<'a> {
        Expression::BooleanLiteral(self.builder.alloc(BooleanLiteral {
            value,
            span: SPAN,
            node_id: Cell::new(NodeId::DUMMY),
        }))
    }

    /// 创建 StringLiteral
    fn str_lit(&self, value: &str) -> Expression<'a> {
        Expression::StringLiteral(self.builder.alloc(StringLiteral {
            value: self.builder.str(value),
            span: SPAN,
            node_id: Cell::new(NodeId::DUMMY),
            raw: Default::default(),
            lone_surrogates: Default::default(),
        }))
    }

    /// 创建 ObjectProperty
    fn obj_prop(&self, key: &str, value: Expression<'a>) -> ObjectPropertyKind<'a> {
        ObjectPropertyKind::ObjectProperty(self.builder.alloc(ObjectProperty {
            key: PropertyKey::StaticIdentifier(self.builder.alloc(self.ident_name(key))),
            value,
            kind: PropertyKind::Init,
            span: SPAN,
            node_id: Cell::new(NodeId::DUMMY),
            method: false,
            shorthand: false,
            computed: false,
        }))
    }

    /// 创建 ObjectExpression
    fn obj_expr(&self, properties: Vec<'a, ObjectPropertyKind<'a>>) -> Expression<'a> {
        Expression::ObjectExpression(self.builder.alloc(ObjectExpression {
            properties,
            span: SPAN,
            node_id: Cell::new(NodeId::DUMMY),
        }))
    }

    /// 转换组件 JSXElement
    pub fn transform_component(&mut self, node: &mut JSXElement<'a>) -> ComponentResult<'a> {
        let config = &self.state.config;

        // 1. 获取组件标识符
        let tag_id = self.convert_component_identifier(&node.opening_element.name);

        // 2. 检查内置组件
        if let Expression::Identifier(ident) = &tag_id {
            let name = ident.name.as_str();
            if config.built_ins.iter().any(|b| b.as_str() == name) {
                return self.transform_builtin_component(ident, node);
            }
        }

        // 3. 构建 props 对象
        let (props_expr, has_dynamic) = self.transform_component_props(node);

        // 4. 处理 children
        let children_result = self.transform_component_children(node);
        let final_props = self.merge_children_into_props(props_expr, children_result);

        // 5. 注册 helpers
        self.state.register_helper("createComponent".to_string(), None);
        if has_dynamic {
            self.state.register_helper("mergeProps".to_string(), None);
        }

        // 6. 生成 createComponent 调用
        self.call(
            self.ident_ref("createComponent"),
            self.builder.vec_from_iter([tag_id.into(), final_props.into()]),
        );

        ComponentResult::new(self.call(
            self.ident_ref("createComponent"),
            self.builder.vec_from_iter([tag_id.into(), final_props.into()]),
        ), has_dynamic)
    }

    /// 转换内置组件
    fn transform_builtin_component(&mut self, ident: &IdentifierReference, node: &mut JSXElement<'a>) -> ComponentResult<'a> {
        let name = ident.name.as_str();

        match name {
            "Show" => self.transform_show(node),
            "For" => self.transform_for(node),
            "Index" => self.transform_index(node),
            "Switch" | "Match" => self.transform_match(node, name == "Switch"),
            "Portal" => self.transform_portal(node),
            _ => {
                ComponentResult::new(
                    Expression::Identifier(self.builder.alloc(IdentifierReference {
                        name: ident.name,
                        span: ident.span,
                        node_id: Cell::new(NodeId::DUMMY),
                        reference_id: Default::default(),
                    })),
                    false,
                )
            }
        }
    }

    /// 转换 Show 组件
    fn transform_show(&mut self, node: &mut JSXElement<'a>) -> ComponentResult<'a> {
        ComponentResult::new(
            Expression::JSXElement(self.builder.alloc(node.clone_in(self.allocator))),
            true,
        )
    }

    /// 转换 For 组件
    fn transform_for(&mut self, node: &mut JSXElement<'a>) -> ComponentResult<'a> {
        ComponentResult::new(
            Expression::JSXElement(self.builder.alloc(node.clone_in(self.allocator))),
            true,
        )
    }

    /// 转换 Index 组件
    fn transform_index(&mut self, node: &mut JSXElement<'a>) -> ComponentResult<'a> {
        ComponentResult::new(
            Expression::JSXElement(self.builder.alloc(node.clone_in(self.allocator))),
            true,
        )
    }

    /// 转换 Switch/Match 组件
    fn transform_match(&mut self, node: &mut JSXElement<'a>, _is_switch: bool) -> ComponentResult<'a> {
        ComponentResult::new(
            Expression::JSXElement(self.builder.alloc(node.clone_in(self.allocator))),
            true,
        )
    }

    /// 转换 Portal 组件
    fn transform_portal(&mut self, node: &mut JSXElement<'a>) -> ComponentResult<'a> {
        self.state.register_helper("Portal".to_string(), None);
        ComponentResult::new(
            Expression::JSXElement(self.builder.alloc(node.clone_in(self.allocator))),
            true,
        )
    }

    /// 转换组件的 props
    fn transform_component_props(&mut self, node: &mut JSXElement<'a>) -> (Expression<'a>, bool) {
        let mut properties: Vec<'a, ObjectPropertyKind<'a>> = self.builder.vec();
        let mut spread_args: Vec<'a, Expression<'a>> = self.builder.vec();
        let mut has_dynamic = false;

        for attr in &node.opening_element.attributes {
            match attr {
                JSXAttributeItem::Attribute(attr) => {
                    let (key, value, is_dyn) = self.transform_prop_attr(attr);
                    has_dynamic = has_dynamic || is_dyn;
                    properties.push(self.obj_prop(&key, value));
                }
                JSXAttributeItem::SpreadAttribute(spread) => {
                    spread_args.push(spread.argument.clone_in(self.allocator));
                }
            }
        }

        if !spread_args.is_empty() {
            let merged = self.merge_spread_args(spread_args);
            (merged, true)
        } else {
            (self.obj_expr(properties), has_dynamic)
        }
    }

    /// 转换单个 prop 属性
    fn transform_prop_attr(&mut self, attr: &JSXAttribute<'a>) -> (String, Expression<'a>, bool) {
        let key = attr.name.as_identifier().unwrap().name.as_str().to_string();
        let value_opt = attr.value.as_ref();

        if let Some(value) = value_opt {
            if let JSXAttributeValue::ExpressionContainer(expr_container) = value {
                if let Some(expr) = expr_container.expression.as_expression() {
                    let check_config = CheckConfig { check_member: true, check_tags: true, ..Default::default() };
                    let is_dyn = is_dynamic_expression(expr, check_config);
                    return (key, expr.clone_in(self.allocator), is_dyn);
                }
            }
        }

        (key, self.bool_lit(true), false)
    }

    /// 转换 Spread 表达式
    fn transform_spread_expression(&mut self, spread: &JSXSpreadAttribute<'a>) -> Expression<'a> {
        spread.argument.clone_in(self.allocator)
    }

    /// 合并 spread 参数
    fn merge_spread_args(&mut self, spread_args: Vec<'a, Expression<'a>>) -> Expression<'a> {
        let merge_call = self.call(
            self.ident_ref("mergeProps"),
            self.builder.vec_from_iter(spread_args.into_iter().map(|e| e.into())),
        );

        Expression::ObjectExpression(self.builder.alloc(ObjectExpression {
            properties: self.builder.vec_from_iter([ObjectPropertyKind::ObjectProperty(self.builder.alloc(ObjectProperty {
                key: PropertyKey::StaticIdentifier(self.builder.alloc(self.ident_name("__spread"))),
                value: merge_call,
                kind: PropertyKind::Init,
                span: SPAN,
                node_id: Cell::new(NodeId::DUMMY),
                method: false,
                shorthand: false,
                computed: false,
            }))]),
            span: SPAN,
            node_id: Cell::new(NodeId::DUMMY),
        }))
    }

    /// 转换组件的 children
    fn transform_component_children(&mut self, node: &mut JSXElement<'a>) -> Option<Expression<'a>> {
        if node.children.is_empty() {
            return None;
        }

        if node.children.len() == 1 {
            if let JSXChild::Element(elem) = &node.children[0] {
                // ArrayExpressionElement::JSXElement 需要直接的 JSXElement，不是 Box
                return Some(Expression::JSXElement(self.builder.alloc(elem.clone_in(self.allocator))));
            }
        }

        let mut elements: Vec<'a, ArrayExpressionElement<'a>> = self.builder.vec();

        for child in &node.children {
            match child {
                JSXChild::Element(elem) => {
                    // ArrayExpressionElement::JSXElement 需要直接的 JSXElement
                    let cloned_elem = elem.clone_in(self.allocator);
                    elements.push(ArrayExpressionElement::JSXElement(cloned_elem));
                }
                JSXChild::ExpressionContainer(expr_container) => {
                    if !matches!(expr_container.expression, JSXExpression::EmptyExpression(_)) {
                        if let Some(expr) = expr_container.expression.as_expression() {
                            let cloned_expr = expr.clone_in(self.allocator);
                            // 直接将 Expression 转换为 ArrayExpressionElement
                            // 需要匹配 Expression 的每个变体
                            match cloned_expr {
                                Expression::Identifier(id) => elements.push(ArrayExpressionElement::Identifier(id)),
                                Expression::StringLiteral(s) => elements.push(ArrayExpressionElement::StringLiteral(s)),
                                Expression::NumericLiteral(n) => elements.push(ArrayExpressionElement::NumericLiteral(n)),
                                Expression::BooleanLiteral(b) => elements.push(ArrayExpressionElement::BooleanLiteral(b)),
                                Expression::NullLiteral(n) => elements.push(ArrayExpressionElement::NullLiteral(n)),
                                Expression::JSXElement(e) => elements.push(ArrayExpressionElement::JSXElement(e)),
                                Expression::JSXFragment(f) => elements.push(ArrayExpressionElement::JSXFragment(f)),
                                Expression::TemplateLiteral(t) => elements.push(ArrayExpressionElement::TemplateLiteral(t)),
                                Expression::ArrayExpression(a) => elements.push(ArrayExpressionElement::ArrayExpression(a)),
                                Expression::ObjectExpression(o) => elements.push(ArrayExpressionElement::ObjectExpression(o)),
                                Expression::ArrowFunctionExpression(a) => elements.push(ArrayExpressionElement::ArrowFunctionExpression(a)),
                                Expression::FunctionExpression(f) => elements.push(ArrayExpressionElement::FunctionExpression(f)),
                                Expression::BinaryExpression(b) => elements.push(ArrayExpressionElement::BinaryExpression(b)),
                                Expression::LogicalExpression(l) => elements.push(ArrayExpressionElement::LogicalExpression(l)),
                                Expression::ConditionalExpression(c) => elements.push(ArrayExpressionElement::ConditionalExpression(c)),
                                Expression::CallExpression(c) => elements.push(ArrayExpressionElement::CallExpression(c)),
                                Expression::MemberExpression(m) => elements.push(ArrayExpressionElement::MemberExpression(m)),
                                Expression::SequenceExpression(s) => elements.push(ArrayExpressionElement::SequenceExpression(s)),
                                Expression::UnaryExpression(u) => elements.push(ArrayExpressionElement::UnaryExpression(u)),
                                Expression::UpdateExpression(u) => elements.push(ArrayExpressionElement::UpdateExpression(u)),
                                Expression::AssignmentExpression(a) => elements.push(ArrayExpressionElement::AssignmentExpression(a)),
                                Expression::TaggedTemplateExpression(t) => elements.push(ArrayExpressionElement::TaggedTemplateExpression(t)),
                                Expression::YieldExpression(y) => elements.push(ArrayExpressionElement::YieldExpression(y)),
                                Expression::AwaitExpression(a) => elements.push(ArrayExpressionElement::AwaitExpression(a)),
                                Expression::NewExpression(n) => elements.push(ArrayExpressionElement::NewExpression(n)),
                                Expression::ThisExpression(t) => elements.push(ArrayExpressionElement::ThisExpression(t)),
                                Expression::Super(s) => elements.push(ArrayExpressionElement::Super(s)),
                                Expression::RegExpLiteral(r) => elements.push(ArrayExpressionElement::RegExpLiteral(r)),
                                Expression::BigIntLiteral(b) => elements.push(ArrayExpressionElement::BigIntLiteral(b)),
                                Expression::ClassExpression(c) => elements.push(ArrayExpressionElement::ClassExpression(c)),
                                Expression::ImportExpression(i) => elements.push(ArrayExpressionElement::ImportExpression(i)),
                                Expression::ChainExpression(c) => elements.push(ArrayExpressionElement::ChainExpression(c)),
                                Expression::PrivateInExpression(p) => elements.push(ArrayExpressionElement::PrivateInExpression(p)),
                                Expression::MetaProperty(m) => elements.push(ArrayExpressionElement::MetaProperty(m)),
                                Expression::ParenthesizedExpression(p) => elements.push(ArrayExpressionElement::ParenthesizedExpression(p)),
                                Expression::ComputedMemberExpression(m) => elements.push(ArrayExpressionElement::ComputedMemberExpression(m)),
                                Expression::StaticMemberExpression(m) => elements.push(ArrayExpressionElement::StaticMemberExpression(m)),
                                Expression::PrivateFieldExpression(p) => elements.push(ArrayExpressionElement::PrivateFieldExpression(p)),
                                _ => {}
                            }
                        }
                    }
                }
                JSXChild::Text(text) => {
                    elements.push(ArrayExpressionElement::StringLiteral(self.builder.alloc(StringLiteral {
                        value: self.builder.str(text.value.as_str()),
                        span: SPAN,
                        node_id: Cell::new(NodeId::DUMMY),
                        raw: Default::default(),
                        lone_surrogates: Default::default(),
                    })));
                }
                _ => {}
            }
        }

        if elements.len() == 1 {
            let elem = elements.into_iter().next().unwrap();
            // 从 ArrayExpressionElement 反向转换为 Expression
            match elem {
                ArrayExpressionElement::Identifier(id) => Some(Expression::Identifier(id)),
                ArrayExpressionElement::StringLiteral(s) => Some(Expression::StringLiteral(s)),
                ArrayExpressionElement::NumericLiteral(n) => Some(Expression::NumericLiteral(n)),
                ArrayExpressionElement::BooleanLiteral(b) => Some(Expression::BooleanLiteral(b)),
                ArrayExpressionElement::NullLiteral(n) => Some(Expression::NullLiteral(n)),
                ArrayExpressionElement::JSXElement(e) => Some(Expression::JSXElement(e)),
                ArrayExpressionElement::JSXFragment(f) => Some(Expression::JSXFragment(f)),
                ArrayExpressionElement::TemplateLiteral(t) => Some(Expression::TemplateLiteral(t)),
                ArrayExpressionElement::ArrayExpression(a) => Some(Expression::ArrayExpression(a)),
                ArrayExpressionElement::ObjectExpression(o) => Some(Expression::ObjectExpression(o)),
                ArrayExpressionElement::ArrowFunctionExpression(a) => Some(Expression::ArrowFunctionExpression(a)),
                ArrayExpressionElement::FunctionExpression(f) => Some(Expression::FunctionExpression(f)),
                ArrayExpressionElement::BinaryExpression(b) => Some(Expression::BinaryExpression(b)),
                ArrayExpressionElement::LogicalExpression(l) => Some(Expression::LogicalExpression(l)),
                ArrayExpressionElement::ConditionalExpression(c) => Some(Expression::ConditionalExpression(c)),
                ArrayExpressionElement::CallExpression(c) => Some(Expression::CallExpression(c)),
                ArrayExpressionElement::MemberExpression(m) => Some(Expression::MemberExpression(m)),
            ArrayExpressionElement::SequenceExpression(s) => Some(Expression::SequenceExpression(s)),
            ArrayExpressionElement::UnaryExpression(u) => Some(Expression::UnaryExpression(u)),
            ArrayExpressionElement::UpdateExpression(u) => Some(Expression::UpdateExpression(u)),
            ArrayExpressionElement::AssignmentExpression(a) => Some(Expression::AssignmentExpression(a)),
            ArrayExpressionElement::TaggedTemplateExpression(t) => Some(Expression::TaggedTemplateExpression(t)),
            ArrayExpressionElement::YieldExpression(y) => Some(Expression::YieldExpression(y)),
            ArrayExpressionElement::AwaitExpression(a) => Some(Expression::AwaitExpression(a)),
            ArrayExpressionElement::NewExpression(n) => Some(Expression::NewExpression(n)),
            ArrayExpressionElement::ThisExpression(t) => Some(Expression::ThisExpression(t)),
            ArrayExpressionElement::Super(s) => Some(Expression::Super(s)),
            ArrayExpressionElement::RegExpLiteral(r) => Some(Expression::RegExpLiteral(r)),
            ArrayExpressionElement::BigIntLiteral(b) => Some(Expression::BigIntLiteral(b)),
            ArrayExpressionElement::ClassExpression(c) => Some(Expression::ClassExpression(c)),
            ArrayExpressionElement::ImportExpression(i) => Some(Expression::ImportExpression(i)),
            ArrayExpressionElement::ChainExpression(c) => Some(Expression::ChainExpression(c)),
            ArrayExpressionElement::PrivateInExpression(p) => Some(Expression::PrivateInExpression(p)),
            ArrayExpressionElement::MetaProperty(m) => Some(Expression::MetaProperty(m)),
            ArrayExpressionElement::ParenthesizedExpression(p) => Some(Expression::ParenthesizedExpression(p)),
            ArrayExpressionElement::ComputedMemberExpression(m) => Some(Expression::ComputedMemberExpression(m)),
            ArrayExpressionElement::StaticMemberExpression(m) => Some(Expression::StaticMemberExpression(m)),
            ArrayExpressionElement::PrivateFieldExpression(p) => Some(Expression::PrivateFieldExpression(p)),
            _ => None
            }
        } else {
            Some(Expression::ArrayExpression(self.builder.alloc(ArrayExpression {
                elements,
                span: SPAN,
                node_id: Cell::new(NodeId::DUMMY),
            })))
        }
    }

    /// 将 children 合并到 props 对象
    fn merge_children_into_props(&mut self, props: Expression<'a>, children: Option<Expression<'a>>) -> Expression<'a> {
        let Some(children) = children else {
            return props;
        };

        if let Expression::ObjectExpression(obj) = props {
            let mut props_vec = obj.properties.into_vec();
            props_vec.push(ObjectPropertyKind::ObjectProperty(self.builder.alloc(ObjectProperty {
                key: PropertyKey::StaticIdentifier(self.builder.alloc(self.ident_name("children"))),
                value: children,
                kind: PropertyKind::Init,
                span: SPAN,
                node_id: Cell::new(NodeId::DUMMY),
                method: false,
                shorthand: false,
                computed: false,
            })));
            self.obj_expr(props_vec)
        } else {
            props
        }
    }

    /// 转换组件标识符
    fn convert_component_identifier(&mut self, name: &JSXElementName<'a>) -> Expression<'a> {
        match name {
            JSXElementName::Identifier(id) => Expression::Identifier(self.builder.alloc(IdentifierReference {
                name: self.builder.ident(id.name.as_str()),
                span: SPAN,
                node_id: Cell::new(NodeId::DUMMY),
                reference_id: Default::default(),
            })),
            JSXElementName::MemberExpression(member) => {
                self.member_expression_to_expr(member)
            }
            JSXElementName::NamespacedName(ns) => Expression::Identifier(self.builder.alloc(IdentifierReference {
                name: self.builder.ident(&format!("{}:{}", ns.namespace.name, ns.property.name)),
                span: SPAN,
                node_id: Cell::new(NodeId::DUMMY),
                reference_id: Default::default(),
            })),
            JSXElementName::IdentifierReference(id_ref) => Expression::Identifier(self.builder.alloc(IdentifierReference {
                name: id_ref.name,
                span: id_ref.span,
                node_id: Cell::new(NodeId::DUMMY),
                reference_id: Default::default(),
            })),
            JSXElementName::ThisExpression(_) => Expression::Identifier(self.builder.alloc(self.ident_ref("this"))),
        }
    }

    /// 将 JSXMemberExpression 转换为表达式
    fn member_expression_to_expr(&mut self, member: &JSXMemberExpression<'a>) -> Expression<'a> {
        let full_name = self.flatten_jsx_member_name(member);
        Expression::Identifier(self.builder.alloc(IdentifierReference {
            name: self.builder.ident(&full_name),
            span: SPAN,
            node_id: Cell::new(NodeId::DUMMY),
            reference_id: Default::default(),
        }))
    }

    /// 递归展开 JSXMemberExpression 为字符串
    fn flatten_jsx_member_name(&self, member: &JSXMemberExpression<'a>) -> String {
        let mut parts: Vec<String> = self.builder.vec();
        self.collect_member_parts(member, &mut parts);
        parts.reverse();
        parts.join(".")
    }

    /// 收集 MemberExpression 的各个部分
    fn collect_member_parts(&self, member: &JSXMemberExpression<'a>, parts: &mut Vec<String>) {
        parts.push(member.property.name.as_str().to_string());
        match &member.object {
            JSXMemberExpressionObject::IdentifierReference(id_ref) => {
                parts.push(id_ref.name.as_str().to_string());
            }
            JSXMemberExpressionObject::MemberExpression(inner) => {
                self.collect_member_parts(inner, parts);
            }
            JSXMemberExpressionObject::ThisExpression(_) => {
                parts.push("this".to_string());
            }
        }
    }
}
