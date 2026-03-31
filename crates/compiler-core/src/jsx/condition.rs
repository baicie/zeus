//! JSX 条件表达式处理模块
//!
//! 提供条件/逻辑表达式的 memo 包装逻辑

use std::cell::Cell;

use oxc_syntax::node::NodeId;
use crate::jsx::state::JsxCompilerState;
use crate::jsx::utils::{is_dynamic_expression, CheckConfig};
use oxc_allocator::{Allocator, Box, CloneIn, FromIn, Vec};
use oxc_ast::ast::*;
use oxc_span::{Ident, Str};

/// 条件表达式包装器
pub struct ConditionWrapper<'a, 'ctx> {
    /// 内存分配器
    allocator: &'a Allocator,
    /// 编译器状态
    state: &'ctx mut JsxCompilerState<'a>,
}

impl<'a, 'ctx> ConditionWrapper<'a, 'ctx> {
    /// 创建新的条件包装器
    pub fn new(allocator: &'a Allocator, state: &'ctx mut JsxCompilerState<'a>) -> Self {
        Self { allocator, state }
    }

    /// 创建 IdentifierReference
    fn ident_ref(&self, name: &str) -> IdentifierReference<'a> {
        IdentifierReference {
            name: Ident::from_in(name, self.allocator),
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
            reference_id: Default::default(),
        }
    }

    /// 创建 BindingIdentifier
    fn binding_ident(&self, name: &str) -> BindingIdentifier<'a> {
        BindingIdentifier {
            name: Ident::from_in(name, self.allocator),
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
            symbol_id: Default::default(),
        }
    }

    /// 创建空参数列表
    fn empty_params(&self) -> Box<FormalParameters<'a>> {
        Box::new(FormalParameters {
            node_id: Cell::new(NodeId::DUMMY),
            span: Default::default(),
            kind: FormalParameterKind::FormalParameter,
            items: Vec::new_in(self.allocator),
            rest: None,
        })
    }

    /// 创建 ArrowFunctionExpression（隐式返回）
    fn arrow_fn(&self, body: Expression<'a>) -> Expression<'a> {
        Expression::ArrowFunctionExpression(ArrowFunctionExpression {
            node_id: Cell::new(NodeId::DUMMY),
            span: Default::default(),
            expression: true,
            r#async: false,
            type_parameters: None,
            params: self.empty_params(),
            return_type: None,
            body: Box::new(FunctionBody {
                node_id: Cell::new(NodeId::DUMMY),
                span: Default::default(),
                directives: Vec::new_in(self.allocator),
                statements: Vec::from_iter_in([Statement::ExpressionStatement(Box::new(
                    ExpressionStatement {
                        node_id: Cell::new(NodeId::DUMMY),
                        span: Default::default(),
                        expression: body,
                    },
                ))], self.allocator),
            }),
            scope_id: Default::default(),
            pure: false,
            pife: false,
        })
    }

    /// 创建 ArrowFunctionExpression（返回块）
    fn arrow_fn_block(&self, body: Statement<'a>) -> Expression<'a> {
        Expression::ArrowFunctionExpression(ArrowFunctionExpression {
            node_id: Cell::new(NodeId::DUMMY),
            span: Default::default(),
            expression: false,
            r#async: false,
            type_parameters: None,
            params: self.empty_params(),
            return_type: None,
            body: Box::new(FunctionBody {
                node_id: Cell::new(NodeId::DUMMY),
                span: Default::default(),
                directives: Vec::new_in(self.allocator),
                statements: Vec::from_iter_in([body], self.allocator),
            }),
            scope_id: Default::default(),
            pure: false,
            pife: false,
        })
    }

    /// 创建 CallExpression
    fn call(&self, callee: &IdentifierReference<'a>, args: Vec<'a, Argument<'a>>) -> Expression<'a> {
        Expression::CallExpression(CallExpression {
            callee: Expression::Identifier(*callee),
            arguments: Vec::from_iter_in(args, self.allocator),
            span: Default::default(),
            node_id: Cell::new(NodeId::DUMMY),
            optional: false,
            pure: false,
            type_arguments: None,
        })
    }

    /// 创建 CallExpression（无参数）
    fn call0(&self, name: &str) -> Expression<'a> {
        self.call(&self.ident_ref(name), Vec::new_in(self.allocator))
    }

    /// 创建 CallExpression（一个参数）
    fn call1(&self, name: &str, arg: Expression<'a>) -> Expression<'a> {
        self.call(&self.ident_ref(name), Vec::from_iter_in([arg.into()], self.allocator))
    }

    /// 包装条件表达式
    /// 输入: {flag ? <A/> : <B/>}
    /// 输出:
    /// (() => {
    ///   const _c$0 = memo(() => flag);
    ///   return _c$0() ? <A/> : <B/>;
    /// })()
    pub fn wrap(&mut self, expr: &Expression<'a>) -> Expression<'a> {
        match expr {
            Expression::ConditionalExpression(cond) => self.wrap_conditional(cond),
            Expression::LogicalExpression(logical) => self.wrap_logical(logical),
            _ => expr.clone_in(self.allocator),
        }
    }

    /// 包装条件表达式 (三元表达式)
    fn wrap_conditional(&mut self, cond: &ConditionalExpression<'a>) -> Expression<'a> {
        let config = &self.state.config;
        let test = &cond.test;

        let check_config = CheckConfig { check_member: true, ..CheckConfig::default_dom() };

        if is_dynamic_expression(test, check_config) {
            let memo_id = self.state.generate_component_name();
            self.state.register_helper(config.memo_wrapper.clone(), None);

            let memo_call = self.call1(&config.memo_wrapper, self.arrow_fn(test.clone_in(self.allocator)));

            let var_decl = Statement::VariableDeclaration(Box::new(VariableDeclaration {
                node_id: Cell::new(NodeId::DUMMY),
                span: Default::default(),
                kind: VariableDeclarationKind::Const,
                declare: false,
                declarations: Vec::from_iter_in([VariableDeclarator {
                    node_id: Cell::new(NodeId::DUMMY),
                    span: Default::default(),
                    id: self.binding_ident(&memo_id),
                    init: Some(memo_call.into()),
                    definite: false,
                    kind: VariableDeclarationKind::Const,
                    type_annotation: None,
                }], self.allocator),
            }));

            let mut new_cond = cond.clone_in(self.allocator);
            new_cond.test = self.call0(&memo_id);

            let block_body = Statement::BlockStatement(Box::new(BlockStatement {
                node_id: Cell::new(NodeId::DUMMY),
                span: Default::default(),
                body: Vec::from_iter_in([
                    var_decl,
                    Statement::ReturnStatement(Box::new(ReturnStatement {
                        node_id: Cell::new(NodeId::DUMMY),
                        span: Default::default(),
                        argument: Some(Box::new(Expression::ConditionalExpression(new_cond))),
                    })),
                ], self.allocator),
                scope_id: Default::default(),
            }));

            self.arrow_fn_block(block_body)
        } else {
            Expression::ConditionalExpression(cond.clone_in(self.allocator))
        }
    }

    /// 包装逻辑表达式 (&&, ||)
    fn wrap_logical(&mut self, logical: &LogicalExpression<'a>) -> Expression<'a> {
        let config = &self.state.config;
        let left = &logical.left;

        let check_config = CheckConfig { check_member: true, ..CheckConfig::default_dom() };

        if is_dynamic_expression(left, check_config) {
            let memo_id = self.state.generate_component_name();
            self.state.register_helper(config.memo_wrapper.clone(), None);

            let memo_call = self.call1(&config.memo_wrapper, self.arrow_fn(left.clone_in(self.allocator)));

            let var_decl = Statement::VariableDeclaration(Box::new(VariableDeclaration {
                node_id: Cell::new(NodeId::DUMMY),
                span: Default::default(),
                kind: VariableDeclarationKind::Const,
                declare: false,
                declarations: Vec::from_iter_in([VariableDeclarator {
                    node_id: Cell::new(NodeId::DUMMY),
                    span: Default::default(),
                    id: self.binding_ident(&memo_id),
                    init: Some(memo_call.into()),
                    definite: false,
                    kind: VariableDeclarationKind::Const,
                    type_annotation: None,
                }], self.allocator),
            }));

            let mut new_logical = logical.clone_in(self.allocator);
            new_logical.left = self.call0(&memo_id);

            let block_body = Statement::BlockStatement(Box::new(BlockStatement {
                node_id: Cell::new(NodeId::DUMMY),
                span: Default::default(),
                body: Vec::from_iter_in([
                    var_decl,
                    Statement::ReturnStatement(Box::new(ReturnStatement {
                        node_id: Cell::new(NodeId::DUMMY),
                        span: Default::default(),
                        argument: Some(Box::new(Expression::LogicalExpression(new_logical))),
                    })),
                ], self.allocator),
                scope_id: Default::default(),
            }));

            self.arrow_fn_block(block_body)
        } else {
            Expression::LogicalExpression(logical.clone_in(self.allocator))
        }
    }
}
