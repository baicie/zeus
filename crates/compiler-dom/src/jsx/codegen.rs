//! JSX DOM 代码生成模块
//!
//! 提供完整的代码生成逻辑

use zeus_compiler_core::jsx::ir::{ChildBinding, DynamicAttr, ElementResult, TemplateDecl};
use zeus_compiler_core::jsx::state::JsxCompilerState;
use zeus_compiler_core::jsx::template::TemplateGenerator;
use oxc_allocator::{Allocator, Box, CloneIn, FromIn, Vec};
use oxc_ast::ast::*;
use oxc_ast::AstBuilder;
use oxc_span::GetSpan;
use oxc_span::SPAN;

/// DOM 代码生成器
pub struct DomCodegen<'a> {
    /// 内存分配器
    allocator: &'a Allocator,
    /// AST 构建器
    builder: AstBuilder<'a>,
}

impl<'a> DomCodegen<'a> {
    /// 创建新的代码生成器
    pub fn new(allocator: &'a Allocator) -> Self {
        Self { allocator, builder: AstBuilder::new(allocator) }
    }

    /// 创建表达式语句
    fn expr_stmt(&self, expr: Expression<'a>) -> Statement<'a> {
        Statement::ExpressionStatement(self.builder.alloc(ExpressionStatement {
            node_id: Default::default(),
            span: SPAN,
            expression: expr,
        }))
    }

    /// 创建 IdentifierReference
    fn ident_ref(&self, name: &str) -> IdentifierReference<'a> {
        self.builder.identifier_reference(SPAN, self.builder.ident(name))
    }

    /// 创建空参数列表
    fn empty_params(&self) -> Box<'a, FormalParameters<'a>> {
        self.builder.alloc(FormalParameters {
            node_id: Default::default(),
            span: SPAN,
            kind: FormalParameterKind::FormalParameter,
            items: self.builder.vec(),
            rest: None,
        })
    }

    /// 创建 CallExpression
    fn make_call(&self, callee: IdentifierReference<'a>, args: Vec<'a, Argument<'a>>) -> Expression<'a> {
        Expression::CallExpression(self.builder.alloc(CallExpression {
            node_id: Default::default(),
            span: SPAN,
            callee: Expression::Identifier(callee),
            type_arguments: None,
            arguments: args,
            optional: false,
        }))
    }

    /// 生成完整的元素代码
    pub fn generate_element_code(&self, result: ElementResult<'a>) -> Expression<'a> {
        // 1. 纯静态元素 → 直接返回模板引用
        if result.declarations.is_empty()
            && result.exprs.is_empty()
            && result.dynamics.is_empty()
            && result.post_exprs.is_empty()
        {
            return self.make_call(self.ident_ref("_tmpl$0"), self.builder.vec());
        }

        // 2. 收集所有语句
        let mut statements: Vec<'a, Statement<'a>> = self.builder.vec_from_iter(
            result.declarations.into_iter().map(|e| self.expr_stmt(e)),
        );
        statements.extend(
            self.builder
                .vec_from_iter(result.exprs.into_iter().map(|e| self.expr_stmt(e))),
        );

        // 3. 包装动态属性为 effect
        if !result.dynamics.is_empty() {
            let effect_stmt = self.generate_effect_wrapper(&result.dynamics);
            statements.push(effect_stmt);
        }

        // 4. 后置表达式
        statements.extend(
            self.builder
                .vec_from_iter(result.post_exprs.into_iter().map(|e| self.expr_stmt(e))),
        );

        // 5. 返回元素
        if let Some(elem_id) = &result.element_id {
            statements.push(Statement::ReturnStatement(self.builder.alloc(ReturnStatement {
                node_id: Default::default(),
                span: SPAN,
                argument: Some(elem_id.clone().clone_in(self.allocator).into()),
            })));
        }

        // 6. 包装为立即执行的箭头函数
        let fn_expr = Expression::ArrowFunctionExpression(self.builder.alloc(
            ArrowFunctionExpression {
                node_id: Default::default(),
                span: SPAN,
                expression: false,
                r#async: false,
                type_parameters: None,
                params: self.empty_params(),
                return_type: None,
                body: self.builder.alloc(FunctionBody {
                    node_id: Default::default(),
                    span: SPAN,
                    directives: self.builder.vec(),
                    statements,
                }),
                scope_id: Default::default(),
            },
        ));

        self.make_call(self.ident_ref("_"), self.builder.vec_from_iter([fn_expr.into()]))
    }

    /// 生成 effect 包装
    fn generate_effect_wrapper(&self, dynamics: &[DynamicAttr<'a>]) -> Statement<'a> {
        let effect_fn = if dynamics.len() == 1 {
            let dyn_attr = &dynamics[0];
            Expression::ArrowFunctionExpression(self.builder.alloc(
                ArrowFunctionExpression {
                    node_id: Default::default(),
                    span: SPAN,
                    expression: true,
                    r#async: false,
                    type_parameters: None,
                    params: self.empty_params(),
                    return_type: None,
                    body: self.builder.alloc(FunctionBody {
                        node_id: Default::default(),
                        span: SPAN,
                        directives: self.builder.vec(),
                        statements: self.builder.vec_from_iter([self.expr_stmt(self.make_call(
                            self.ident_ref(&self.get_setter_name(&dyn_attr.key)),
                            self.builder
                                .vec_from_iter([dyn_attr.elem.clone().into(), dyn_attr.value.clone().into()]),
                        )]),
                    }),
                    scope_id: Default::default(),
                },
            ))
        } else {
            Expression::ArrowFunctionExpression(self.builder.alloc(
                ArrowFunctionExpression {
                    node_id: Default::default(),
                    span: SPAN,
                    expression: false,
                    r#async: false,
                    type_parameters: None,
                    params: self.empty_params(),
                    return_type: None,
                    body: self.builder.alloc(FunctionBody {
                        node_id: Default::default(),
                        span: SPAN,
                        directives: self.builder.vec(),
                        statements: self.builder.vec_from_iter(
                            dynamics.iter().map(|dyn_attr| {
                                self.expr_stmt(self.make_call(
                                    self.ident_ref(&self.get_setter_name(&dyn_attr.key)),
                                    self.builder
                                        .vec_from_iter([dyn_attr.elem.clone().into(), dyn_attr.value.clone().into()]),
                                ))
                            }),
                        ),
                    }),
                    scope_id: Default::default(),
                },
            ))
        };

        self.expr_stmt(self.make_call(
            self.ident_ref("effect"),
            self.builder.vec_from_iter([effect_fn.into()]),
        ))
    }

    /// 获取属性 setter 名称
    fn get_setter_name(&self, key: &str) -> String {
        match key {
            "className" | "class" => "className".to_string(),
            "classList" => "classList".to_string(),
            "style" => "style".to_string(),
            "ref" => "use".to_string(),
            _ if key.starts_with("on") => "delegateEvents".to_string(),
            _ => "setAttribute".to_string(),
        }
    }
}
