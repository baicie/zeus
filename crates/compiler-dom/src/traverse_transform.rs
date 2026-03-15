//! AST Transformer using oxc_traverse
//!
//! This module transforms JSX to SolidJS-style template() + insert() calls
//! using oxc_traverse for safe AST mutation.

use oxc::allocator::Allocator;
use oxc::ast::ast::*;
use oxc_traverse::Traverse;
use oxc_traverse::TraverseCtx;

/// JSX to DOM transformer using oxc_traverse
pub struct JsxToDomTransformer<'a> {
    /// Counter for unique template variable names
    pub template_counter: usize,
    /// Runtime helpers that are used
    pub used_helpers: Vec<String>,
    /// Delegated event names
    pub delegated_events: Vec<String>,
    /// Hoisted template declarations
    pub hoisted: Vec<String>,
    /// Source code for reference
    pub source: &'a str,
}

impl<'a> JsxToDomTransformer<'a> {
    pub fn new(source: &'a str) -> Self {
        Self {
            template_counter: 0,
            used_helpers: Vec::new(),
            delegated_events: Vec::new(),
            hoisted: Vec::new(),
            source,
        }
    }

    /// Add a runtime helper to the used list
    pub fn add_helper(&mut self, helper: &str) {
        if !self.used_helpers.contains(&helper.to_string()) {
            self.used_helpers.push(helper.to_string());
        }
    }

    /// Generate unique template variable name
    pub fn next_template_var(&mut self) -> String {
        let var = format!("_tmpl${}", self.template_counter);
        self.template_counter += 1;
        var
    }

    /// Check if element name is a component (starts with uppercase or contains hyphen)
    pub fn is_component(name: &str) -> bool {
        let first = name.chars().next();
        first.map_or(false, |c| c.is_uppercase() || c == '-') || name.contains('.')
    }

    /// Get tag name from JSX element
    pub fn get_tag_name(element: &JSXElement) -> String {
        let opening = &element.opening_element;
        match &opening.name {
            JSXElementName::Identifier(ident) => ident.name.to_string(),
            _ => String::new(), // Simplified - just handle identifiers
        }
    }
}

/// Check if expression contains a signal getter call (function call with no arguments)
fn has_signal_call(expr: &Expression) -> bool {
    match expr {
        Expression::CallExpression(call) => {
            call.arguments.is_empty()
        }
        Expression::UnaryExpression(unary) => has_signal_call(&unary.argument),
        Expression::BinaryExpression(bin) => {
            has_signal_call(&bin.left) || has_signal_call(&bin.right)
        }
        Expression::LogicalExpression(logic) => {
            has_signal_call(&logic.left) || has_signal_call(&logic.right)
        }
        Expression::ParenthesizedExpression(paren) => has_signal_call(&paren.expression),
        _ => false,
    }
}

/// Check if a statement returns JSX
fn returns_jsx(stmt: &Statement) -> bool {
    match stmt {
        Statement::ReturnStatement(ret) => {
            matches!(ret.argument.as_ref(), Some(Expression::JSXElement(_)) | Some(Expression::JSXFragment(_)))
        }
        Statement::BlockStatement(block) => {
            block.body.iter().any(|s| returns_jsx(s))
        }
        _ => false,
    }
}

impl<'a> Traverse<'a, ()> for JsxToDomTransformer<'a> {
    /// Transform JSX Element - delegate to actual transformation
    fn enter_jsx_element(&mut self, node: &mut JSXElement<'a>, _ctx: &mut TraverseCtx<'a, ()>) {
        let tag_name = Self::get_tag_name(node);
        
        // For now, we just mark that we found JSX
        // The actual transformation will be done by generating code
        eprintln!("DEBUG: Found JSX element: {}", tag_name);
    }

    /// Transform JSX Fragment
    fn enter_jsx_fragment(&mut self, node: &mut JSXFragment<'a>, _ctx: &mut TraverseCtx<'a, ()>) {
        eprintln!("DEBUG: Found JSX fragment with {} children", node.children.len());
    }

    /// Handle IfStatement - check if we should transform to ternary
    fn enter_if_statement(&mut self, node: &mut IfStatement<'a>, ctx: &mut TraverseCtx<'a, ()>) {
        // Only transform if condition has signal call
        if !has_signal_call(&node.test) {
            return;
        }

        // Check if branches return JSX
        let then_returns_jsx = returns_jsx(&node.consequent);
        let else_returns_jsx = node.alternate.as_ref().map_or(false, returns_jsx);
        
        if then_returns_jsx && else_returns_jsx {
            eprintln!("DEBUG: Found if-return pattern with signal condition");
            // This is a candidate for ternary transformation
            // For now, just log - actual transformation would modify the AST
        }
    }
}

/// Execute the JSX transformation on a program using oxc_traverse
pub fn transform_program<'a>(
    allocator: &'a Allocator,
    program: &mut Program<'a>,
    source: &'a str,
) {
    use oxc_semantic::Scoping;
    
    let mut transformer = JsxToDomTransformer::new(source);
    
    // Run the transformer - use default() for Scoping
    let _scope = oxc_traverse::traverse_mut(
        &mut transformer,
        allocator,
        program,
        Scoping::default(),
        (),
    );
    
    // Log results
    eprintln!("DEBUG: Transformation complete");
    eprintln!("DEBUG: Used helpers: {:?}", transformer.used_helpers);
    eprintln!("DEBUG: Delegated events: {:?}", transformer.delegated_events);
}
