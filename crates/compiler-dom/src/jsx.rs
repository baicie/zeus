//! JSX Compiler — String-based code generation
//!
//! Instead of building AST nodes with AstBuilder (which requires complex lifetime
//! management), we generate JavaScript code as strings. The compilation pipeline:
//!
//! 1. Parse source with oxc → AST (read-only)
//! 2. Walk AST to find JSX expressions and their spans
//! 3. Analyze each JSX tree → TemplateIR (static HTML + dynamic bindings)
//! 4. Generate replacement JS code as strings
//! 5. Apply span-based replacements to produce final output

use oxc::ast::ast::*;
use oxc::span::GetSpan;

use crate::control_flow::ControlFlowAnalyzer;
use crate::control_flow::ConditionalBranch;
use crate::template_analyzer::{escape_html, TemplateAnalyzer};
use crate::template_ir::*;

/// A span replacement: replace source[start..end] with `code`
#[derive(Debug)]
pub struct Replacement {
    pub start: u32,
    pub end: u32,
    pub code: String,
}

/// A compiler warning
#[derive(Debug, Clone)]
pub struct Warning {
    pub message: String,
    pub line: u32,
    pub column: u32,
}

/// JSX compiler that collects replacements and hoisted code
#[allow(dead_code)]
pub struct JsxCompiler<'s> {
    source: &'s str,
    analyzer: TemplateAnalyzer<'s>,
    /// Allocator for creating new AST nodes
    allocator: Option<&'s oxc::allocator::Allocator>,
    /// Counter for unique template variable names (shared across all compilations)
    template_counter: usize,
    /// Hoisted template declarations (inserted at top of module)
    pub hoisted: Vec<String>,
    /// Collected delegated event names
    pub delegated_events: Vec<String>,
    /// Span replacements to apply
    pub replacements: Vec<Replacement>,
    /// Runtime helpers that are actually used
    pub used_helpers: Vec<String>,
    /// Compiler warnings
    pub warnings: Vec<String>,
    /// Pending conditional transformations (to be processed after JSX compilation)
    pending_conditionals: Vec<ConditionalTransform>,
    /// Conditional patterns from AST transform: (if_start, if_end, then_end, else_end)
    conditional_patterns: Vec<(usize, usize, usize, Option<usize>)>,
}

/// A pending conditional transformation
#[derive(Debug, Clone)]
struct ConditionalTransform {
    /// The span of the if statement to replace
    span: Span,
    /// The condition expression source
    condition: String,
    /// Then branch source (after JSX compilation)
    then_code: String,
    /// Else branch source (after JSX compilation)
    else_code: String,
    /// Whether there's an else branch
    has_else: bool,
}

impl<'s> JsxCompiler<'s> {
    pub fn new(source: &'s str) -> Self {
        Self::new_with_allocator(source, None)
    }
    
    /// Create with allocator for AST transformations
    pub fn new_with_allocator(source: &'s str, allocator: Option<&'s oxc::allocator::Allocator>) -> Self {
        Self {
            source,
            analyzer: TemplateAnalyzer::new(source),
            allocator,
            template_counter: 0,
            hoisted: Vec::new(),
            delegated_events: Vec::new(),
            replacements: Vec::new(),
            used_helpers: Vec::new(),
            warnings: Vec::new(),
            pending_conditionals: Vec::new(),
            conditional_patterns: Vec::new(),
        }
    }

    /// Set conditional patterns from AST transform
    pub fn set_conditional_patterns(&mut self, patterns: Vec<(usize, usize, usize, Option<usize>)>) {
        self.conditional_patterns = patterns;
    }

    /// Create with an initial template counter value
    #[allow(dead_code)]
    pub fn with_counter(source: &'s str, counter: usize) -> Self {
        Self {
            source,
            analyzer: TemplateAnalyzer::with_counter(source, counter),
            allocator: None,
            template_counter: counter,
            hoisted: Vec::new(),
            delegated_events: Vec::new(),
            replacements: Vec::new(),
            used_helpers: Vec::new(),
            warnings: Vec::new(),
            pending_conditionals: Vec::new(),
            conditional_patterns: Vec::new(),
        }
    }

    /// Get current template counter value (synced with analyzer)
    pub fn get_template_counter(&self) -> usize {
        self.analyzer.get_counter()
    }

    /// Sync counter with analyzer after compilations
    fn sync_counter(&mut self) {
        self.template_counter = self.analyzer.get_counter();
    }

    /// Walk the program AST and collect all JSX replacements
    pub fn visit_program(&mut self, program: &Program<'_>) {
        for stmt in &program.body {
            self.visit_statement(stmt);
        }
    }

    fn drain_analyzer_helpers(&mut self) {
        let helpers = self.analyzer.take_used_helpers();
        for h in helpers {
            self.add_helper(&h);
        }
    }

    fn visit_statement(&mut self, stmt: &Statement<'_>) {
        match stmt {
            Statement::VariableDeclaration(decl) => {
                for declarator in &decl.declarations {
                    if let Some(init) = &declarator.init {
                        self.visit_expression(init);
                    }
                }
            }
            Statement::ReturnStatement(ret) => {
                if let Some(arg) = &ret.argument {
                    self.visit_expression(arg);
                }
            }
            Statement::ExpressionStatement(expr_stmt) => {
                self.visit_expression(&expr_stmt.expression);
            }
            Statement::FunctionDeclaration(func) => {
                if let Some(body) = &func.body {
                    for s in &body.statements {
                        self.visit_statement(s);
                    }
                }
            }
            Statement::ExportDefaultDeclaration(export) => {
                // ExportDefaultDeclarationKind inherits Expression variants
                // So we can try to get it as an expression
                if let Some(expr) = export.declaration.as_expression() {
                    self.visit_expression(expr);
                } else {
                    // Handle explicit variants
                    if let ExportDefaultDeclarationKind::FunctionDeclaration(func) = &export.declaration
                        && let Some(body) = &func.body
                    {
                        for s in &body.statements {
                            self.visit_statement(s);
                        }
                    }
                }
            }
            Statement::ExportNamedDeclaration(export) => {
                if let Some(decl) = &export.declaration {
                    self.visit_declaration(decl);
                }
            }
            Statement::IfStatement(if_stmt) => {
                // Skip normal if statement handling for now
                // The function-level transformation will handle these
                
                // Visit the branches to compile JSX (we still need this for the JSX transforms)
                self.visit_statement(&if_stmt.consequent);
                if let Some(alt) = &if_stmt.alternate {
                    self.visit_statement(alt);
                }
            }
            Statement::BlockStatement(block) => {
                for s in &block.body {
                    self.visit_statement(s);
                }
            }
            _ => {}
        }
    }

    fn visit_declaration(&mut self, decl: &Declaration<'_>) {
        match decl {
            Declaration::VariableDeclaration(var_decl) => {
                for declarator in &var_decl.declarations {
                    if let Some(init) = &declarator.init {
                        self.visit_expression(init);
                    }
                }
            }
            Declaration::FunctionDeclaration(func) => {
                if let Some(body) = &func.body {
                    for s in &body.statements {
                        self.visit_statement(s);
                    }
                }
            }
            _ => {}
        }
    }

