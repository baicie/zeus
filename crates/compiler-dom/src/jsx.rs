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

/// A compiler warning
#[derive(Debug, Clone)]
pub struct Warning {
    pub message: String,
    pub line: u32,
    pub column: u32,
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
    /// Compiler warnings
    pub warnings: Vec<Warning>,
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
            warnings: Vec::new(),
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
            Expression::JSXFragment(fragment) => {
                self.compile_jsx_fragment(fragment);
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
        if let Some(member) = call.callee.as_member_expression() {
            // Check if it's a static member expression (obj.prop, not obj[prop])
            if let MemberExpression::StaticMemberExpression(static_member) = member {
                if static_member.property.name == "map" {
                    // This is a .map() call, check for key
                    let has_key = call.arguments.iter().any(|arg| {
                        if let Some(expr) = arg.as_expression() {
                            if let Expression::ArrowFunctionExpression(arrow) = expr {
                                // Check if the arrow function returns JSX with key
                                return self.arrow_function_has_key(arrow);
                            }
                        }
                        false
                    });

                    if !has_key {
                        let span = call.span();
                        self.warnings.push(Warning {
                            message: "Missing 'key' prop in list rendering. Consider adding a unique key to each list item for better performance.".to_string(),
                            line: span.start,
                            column: span.end,
                        });
                    }
                }
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
        if children.len() == 1 {
            if let JSXChild::Element(jsx_child) = &children[0] {
                // 1. 先分析子元素，获取其 IR（这会收集事件等）
                let ir = self.analyzer.analyze(jsx_child);
                
                // 2. 收集事件
                for event in &ir.delegated_events {
                    if !self.delegated_events.contains(event) {
                        self.delegated_events.push(event.clone());
                    }
                }
                if !ir.delegated_events.is_empty() {
                    self.add_helper("delegateEvents");
                }
                
                // 3. 生成子元素的代码
                let child_code = self.generate_element_code(&ir);
                
                // 4. 为 Fragment 生成替换代码 - 直接使用子元素的代码
                self.replacements.push(Replacement {
                    start: span.start,
                    end: span.end,
                    code: child_code,
                });
                
                return;
            }
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
                        // 原生元素：使用 generate_element_code 生成完整代码
                        let ir = self.analyzer.analyze(jsx_child);
                        
                        // 收集事件
                        for event in &ir.delegated_events {
                            if !self.delegated_events.contains(event) {
                                self.delegated_events.push(event.clone());
                            }
                        }
                        if !ir.delegated_events.is_empty() {
                            self.add_helper("delegateEvents");
                        }
                        
                        let escaped_html = ir
                            .html
                            .replace('\\', "\\\\")
                            .replace('"', "\\\"")
                            .replace('\n', "\\n")
                            .replace('\r', "\\r");
                        let template_var = format!("_tmpl${}", self.hoisted.len());
                        self.hoisted.push(format!(
                            "const {} = template(\"{}\");",
                            template_var, escaped_html
                        ));
                        self.add_helper("template");

                        // 生成代码
                        let element_code = self.generate_element_code_with_template(&ir, &template_var);
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
        let target_paths: Vec<DomPath> = ir.bindings
            .iter()
            .filter(|b| b.path != DomPath::root())
            .map(|b| b.path.clone())
            .collect();

        // Generate all possible intermediate paths from root to each target
        // For each target path, generate all prefixes
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

        // Sort by path length (shorter first) so we create shorter paths first
        all_needed_paths.sort_by(|a, b| a.steps.len().cmp(&b.steps.len()));

        // Remove duplicates while preserving order
        all_needed_paths.dedup();

        // Now create variables for all paths
        for path in all_needed_paths {
            // Find the best base path to reuse (the longest prefix that already has a variable)
            let (base_path, base_var) = path_vars
                .iter()
                .rev()  // Start from the end (longest paths first)
                .find(|(p, _)| path.is_descendant_of(p))
                .map(|(p, v)| (p.clone(), v.clone()))
                .unwrap_or_else(|| (DomPath::root(), root_var.clone()));

            // Calculate remaining steps from the base path
            let remaining_steps = path.steps.len() - base_path.steps.len();

            if remaining_steps > 0 {
                let var_name = format!("_el${}", path_vars.len());
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
                BindingKind::Ref { ref_source } => {
                    lines.push(format!("{}({});", ref_source, target));
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
            let (base_path, base_var) = path_vars
                .iter()
                .rev()
                .find(|(p, _)| path.is_descendant_of(p))
                .map(|(p, v)| (p.clone(), v.clone()))
                .unwrap_or_else(|| (DomPath::root(), root_var.clone()));

            let remaining_steps = path.steps.len() - base_path.steps.len();

            if remaining_steps > 0 {
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
                BindingKind::Ref { ref_source } => {
                    lines.push(format!("{}({});", ref_source, target));
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
