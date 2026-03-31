//! JSX 编译器后处理模块
//!
//! 在 AST 遍历后执行代码生成优化和辅助函数注册

use std::cell::Cell;

use oxc_syntax::node::NodeId;
use crate::jsx::ir::{Renderer, TemplateDecl};
use crate::jsx::state::JsxCompilerState;
use oxc_allocator::{Allocator, Box, CloneIn, FromIn, Vec};
use oxc_ast::ast::*;
use oxc_span::{Ident, Str};

/// 执行后处理
#[allow(dead_code)]
pub fn postprocess<'a>(
    program: &mut Program<'a>,
    state: &mut JsxCompilerState<'a>,
    allocator: &'a Allocator,
) {
    // 1. 注册 delegateEvents 调用
    if !state.delegated_events.is_empty() {
        let delegate_call = build_delegate_events_call(state, allocator);
        program.body.insert(0, Statement::ExpressionStatement(Box::new(delegate_call)));
    }

    // 2. 注册模板声明
    if !state.templates.is_empty() {
        let dom_templates: Vec<_> = state
            .templates
            .iter()
            .filter(|t| t.renderer == Renderer::Dom)
            .collect();

        if !dom_templates.is_empty() {
            let template_decls = generate_template_declarations(dom_templates, allocator);
            program.body.splice(0..0, template_decls);
        }
    }
}

/// 生成 delegateEvents 调用
fn build_delegate_events_call<'a>(
    state: &JsxCompilerState<'a>,
    allocator: &'a Allocator,
) -> Expression<'a> {
    let events: Vec<'a, Expression<'a>> = state
        .delegated_events
        .iter()
        .map(|name| {
            Expression::StringLiteral(StringLiteral {
                value: Str::from_in(name.as_str(), allocator),
                span: Default::default(),
                node_id: Cell::new(NodeId::DUMMY),
                lone_surrogates: Default::default(),
                raw: Default::default(),
            })
        })
        .collect();

    Expression::CallExpression(CallExpression {
        callee: Expression::Identifier(IdentifierReference {
            name: Ident::from_in("delegateEvents", allocator),
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
            reference_id: Default::default(),
        }),
        arguments: Vec::from_iter_in([Expression::ArrayExpression(ArrayExpression {
            elements: Vec::from_iter_in(events.into_iter().map(|e| ArrayExpressionElement::Expression(e)), allocator),
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
        })
        .into()], allocator),
        span: Default::default(),
        node_id: Cell::new(NodeId::DUMMY),
        optional: false,
        pure: false,
        type_arguments: None,
    })
}

/// 生成 DOM 模板声明
pub fn generate_template_declarations<'a>(
    templates: &[&TemplateDecl<'a>],
    allocator: &'a Allocator,
) -> Vec<'a, Statement<'a>> {
    templates
        .iter()
        .map(|tmpl| {
            let args: Vec<'a, Argument<'a>> = if tmpl.is_svg
                || tmpl.is_custom_element
                || tmpl.is_import_node
            {
                Vec::from_iter_in([
                    template_literal(&tmpl.html, allocator).into(),
                    Expression::BooleanLiteral(BooleanLiteral {
                        value: tmpl.is_import_node,
                        span: Default::default(),
                        node_id: Cell::new(NodeId::DUMMY),
                    })
                    .into(),
                    Expression::BooleanLiteral(BooleanLiteral {
                        value: tmpl.is_svg,
                        span: Default::default(),
                        node_id: Cell::new(NodeId::DUMMY),
                    })
                    .into(),
                ], allocator)
            } else {
                Vec::from_iter_in([template_literal(&tmpl.html, allocator).into()], allocator)
            };

            let template_call = Expression::CallExpression(CallExpression {
                callee: Expression::Identifier(IdentifierReference {
                    name: Ident::from_in("template", allocator),
                    span: Default::default(),
                    node_id: Cell::new(NodeId::DUMMY),
                    reference_id: Default::default(),
                }),
                arguments: args,
                span: Default::default(),
                node_id: Cell::new(NodeId::DUMMY),
                optional: false,
                pure: false,
                type_arguments: None,
            });

            Statement::VariableDeclaration(Box::new(VariableDeclaration {
                node_id: Cell::new(NodeId::DUMMY),
                span: Default::default(),
                kind: VariableDeclarationKind::Const,
                declare: false,
                declarations: Vec::from_iter_in([VariableDeclarator {
                    node_id: Cell::new(NodeId::DUMMY),
                    span: Default::default(),
                    kind: VariableDeclarationKind::Const,
                    id: BindingPattern::BindingIdentifier(Box::new(BindingIdentifier {
                        name: Ident::from_in(tmpl.name.as_str(), allocator),
                        span: Default::default(),
                        node_id: Cell::new(NodeId::DUMMY),
                        symbol_id: Default::default(),
                    })),
                    init: Some(template_call.into()),
                    definite: false,
                    type_annotation: None,
                }], allocator),
            }))
        })
        .collect()
}

/// 生成模板字面量
fn template_literal<'a>(html: &str, allocator: &'a Allocator) -> Expression<'a> {
    let cooked = html.to_string();
    let raw = html.to_string();

    Expression::TemplateLiteral(TemplateLiteral {
        node_id: Cell::new(NodeId::DUMMY),
        span: Default::default(),
        quasis: allocator.alloc([TemplateElement {
            node_id: Cell::new(NodeId::DUMMY),
            span: Default::default(),
            tail: true,
            value: TemplateElementValue { cooked, raw },
        }]),
        expressions: Vec::new_in(allocator),
    })
}