    fn visit_expression(&mut self, expr: &Expression<'_>) {
        match expr {
            Expression::JSXElement(jsx) => {
                self.compile_jsx_element(jsx);
            }
            Expression::JSXFragment(fragment) => {
                self.compile_jsx_fragment(fragment);
            }
            Expression::ArrowFunctionExpression(arrow) => {
                // Handle both block-bodied and expression-bodied arrow functions
                for stmt in &arrow.body.statements {
                    self.visit_statement(stmt);
                }
                // For expression-bodied arrows (0 statements), we need to check the expression
                if arrow.body.statements.is_empty() {
                    // Try to get the expression from the arrow - this handles expression-bodied arrows
                    // Note: oxc represents these differently, so this is a fallback
                }
            }
            Expression::FunctionExpression(func) => {
                if let Some(body) = &func.body {
                    for stmt in &body.statements {
                        self.visit_statement(stmt);
                    }
                }
            }
            Expression::CallExpression(call) => {
                // Check for .map() call
                self.check_list_rendering_warnings(call);
                self.visit_expression(&call.callee);
                for arg in &call.arguments {
                    self.visit_argument(arg);
                }
            }
            Expression::ConditionalExpression(cond) => {
                self.visit_expression(&cond.test);
                self.visit_expression(&cond.consequent);
                self.visit_expression(&cond.alternate);
            }
            Expression::ParenthesizedExpression(paren) => {
                self.visit_expression(&paren.expression);
            }
            Expression::SequenceExpression(seq) => {
                for e in &seq.expressions {
                    self.visit_expression(e);
                }
            }
            Expression::LogicalExpression(logic) => {
                self.visit_expression(&logic.left);
                self.visit_expression(&logic.right);
            }
            Expression::AssignmentExpression(assign) => {
                self.visit_expression(&assign.right);
            }
            _ => {}
        }
    }

    /// Check for list rendering warnings (missing key, etc.)
    fn check_list_rendering_warnings(&mut self, call: &CallExpression<'_>) {
        // Check if this is a .map() call
        // In oxc, MemberExpression is accessed via as_member_expression()
        if let Some(member) = call.callee.as_member_expression()
            && let MemberExpression::StaticMemberExpression(static_member) = member
            && static_member.property.name == "map"
        {
            // This is a .map() call, check for key
            let has_key = call.arguments.iter().any(|arg| {
                if let Some(expr) = arg.as_expression()
                    && let Expression::ArrowFunctionExpression(arrow) = expr
                {
                    // Check if the arrow function returns JSX with key
                    return self.arrow_function_has_key(arrow);
                }
                false
            });

            if !has_key {
                self.warnings.push(
                    "Missing 'key' prop in list rendering. Consider adding a unique key to each list item for better performance.".to_string()
                );
            }
        }
    }

    /// Check if an arrow function has key in its JSX return
    fn arrow_function_has_key(&self, arrow: &ArrowFunctionExpression<'_>) -> bool {
        // Simple check: look for key= in the function body
        // This is a simplified check - a full implementation would traverse the AST
        let source = self.source;
        let start = arrow.span.start as usize;
        let end = arrow.span.end as usize;
        if start < source.len() && end <= source.len() {
            let body_source = &source[start..end];
            return body_source.contains("key=") || body_source.contains("key={");
        }
        false
    }

    fn visit_argument(&mut self, arg: &Argument<'_>) {
        match arg {
            Argument::SpreadElement(spread) => {
                self.visit_expression(&spread.argument);
            }
            _ => {
                // Argument is also an Expression in oxc
                // Use the span to check if it's a JSX element
                if let Some(expr) = arg.as_expression() {
                    self.visit_expression(expr);
                }
            }
        }
    }

    // =========================================================================
    // Control Flow Analysis
    // =========================================================================

    // =========================================================================
    // Control Flow Transformation
    // =========================================================================

    /// Transform conditional if/return statements into reactive conditional calls
    fn transform_conditional_statement(&mut self, if_stmt: &IfStatement) {
        let mut analyzer = ControlFlowAnalyzer::new(self.source);
        
        // Analyze the if statement for conditional JSX pattern
        if let Some(branch) = analyzer.analyze_if_statement(if_stmt) {
            // Only transform if there's a signal condition
            if branch.condition_signals.is_empty() {
                // No signal in condition, visit normally
                self.visit_statement(&if_stmt.consequent);
                if let Some(alt) = &if_stmt.alternate {
                    self.visit_statement(alt);
                }
                return;
            }

            // Check if this has valid branches
            let has_then = branch.then_source.is_some() && !branch.then_source.as_ref().unwrap().is_empty();
            let has_else = branch.else_source.is_some() && !branch.else_source.as_ref().unwrap().is_empty();
            
            if !has_then && !has_else {
                // No valid branch content, visit normally
                self.visit_statement(&if_stmt.consequent);
                if let Some(alt) = &if_stmt.alternate {
                    self.visit_statement(alt);
                }
                return;
            }

            // First, compile the JSX in the branches normally
            // This will convert <h1>Error</h1> to _tmpl$1() etc.
            self.visit_statement(&if_stmt.consequent);
            if let Some(alt) = &if_stmt.alternate {
                self.visit_statement(alt);
            }
            
            // After JSX is compiled, now transform the if to conditional
            // Re-analyze to get the compiled template references
            let mut re_analyzer = ControlFlowAnalyzer::new(self.source);
            if let Some(compiled_branch) = re_analyzer.analyze_if_statement(if_stmt) {
                let transformed = self.generate_conditional_code(&compiled_branch);
                
                // Replace the if statement with the conditional call
                self.replacements.push(Replacement {
                    start: if_stmt.span.start,
                    end: if_stmt.span.end,
                    code: transformed,
                });
                
                // Mark conditional helper as used
                self.add_helper("conditional");
                self.add_helper("ifOnly");
            }
            return;
        }
        
        // Fallback: visit normally
        self.visit_statement(&if_stmt.consequent);
        if let Some(alt) = &if_stmt.alternate {
            self.visit_statement(alt);
        }
    }

    /// Generate the conditional() call code from a ConditionalBranch
    fn generate_conditional_code(&self, branch: &ConditionalBranch) -> String {
        let condition = &branch.condition_source;
        
        // Get then code from then_source (raw source from the return statement)
        let then_code = branch.then_source.clone().unwrap_or_default();
        
        // Get else code from else_source
        let else_code = branch.else_source.clone().unwrap_or_default();
        
        // Check if there's an else branch
        if else_code.is_empty() {
            // No else branch - use ifOnly pattern
            format!(
                "ifOnly({}, () => {{ return {}; }})",
                condition, then_code
            )
        } else {
            // Has else branch - use conditional pattern
            format!(
                "conditional({{ condition: {}, then: () => {{ return {}; }}, else: () => {{ return {}; }} }})",
                condition, then_code, else_code
            )
        }
    }

