//! JSX DOM 事件处理模块
//!
//! 提供事件委托和非委托处理逻辑

use zeus_compiler_core::jsx::state::JsxCompilerState;
use zeus_compiler_core::jsx::constants;
use zeus_compiler_core::jsx::utils::{to_event_name, HandlerType};
use zeus_compiler_core::jsx::ir::AttrBindingKind;
use oxc_allocator::{Allocator, CloneIn};
use oxc_ast::ast::*;
use oxc_span::GetSpan;
use oxc_span::{Ident, Str};

/// 事件处理器
pub struct EventHandler<'a, 'ctx> {
    /// 内存分配器
    allocator: &'a Allocator,
    /// 编译器状态
    state: &'ctx mut JsxCompilerState<'a>,
    /// 元素 ID
    element_id: String,
}

impl<'a, 'ctx> EventHandler<'a, 'ctx> {
    /// 创建新的事件处理器
    pub fn new(
        allocator: &'a Allocator,
        state: &'ctx mut JsxCompilerState<'a>,
        element_id: String,
    ) -> Self {
        Self { allocator, state, element_id }
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

    /// 处理事件属性
    pub fn handle_event(
        &mut self,
        name: &str,
        value_opt: Option<&JSXAttributeValue<'a>>,
    ) -> Option<EventResult<'a>> {
        let config = &self.state.config;

        // 1. 提取事件名 (onClick → click)
        let event_name = to_event_name(name);
        let full_event_key = format!("${}", event_name);

        // 2. 获取处理函数表达式
        let handler = self.extract_handler_expression(value_opt)?;

        // 3. 检测强制非委托模式 (on:click)
        if name.starts_with("on:") {
            return Some(self.build_direct_event(event_name, handler));
        }

        // 4. 检测是否可委托
        let can_delegate = config.delegate_events
            && constants::is_delegated_event(&event_name);

        if can_delegate {
            Some(self.build_delegated_event(&event_name, &full_event_key, handler))
        } else {
            Some(self.build_direct_event(event_name, handler))
        }
    }

    /// 提取处理函数表达式
    fn extract_handler_expression(&self, value_opt: Option<&JSXAttributeValue<'a>>) -> Option<Expression<'a>> {
        if let Some(value) = value_opt {
            if let JSXAttributeValue::ExpressionContainer(expr_container) = value {
                if !expr_container.expression.is_null_literal() {
                    return Some(expr_container.expression.clone());
                }
            }
        }
        None
    }

    /// 构建委托事件
    fn build_delegated_event(
        &mut self,
        event_name: &str,
        full_event_key: &str,
        handler: Expression<'a>,
    ) -> EventResult<'a> {
        let state = &mut self.state;
        state.register_delegated_event(event_name.to_string());
        state.register_helper("delegateEvents".to_string(), None);

        let handler_type = HandlerType::detect(&handler);

        match handler_type {
            HandlerType::StaticFunction | HandlerType::Resolvable => {
                let elem_str = Str::from_in(&self.element_id, self.allocator);
                let key_str = Str::from_in(full_event_key, self.allocator);
                let assignment = Expression::AssignmentExpression(AssignmentExpression {
                    node_id: Default::default(),
                    left: MemberExpression::StaticMemberExpression(Box::new(StaticMemberExpression {
                        node_id: Default::default(),
                        span: Default::default(),
                        object: Expression::Identifier(IdentifierReference {
                            name: Ident::from_in(&self.element_id, self.allocator),
                            span: Default::default(),
                            node_id: Default::default(),
                            reference_id: Default::default(),
                        }),
                        property: Ident::from_in(full_event_key, self.allocator),
                        optional: false,
                    })),
                    operator: AssignmentOperator::Assign,
                    right: handler,
                });

                EventResult {
                    statement: Some(Statement::ExpressionStatement(Box::new(ExpressionStatement {
                        node_id: Default::default(),
                        span: Default::default(),
                        expression: assignment,
                    }))),
                    is_delegated: true,
                }
            }
            HandlerType::Array => {
                EventResult {
                    statement: None,
                    is_delegated: true,
                }
            }
            HandlerType::Dynamic => {
                state.register_helper("addEventListener".to_string(), None);
                EventResult {
                    statement: None,
                    is_delegated: false,
                }
            }
        }
    }

    /// 构建直接事件
    fn build_direct_event(&mut self, event_name: String, handler: Expression<'a>) -> EventResult<'a> {
        self.state.register_helper("addEventListener".to_string(), None);

        let call = self.call(
            self.ident_ref("addEventListener"),
            vec![
                self.element_id.clone().clone_in(self.allocator).into(),
                event_name.clone().clone_in(self.allocator).into(),
                handler.into(),
            ],
        );

        EventResult {
            statement: Some(Statement::ExpressionStatement(Box::new(ExpressionStatement {
                node_id: Default::default(),
                span: Default::default(),
                expression: call,
            }))),
            is_delegated: false,
        }
    }

    /// 注册委托事件
    pub fn register_delegated_event(&mut self, event_name: &str) {
        self.state.register_delegated_event(event_name.to_string());
    }
}

/// 事件结果
pub struct EventResult<'a> {
    /// 生成的语句
    pub statement: Option<Statement<'a>>,
    /// 是否为委托事件
    pub is_delegated: bool,
}

/// 检测是否为可委托事件
pub fn can_delegate_event(event_name: &str) -> bool {
    constants::is_delegated_event(event_name)
}

/// 检测事件属性名
pub fn is_event_attribute(name: &str) -> bool {
    name.starts_with("on") && name.len() > 2 && !name.contains(':')
}

/// 提取事件名
pub fn extract_event_name(name: &str) -> Option<&str> {
    if is_event_attribute(name) {
        Some(&name[2..])
    } else {
        None
    }
}

/// 检测是否为强制非委托模式
pub fn is_forced_direct(name: &str) -> bool {
    name.starts_with("on:")
}
