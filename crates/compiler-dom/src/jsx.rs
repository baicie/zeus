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

use crate::template_analyzer::TemplateAnalyzer;
use crate::template_ir::*;

/// A span replacement: replace source[start..end] with `code`
#[derive(Debug)]
pub struct Replacement {
    pub start: u32,
    pub end: u32,
    pub code: String,
}

/// JSX compiler that collects replacements and hoisted code
pub struct JsxCompiler<'s> {
    source: &'s str,
    analyzer: TemplateAnalyzer<'s>,
    /// Hoisted template declarations (inserted at top of module)
    pub hoisted: Vec<String>,
    /// Collected delegated event names
    pub delegated_events: Vec<String>,
    /// Span replacements to apply
    pub replacements: Vec<Replacement>,
    /// Runtime helpers that are actually used
    pub used_helpers: Vec<String>,
}

impl<'s> JsxCompiler<'s> {
    pub fn new(source: &'s str) -> Self {
        Self {
            source,
            analyzer: TemplateAnalyzer::new(source),
            hoisted: Vec::new(),
            delegated_events: Vec::new(),
            replacements: Vec::new(),
            used_helpers: Vec::new(),
        }
    }

    /// Walk the program AST and collect all JSX replacements
    pub fn visit_program(&mut self, program: &Program<'_>) {
        for stmt in &program.body {
            self.visit_statement(stmt);
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
                    match &export.declaration {
                        ExportDefaultDeclarationKind::FunctionDeclaration(func) => {
                            if let Some(body) = &func.body {
                                for s in &body.statements {
                                    self.visit_statement(s);
                                }
                            }
                        }
                        _ => {}
                    }
                }
            }
            Statement::ExportNamedDeclaration(export) => {
                if let Some(decl) = &export.declaration {
                    self.visit_declaration(decl);
                }
            }
            Statement::IfStatement(if_stmt) => {
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
            Expression::ArrowFunctionExpression(arrow) => {
                for stmt in &arrow.body.statements {
                    self.visit_statement(stmt);
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

        // Collect delegated events
        for event in &ir.delegated_events {
            if !self.delegated_events.contains(event) {
                self.delegated_events.push(event.clone());
            }
        }

        // Generate hoisted template declaration
        let escaped_html = ir.html.replace('\\', "\\\\").replace('"', "\\\"");
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

    /// Generate JS code for a native element from its TemplateIR
    fn generate_element_code(&mut self, ir: &TemplateIR) -> String {
        let mut lines: Vec<String> = Vec::new();

        // const _el$ = _tmpl$N()
        let root_var = "_el$".to_string();
        lines.push(format!("const {} = {}();", root_var, ir.template_var));

        // Collect unique paths → variable names
        let mut path_vars: Vec<(DomPath, String)> = Vec::new();
        path_vars.push((DomPath::root(), root_var.clone()));

        let mut el_counter: usize = 0;
        for binding in &ir.bindings {
            if binding.path != DomPath::root()
                && !path_vars.iter().any(|(p, _)| p == &binding.path)
            {
                el_counter += 1;
                let var_name = format!("_el${}", el_counter + 1);
                let access = binding.path.to_js_access(&root_var);
                lines.push(format!("const {} = {};", var_name, access));
                path_vars.push((binding.path.clone(), var_name));
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
                BindingKind::Ref { ref_source } => {
                    lines.push(format!("{}({});", ref_source, target));
                }
                BindingKind::Spread { props_source } => {
                    lines.push(format!("spread({}, {});", target, props_source));
                    self.add_helper("spread");
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

    /// Compile a component JSX element: <Comp prop={val} />
    fn compile_component(&self, element: &JSXElement<'_>, component_name: &str) -> String {
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
                                e => self.extract_source(e.span()),
                            }
                        }
                        None => "true".to_string(),
                        _ => continue,
                    };

                    props.push(format!("{}: {}", prop_name, prop_value));
                }
                JSXAttributeItem::SpreadAttribute(spread) => {
                    let source = self.extract_source(spread.argument.span());
                    props.push(format!("...{}", source));
                }
            }
        }

        // Handle children as a special "children" prop
        if !element.children.is_empty() {
            let children_source = self.extract_children_source(element);
            if !children_source.is_empty() {
                props.push(format!("children: {}", children_source));
            }
        }

        // Direct function call - no wrapper needed
        format!(
            "{}({{ {} }})",
            component_name,
            props.join(", ")
        )
    }

    fn extract_children_source(&self, element: &JSXElement<'_>) -> String {
        // For MVP: extract children source text between opening and closing tags
        let open_end = element.opening_element.span().end as usize;
        let close_start = element
            .closing_element
            .as_ref()
            .map(|c| c.span().start as usize)
            .unwrap_or(open_end);

        if close_start > open_end {
            let children_text = self.source[open_end..close_start].trim();
            if !children_text.is_empty() {
                return format!("\"{}\"", children_text);
            }
        }
        String::new()
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
    pub fn generate_output(&self) -> String {
        let mut output = String::new();

        // 1. Import statement for runtime helpers
        if !self.used_helpers.is_empty() {
            output.push_str(&format!(
                "import {{ {} }} from \"@zeus-js/runtime-dom\";\n",
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