    // =========================================================================
    // JSX Compilation
    // =========================================================================

    /// Compile a JSX element: analyze it, generate code, record replacement
    fn compile_jsx_element(&mut self, element: &JSXElement<'_>) {
        let tag_name = TemplateAnalyzer::get_tag_name(element);
        let span = element.span();

        if TemplateAnalyzer::is_component(&tag_name) {
            let code = self.compile_component(element, &tag_name);
            // No need to add helper - components are just function calls
            self.replacements.push(Replacement {
                start: span.start,
                end: span.end,
                code,
            });
            return;
        }

        // Analyze the JSX tree
        let ir = self.analyzer.analyze(element);
        self.drain_analyzer_helpers();

        // Collect delegated events
        for event in &ir.delegated_events {
            if !self.delegated_events.contains(event) {
                self.delegated_events.push(event.clone());
            }
        }
        if !ir.delegated_events.is_empty() {
            // Ensure delegateEvents is imported when delegated events are used
            self.add_helper("delegateEvents");
        }

        // Generate hoisted template declaration
        let escaped_html = ir
            .html
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r");
        self.hoisted.push(format!(
            "const {} = template(\"{}\");",
            ir.template_var, escaped_html
        ));
        self.add_helper("template");

        // Generate the replacement code (IIFE)
        let code = self.generate_element_code(&ir);

        self.replacements.push(Replacement {
            start: span.start,
            end: span.end,
            code,
        });
    }

    /// Compile a JSX fragment: <>...</> → returns DocumentFragment
    fn compile_jsx_fragment(&mut self, fragment: &JSXFragment<'_>) {
        let span = fragment.span();

        // Fragment 只有一个 children 列表
        let children = &fragment.children;

        if children.is_empty() {
            // 空 Fragment 返回 null
            self.replacements.push(Replacement {
                start: span.start,
                end: span.end,
                code: "null".to_string(),
            });
            return;
        }

        // 如果只有一个子元素
        if children.len() == 1 && let JSXChild::Element(jsx_child) = &children[0] {
            // 1. 先分析子元素，获取其 IR（这会收集事件等）
            let ir = self.analyzer.analyze(jsx_child);
            self.drain_analyzer_helpers();

            // 2. 收集事件
            for event in &ir.delegated_events {
                if !self.delegated_events.contains(event) {
                    self.delegated_events.push(event.clone());
                }
            }
            if !ir.delegated_events.is_empty() {
                self.add_helper("delegateEvents");
            }

            // 3. 生成 hoisted 模板声明
            let escaped_html = ir
                .html
                .replace('\\', "\\\\")
                .replace('"', "\\\"")
                .replace('\n', "\\n")
                .replace('\r', "\\r");
            self.hoisted.push(format!(
                "const {} = template(\"{}\");",
                ir.template_var, escaped_html
            ));
            self.add_helper("template");

            // 4. 生成子元素的代码
            let child_code = self.generate_element_code(&ir);

            // 5. 为 Fragment 生成替换代码 - 直接使用子元素的代码
            self.replacements.push(Replacement {
                start: span.start,
                end: span.end,
                code: child_code,
            });

            return;
        }

        // 多个子元素：使用 DocumentFragment
        // 生成代码来创建 DocumentFragment 并插入所有子节点
        let mut children_code = Vec::new();

        for child in children {
            match child {
                JSXChild::Element(jsx_child) => {
                    // 递归编译这个 JSX 元素 - 这会正确处理事件绑定
                    let tag_name = TemplateAnalyzer::get_tag_name(jsx_child);

                    if TemplateAnalyzer::is_component(&tag_name) {
                        // 组件调用 - 直接获取组件调用的代码
                        let code = self.compile_component(jsx_child, &tag_name);
                        children_code.push(format!("_fr.appendChild({});", code));
                    } else {
                        // 原生元素：使用 analyze 返回的 IR，生成 hoisted 声明
                        let ir = self.analyzer.analyze(jsx_child);
                        self.drain_analyzer_helpers();

                        // 收集事件
                        for event in &ir.delegated_events {
                            if !self.delegated_events.contains(event) {
                                self.delegated_events.push(event.clone());
                            }
                        }
                        if !ir.delegated_events.is_empty() {
                            self.add_helper("delegateEvents");
                        }

                        // 生成 hoisted 模板声明 - 使用 ir.template_var 确保变量名一致
                        let escaped_html = ir
                            .html
                            .replace('\\', "\\\\")
                            .replace('"', "\\\"")
                            .replace('\n', "\\n")
                            .replace('\r', "\\r");
                        self.hoisted.push(format!(
                            "const {} = template(\"{}\");",
                            ir.template_var, escaped_html
                        ));
                        self.add_helper("template");

                        // 生成代码 - 使用 ir.template_var
                        let element_code = self.generate_element_code(&ir);
                        children_code.push(format!("_fr.appendChild({});", element_code));
                    }
                }
                JSXChild::Fragment(_text) => {
                    // 文本节点 - 创建空 TextNode
                    children_code.push(
                        "_fr.appendChild(document.createTextNode(\"\"));".to_string()
                    );
                }
                JSXChild::ExpressionContainer(expr) => {
                    // 动态表达式 - 使用 insert
                    let source = self.source;
                    // JSXExpression 需要通过 .span() 获取 span
                    let start = expr.expression.span().start as usize;
                    let end = expr.expression.span().end as usize;
                    if start < source.len() && end <= source.len() {
                        let expr_code = source[start..end].to_string();
                        children_code.push(format!(
                            "insert(_fr, {});",
                            expr_code
                        ));
                        self.add_helper("insert");
                    }
                }
                _ => {}
            }
        }

        if children_code.is_empty() {
            // 空 Fragment
            self.replacements.push(Replacement {
                start: span.start,
                end: span.end,
                code: "document.createDocumentFragment()".to_string(),
            });
            return;
        }

        // 生成完整的代码
        let code = format!(
            "(function() {{ const _fr = document.createDocumentFragment(); {} return _fr; }})()",
            children_code.join(" ")
        );

        self.replacements.push(Replacement {
            start: span.start,
            end: span.end,
            code,
        });
    }

