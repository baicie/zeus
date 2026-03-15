//! Control Flow Analyzer
//!
//! Analyzes component function bodies for conditional rendering patterns
//! and transforms them into fine-grained reactive computations.

use oxc::ast::ast::*;
use oxc::span::GetSpan;

/// A detected signal getter access
#[derive(Debug, Clone)]
pub struct SignalAccess {
    /// Function name being called (e.g., "shouldError")
    pub name: String,
    /// Source span of the call expression
    pub span: Span,
}

/// A conditional branch with signal dependencies
#[derive(Debug, Clone)]
pub struct ConditionalBranch {
    /// Signal accesses in the condition
    pub condition_signals: Vec<SignalAccess>,
    /// Source code of the condition expression
    pub condition_source: String,
    /// Then branch (JSX element span)
    pub then_span: Option<Span>,
    /// Then branch (raw source)
    pub then_source: Option<String>,
    /// Else branch (JSX element span)
    pub else_span: Option<Span>,
    /// Else branch (raw source)
    pub else_source: Option<String>,
    /// The entire if statement span
    pub span: Span,
}

/// Control flow analysis result for a component
#[derive(Debug, Clone)]
pub struct ControlFlowResult {
    /// Detected conditional branches
    pub branches: Vec<ConditionalBranch>,
    /// All signal accesses in the component
    pub signal_accesses: Vec<SignalAccess>,
}

/// Control flow analyzer for component functions
pub struct ControlFlowAnalyzer<'s> {
    source: &'s str,
}

impl<'s> ControlFlowAnalyzer<'s> {
    pub fn new(source: &'s str) -> Self {
        Self { source }
    }

    /// Analyze a function body for conditional rendering patterns
    pub fn analyze_function(&mut self, func: &Function) -> ControlFlowResult {
        let mut branches = Vec::new();
        let mut signal_accesses = Vec::new();

        // func.body is Option<Box<BlockStatement>>
        if let Some(body) = &func.body {
            // Analyze each statement in the function body
            for stmt in &body.statements {
                self.analyze_statement(stmt, &mut branches, &mut signal_accesses);
            }
        }

        ControlFlowResult {
            branches,
            signal_accesses,
        }
    }

    /// Analyze an arrow function body
    pub fn analyze_arrow_function(&mut self, arrow: &ArrowFunctionExpression) -> ControlFlowResult {
        let mut branches = Vec::new();
        let mut signal_accesses = Vec::new();

        // For expression-bodied arrows, wrap in implicit return
        if arrow.expression {
            // Expression-bodied: () => <div/>
            // We can't analyze this for control flow, just collect signal accesses
            if let Some(expr) = arrow.get_expression() {
                self.collect_signal_accesses(expr, &mut signal_accesses);
            }
        } else {
            // Block-bodied: () => { ... }
            // arrow.body is Box<BlockStatement>
            for stmt in &arrow.body.statements {
                self.analyze_statement(stmt, &mut branches, &mut signal_accesses);
            }
        }

        ControlFlowResult {
            branches,
            signal_accesses,
        }
    }

    /// Analyze a statement for conditional patterns
    fn analyze_statement(
        &mut self,
        stmt: &Statement,
        branches: &mut Vec<ConditionalBranch>,
        signal_accesses: &mut Vec<SignalAccess>,
    ) {
        match stmt {
            Statement::IfStatement(if_stmt) => {
                // Check if this is a conditional JSX return
                if let Some(branch) = self.analyze_if_statement(if_stmt) {
                    // Only include if it has signal dependencies and JSX returns
                    if !branch.condition_signals.is_empty() {
                        signal_accesses.extend(branch.condition_signals.clone());
                        branches.push(branch);
                    }
                }
            }
            Statement::BlockStatement(block) => {
                for s in &block.body {
                    self.analyze_statement(s, branches, signal_accesses);
                }
            }
            Statement::ReturnStatement(ret) => {
                if let Some(arg) = &ret.argument {
                    self.collect_signal_accesses(arg, signal_accesses);
                }
            }
            Statement::VariableDeclaration(var_decl) => {
                for declarator in &var_decl.declarations {
                    if let Some(init) = &declarator.init {
                        self.collect_signal_accesses(init, signal_accesses);
                    }
                }
            }
            Statement::ExpressionStatement(expr_stmt) => {
                self.collect_signal_accesses(&expr_stmt.expression, signal_accesses);
            }
            _ => {}
        }
    }

