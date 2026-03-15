//! AST Transformation Module
//!
//! Transforms IfStatement with JSX returns to ConditionalExpression (ternary)
//! This runs BEFORE JSX compilation to enable fine-grained reactivity.

use oxc::ast::ast::*;
use oxc::span::GetSpan;

/// Check if expression contains JSX (recursive)
fn has_jsx(expr: &Expression) -> bool {
    match expr {
        Expression::JSXElement(_) => true,
        Expression::JSXFragment(_) => true,
        Expression::ParenthesizedExpression(paren) => has_jsx(&paren.expression),
        Expression::CallExpression(call) => {
            for arg in &call.arguments {
                if let Some(expr) = arg.as_expression() {
                    if has_jsx(expr) {
                        return true;
                    }
                }
            }
            false
        }
        Expression::ConditionalExpression(cond) => {
            has_jsx(&cond.test) || has_jsx(&cond.consequent) || has_jsx(&cond.alternate)
        }
        Expression::LogicalExpression(logic) => {
            has_jsx(&logic.left) || has_jsx(&logic.right)
        }
        _ => false,
    }
}

/// Check if expression contains a signal getter call
fn has_signal_call(expr: &Expression) -> bool {
    match expr {
        Expression::CallExpression(call) => {
            if call.arguments.is_empty() {
                if let Expression::Identifier(ident) = &call.callee {
                    return true;
                }
            }
            false
        }
        Expression::UnaryExpression(unary) => has_signal_call(&unary.argument),
        Expression::BinaryExpression(bin) => {
            has_signal_call(&bin.left) || has_signal_call(&bin.right)
        }
        Expression::LogicalExpression(logic) => {
            has_signal_call(&logic.left) || has_signal_call(&logic.right)
        }
        Expression::ParenthesizedExpression(paren) => has_signal_call(&paren.expression),
        Expression::ConditionalExpression(cond) => {
            has_signal_call(&cond.test) || 
            has_signal_call(&cond.consequent) || 
            has_signal_call(&cond.alternate)
        }
        _ => false,
    }
}

/// Find if-return-else patterns in statements
/// Returns spans: (if_start, if_end, then_return_end, else_return_end_or_none)
fn find_patterns(stmts: &[Statement]) -> Vec<(usize, usize, usize, Option<usize>)> {
    let mut results = Vec::new();
    
    for i in 0..stmts.len() {
        let stmt = &stmts[i];
        
        if let Statement::IfStatement(if_stmt) = stmt {
            // Must have signal in condition
            if !has_signal_call(&if_stmt.test) {
                continue;
            }
            
            // Then must be return with JSX (direct or in block)
            let then_has_jsx: bool = match &if_stmt.consequent {
                Statement::ReturnStatement(ret) => {
                    ret.argument.as_ref().map_or(false, has_jsx)
                }
                Statement::BlockStatement(block) => {
                    let mut found = false;
                    for s in &block.body {
                        if let Statement::ReturnStatement(ret) = s {
                            if ret.argument.as_ref().map_or(false, has_jsx) {
                                found = true;
                                break;
                            }
                        }
                    }
                    found
                }
                _ => false,
            };
            
            if !then_has_jsx {
                continue;
            }
            
            // Get spans
            let if_span = if_stmt.span();
            let if_start = if_span.start as usize;
            let if_end = if_span.end as usize;
            
            // Find end of then return statement
            let then_return_end = match &if_stmt.consequent {
                Statement::ReturnStatement(ret) => ret.span().end as usize,
                Statement::BlockStatement(block) => block.span.end as usize,
                _ => continue,
            };
            
            // Check for else - either explicit or implicit
            let else_return_end = if let Some(alt) = &if_stmt.alternate {
                // Explicit else - return with JSX
                let mut else_end = None;
                match alt {
                    Statement::ReturnStatement(ret) => {
                        if ret.argument.as_ref().map_or(false, has_jsx) {
                            else_end = Some(ret.span().end as usize);
                        }
                    }
                    Statement::BlockStatement(block) => {
                        for s in &block.body {
                            if let Statement::ReturnStatement(ret) = s {
                                if ret.argument.as_ref().map_or(false, has_jsx) {
                                    else_end = Some(block.span.end as usize);
                                    break;
                                }
                            }
                        }
                    }
                    _ => {}
                };
                else_end
            } else if i + 1 < stmts.len() {
                // Implicit else: next statement is return with JSX
                if let Some(next_stmt) = stmts.get(i + 1) {
                    match next_stmt {
                        Statement::ReturnStatement(ret) => {
                            if ret.argument.as_ref().map_or(false, has_jsx) {
                                Some(next_stmt.span().end as usize)
                            } else {
                                None
                            }
                        }
                        _ => None,
                    }
                } else {
                    None
                }
            } else {
                None
            };
            
            if else_return_end.is_some() {
                results.push((if_start, if_end, then_return_end, else_return_end));
            }
        }
    }
    
    results
}

/// Transform a program: find all if-return patterns and return their spans
pub fn transform_program(source: &str, program: &Program) -> Vec<(usize, usize, usize, Option<usize>)> {
    let mut all_patterns = Vec::new();
    
    // Find patterns in program body
    all_patterns.extend(find_patterns(&program.body));
    
    // Find patterns in function declarations
    for stmt in &program.body {
        if let Statement::FunctionDeclaration(func) = stmt {
            if let Some(body) = &func.body {
                all_patterns.extend(find_patterns(&body.statements));
            }
        }
    }
    
    all_patterns
}