    /// Generate JS code for a native element from its TemplateIR
    fn generate_element_code(&mut self, ir: &TemplateIR) -> String {
        let mut lines: Vec<String> = Vec::new();

        // const _el$ = _tmpl$N()
        let root_var = "_el$".to_string();
        lines.push(format!("const {} = {}();", root_var, ir.template_var));

        // Collect unique paths → variable names
        // Use path reuse optimization: generate ALL possible intermediate paths
        let mut path_vars: Vec<(DomPath, String)> = Vec::new();
        path_vars.push((DomPath::root(), root_var.clone()));

        // Get all unique non-root paths that need variables (binding targets)
        let mut target_paths: Vec<DomPath> = ir.bindings
            .iter()
            .filter(|b| b.path != DomPath::root())
            .map(|b| b.path.clone())
            .collect();

        // Remove duplicates while preserving order
        target_paths.dedup();

        // Generate all possible intermediate paths from root to each target
        // For each target path, generate all prefixes AND paths needed to connect targets
        let mut all_needed_paths: Vec<DomPath> = Vec::new();
        for target_path in &target_paths {
            // Add all prefixes of this path (excluding root)
            for len in 1..=target_path.steps.len() {
                let prefix = DomPath {
                    steps: target_path.steps[..len].to_vec(),
                };
                all_needed_paths.push(prefix);
            }
        }

        // Also add paths that connect different targets (for sibling traversal)
        // For any two targets, add the path to their lowest common ancestor + one step
        for i in 0..target_paths.len() {
            for j in (i + 1)..target_paths.len() {
                let path1 = &target_paths[i];
                let path2 = &target_paths[j];
                // Find common prefix length
                let common_len = path1.steps.iter().zip(path2.steps.iter())
                    .take_while(|(a, b)| a == b)
                    .count();
                // Add the prefix just before they diverge (for sibling traversal)
                if common_len > 0 && common_len < path1.steps.len() && common_len < path2.steps.len() {
                    // Add the common prefix + one NextSibling step to enable sibling traversal
                    if common_len < path1.steps.len() {
                        let mut connect_path = path1.steps[..common_len + 1].to_vec();
                        all_needed_paths.push(DomPath { steps: connect_path });
                    }
                }
            }
        }

        // Sort by path length (shorter first) so we create shorter paths first
        // For same length, use lexicographic order to ensure consistent ordering
        all_needed_paths.sort_by(|a, b| {
            let len_cmp = a.steps.len().cmp(&b.steps.len());
            if len_cmp == std::cmp::Ordering::Equal {
                // Compare steps lexicographically
                for (step_a, step_b) in a.steps.iter().zip(b.steps.iter()) {
                    let step_order = match (step_a, step_b) {
                        (TraversalStep::FirstChild, TraversalStep::FirstChild) => std::cmp::Ordering::Equal,
                        (TraversalStep::FirstChild, TraversalStep::NextSibling) => std::cmp::Ordering::Less,
                        (TraversalStep::NextSibling, TraversalStep::FirstChild) => std::cmp::Ordering::Greater,
                        (TraversalStep::NextSibling, TraversalStep::NextSibling) => std::cmp::Ordering::Equal,
                    };
                    if step_order != std::cmp::Ordering::Equal {
                        return step_order;
                    }
                }
                std::cmp::Ordering::Equal
            } else {
                len_cmp
            }
        });

        // Remove duplicates while preserving order
        all_needed_paths.dedup();

        // Now create variables for all paths
        for path in all_needed_paths {
            // Find the best base path to reuse (the longest prefix that already has a variable)
            // We need to find which existing path `p` is a prefix of `path`
            // i.e., find p such that path.is_descendant_of(p) is true
            let (base_path, base_var) = path_vars
                .iter()
                .rev()  // Start from the end (longest paths first)
                .find(|(p, _)| path.is_descendant_of(p))  // Check if path has p as prefix
                .map(|(p, v)| (p.clone(), v.clone()))
                .unwrap_or_else(|| (DomPath::root(), root_var.clone()));

            // Calculate remaining steps from the base path
            let remaining_steps = path.steps.len() - base_path.steps.len();

            if remaining_steps > 0 {
                // Variable index should be path_vars.len() (0 is root, so first real var is at index 1)
                let var_index = path_vars.len();
                let var_name = format!("_el${}", var_index);
                let access = path.partial_to_js_access(&base_var, remaining_steps);
                lines.push(format!("const {} = {};", var_name, access));
                path_vars.push((path.clone(), var_name));
            }
            // If remaining_steps == 0, this path already exists as base_path
        }

        // Generate binding statements
        for binding in &ir.bindings {
            let target = path_vars
                .iter()
                .find(|(p, _)| p == &binding.path)
                .map(|(_, v)| v.as_str())
                .unwrap_or("_el$");

            match &binding.kind {
                BindingKind::Insert { expression_source } => {
                    // insert(parent, accessor, marker)
                    // The marker is the node at the binding path (the <!> comment)
                    // The parent is the marker's parent node
                    let parent = get_parent_var(&binding.path, &path_vars, &root_var);
                    if parent == target {
                        // Single child case: insert(parent, accessor)
                        lines.push(format!("insert({}, {});", target, expression_source));
                    } else {
                        // Mixed children: insert(parent, accessor, marker)
                        lines.push(format!(
                            "insert({}, {}, {});",
                            parent, expression_source, target
                        ));
                    }
                    self.add_helper("insert");
                }
                BindingKind::DelegatedEvent {
                    event_name,
                    handler_source,
                } => {
                    lines.push(format!("{}.$${}  = {};", target, event_name, handler_source));
                }
                BindingKind::DirectEvent {
                    event_name,
                    handler_source,
                } => {
                    lines.push(format!(
                        "{}.addEventListener(\"{}\", {});",
                        target, event_name, handler_source
                    ));
                }
                BindingKind::Attribute {
                    name,
                    value_source,
                    is_dynamic: _,
                } => {
                    lines.push(format!(
                        "setAttribute({}, \"{}\", {});",
                        target, name, value_source
                    ));
                    self.add_helper("setAttribute");
                }
                BindingKind::ClassName {
                    value_source,
                    is_dynamic: _,
                } => {
                    lines.push(format!("className({}, {});", target, value_source));
                    self.add_helper("className");
                }
                BindingKind::Style {
                    value_source,
                    is_dynamic: _,
                } => {
                    lines.push(format!("style({}, {});", target, value_source));
                    self.add_helper("style");
                }
                BindingKind::Ref { ref_source, is_dom_ref } => {
                    if *is_dom_ref {
                        // DOM ref: let el; <div ref={el}/> - direct assignment like SolidJS
                        // Generate: el = node
                        lines.push(format!("{} = {};", ref_source, target));
                    } else {
                        // Callback ref or signal ref - use ref() helper
                        lines.push(format!("ref({}, {});", target, ref_source));
                        self.add_helper("ref");
                    }
                }
                BindingKind::Spread { props_source } => {
                    lines.push(format!("spread({}, {});", target, props_source));
                    self.add_helper("spread");
                }
                BindingKind::Slot { slot_binding } => {
                    // Generate renderSlot call for Light DOM slots
                    let slot_name = match &slot_binding.kind {
                        SlotBindingKind::Named { name, .. } => format!("\"{}\"", name),
                        SlotBindingKind::Default { .. } => "undefined".to_string(),
                        SlotBindingKind::Fallback { name, .. } => {
                            name.as_ref().map(|n| format!("\"{}\"", n)).unwrap_or_else(|| "undefined".to_string())
                        }
                    };
                    
                    let fallback = match &slot_binding.kind {
                        SlotBindingKind::Fallback { fallback_source, .. } => {
                            if !fallback_source.is_empty() {
                                format!(", \"{}\"", fallback_source.replace('"', "\\\""))
                            } else {
                                String::new()
                            }
                        }
                        _ => String::new(),
                    };
                    
                    lines.push(format!(
                        "insert({}, renderSlot({}{}));",
                        target, slot_name, fallback
                    ));
                    self.add_helper("insert");
                    self.add_helper("renderSlot");
                }
            }
        }

        // return _el$
        lines.push(format!("return {};", root_var));

        // Wrap in IIFE if there are bindings, otherwise just clone call
        if ir.bindings.is_empty() {
            // Pure static: just return the clone
            format!("{}()", ir.template_var)
        } else {
            format!("(() => {{\n  {}\n}})()", lines.join("\n  "))
        }
    }

