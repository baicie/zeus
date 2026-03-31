//! JSX DOM 模板生成模块
//!
//! 提供模板声明生成逻辑

use zeus_compiler_core::jsx::ir::{ChildBinding, TemplateDecl};
use zeus_compiler_core::jsx::state::JsxCompilerState;
use oxc_allocator::{Allocator, CloneIn};
use oxc_ast::ast::*;
use oxc_span::{Ident, Str};

/// 模板生成器
pub struct TemplateGenerator<'a> {
    /// 内存分配器
    allocator: &'a Allocator,
}

impl<'a> TemplateGenerator<'a> {
    /// 创建新的模板生成器
    pub fn new(allocator: &'a Allocator) -> Self {
        Self { allocator }
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

    /// 生成模板声明
    pub fn generate_template_declaration(
        &self,
        tmpl: &TemplateDecl<'a>,
    ) -> Statement<'a> {
        let args: Vec<Expression<'a>> = if tmpl.is_svg
            || tmpl.is_custom_element
            || tmpl.is_import_node
        {
            vec![
                self.template_literal(&tmpl.html).into(),
                Expression::BooleanLiteral(BooleanLiteral {
                    value: tmpl.is_import_node,
                    span: Default::default(),
                    node_id: Default::default(),
                })
                .into(),
                Expression::BooleanLiteral(BooleanLiteral {
                    value: tmpl.is_svg,
                    span: Default::default(),
                    node_id: Default::default(),
                })
                .into(),
            ]
        } else {
            vec![self.template_literal(&tmpl.html).into()]
        };

        let template_call = self.call(self.ident_ref("template"), args);
        let pure_template = self.add_pure_annotation(template_call);

        Statement::VariableDeclaration(Box::new(VariableDeclaration {
            node_id: Default::default(),
            span: Default::default(),
            kind: VariableDeclarationKind::Const,
            declare: false,
            declarations: self.allocator.vec([VariableDeclarator {
                node_id: Default::default(),
                span: Default::default(),
                id: BindingIdentifier {
                    name: Ident::from_in(tmpl.name.as_str(), self.allocator),
                    span: Default::default(),
                    node_id: Default::default(),
                    symbol_id: Default::default(),
                },
                init: Some(pure_template.into()),
                definite: false,
                kind: VariableDeclarationKind::Const,
            }]),
        }))
    }

    /// 生成模板字面量
    fn template_literal(&self, html: &str) -> Expression<'a> {
        Expression::TemplateLiteral(TemplateLiteral {
            node_id: Default::default(),
            span: Default::default(),
            quasis: self.allocator.alloc([TemplateElement {
                node_id: Default::default(),
                span: Default::default(),
                tail: true,
                value: TemplateElementValue {
                    cooked: html.to_string(),
                    raw: html.to_string(),
                },
            }]),
            expressions: self.allocator.vec([]),
        })
    }

    /// 添加纯函数注释
    fn add_pure_annotation(&self, expr: Expression<'a>) -> Expression<'a> {
        Expression::SequenceExpression(SequenceExpression {
            expressions: self.allocator.vec([
                Expression::UnaryExpression(UnaryExpression {
                    node_id: Default::default(),
                    operator: UnaryOperator::Typeof,
                    argument: Box::new(Expression::Identifier(self.ident_ref("undefined"))),
                    span: Default::default(),
                }),
                expr,
            ]),
            span: Default::default(),
        })
    }

    /// 生成 insert 调用
    #[allow(clippy::vec_box)]
    pub fn generate_insert_call(
        &self,
        template_name: &str,
        child_bindings: &[ChildBinding<'a>],
    ) -> Vec<Statement<'a>> {
        child_bindings
            .iter()
            .map(|binding| {
                let call = self.call(
                    self.ident_ref("insert"),
                    vec![
                        template_name.to_string().clone_in(self.allocator).into(),
                        binding.expression.clone().into(),
                        Expression::NullLiteral(NullLiteral {
                            node_id: Default::default(),
                            span: Default::default(),
                        }).into(),
                    ],
                );

                Statement::ExpressionStatement(Box::new(ExpressionStatement {
                    node_id: Default::default(),
                    span: Default::default(),
                    expression: call,
                }))
            })
            .collect()
    }

    /// 生成 effect 调用
    pub fn generate_effect_call(
        &self,
        effect_fn: Expression<'a>,
        state: &JsxCompilerState,
    ) -> Statement<'a> {
        let effect_call = self.call(
            self.ident_ref(&state.config.effect_wrapper),
            vec![effect_fn.into()],
        );

        Statement::ExpressionStatement(Box::new(ExpressionStatement {
            node_id: Default::default(),
            span: Default::default(),
            expression: effect_call,
        }))
    }
}