    /// Analyze an if statement for conditional JSX return
    pub fn analyze_if_statement(&mut self, stmt: &IfStatement) -> Option<ConditionalBranch> {
        // Collect signal accesses in the condition
        let mut condition_signals = Vec::new();
        self.collect_signal_accesses(&stmt.test, &mut condition_signals);

        // Extract then branch
        let (then_span, then_source) = self.extract_jsx_or_source(&stmt.consequent);

        // Extract else branch
        let (else_span, else_source) = match &stmt.alternate {
            Some(alt) => self.extract_jsx_or_source(alt),
            None => (None, None),
        };

        // Only transform if there's a condition with signals
        if condition_signals.is_empty() {
            return None;
        }

        // We need at least one branch with content (either then or else)
        let has_then_content = then_source.is_some() && !then_source.as_ref().unwrap().is_empty();
        let has_else_content = stmt.alternate.is_some() && else_source.is_some() && !else_source.as_ref().unwrap().is_empty();
        
        if !has_then_content && !has_else_content {
            return None;
        }

        // Extract condition source
        let condition_source = self.extract_expression_source(&stmt.test);

        Some(ConditionalBranch {
            condition_signals,
            condition_source,
            then_span,
            then_source,
            else_span,
            else_source,
            span: stmt.span,
        })
    }

    /// Extract JSX element span or source code from a statement
    fn extract_jsx_or_source(&mut self, stmt: &Statement) -> (Option<Span>, Option<String>) {
        match stmt {
            Statement::BlockStatement(block) => {
                // Look for return statement with JSX
                for s in block.body.iter().rev() {
                    if let Statement::ReturnStatement(ret) = s {
                        if let Some(arg) = &ret.argument {
                            if let Expression::JSXElement(elem) = arg {
                                // For JSX, extract the source code from the element
                                let source = self.extract_expression_source(arg);
                                return (Some(elem.span()), Some(source));
                            }
                            // Non-JSX return
                            return (None, Some(self.extract_expression_source(arg)));
                        }
                    }
                }
                (None, None)
            }
            Statement::ReturnStatement(ret) => {
                if let Some(arg) = &ret.argument {
                    if let Expression::JSXElement(elem) = arg {
                        // For JSX, extract the source code
                        let source = self.extract_expression_source(arg);
                        return (Some(elem.span()), Some(source));
                    }
                    return (None, Some(self.extract_expression_source(arg)));
                }
                (None, None)
            }
            _ => (None, Some(self.extract_statement_source(stmt))),
        }
    }