    /// Generate JS code for a native element with a specific template variable name
    /// Used when calling from Fragment context where we need to control the template var
    fn generate_element_code_with_template(&mut self, ir: &TemplateIR, template_var: &str) -> String {
        let mut lines: Vec<String> = Vec::new();

        // const _el$ = _tmpl$N()
        let root_var = "_el$".to_string();
        lines.push(format!("const {} = {}();", root_var, template_var));

        // Collect unique paths → variable names
        let mut path_vars: Vec<(DomPath, String)> = Vec::new();
        path_vars.push((DomPath::root(), root_var.clone()));

        // Get all unique non-root paths that need variables
        let target_paths: Vec<DomPath> = ir.bindings
            .iter()
            .filter(|b| b.path != DomPath::root())
            .map(|b| b.path.clone())
            .collect();

        // Generate all possible intermediate paths
        let mut all_needed_paths: Vec<DomPath> = Vec::new();
        for target_path in &target_paths {
            for len in 1..=target_path.steps.len() {
                let prefix = DomPath {
                    steps: target_path.steps[..len].to_vec(),
                };
                all_needed_paths.push(prefix);
            }
        }

        all_needed_paths.sort_by(|a, b| a.steps.len().cmp(&b.steps.len()));
        all_needed_paths.dedup();

        for path in &all_needed_paths {
            // Find the best base path to reuse
            // i.e., find p such that path.is_descendant_of(p) is true
            let (base_path, base_var) = path_vars
                .iter()
                .rev()
                .find(|(p, _)| path.is_descendant_of(p))  // Check if path has p as prefix
                .map(|(p, v)| (p.clone(), v.clone()))
                .unwrap_or_else(|| (DomPath::root(), root_var.clone()));

            let remaining_steps = path.steps.len() - base_path.steps.len();

            if remaining_steps > 0 {
                // Variable index should be path_vars.len() (0 is root, so first real var is at index 1)
                let var_name = format!("_el${}", path_vars.len());
                let access = path.partial_to_js_access(&base_var, remaining_steps);
                lines.push(format!("const {} = {};", var_name, access));
                path_vars.push((path.clone(), var_name));
            }
        }

        // Generate binding statements
        for binding in &ir.bindings {
            let target = path_vars
                .iter()
                .find(|(p, _)| p == &binding.path)
                .map(|(_, v)| v.as_str())
                .unwrap_or("_el$");

            match &binding.kind {
                BindingKind::Insert { expression_source } => {
                    let parent = get_parent_var(&binding.path, &path_vars, &root_var);
                    if parent == target {
                        lines.push(format!("insert({}, {});", target, expression_source));
                    } else {
                        lines.push(format!("insert({}, {}, {});", parent, expression_source, target));
                    }
                    self.add_helper("insert");
                }
                BindingKind::DelegatedEvent {
                    event_name,
                    handler_source,
                } => {
                    lines.push(format!("{}.$${}  = {};", target, event_name, handler_source));
                }
                BindingKind::DirectEvent {
                    event_name,
                    handler_source,
                } => {
                    lines.push(format!("{}.addEventListener(\"{}\", {});", target, event_name, handler_source));
                }
                BindingKind::Attribute {
                    name,
                    value_source,
                    is_dynamic: _,
                } => {
                    lines.push(format!("setAttribute({}, \"{}\", {});", target, name, value_source));
                    self.add_helper("setAttribute");
                }
                BindingKind::ClassName {
                    value_source,
                    is_dynamic: _,
                } => {
                    lines.push(format!("className({}, {});", target, value_source));
                    self.add_helper("className");
                }
                BindingKind::Style {
                    value_source,
                    is_dynamic: _,
                } => {
                    lines.push(format!("style({}, {});", target, value_source));
                    self.add_helper("style");
                }
                BindingKind::Ref { ref_source, is_dom_ref } => {
                    if *is_dom_ref {
                        // DOM ref: let el; <div ref={el}/> - direct assignment like SolidJS
                        // Generate: el = node
                        lines.push(format!("{} = {};", ref_source, target));
                    } else {
                        // Callback ref or signal ref - use ref() helper
                        lines.push(format!("ref({}, {});", target, ref_source));
                        self.add_helper("ref");
                    }
                }
                BindingKind::Spread { props_source } => {
                    lines.push(format!("spread({}, {});", target, props_source));
                    self.add_helper("spread");
                }
                BindingKind::Slot { .. } => {
                    // Slot handling - use insert
                    lines.push(format!("insert({}, renderSlot());", target));
                    self.add_helper("insert");
                }
            }
        }

        lines.push(format!("return {};", root_var));

        if ir.bindings.is_empty() {
            format!("{}()", template_var)
        } else {
            format!("(() => {{\n  {}\n}})()", lines.join("\n  "))
        }
    }

    /// Compile a component JSX element: <Comp prop={val} />
    fn compile_component(&mut self, element: &JSXElement<'_>, component_name: &str) -> String {
        let mut props: Vec<String> = Vec::new();

        for attr in &element.opening_element.attributes {
            match attr {
                JSXAttributeItem::Attribute(attr) => {
                    let prop_name = match &attr.name {
                        JSXAttributeName::Identifier(ident) => ident.name.as_str(),
                        _ => continue,
                    };

                    let prop_value = match &attr.value {
                        Some(JSXAttributeValue::StringLiteral(s)) => {
                            format!("\"{}\"", s.value)
                        }
                        Some(JSXAttributeValue::ExpressionContainer(expr)) => {
                            match &expr.expression {
                                JSXExpression::EmptyExpression(_) => continue,
                                // Use analyzer to compile JSX expressions to avoid React.createElement
                                e => self.analyzer.extract_jsx_expr_source(e),
                            }
                        }
                        None => "true".to_string(),
                        _ => continue,
                    };

                    props.push(format!("{}: {}", prop_name, prop_value));
                }
                JSXAttributeItem::SpreadAttribute(spread) => {
                    // Use analyzer to compile JSX expressions in spread
                    let source = self.analyzer.compile_expression_value(&spread.argument);
                    props.push(format!("...{}", source));
                }
            }
        }

        // Drain helpers used during attribute processing
        self.drain_analyzer_helpers();

        // Handle children as a special "children" prop
        // Wrap children in a function to enable lazy evaluation for ErrorBoundary, Suspense, etc.
        if !element.children.is_empty() {
            let children_source = self.extract_children_source(element);
            if !children_source.is_empty() {
                // Wrap in arrow function for lazy evaluation
                props.push(format!("children: () => ({})", children_source));
            }
        }

        // Direct function call - no wrapper needed
        format!(
            "{}({{ {} }})",
            component_name,
            props.join(", ")
        )
    }

