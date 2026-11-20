//! Frontend facts: what the parsed program contains.
//!
//! These walk the AST and answer questions lowering will ask — which names are
//! builtins, which calls pass through `defineElement`, where `render` is called,
//! whether the module manages its own hot boundary. They read the program and
//! return data; none of them touches the lowerer or produces IR.
//!
//! This is the "Frontend" stage from AGENTS.md §5, kept apart from lowering so
//! a change to "what counts as a builtin?" is reviewable without reading the
//! JSX transformation it feeds.

use std::collections::{HashMap, HashSet};

use oxc_ast::ast::{
    BindingPattern, Expression, FunctionType, JSXElementName,
    MemberExpression, Statement, VariableDeclarator,
};
use oxc_ast_visit::{Visit, walk};
use oxc_span::Span;

use crate::stage_contracts::HmrRenderCall;

pub(super) fn collect_variable_render_calls<'a>(
    declarations: &oxc_allocator::Vec<'a, VariableDeclarator<'a>>,
    render_names: &HashSet<String>,
    render_calls: &mut Vec<HmrRenderCall>,
) {
    for declaration in declarations {
        let Some(initializer) = &declaration.init else {
            continue;
        };
        let Some(call) = render_call(initializer, render_names) else {
            continue;
        };
        render_calls.push(HmrRenderCall {
            offset: call.start,
            end: call.end,
            terminate_statement: false,
        });
    }
}

pub(super) fn render_call(expression: &Expression<'_>, render_names: &HashSet<String>) -> Option<Span> {
    match expression {
        Expression::CallExpression(call) => match &call.callee {
            Expression::Identifier(identifier)
                if render_names.contains(identifier.name.as_str()) =>
            {
                Some(call.span)
            }
            _ => None,
        },
        Expression::ParenthesizedExpression(expression) => {
            render_call(&expression.expression, render_names)
        }
        Expression::TSInstantiationExpression(expression) => {
            render_call(&expression.expression, render_names)
        }
        _ => None,
    }
}

pub(super) fn has_manual_hmr_boundary(program: &oxc_ast::ast::Program<'_>) -> bool {
    let mut detector = ManualHmrDetector(false);
    detector.visit_program(program);
    detector.0
}

struct ManualHmrDetector(bool);

impl<'ast> Visit<'ast> for ManualHmrDetector {
    fn visit_member_expression(&mut self, expression: &MemberExpression<'ast>) {
        if is_import_meta_hot(expression) {
            self.0 = true;
        }
        walk::walk_member_expression(self, expression);
    }
}

fn is_import_meta_hot(expression: &MemberExpression<'_>) -> bool {
    let MemberExpression::StaticMemberExpression(expression) = expression else {
        return false;
    };
    if expression.property.name.as_str() != "hot" {
        return false;
    }
    match &expression.object {
        Expression::ImportMeta(_) => true,
        Expression::StaticMemberExpression(meta) => {
            meta.property.name.as_str() == "meta"
                && matches!(meta.object, Expression::ImportMeta(_))
        }
        _ => false,
    }
}

pub(super) fn binding_name(pattern: &BindingPattern<'_>) -> Option<String> {
    match pattern {
        BindingPattern::BindingIdentifier(identifier) => Some(identifier.name.to_string()),
        BindingPattern::ObjectPattern(_)
        | BindingPattern::ArrayPattern(_)
        | BindingPattern::AssignmentPattern(_) => None,
    }
}

pub(super) struct DefineElementCollector {
    pub(super) define_names: HashSet<String>,
    pub(super) host_names: HashSet<String>,
    pub(super) setup_functions: HashMap<String, SetupFunctionInfo>,
    pub(super) setup_spans: Vec<Span>,
    pub(super) host_root_spans: HashSet<u32>,
}

#[derive(Clone, Copy)]
pub(super) struct SetupFunctionInfo {
    pub(super) span: Span,
    pub(super) host_root: Option<Span>,
}

pub(super) fn collect_setup_functions(
    program: &oxc_ast::ast::Program<'_>,
    host_names: &HashSet<String>,
) -> HashMap<String, SetupFunctionInfo> {
    let mut collector = SetupFunctionCollector {
        host_names,
        functions: HashMap::new(),
    };
    collector.visit_program(program);
    collector.functions
}

struct SetupFunctionCollector<'a> {
    host_names: &'a HashSet<String>,
    functions: HashMap<String, SetupFunctionInfo>,
}

impl<'ast> Visit<'ast> for SetupFunctionCollector<'_> {
    fn visit_variable_declarator(&mut self, declarator: &VariableDeclarator<'ast>) {
        if let Some(name) = binding_name(&declarator.id)
            && let Some(init) = &declarator.init
            && let Some(info) = setup_function_info(init, self.host_names)
        {
            self.functions.insert(name, info);
        }
        walk::walk_variable_declarator(self, declarator);
    }

    fn visit_function(
        &mut self,
        function: &oxc_ast::ast::Function<'ast>,
        flags: oxc_syntax::scope::ScopeFlags,
    ) {
        if function.r#type == FunctionType::FunctionDeclaration
            && let Some(identifier) = &function.id
        {
            self.functions.insert(
                identifier.name.to_string(),
                SetupFunctionInfo {
                    span: function.span,
                    host_root: function_setup_root(function, self.host_names),
                },
            );
        }
        walk::walk_function(self, function, flags);
    }
}