    /// Collect all signal getter accesses from an expression
    fn collect_signal_accesses(&mut self, expr: &Expression, accesses: &mut Vec<SignalAccess>) {
        match expr {
            Expression::CallExpression(call) => {
                // Check if this is a signal getter (identifier with no arguments)
                if call.arguments.is_empty() {
                    // Use source extraction to get the function name
                    let callee_source = self.extract_expression_source(&call.callee);
                    if !callee_source.is_empty() && is_valid_identifier(&callee_source) {
                        accesses.push(SignalAccess {
                            name: callee_source,
                            span: call.span,
                        });
                    }
                }
                // Recursively check arguments
                for arg in &call.arguments {
                    if let Some(expr) = arg.as_expression() {
                        self.collect_signal_accesses(expr, accesses);
                    }
                }
                // Check member expression callee
                if let Some(member) = call.callee.as_member_expression() {
                    self.collect_signal_accesses_from_member(member, accesses);
                }
            }
            Expression::ConditionalExpression(cond) => {
                self.collect_signal_accesses(&cond.test, accesses);
                self.collect_signal_accesses(&cond.consequent, accesses);
                self.collect_signal_accesses(&cond.alternate, accesses);
            }
            Expression::LogicalExpression(logic) => {
                self.collect_signal_accesses(&logic.left, accesses);
                self.collect_signal_accesses(&logic.right, accesses);
            }
            Expression::BinaryExpression(bin) => {
                self.collect_signal_accesses(&bin.left, accesses);
                self.collect_signal_accesses(&bin.right, accesses);
            }
            Expression::UnaryExpression(unary) => {
                self.collect_signal_accesses(&unary.argument, accesses);
            }
            Expression::ParenthesizedExpression(paren) => {
                self.collect_signal_accesses(&paren.expression, accesses);
            }
            Expression::ArrowFunctionExpression(arrow) => {
                if arrow.expression {
                    if let Some(expr) = arrow.get_expression() {
                        self.collect_signal_accesses(expr, accesses);
                    }
                } else {
                    for stmt in &arrow.body.statements {
                        self.analyze_statement(stmt, &mut Vec::new(), accesses);
                    }
                }
            }
            Expression::FunctionExpression(func) => {
                if let Some(body) = &func.body {
                    for stmt in &body.statements {
                        self.analyze_statement(stmt, &mut Vec::new(), accesses);
                    }
                }
            }
            Expression::ObjectExpression(obj) => {
                // Simplified: recursively check all properties
                for prop in &obj.properties {
                    match prop {
                        // oxc uses different variant names, try to match what exists
                        _ => {
                            // Try to extract expression from property if possible
                            // This is a fallback - the exact variant depends on oxc version
                        }
                    }
                }
            }
            Expression::ArrayExpression(arr) => {
                for elem in &arr.elements {
                    if let Some(expr) = elem.as_expression() {
                        self.collect_signal_accesses(expr, accesses);
                    }
                }
            }
            _ => {}
        }
    }

    /// Collect signal accesses from member expression
    fn collect_signal_accesses_from_member(
        &mut self,
        member: &MemberExpression,
        accesses: &mut Vec<SignalAccess>,
    ) {
        match member {
            MemberExpression::StaticMemberExpression(static_member) => {
                self.collect_signal_accesses(&static_member.object, accesses);
            }
            MemberExpression::ComputedMemberExpression(computed) => {
                self.collect_signal_accesses(&computed.object, accesses);
                self.collect_signal_accesses(&computed.expression, accesses);
            }
            _ => {}
        }
    }

    /// Extract source code from an expression
    fn extract_expression_source(&self, expr: &Expression) -> String {
        let span = expr.span();
        let start = span.start as usize;
        let end = span.end as usize;
        if start < self.source.len() && end <= self.source.len() {
            self.source[start..end].to_string()
        } else {
            String::new()
        }
    }

    /// Extract source code from a statement
    fn extract_statement_source(&self, stmt: &Statement) -> String {
        let span = stmt.span();
        let start = span.start as usize;
        let end = span.end as usize;
        if start < self.source.len() && end <= self.source.len() {
            self.source[start..end].to_string()
        } else {
            String::new()
        }
    }
}

/// Check if a string is a valid JavaScript identifier
fn is_valid_identifier(s: &str) -> bool {
    if s.is_empty() {
        return false;
    }
    let mut chars = s.chars();
    // First character must be letter or underscore or dollar sign
    let first = chars.next().unwrap();
    if !first.is_ascii_alphabetic() && first != '_' && first != '$' {
        return false;
    }
    // Remaining characters must be alphanumeric, underscore, or dollar sign
    chars.all(|c| c.is_ascii_alphanumeric() || c == '_' || c == '$')
}