    fn extract_children_source(&mut self, element: &JSXElement<'_>) -> String {
        let mut children_exprs: Vec<String> = Vec::new();

        for child in &element.children {
            match child {
                JSXChild::Text(text) => {
                    let trimmed = text.value.as_str().trim();
                    if !trimmed.is_empty() {
                        children_exprs.push(format!("\"{}\"", escape_html(trimmed)));
                    }
                }
                JSXChild::ExpressionContainer(expr_container) => {
                    match &expr_container.expression {
                        JSXExpression::EmptyExpression(_) => {}
                        expr => {
                            let expr_source = self.analyzer.extract_jsx_expr_source(expr);
                            self.drain_analyzer_helpers();
                            children_exprs.push(expr_source);
                        }
                    }
                }
                JSXChild::Element(child_element) => {
                    // Handle nested element as child
                    let child_tag_name = TemplateAnalyzer::get_tag_name(child_element);
                    if TemplateAnalyzer::is_component(&child_tag_name) {
                        // It's a component - compile as function call
                        let child_code = self.compile_component(child_element, &child_tag_name);
                        children_exprs.push(child_code);
                    } else {
                        // It's a DOM element - analyze it and generate template
                        let child_ir = self.analyzer.analyze(child_element);
                        self.drain_analyzer_helpers();

                        // Collect delegated events from child
                        for event in &child_ir.delegated_events {
                            if !self.delegated_events.contains(event) {
                                self.delegated_events.push(event.clone());
                            }
                        }
                        if !child_ir.delegated_events.is_empty() {
                            self.add_helper("delegateEvents");
                        }
                        
                        // Add template declaration to hoisted list
                        let escaped_html = child_ir
                            .html
                            .replace('\\', "\\\\")
                            .replace('"', "\\\"")
                            .replace('\n', "\\n")
                            .replace('\r', "\\r");
                        self.hoisted.push(format!(
                            "const {} = template(\"{}\");",
                            child_ir.template_var, escaped_html
                        ));
                        self.add_helper("template");
                        
                        // Generate code for this child element
                        let child_code = self.generate_element_code(&child_ir);
                        children_exprs.push(child_code);
                    }
                }
                JSXChild::Fragment(fragment) => {
                    // Handle fragment children
                    for frag_child in &fragment.children {
                        match frag_child {
                            JSXChild::Text(text) => {
                                let trimmed = text.value.as_str().trim();
                                if !trimmed.is_empty() {
                                    children_exprs.push(format!("\"{}\"", escape_html(trimmed)));
                                }
                            }
                            JSXChild::Element(el) => {
                                let child_tag_name = TemplateAnalyzer::get_tag_name(el);
                                if TemplateAnalyzer::is_component(&child_tag_name) {
                                    let child_code = self.compile_component(el, &child_tag_name);
                                    children_exprs.push(child_code);
                                } else {
                                    let child_ir = self.analyzer.analyze(el);
                                    self.drain_analyzer_helpers();

                                    for event in &child_ir.delegated_events {
                                        if !self.delegated_events.contains(event) {
                                            self.delegated_events.push(event.clone());
                                        }
                                    }
                                    if !child_ir.delegated_events.is_empty() {
                                        self.add_helper("delegateEvents");
                                    }
                                    
                                    let escaped_html = child_ir
                                        .html
                                        .replace('\\', "\\\\")
                                        .replace('"', "\\\"")
                                        .replace('\n', "\\n")
                                        .replace('\r', "\\r");
                                    self.hoisted.push(format!(
                                        "const {} = template(\"{}\");",
                                        child_ir.template_var, escaped_html
                                    ));
                                    self.add_helper("template");
                                    
                                    let child_code = self.generate_element_code(&child_ir);
                                    children_exprs.push(child_code);
                                }
                            }
                            _ => {}
                        }
                    }
                }
                _ => {}
            }
        }

        if children_exprs.is_empty() {
            String::new()
        } else if children_exprs.len() == 1 {
            children_exprs[0].clone()
        } else {
            format!("[{}]", children_exprs.join(", "))
        }
    }

    fn extract_source(&self, span: oxc::span::Span) -> String {
        let start = span.start as usize;
        let end = span.end as usize;
        if start < self.source.len() && end <= self.source.len() && start < end {
            self.source[start..end].to_string()
        } else {
            String::new()
        }
    }

    fn add_helper(&mut self, name: &str) {
        if !self.used_helpers.contains(&name.to_string()) {
            self.used_helpers.push(name.to_string());
        }
    }

    // =========================================================================
    // Final output generation
    // =========================================================================

    /// Apply all collected replacements and generate the final output
    pub fn generate_output(&mut self) -> String {
        let mut output = String::new();

        // 1. Import statement for runtime helpers
        if !self.used_helpers.is_empty() {
            output.push_str(&format!(
                "import {{ {} }} from \"@zeus-js/core\";\n",
                self.used_helpers.join(", ")
            ));
        }

        // 2. Hoisted template declarations
        for hoisted in &self.hoisted {
            output.push_str(hoisted);
            output.push('\n');
        }

        // 3. Apply replacements to source (sorted by start position, applied in reverse)
        let mut sorted_replacements: Vec<&Replacement> = self.replacements.iter().collect();
        sorted_replacements.sort_by(|a, b| a.start.cmp(&b.start));

        let mut result = self.source.to_string();
        
        // Apply in reverse order to preserve positions
        for replacement in sorted_replacements.iter().rev() {
            let start = replacement.start as usize;
            let end = replacement.end as usize;
            result.replace_range(start..end, &replacement.code);
        }

        // 3b. Transform if-return patterns to ternary using AST-analyzed patterns
        // After JSX is compiled, the patterns still work because JSX is inside the if/return
        if !self.conditional_patterns.is_empty() {
            result = transform_with_patterns(&result, &self.conditional_patterns);
        }

        output.push_str(&result);

        // 4. Append delegateEvents() if needed
        if !self.delegated_events.is_empty() {
            let events: Vec<String> = self
                .delegated_events
                .iter()
                .map(|e| format!("\"{}\"", e))
                .collect();
            output.push_str(&format!("\ndelegateEvents([{}]);", events.join(", ")));
        }

        output
    }
}