fn setup_function_info(
    expression: &Expression<'_>,
    host_names: &HashSet<String>,
) -> Option<SetupFunctionInfo> {
    match expression {
        Expression::ArrowFunctionExpression(function) => Some(SetupFunctionInfo {
            span: function.span,
            host_root: arrow_setup_root(function, host_names),
        }),
        Expression::FunctionExpression(function) => Some(SetupFunctionInfo {
            span: function.span,
            host_root: function_setup_root(function, host_names),
        }),
        Expression::ParenthesizedExpression(expression) => {
            setup_function_info(&expression.expression, host_names)
        }
        Expression::TSAsExpression(expression) => {
            setup_function_info(&expression.expression, host_names)
        }
        Expression::TSSatisfiesExpression(expression) => {
            setup_function_info(&expression.expression, host_names)
        }
        Expression::TSNonNullExpression(expression) => {
            setup_function_info(&expression.expression, host_names)
        }
        Expression::TSInstantiationExpression(expression) => {
            setup_function_info(&expression.expression, host_names)
        }
        _ => None,
    }
}

fn setup_function_reference(expression: &Expression<'_>) -> Option<String> {
    match expression {
        Expression::Identifier(identifier) => Some(identifier.name.to_string()),
        Expression::ParenthesizedExpression(expression) => {
            setup_function_reference(&expression.expression)
        }
        Expression::TSAsExpression(expression) => setup_function_reference(&expression.expression),
        Expression::TSSatisfiesExpression(expression) => {
            setup_function_reference(&expression.expression)
        }
        Expression::TSNonNullExpression(expression) => {
            setup_function_reference(&expression.expression)
        }
        Expression::TSInstantiationExpression(expression) => {
            setup_function_reference(&expression.expression)
        }
        _ => None,
    }
}

impl<'ast> Visit<'ast> for DefineElementCollector {
    fn visit_call_expression(&mut self, expression: &oxc_ast::ast::CallExpression<'ast>) {
        if let Expression::Identifier(callee) = &expression.callee
            && self.define_names.contains(callee.name.as_str())
            && let Some(argument) = expression.arguments.get(2)
            && let Some(setup) = argument.as_expression()
        {
            let info = setup_function_info(setup, &self.host_names).or_else(|| {
                setup_function_reference(setup)
                    .and_then(|name| self.setup_functions.get(&name).copied())
            });
            if let Some(info) = info {
                self.setup_spans.push(info.span);
                if let Some(root) = info.host_root {
                    self.host_root_spans.insert(root.start);
                }
            }
        }
        walk::walk_call_expression(self, expression);
    }
}

fn arrow_setup_root(
    function: &oxc_ast::ast::ArrowFunctionExpression<'_>,
    host_names: &HashSet<String>,
) -> Option<Span> {
    function
        .body
        .as_expression()
        .and_then(|expression| jsx_host_span(expression, host_names))
        .or_else(|| {
            let oxc_ast::ast::ArrowFunctionBody::FunctionBody(body) = &function.body else {
                return None;
            };
            body.statements.iter().find_map(|statement| {
                let Statement::ReturnStatement(return_statement) = statement else {
                    return None;
                };
                return_statement
                    .argument
                    .as_ref()
                    .and_then(|expression| jsx_host_span(expression, host_names))
            })
        })
}

fn function_setup_root(
    function: &oxc_ast::ast::Function<'_>,
    host_names: &HashSet<String>,
) -> Option<Span> {
    function.body.as_ref().and_then(|body| {
        body.statements.iter().find_map(|statement| {
            let Statement::ReturnStatement(return_statement) = statement else {
                return None;
            };
            return_statement
                .argument
                .as_ref()
                .and_then(|expression| jsx_host_span(expression, host_names))
        })
    })
}

fn jsx_host_span(expression: &Expression<'_>, host_names: &HashSet<String>) -> Option<Span> {
    match expression {
        Expression::ParenthesizedExpression(expression) => {
            return jsx_host_span(&expression.expression, host_names);
        }
        Expression::TSAsExpression(expression) => {
            return jsx_host_span(&expression.expression, host_names);
        }
        Expression::TSSatisfiesExpression(expression) => {
            return jsx_host_span(&expression.expression, host_names);
        }
        Expression::TSNonNullExpression(expression) => {
            return jsx_host_span(&expression.expression, host_names);
        }
        _ => {}
    }
    let Expression::JSXElement(element) = expression else {
        return None;
    };
    let name = match &element.opening_element.name {
        JSXElementName::Identifier(identifier) => identifier.name.as_str(),
        JSXElementName::IdentifierReference(identifier) => identifier.name.as_str(),
        _ => return None,
    };
    host_names.contains(name).then_some(element.span)
}