/// Transform if-return using AST-analyzed patterns
fn transform_with_patterns(code: &str, patterns: &[(usize, usize, usize, Option<usize>)]) -> String {
    if patterns.is_empty() {
        return code.to_string();
    }
    
    eprintln!("DEBUG transform_with_patterns: got {} patterns", patterns.len());
    
    let mut result = code.to_string();
    
    // Sort patterns by start position (descending) to apply from end to start
    let mut sorted: Vec<_> = patterns.iter().collect();
    sorted.sort_by(|a, b| b.0.cmp(&a.0));
    
    for (if_start, _if_end, then_end, else_end_opt) in sorted {
        // Get the condition from the if statement
        let if_text = &result[*if_start..];
        
        // Find the condition - look for the pattern: "if (condition)"
        if let Some(cond_start) = if_text.find("if (") {
            let cond_start = *if_start + cond_start + 3; // after "if "
            // Find matching )
            let rest = &result[cond_start..];
            let cond_end = cond_start + find_matching_paren(rest);
            
            let condition = &result[cond_start..cond_end].trim();
            
            // Get then expression (between condition and semicolon)
            let then_expr = extract_return_expression(&result[cond_end..*then_end]);
            
            // Get else expression if exists
            let else_expr = if let Some(else_end) = else_end_opt {
                extract_return_expression(&result[*then_end..*else_end])
            } else {
                // Implicit else - look for next return
                let after_then = &result[*then_end..];
                if let Some(next_return_pos) = after_then.find("return ") {
                    let next_return_start = *then_end + next_return_pos + 7;
                    let next_semicolon = result[next_return_start..].find(';')
                        .map(|p| next_return_start + p)
                        .unwrap_or(result.len());
                    extract_return_expression(&result[next_return_start..next_semicolon])
                } else {
                    String::new()
                }
            };
            
            if !then_expr.is_empty() && !else_expr.is_empty() {
                // Transform!
                let ternary = format!("return {} ? {} : {};", condition, then_expr, else_expr);
                
                // Find the end of the entire pattern
                let pattern_end = else_end_opt.unwrap_or(*then_end + 1);
                let after_pattern = &result[pattern_end..];
                let extra = if after_pattern.trim().starts_with("return ") {
                    // Include implicit else return
                    let return_start = pattern_end + after_pattern.find("return ").unwrap();
                    let return_end = return_start + after_pattern[after_pattern.find("return ").unwrap()..].find(';').map(|p| p + 1).unwrap_or(after_pattern.len());
                    let return_text = &after_pattern[..return_end.min(after_pattern.len())];
                    let remaining = &after_pattern[return_end..];
                    result = format!("{}{}{}", &result[..*if_start], ternary, remaining);
                    true
                } else {
                    false
                };
                
                if !extra {
                    let remaining = &result[pattern_end..];
                    result = format!("{}{}{}", &result[..*if_start], ternary, remaining);
                }
            }
        }
    }
    
    result
}

/// Find matching parenthesis
fn find_matching_paren(s: &str) -> usize {
    let mut count = 0;
    for (i, c) in s.char_indices() {
        match c {
            '(' => count += 1,
            ')' => {
                count -= 1;
                if count == 0 {
                    return i;
                }
            }
            _ => {}
        }
    }
    s.len()
}

/// Extract the return expression from compiled if-then branch
/// Input: "if (shouldError()) {\n    return _tmpl$1();\n  }"
/// Output: "_tmpl$1()"
fn extract_return_expression(code: &str) -> String {
    // Find "return " followed by an expression
    // Handle both single-line and multi-line
    if let Some(ret_pos) = code.find("return ") {
        let after_return = &code[ret_pos + 7..]; // Skip "return "
        
        // Find the first semicolon or closing brace
        let end_pos = after_return.find(';').or(after_return.find('}'));
        
        if let Some(pos) = end_pos {
            let expr = after_return[..pos].trim();
            return expr.to_string();
        }
    }
    String::new()
}

/// Transform if-return patterns to ternary expressions
/// This runs after JSX compilation, so JSX is already converted to template calls
fn transform_if_return_patterns(code: &str) -> String {
    let mut result = code.to_string();
    let mut changed = true;
    
    let mut iterations = 0;
    const MAX_ITERATIONS: usize = 10;
    
    while changed && iterations < MAX_ITERATIONS {
        changed = false;
        iterations += 1;
        
        // Find function bodies and transform within each
        // Pattern: "function X(...) { if(...) return A; return B; }"
        if let Some(new_result) = transform_functions_in_code(&result) {
            if new_result != result {
                result = new_result;
                changed = true;
            }
        }
    }
    
    result
}

/// Transform if-return patterns within function bodies
fn transform_functions_in_code(code: &str) -> Option<String> {
    let mut result = code.to_string();
    let mut made_change = false;
    
    // Find all function declarations
    // Pattern: "function name(...) { ... }"
    let mut search_start = 0;
    
    while let Some(func_start) = result[search_start..].find("function ") {
        let absolute_start = search_start + func_start;
        
        // Find the function name
        let after_function = &result[absolute_start + 9..];
        let name_end = after_function.find(|c: char| !c.is_alphanumeric() && c != '_').unwrap_or(after_function.len());
        let func_name = &after_function[..name_end];
        
        // Find the opening brace of the function body
        if let Some(body_start) = result[absolute_start..].find('{') {
            let absolute_body_start = absolute_start + body_start;
            
            // Find the matching closing brace
            if let Some(body_end) = find_matching_brace(&result[absolute_body_start..]) {
                let absolute_body_end = absolute_body_start + body_end + 1;
                
                // Extract function body
                let body = &result[absolute_body_start..absolute_body_end];
                
                // Try to transform within this body
                let new_body = transform_single_if_return(body);
                
                if let Some(transformed) = new_body {
                    // Replace the body
                    result = format!("{}{}{}", 
                        &result[..absolute_body_start], 
                        transformed, 
                        &result[absolute_body_end..]
                    );
                    made_change = true;
                    // Continue searching from where we left off
                    search_start = absolute_body_end;
                } else {
                    // No transformation in this function, continue
                    search_start = absolute_body_end;
                }
            } else {
                search_start = absolute_start + 10;
            }
        } else {
            search_start = absolute_start + 10;
        }
    }
    
    if made_change { Some(result) } else { None }
}

/// Find matching closing brace
fn find_matching_brace(s: &str) -> Option<usize> {
    let mut count = 0;
    for (i, c) in s.char_indices() {
        match c {
            '{' => count += 1,
            '}' => {
                count -= 1;
                if count == 0 {
                    return Some(i);
                }
            }
            _ => {}
        }
    }
    None
}

/// Transform a single if-return pattern in a function body
/// Returns None if no pattern found
fn transform_single_if_return(code: &str) -> Option<String> {
    // Find "if (" or "if(" - be flexible with whitespace
    let if_start = code.find("if (").or_else(|| code.find("if("))?;
    let before_if = &code[..if_start];
    
    // Find what's immediately before the if statement (skip whitespace)
    let trimmed_before = before_if.trim_end();
    eprintln!("DEBUG transform_single: found if at {}, before ends with: ...{}", 
        if_start, trimmed_before.chars().rev().take(20).collect::<String>());
    
    // Check if this is at function body start or after return statement
    // We need: function() { if ... } or ... return; if ... }
    // The if should be after either { or ; (from a return statement)
    let last_char = trimmed_before.chars().last();
    if last_char != Some('{') && last_char != Some(';') {
        eprintln!("DEBUG transform_single: skipping - last char is {:?}", last_char);
        return None;
    }
    
    // Find the matching closing brace for the if
    let if_content_start = if_start + 3; // after "if "
    let paren_start = if_content_start;
    
    // Find matching closing parenthesis
    let mut paren_count = 0;
    let mut cond_start = 0;
    let mut cond_end = 0;
    let mut found_open = false;
    
    for (i, c) in code[if_content_start..].char_indices() {
        match c {
            '(' => {
                if !found_open {
                    cond_start = if_content_start + i;
                    found_open = true;
                }
                paren_count += 1;
            }
            ')' => {
                paren_count -= 1;
                if paren_count == 0 && found_open {
                    cond_end = if_content_start + i;
                    break;
                }
            }
            _ => {}
        }
    }
    
    if cond_start == 0 || cond_end == 0 {
        return None;
    }
    
    let condition = &code[cond_start..=cond_end].trim();
    
    // Now find what follows the condition
    let after_cond = &code[cond_end + 1..];
    let after_cond = after_cond.trim();
    
    // Check for "return X;" or "{ return X; }"
    let (then_expr, remaining_after_then) = if after_cond.starts_with("{") {
        // Block statement
        let mut brace_count = 0;
        let mut found_open_brace = false;
        let mut block_end = 0;
        
        for (i, c) in after_cond.char_indices() {
            match c {
                '{' => {
                    if !found_open_brace {
                        found_open_brace = true;
                    }
                    brace_count += 1;
                }
                '}' => {
                    brace_count -= 1;
                    if brace_count == 0 && found_open_brace {
                        block_end = i;
                        break;
                    }
                }
                _ => {}
            }
        }
        
        if block_end == 0 {
            return None;
        }
        
        let block = &after_cond[1..block_end];
        let then_expr = extract_return_expression(block);
        if then_expr.is_empty() {
            return None;
        }
        let remaining = &after_cond[block_end+1..];
        (then_expr, remaining)
    } else if after_cond.starts_with("return ") {
        let then_expr = extract_return_expression(after_cond);
        if then_expr.is_empty() {
            return None;
        }
        let return_end = after_cond.find(';').map(|p| p + 1).unwrap_or(after_cond.len());
        let remaining = &after_cond[return_end..];
        (then_expr, remaining)
    } else {
        return None;
    };
    
    // Now look for the else branch or the next return
    let remaining = remaining_after_then.trim();
    
    // Check for else branch or implicit else
    let else_result = if remaining.starts_with("else") {
        let after_else_keyword = remaining[4..].trim();
        
        if after_else_keyword.starts_with("{") {
            // else block
            let mut brace_count = 0;
            let mut found_open = false;
            let mut block_end = 0;
            
            for (i, c) in after_else_keyword.char_indices() {
                match c {
                    '{' => {
                        if !found_open {
                            found_open = true;
                        }
                        brace_count += 1;
                    }
                    '}' => {
                        brace_count -= 1;
                        if brace_count == 0 && found_open {
                            block_end = i;
                            break;
                        }
                    }
                    _ => {}
                }
            }
            
            if block_end == 0 {
                return None;
            }
            
            let else_block = &after_else_keyword[1..block_end];
            let else_expr = extract_return_expression(else_block);
            if else_expr.is_empty() {
                return None;
            }
            let after = &after_else_keyword[block_end+1..];
            Some((else_expr, after))
        } else if after_else_keyword.starts_with("if ") {
            // else if - handle recursively
            return None;
        } else {
            // else return
            let else_expr = extract_return_expression(after_else_keyword);
            if else_expr.is_empty() {
                return None;
            }
            let return_end = after_else_keyword.find(';').map(|p| p + 1).unwrap_or(after_else_keyword.len());
            let after = &after_else_keyword[return_end..];
            Some((else_expr, after))
        }
    } else if remaining.starts_with("return ") {
        // No else - this is the implicit else
        let else_expr = extract_return_expression(remaining);
        if else_expr.is_empty() {
            return None;
        }
        let return_end = remaining.find(';').map(|p| p + 1).unwrap_or(remaining.len());
        let after = &remaining[return_end..];
        Some((else_expr, after))
    } else {
        return None;
    };
    
    let Some((else_expr, after_else)) = else_result else {
        return None;
    };
    
    // Now we have condition, then_expr, else_expr
    // Transform to ternary
    let ternary = format!("{} ? {} : {}", condition, then_expr, else_expr);
    let return_ternary = format!("return {};", ternary);
    
    // Replace the entire if-else pattern with the ternary return
    // Find where the pattern ends
    let pattern_end = after_else.as_ptr() as usize - code.as_ptr() as usize;
    let pattern_start = if_start;
    
    // Build new code
    let before = &code[..pattern_start];
    let after = &code[pattern_end..];
    
    Some(format!("{}{}{}", before.trim_end(), return_ternary, after))
}

/// Extract the else branch return expression from compiled code
/// Handles both "else { return X; }" and direct "return X;" after if block
fn extract_else_expression(code: &str) -> String {
    // First try to find "else {"
    if let Some(else_pos) = code.find("else") {
        let after_else = &code[else_pos..];
        
        // Check if it's "else {" with a block
        if after_else.starts_with("else {") {
            let else_body = &after_else[5..]; // Skip "else "
            if let Some(close_pos) = else_body.find('}') {
                let inner = &else_body[1..close_pos]; // Skip opening {
                return extract_return_expression(inner);
            }
        }
    }
    
    // Try to find a return statement directly (no else block)
    // This handles the case: "if (cond) { ... } return X;"
    extract_return_expression(code)
}

/// Find the parent element variable for a given path
fn get_parent_var(path: &DomPath, path_vars: &[(DomPath, String)], root_var: &str) -> String {
    // The parent is the path without the last child-identifying steps
    // A child path is: parent_steps + FirstChild + N*NextSibling
    // So we strip from the last FirstChild onwards
    let steps = &path.steps;
    let mut last_first_child = None;
    for (i, step) in steps.iter().enumerate() {
        if *step == TraversalStep::FirstChild {
            last_first_child = Some(i);
        }
    }

    match last_first_child {
        Some(idx) => {
            let parent_path = DomPath {
                steps: steps[..idx].to_vec(),
            };
            path_vars
                .iter()
                .find(|(p, _)| p == &parent_path)
                .map(|(_, v)| v.clone())
                .unwrap_or_else(|| root_var.to_string())
        }
        None => root_var.to_string(),
    }
}
