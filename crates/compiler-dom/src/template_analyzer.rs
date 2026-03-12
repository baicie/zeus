//! JSX Template Analyzer
//!
//! Walks a JSX element tree and produces a TemplateIR:
//! - Static content → HTML string (for `template()`)
//! - Dynamic content → Bindings (for runtime wiring)

use oxc::ast::ast::*;
use oxc::span::GetSpan;

use crate::template_ir::*;

/// Void HTML elements that don't have closing tags
const VOID_ELEMENTS: &[&str] = &[
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param",
    "source", "track", "wbr",
];

/// Events that don't bubble and can't be delegated
const NON_DELEGATABLE_EVENTS: &[&str] = &[
    "focus",
    "blur",
    "mouseenter",
    "mouseleave",
    "scroll",
    "load",
    "error",
    "pointerenter",
    "pointerleave",
];

/// Analyzes JSX element trees to produce TemplateIR
pub struct TemplateAnalyzer<'s> {
    /// Original source code for span-based extraction
    source: &'s str,
    /// Counter for unique template variable names
    template_counter: usize,
    /// Collected delegated event names
    delegated_events: Vec<String>,
    /// Helpers used while compiling expression-position JSX / component children.
    used_helpers: Vec<String>,
}

impl<'s> TemplateAnalyzer<'s> {
    pub fn new(source: &'s str) -> Self {
        Self {
            source,
            template_counter: 0,
            delegated_events: Vec::new(),
            used_helpers: Vec::new(),
        }
    }

    /// Create with an initial template counter value (for sharing across compilations)
    pub fn with_counter(source: &'s str, counter: usize) -> Self {
        Self {
            source,
            template_counter: counter,
            delegated_events: Vec::new(),
            used_helpers: Vec::new(),
        }
    }

    /// Get current template counter value
    pub fn get_counter(&self) -> usize {
        self.template_counter
    }

    /// Set template counter value (e.g., after sharing across compilations)
    pub fn set_counter(&mut self, counter: usize) {
        self.template_counter = counter;
    }

    /// Drain helpers used so far (deduped by insertion).
    pub fn take_used_helpers(&mut self) -> Vec<String> {
        std::mem::take(&mut self.used_helpers)
    }

    fn add_used_helper(&mut self, name: &str) {
        if !self.used_helpers.iter().any(|h| h == name) {
            self.used_helpers.push(name.to_string());
        }
    }

    /// Analyze a JSX element and produce a TemplateIR
    pub fn analyze(&mut self, element: &JSXElement<'_>) -> TemplateIR {
        let mut html = String::new();
        let mut bindings = Vec::new();

        self.template_counter += 1;
        let template_var = format!("_tmpl${}", self.template_counter);

        self.analyze_element(element, &mut html, &mut bindings, &DomPath::root());

        TemplateIR {
            html,
            template_var,
            bindings,
            delegated_events: self.delegated_events.clone(),
        }
    }

    /// Check if a tag name is a component (starts with uppercase)
    pub fn is_component(tag_name: &str) -> bool {
        tag_name
            .chars()
            .next()
            .is_some_and(|c| c.is_uppercase())
    }

    /// Extract the tag name from a JSX element
    pub fn get_tag_name(element: &JSXElement<'_>) -> String {
        match &element.opening_element.name {
            JSXElementName::Identifier(ident) => ident.name.as_str().to_string(),
            JSXElementName::IdentifierReference(ident) => ident.name.as_str().to_string(),
            JSXElementName::NamespacedName(ns) => {
                format!("{}:{}", ns.namespace.name, ns.name.name)
            }
            JSXElementName::MemberExpression(member) => member_expr_to_string(member),
            JSXElementName::ThisExpression(_) => "this".to_string(),
        }
    }

    fn analyze_element(
        &mut self,
        element: &JSXElement<'_>,
        html: &mut String,
        bindings: &mut Vec<Binding>,
        current_path: &DomPath,
    ) {
        let tag_name = TemplateAnalyzer::get_tag_name(element);

        // Check for slot element - special handling for Light DOM slots
        if tag_name == "slot" {
            self.analyze_slot_element(element, html, bindings, current_path);
            return;
        }

        // If this is a component, add a placeholder for its output
        // Components are function calls, not DOM elements
        if TemplateAnalyzer::is_component(&tag_name) {
            // Add an Insert binding for the component call
            let component_expr = self.compile_component_as_expression(element, &tag_name);
            bindings.push(Binding {
                path: current_path.clone(),
                kind: BindingKind::Insert {
                    expression_source: component_expr,
                },
            });
            // Add placeholder in HTML
            html.push_str("<!>");
            return;
        }

        // Open tag
        html.push('<');
        html.push_str(&tag_name);

        // Process attributes
        for attr in &element.opening_element.attributes {
            match attr {
                JSXAttributeItem::Attribute(attr) => {
                    self.analyze_attribute(attr, html, bindings, current_path);
                }
                JSXAttributeItem::SpreadAttribute(spread) => {
                    // Use compile_expression_value to compile JSX in spread
                    let source = self.compile_expression_value(&spread.argument);
                    bindings.push(Binding {
                        path: current_path.clone(),
                        kind: BindingKind::Spread {
                            props_source: source,
                        },
                    });
                }
            }
        }

        html.push('>');

        // Process children
        let mut child_index: usize = 0;
        for child in &element.children {
            match child {
                JSXChild::Text(text) => {
                    let trimmed = text.value.as_str().trim();
                    if !trimmed.is_empty() {
                        // Escape HTML entities
                        html.push_str(&escape_html(trimmed));
                        child_index += 1;
                    }
                }
                JSXChild::ExpressionContainer(expr_container) => {
                    match &expr_container.expression {
                        JSXExpression::EmptyExpression(_) => {}
                        expr => {
                            // Dynamic expression: insert marker in HTML and add binding
                            // We use an empty text node marker for the insert position
                            let child_path = compute_child_path(current_path, child_index);

                            let expr_source = self.extract_jsx_expr_source(expr);

                            bindings.push(Binding {
                                path: child_path,
                                kind: BindingKind::Insert {
                                    expression_source: expr_source,
                                },
                            });

                            // Insert an empty comment as placeholder
                            html.push_str("<!>");
                            child_index += 1;
                        }
                    }
                }
                JSXChild::Element(child_element) => {
                    let child_path = compute_child_path(current_path, child_index);
                    self.analyze_element(child_element, html, bindings, &child_path);
                    child_index += 1;
                }
                JSXChild::Fragment(fragment) => {
                    // Inline fragment children
                    for frag_child in &fragment.children {
                        match frag_child {
                            JSXChild::Text(text) => {
                                let trimmed = text.value.as_str().trim();
                                if !trimmed.is_empty() {
                                    html.push_str(&escape_html(trimmed));
                                    child_index += 1;
                                }
                            }
                            JSXChild::Element(el) => {
                                let child_path = compute_child_path(current_path, child_index);
                                self.analyze_element(el, html, bindings, &child_path);
                                child_index += 1;
                            }
                            _ => {}
                        }
                    }
                }
                JSXChild::Spread(_) => {
                    // Spread children are not common in JSX
                }
            }
        }

        // Close tag (skip for void elements)
        if !VOID_ELEMENTS.contains(&tag_name.as_str()) {
            html.push_str("</");
            html.push_str(&tag_name);
            html.push('>');
        }
    }

    fn analyze_attribute(
        &mut self,
        attr: &JSXAttribute<'_>,
        html: &mut String,
        bindings: &mut Vec<Binding>,
        current_path: &DomPath,
    ) {
        let name = match &attr.name {
            JSXAttributeName::Identifier(ident) => ident.name.as_str().to_string(),
            JSXAttributeName::NamespacedName(ns) => {
                format!("{}:{}", ns.namespace.name, ns.name.name)
            }
        };

        match &attr.value {
            Some(JSXAttributeValue::StringLiteral(s)) => {
                // Static attribute → include in template HTML
                let attr_name = normalize_attr_name(&name);
                html.push(' ');
                html.push_str(&attr_name);
                html.push_str("=\"");
                html.push_str(&escape_html(s.value.as_str()));
                html.push('"');
            }
            Some(JSXAttributeValue::ExpressionContainer(expr)) => {
                // Dynamic attribute
                let expr_source = match &expr.expression {
                    JSXExpression::EmptyExpression(_) => String::new(),
                    e => self.extract_jsx_expr_source(e),
                };

                if expr_source.is_empty() {
                    return;
                }

                if name.starts_with("on") || name.starts_with("on:") {
                    // Event handler
                    let event_name = if let Some(stripped) = name.strip_prefix("on:") {
                        stripped.to_string()
                    } else {
                        // onClick -> click
                        let raw = &name[2..];
                        raw[..1].to_lowercase() + &raw[1..]
                    };

                    if NON_DELEGATABLE_EVENTS.contains(&event_name.as_str()) {
                        bindings.push(Binding {
                            path: current_path.clone(),
                            kind: BindingKind::DirectEvent {
                                event_name,
                                handler_source: expr_source,
                            },
                        });
                    } else {
                        if !self.delegated_events.contains(&event_name) {
                            self.delegated_events.push(event_name.clone());
                        }
                        bindings.push(Binding {
                            path: current_path.clone(),
                            kind: BindingKind::DelegatedEvent {
                                event_name,
                                handler_source: expr_source,
                            },
                        });
                    }
                } else if name == "class" || name == "className" {
                    bindings.push(Binding {
                        path: current_path.clone(),
                        kind: BindingKind::ClassName {
                            value_source: expr_source,
                            is_dynamic: true,
                        },
                    });
                } else if name == "style" {
                    bindings.push(Binding {
                        path: current_path.clone(),
                        kind: BindingKind::Style {
                            value_source: expr_source,
                            is_dynamic: true,
                        },
                    });
                } else if name == "ref" {
                    bindings.push(Binding {
                        path: current_path.clone(),
                        kind: BindingKind::Ref {
                            ref_source: expr_source,
                        },
                    });
                } else {
                    bindings.push(Binding {
                        path: current_path.clone(),
                        kind: BindingKind::Attribute {
                            name: normalize_attr_name(&name),
                            value_source: expr_source,
                            is_dynamic: true,
                        },
                    });
                }
            }
            None => {
                // Boolean attribute (e.g., <input disabled />)
                html.push(' ');
                html.push_str(&normalize_attr_name(&name));
            }
            _ => {}
        }
    }

    /// Extract source text from an expression using span
    fn extract_source_span(&self, span: Span) -> String {
        let start = span.start as usize;
        let end = span.end as usize;
        if start < self.source.len() && end <= self.source.len() && start < end {
            self.source[start..end].to_string()
        } else {
            String::new()
        }
    }

    /// Extract source text from a JSXExpression.
    ///
    /// Important: this must not return raw JSX syntax, because the downstream JS toolchain
    /// may transform it into `React.createElement(...)`. Instead, when we detect JSX in
    /// expression position (logical / conditional / direct JSX expression), we compile it
    /// into Zeus runtime-friendly JS code.
    pub fn extract_jsx_expr_source(&mut self, expr: &JSXExpression<'_>) -> String {
        match expr {
            JSXExpression::EmptyExpression(_) => String::new(),
            JSXExpression::BooleanLiteral(lit) => lit.value.to_string(),
            JSXExpression::NullLiteral(_) => "null".to_string(),
            JSXExpression::NumericLiteral(lit) => lit.value.to_string(),
            JSXExpression::BigIntLiteral(lit) => {
                lit.raw.as_ref().map(|r| r.to_string()).unwrap_or_else(|| lit.value.to_string())
            }
            JSXExpression::RegExpLiteral(lit) => self.extract_source_span(lit.span),
            JSXExpression::StringLiteral(lit) => format!("\"{}\"", lit.value),
            JSXExpression::TemplateLiteral(lit) => self.extract_source_span(lit.span),
            // Simple signal / function call: strip `()` so the runtime receives a
            // reactive accessor and can wrap it in effect().
            JSXExpression::CallExpression(call) => self.extract_call_expression(call),
            // JSX component/element in direct expression position: {<Comp />}
            JSXExpression::JSXElement(elem) => self.compile_expression_child(elem),
            // Logical AND/OR: {cond() && <Comp />}
            // Wrap the whole expression in an arrow function so insert() creates a
            // reactive effect and the branch updates when signals change.
            JSXExpression::LogicalExpression(logic) => {
                let left = self.extract_source_span(logic.left.span());
                let op = match logic.operator {
                    LogicalOperator::And => "&&",
                    LogicalOperator::Or => "||",
                    LogicalOperator::Coalesce => "??",
                };
                let right = self.compile_expression_value(&logic.right);
                format!("() => {} {} {}", left, op, right)
            }
            // Ternary: {cond() ? <A /> : <B />}
            // Same wrapping for reactivity.
            JSXExpression::ConditionalExpression(cond) => {
                let test = self.extract_source_span(cond.test.span());
                let consequent = self.compile_expression_value(&cond.consequent);
                let alternate = self.compile_expression_value(&cond.alternate);
                format!("() => {} ? {} : {}", test, consequent, alternate)
            }
            // Arrow function props that return JSX, e.g. fallback={() => <div/>}
            // We must compile the returned JSX to avoid `React.createElement`.
            JSXExpression::ArrowFunctionExpression(arrow) => {
                // oxc represents arrow bodies as `FunctionBody`; expression-bodied arrows
                // may have 0 statements (expression body) or 1 statement (return).
                let params = self.extract_source_span(arrow.params.span());

                // Handle expression-bodied arrow: () => <div/>
                // In oxc, arrow.expression is true for expression-bodied arrows
                // and we can use get_expression() to get the expression
                if arrow.expression {
                    // This is an expression-bodied arrow - get the expression and compile it
                    if let Some(expr) = arrow.get_expression() {
                        let compiled = self.compile_expression_value(expr);
                        return format!("{} => {{ return {}; }}", params, compiled);
                    }
                    // Fallback to raw source if no expression found
                    return self.extract_source_span(arrow.span);
                }

                // Block-bodied arrow: () => { return <div/> }
                if arrow.body.statements.len() == 1 {
                    // oxc represents expression-bodied arrows as ExpressionStatement
                    if let Statement::ExpressionStatement(expr_stmt) = &arrow.body.statements[0] {
                        let compiled = self.compile_expression_value(&expr_stmt.expression);
                        return format!("{} => {{ return {}; }}", params, compiled);
                    }
                    // Block-bodied arrows have ReturnStatement
                    if let Statement::ReturnStatement(ret) = &arrow.body.statements[0] {
                        if let Some(arg) = &ret.argument {
                            let compiled = self.compile_expression_value(arg);
                            return format!("{} => {{ return {}; }}", params, compiled);
                        }
                    }
                }
                self.extract_source_span(arrow.span)
            }
            // Handle parenthesized expressions that contain arrow functions
            // e.g., fallback={(error, reset) => (<div>...</div>)}
            JSXExpression::ParenthesizedExpression(paren) => {
                self.compile_expression_value(&paren.expression)
            }
            // All other expressions: use raw span extraction
            _ => {
                let span = match expr {
                    JSXExpression::Identifier(id) => id.span,
                    JSXExpression::MetaProperty(mp) => mp.span,
                    _ => self.extract_expr_span(expr),
                };
                self.extract_source_span(span)
            }
        }
    }

    /// Compile an `Expression` node that may contain JSX.
    /// Used for the branches of logical / conditional expressions.
    pub fn compile_expression_value(&mut self, expr: &Expression<'_>) -> String {
        match expr {
            Expression::JSXElement(elem) => self.compile_expression_child(elem),
            Expression::JSXFragment(fragment) => self.compile_expression_fragment(fragment),
            Expression::ParenthesizedExpression(paren) => self.compile_expression_value(&paren.expression),
            _ => self.extract_source_span(expr.span()),
        }
    }

    /// Compile a `JSXElement` that appears in an expression (not as a direct JSX child).
    /// Components become direct function calls; native elements become DOM-producing IIFEs.
    fn compile_expression_child(&mut self, elem: &JSXElement<'_>) -> String {
        let tag_name = TemplateAnalyzer::get_tag_name(elem);
        if TemplateAnalyzer::is_component(&tag_name) {
            self.compile_component_inline(elem, &tag_name)
        } else {
            self.compile_dom_element_inline(elem)
        }
    }

    /// Generate a direct function-call expression for a component JSX element.
    ///
    /// `<MyComp foo="bar" baz={expr} />` → `MyComp({ foo: "bar", baz: expr })`
    fn compile_component_inline(&mut self, element: &JSXElement<'_>, component_name: &str) -> String {
        let mut props: Vec<String> = Vec::new();
        for attr in &element.opening_element.attributes {
            match attr {
                JSXAttributeItem::Attribute(attr) => {
                    let prop_name = match &attr.name {
                        JSXAttributeName::Identifier(ident) => ident.name.as_str().to_string(),
                        _ => continue,
                    };
                    let prop_value = match &attr.value {
                        Some(JSXAttributeValue::StringLiteral(s)) => {
                            format!("\"{}\"", s.value)
                        }
                        Some(JSXAttributeValue::ExpressionContainer(expr_c)) => {
                            match &expr_c.expression {
                                JSXExpression::EmptyExpression(_) => continue,
                                e => self.extract_jsx_expr_source(e),
                            }
                        }
                        None => "true".to_string(),
                        _ => continue,
                    };
                    props.push(format!("{}: {}", prop_name, prop_value));
                }
                JSXAttributeItem::SpreadAttribute(spread) => {
                    // Use compile_expression_value to compile JSX in spread
                    let source = self.compile_expression_value(&spread.argument);
                    props.push(format!(
                        "...{}",
                        source
                    ));
                }
            }
        }
        if props.is_empty() {
            format!("{}({{}})", component_name)
        } else {
            format!("{}({{ {} }})", component_name, props.join(", "))
        }
    }

    /// Compile a JSX fragment that appears in an expression position.
    ///
    /// We produce a DocumentFragment and append all children.
    fn compile_expression_fragment(&mut self, fragment: &JSXFragment<'_>) -> String {
        self.add_used_helper("insert");
        let mut child_exprs: Vec<String> = Vec::new();

        for child in &fragment.children {
            match child {
                JSXChild::Text(text) => {
                    let trimmed = text.value.as_str().trim();
                    if !trimmed.is_empty() {
                        // In expression position we produce Text nodes.
                        let escaped = escape_html(trimmed).replace('"', "\\\"");
                        child_exprs.push(format!("document.createTextNode(\"{}\")", escaped));
                    }
                }
                JSXChild::ExpressionContainer(expr_container) => match &expr_container.expression {
                    JSXExpression::EmptyExpression(_) => {}
                    e => {
                        let expr_source = self.extract_jsx_expr_source(e);
                        // Dynamic inserts into fragments require insert(); we model it as a node
                        // by creating a marker text node and letting insert() populate it.
                        child_exprs.push(format!(
                            "(function() {{ const _m = document.createTextNode(\"\"); insert(_fr, {} , _m); return _m; }})()",
                            expr_source
                        ));
                    }
                },
                JSXChild::Element(el) => {
                    let tag_name = TemplateAnalyzer::get_tag_name(el);
                    if TemplateAnalyzer::is_component(&tag_name) {
                        child_exprs.push(self.compile_component_inline(el, &tag_name));
                    } else {
                        child_exprs.push(self.compile_dom_element_inline(el));
                    }
                }
                JSXChild::Fragment(inner) => {
                    child_exprs.push(self.compile_expression_fragment(inner));
                }
                _ => {}
            }
        }

        let mut lines: Vec<String> = Vec::new();
        lines.push("const _fr = document.createDocumentFragment();".to_string());
        for expr in child_exprs {
            lines.push(format!("_fr.appendChild({});", expr));
        }
        lines.push("return _fr;".to_string());

        format!("(function() {{ {} }})()", lines.join(" "))
    }

    /// Compile a native DOM JSX element into an expression that returns a DOM node.
    ///
    /// This is used for expression-position JSX (e.g. ternary / logical branches).
    /// We avoid module-level hoists here to keep the expression self-contained.
    fn compile_dom_element_inline(&mut self, elem: &JSXElement<'_>) -> String {
        let ir = self.analyze(elem);

        self.add_used_helper("template");
        // These helpers may be required by the inline bindings below.
        // We conservatively mark them based on the binding kinds we emit.
        for binding in &ir.bindings {
            match &binding.kind {
                BindingKind::Insert { .. } => self.add_used_helper("insert"),
                BindingKind::DelegatedEvent { .. } => {}
                BindingKind::DirectEvent { .. } => {}
                BindingKind::Attribute { .. } => self.add_used_helper("setAttribute"),
                BindingKind::ClassName { .. } => self.add_used_helper("className"),
                BindingKind::Style { .. } => self.add_used_helper("style"),
                BindingKind::Ref { .. } => self.add_used_helper("ref"),
                BindingKind::Spread { .. } => self.add_used_helper("spread"),
                BindingKind::Slot { .. } => {
                    self.add_used_helper("insert");
                    self.add_used_helper("renderSlot");
                }
            }
        }

        // Inline template creation to avoid relying on `_tmpl$N` hoists.
        let escaped_html = ir
            .html
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r");

        let mut lines: Vec<String> = Vec::new();
        lines.push(format!("const _tmpl = template(\"{}\");", escaped_html));
        lines.push("const _el$ = _tmpl();".to_string());

        // Generate binding statements (simple path access; good enough for inline branches)
        for binding in &ir.bindings {
            let target = binding.path.to_js_access("_el$");
            match &binding.kind {
                BindingKind::Insert { expression_source } => {
                    let parent = get_parent_access(&binding.path, "_el$");
                    lines.push(format!("insert({}, {}, {});", parent, expression_source, target));
                }
                BindingKind::DelegatedEvent {
                    event_name,
                    handler_source,
                } => {
                    lines.push(format!("{}.$${} = {};", target, event_name, handler_source));
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
                    ..
                } => {
                    lines.push(format!(
                        "setAttribute({}, \"{}\", {});",
                        target, name, value_source
                    ));
                }
                BindingKind::ClassName { value_source, .. } => {
                    lines.push(format!("className({}, {});", target, value_source));
                }
                BindingKind::Style { value_source, .. } => {
                    lines.push(format!("style({}, {});", target, value_source));
                }
                BindingKind::Ref { ref_source } => {
                    lines.push(format!("ref({}, {});", target, ref_source));
                }
                BindingKind::Spread { props_source } => {
                    lines.push(format!("spread({}, {});", target, props_source));
                }
                BindingKind::Slot { slot_binding } => {
                    // Keep slot logic consistent with main generator.
                    let slot_name = match &slot_binding.kind {
                        SlotBindingKind::Named { name, .. } => format!("\"{}\"", name),
                        SlotBindingKind::Default { .. } => "undefined".to_string(),
                        SlotBindingKind::Fallback { name, .. } => name
                            .as_ref()
                            .map(|n| format!("\"{}\"", n))
                            .unwrap_or_else(|| "undefined".to_string()),
                    };
                    let fallback = match &slot_binding.kind {
                        SlotBindingKind::Fallback { fallback_source, .. } if !fallback_source.is_empty() => {
                            format!(", \"{}\"", fallback_source.replace('"', "\\\""))
                        }
                        _ => String::new(),
                    };
                    lines.push(format!("insert({}, renderSlot({}{}));", target, slot_name, fallback));
                }
            }
        }

        lines.push("return _el$;".to_string());
        format!("(function() {{ {} }})()", lines.join(" "))
    }

    /// Extract just the function name from a CallExpression
    /// e.g., `count()` -> `count`, `items.map(item => ...)` -> `items.map(item => ...)`
    fn extract_call_expression(&mut self, call: &CallExpression<'_>) -> String {
        // Check if it's a member expression call like items.map(...)
        if let Some(member) = call.callee.as_member_expression()
            && let MemberExpression::StaticMemberExpression(_) = member
        {
            // This is a method call like obj.method()
            // Check if any arguments contain arrow functions with JSX
            let mut has_jsx_arg = false;
            for arg in &call.arguments {
                if let Some(expr) = arg.as_expression() {
                    if let Expression::ArrowFunctionExpression(arrow) = expr {
                        // Check if the arrow body contains JSX (both expression-bodied and block-bodied)
                        if self.expression_contains_jsx(expr) {
                            has_jsx_arg = true;
                            break;
                        }
                    }
                }
            }
            
            if has_jsx_arg {
                // Rebuild the call with compiled arrow functions
                let callee_source = self.extract_source_span(member.span());
                let mut args: Vec<String> = Vec::new();
                
                for arg in &call.arguments {
                    if let Some(expr) = arg.as_expression() {
                        if let Expression::ArrowFunctionExpression(arrow) = expr {
                            args.push(self.compile_arrow_function_expr(arrow));
                        } else {
                            args.push(self.compile_expression_value(expr));
                        }
                    }
                }
                
                return format!("{}({})", callee_source, args.join(", "));
            }
            
            // No JSX in args, use raw source
            return self.extract_source_span(call.span);
        }

        // Check if this is a simple function call with arrow function arguments containing JSX
        // e.g., resolve(function() { return <div/> })
        let mut has_jsx_arg = false;
        for arg in &call.arguments {
            if let Some(expr) = arg.as_expression() {
                if let Expression::ArrowFunctionExpression(arrow) = expr {
                    if self.expression_contains_jsx(expr) {
                        has_jsx_arg = true;
                        break;
                    }
                }
            }
        }

        if has_jsx_arg {
            // Rebuild the call with compiled arrow functions
            let mut args: Vec<String> = Vec::new();

            for arg in &call.arguments {
                if let Some(expr) = arg.as_expression() {
                    if let Expression::ArrowFunctionExpression(arrow) = expr {
                        args.push(self.compile_arrow_function_expr(arrow));
                    } else {
                        args.push(self.compile_expression_value(expr));
                    }
                }
            }

            // Get the function name (simplified - just extract from source)
            let callee = self.extract_source_span(call.callee.span());

            return format!("{}({})", callee, args.join(", "));
        }

        // For simple calls like count(), extract just the function name
        let full_source = self.extract_source_span(call.span);
        
        // Find the opening parenthesis and return everything before it
        if let Some(paren_pos) = full_source.find('(') {
            full_source[..paren_pos].to_string()
        } else {
            full_source
        }
    }
    
    /// Check if a statement contains JSX
    fn statement_contains_jsx(&self, stmt: &Statement<'_>) -> bool {
        match stmt {
            Statement::ExpressionStatement(expr) => self.expression_contains_jsx(&expr.expression),
            Statement::ReturnStatement(ret) => {
                if let Some(arg) = &ret.argument {
                    self.expression_contains_jsx(arg)
                } else {
                    false
                }
            }
            _ => false,
        }
    }
    
    /// Check if an expression contains JSX
    fn expression_contains_jsx(&self, expr: &Expression<'_>) -> bool {
        match expr {
            Expression::JSXElement(_) => true,
            Expression::JSXFragment(_) => true,
            Expression::ArrowFunctionExpression(arrow) => {
                // Handle expression-bodied arrows: () => <div/>
                if arrow.expression {
                    if let Some(expr) = arrow.get_expression() {
                        return self.expression_contains_jsx(expr);
                    }
                }
                // Handle block-bodied arrows: () => { return <div/> }
                for stmt in &arrow.body.statements {
                    if self.statement_contains_jsx(stmt) {
                        return true;
                    }
                }
                false
            }
            Expression::ConditionalExpression(cond) => {
                self.expression_contains_jsx(&cond.consequent) || self.expression_contains_jsx(&cond.alternate)
            }
            Expression::LogicalExpression(logic) => {
                self.expression_contains_jsx(&logic.right)
            }
            _ => false,
        }
    }
    
    /// Compile an arrow function expression that may contain JSX
    fn compile_arrow_function_expr(&mut self, arrow: &ArrowFunctionExpression<'_>) -> String {
        let params = self.extract_source_span(arrow.params.span());

        // Handle expression-bodied arrow: () => <div/>
        // In oxc, arrow.expression is true for expression-bodied arrows
        if arrow.expression {
            if let Some(expr) = arrow.get_expression() {
                let compiled = self.compile_expression_value(expr);
                return format!("{} => {{ return {}; }}", params, compiled);
            }
            return self.extract_source_span(arrow.span);
        }

        // Block-bodied arrow: () => { return <div/> }
        if arrow.body.statements.len() == 1 {
            // oxc represents expression-bodied arrows as ExpressionStatement
            if let Statement::ExpressionStatement(expr_stmt) = &arrow.body.statements[0] {
                let compiled = self.compile_expression_value(&expr_stmt.expression);
                return format!("{} => {{ return {}; }}", params, compiled);
            }
            // Block-bodied arrows have ReturnStatement
            if let Statement::ReturnStatement(ret) = &arrow.body.statements[0] {
                if let Some(arg) = &ret.argument {
                    let compiled = self.compile_expression_value(arg);
                    return format!("{} => {{ return {}; }}", params, compiled);
                }
            }
        }
        
        self.extract_source_span(arrow.span)
    }

    fn extract_expr_span(&self, expr: &JSXExpression<'_>) -> Span {
        // Use the expression's span directly via the GetSpan trait
        use oxc::span::GetSpan;
        expr.span()
    }

    /// Get all collected delegated event names
    pub fn get_delegated_events(&self) -> &[String] {
        &self.delegated_events
    }

    /// Analyze children of a component element
    /// Components receive children as a special "children" prop
    fn analyze_component_children(
        &mut self,
        element: &JSXElement<'_>,
        html: &mut String,
        bindings: &mut Vec<Binding>,
        current_path: &DomPath,
    ) {
        let _tag_name = TemplateAnalyzer::get_tag_name(element);

        // For components, we need to:
        // 1. Add bindings for all props (excluding children)
        // 2. Add a binding for the children prop

        // Process attributes (props)
        for attr in &element.opening_element.attributes {
            match attr {
                JSXAttributeItem::Attribute(attr) => {
                    let name = match &attr.name {
                        JSXAttributeName::Identifier(ident) => ident.name.as_str(),
                        _ => continue,
                    };

                    // Skip children attribute (it will be handled separately)
                    if name == "children" {
                        continue;
                    }

                    // Handle other props
                    let expr_source = match &attr.value {
                        Some(JSXAttributeValue::StringLiteral(s)) => {
                            format!("\"{}\"", s.value)
                        }
                        Some(JSXAttributeValue::ExpressionContainer(expr)) => {
                            match &expr.expression {
                                JSXExpression::EmptyExpression(_) => continue,
                                e => self.extract_jsx_expr_source(e),
                            }
                        }
                        None => "true".to_string(),
                        _ => continue,
                    };

                    // Create a binding for this prop
                    // For simplicity, we'll add it as a spread
                    bindings.push(Binding {
                        path: current_path.clone(),
                        kind: BindingKind::Spread {
                            props_source: format!("{{ {}: {} }}", name, expr_source),
                        },
                    });
                }
                JSXAttributeItem::SpreadAttribute(spread) => {
                    // Use compile_expression_value to compile JSX in spread
                    let source = self.compile_expression_value(&spread.argument);
                    bindings.push(Binding {
                        path: current_path.clone(),
                        kind: BindingKind::Spread {
                            props_source: format!("...{}", source),
                        },
                    });
                }
            }
        }

        // Process children as the "children" prop
        if !element.children.is_empty() {
            // Create a special marker for children insertion
            // We'll add an insert binding for children
            let children_path = compute_child_path(current_path, 0);

            // For components, children should be passed as a function to support
            // reactive error boundary and suspense components
            // We need to handle different child types
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
                                let expr_source = self.extract_jsx_expr_source(expr);
                                children_exprs.push(expr_source);
                            }
                        }
                    }
                    JSXChild::Element(child_element) => {
                        let child_tag_name = TemplateAnalyzer::get_tag_name(child_element);

                        if TemplateAnalyzer::is_component(&child_tag_name) {
                            // It's a component child - compile it as a function call
                            // Always wrap in arrow function to support reactive components like ErrorBoundary
                            let child_code = self.compile_component_as_expression(child_element, &child_tag_name);
                            children_exprs.push(format!("() => {}", child_code));
                        } else {
                            // It's a DOM element - we need to create a template for it
                            // For now, add a placeholder - the full implementation would be more complex
                            // For simplicity, we'll generate a simple element creation
                            let child_ir = self.analyze(child_element);

                            // Add delegated events from child
                            for event in &child_ir.delegated_events {
                                if !self.delegated_events.contains(event) {
                                    self.delegated_events.push(event.clone());
                                }
                            }

                            // Generate the element code
                            let child_code = self.generate_child_element_code(&child_ir);
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
                                        let child_code = self.compile_component_as_expression(el, &child_tag_name);
                                        // Always wrap in arrow function to support reactive components like ErrorBoundary
                                        children_exprs.push(format!("() => {}", child_code));
                                    } else {
                                        let child_ir = self.analyze(el);
                                        for event in &child_ir.delegated_events {
                                            if !self.delegated_events.contains(event) {
                                                self.delegated_events.push(event.clone());
                                            }
                                        }
                                        let child_code = self.generate_child_element_code(&child_ir);
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

            // Create the children binding
            if !children_exprs.is_empty() {
                // If there's only one child, don't wrap in array
                let children_source = if children_exprs.len() == 1 {
                    children_exprs[0].clone()
                } else {
                    format!("[{}]", children_exprs.join(", "))
                };

                bindings.push(Binding {
                    path: children_path,
                    kind: BindingKind::Insert {
                        expression_source: children_source,
                    },
                });
            }
        }

        // For components, we still need to generate a placeholder in HTML
        // Use an empty comment as placeholder
        html.push_str("<!>");
    }

    /// Compile a component element as a function call expression
    fn compile_component_as_expression(&mut self, element: &JSXElement<'_>, component_name: &str) -> String {
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
                                e => self.extract_jsx_expr_source(e),
                            }
                        }
                        None => "true".to_string(),
                        _ => continue,
                    };

                    props.push(format!("{}: {}", prop_name, prop_value));
                }
                JSXAttributeItem::SpreadAttribute(spread) => {
                    // Use compile_expression_value to compile JSX in spread
                    let source = self.compile_expression_value(&spread.argument);
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

        format!("{}({{ {} }})", component_name, props.join(", "))
    }

    /// Extract children source as a single expression
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
                            let expr_source = self.extract_jsx_expr_source(expr);
                            children_exprs.push(expr_source);
                        }
                    }
                }
                JSXChild::Element(child_element) => {
                    // Handle nested element as child
                    let child_tag_name = TemplateAnalyzer::get_tag_name(child_element);
                    if TemplateAnalyzer::is_component(&child_tag_name) {
                        // It's a component - compile as function call
                        // Always wrap in arrow function to support reactive components like ErrorBoundary
                        let child_code = self.compile_component_as_expression(child_element, &child_tag_name);
                        children_exprs.push(format!("() => {}", child_code));
                    } else {
                        // It's a DOM element - recursively extract its children
                        // For inline elements, just add them directly
                        let child_ir = self.analyze(child_element);
                        let child_code = self.generate_child_element_code(&child_ir);
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
                                    let child_code = self.compile_component_as_expression(el, &child_tag_name);
                                    // Always wrap in arrow function to support reactive components like ErrorBoundary
                                    children_exprs.push(format!("() => {}", child_code));
                                } else {
                                    let child_ir = self.analyze(el);
                                    let child_code = self.generate_child_element_code(&child_ir);
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

    /// Generate element code for DOM children used as component `children` prop.
    ///
    /// This code must be self-contained: it cannot rely on module-level `_tmpl$N` hoists,
    /// otherwise we may reference undefined template vars inside bundled output.
    fn generate_child_element_code(&mut self, ir: &TemplateIR) -> String {
        self.add_used_helper("template");

        for binding in &ir.bindings {
            match &binding.kind {
                BindingKind::Insert { .. } => self.add_used_helper("insert"),
                BindingKind::DelegatedEvent { .. } => {}
                BindingKind::DirectEvent { .. } => {}
                BindingKind::Attribute { .. } => self.add_used_helper("setAttribute"),
                BindingKind::ClassName { .. } => self.add_used_helper("className"),
                BindingKind::Style { .. } => self.add_used_helper("style"),
                BindingKind::Ref { .. } => self.add_used_helper("ref"),
                BindingKind::Spread { .. } => self.add_used_helper("spread"),
                BindingKind::Slot { .. } => {
                    self.add_used_helper("insert");
                    self.add_used_helper("renderSlot");
                }
            }
        }

        let escaped_html = ir
            .html
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r");

        let mut lines: Vec<String> = Vec::new();
        lines.push(format!("const _tmpl = template(\"{}\");", escaped_html));
        lines.push("const _el = _tmpl();".to_string());

        for binding in &ir.bindings {
            let target = binding.path.to_js_access("_el");
            match &binding.kind {
                BindingKind::Insert { expression_source } => {
                    let parent = get_parent_access(&binding.path, "_el");
                    lines.push(format!("insert({}, {}, {});", parent, expression_source, target));
                }
                BindingKind::DelegatedEvent {
                    event_name,
                    handler_source,
                } => {
                    lines.push(format!("{}.$${} = {};", target, event_name, handler_source));
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
                    ..
                } => {
                    lines.push(format!(
                        "setAttribute({}, \"{}\", {});",
                        target, name, value_source
                    ));
                }
                BindingKind::ClassName { value_source, .. } => {
                    lines.push(format!("className({}, {});", target, value_source));
                }
                BindingKind::Style { value_source, .. } => {
                    lines.push(format!("style({}, {});", target, value_source));
                }
                BindingKind::Ref { ref_source } => {
                    lines.push(format!("ref({}, {});", target, ref_source));
                }
                BindingKind::Spread { props_source } => {
                    lines.push(format!("spread({}, {});", target, props_source));
                }
                BindingKind::Slot { slot_binding } => {
                    let slot_name = match &slot_binding.kind {
                        SlotBindingKind::Named { name, .. } => format!("\"{}\"", name),
                        SlotBindingKind::Default { .. } => "undefined".to_string(),
                        SlotBindingKind::Fallback { name, .. } => name
                            .as_ref()
                            .map(|n| format!("\"{}\"", n))
                            .unwrap_or_else(|| "undefined".to_string()),
                    };
                    let fallback = match &slot_binding.kind {
                        SlotBindingKind::Fallback { fallback_source, .. } if !fallback_source.is_empty() => {
                            format!(", \"{}\"", fallback_source.replace('"', "\\\""))
                        }
                        _ => String::new(),
                    };
                    lines.push(format!("insert({}, renderSlot({}{}));", target, slot_name, fallback));
                }
            }
        }

        lines.push("return _el;".to_string());
        format!("(function() {{ {} }})()", lines.join(" "))
    }

    /// Analyze a <slot> element for Light DOM slots
    fn analyze_slot_element(
        &mut self,
        element: &JSXElement<'_>,
        html: &mut String,
        bindings: &mut Vec<Binding>,
        current_path: &DomPath,
    ) {
        // Open slot tag
        html.push_str("<slot");
        
        let mut slot_name: Option<String> = None;
        
        // Process slot attributes
        for attr in &element.opening_element.attributes {
            if let JSXAttributeItem::Attribute(attr) = attr {
                let name = match &attr.name {
                    JSXAttributeName::Identifier(ident) => ident.name.as_str(),
                    _ => "",
                };
                
                if name == "name" {
                    // Named slot: <slot name="header" />
                    if let Some(JSXAttributeValue::StringLiteral(s)) = &attr.value {
                        slot_name = Some(s.value.to_string());
                        html.push_str(" name=\"");
                        html.push_str(&escape_html(s.value.as_str()));
                        html.push('"');
                    }
                } else if name == "children" {
                    // Fallback content: <slot>fallback</slot>
                    // Extract fallback content as string
                    if let Some(JSXAttributeValue::ExpressionContainer(expr)) = &attr.value
                        && let JSXExpression::JSXElement(child_element) = &expr.expression
                    {
                        // Generate fallback content as HTML
                        let fallback_html = self.element_to_html(child_element);
                        html.push('>');
                        html.push_str(&fallback_html);
                        // Mark this as a slot with fallback
                        bindings.push(Binding {
                            path: current_path.clone(),
                            kind: BindingKind::Slot {
                                slot_binding: SlotBinding {
                                    path: current_path.clone(),
                                    kind: SlotBindingKind::Fallback {
                                        name: slot_name.clone(),
                                        fallback_source: fallback_html,
                                    },
                                },
                            },
                        });
                        // Close tag
                        html.push_str("</slot>");
                        return;
                    }
                }
            }
        }
        
        // Close the slot tag
        html.push('>');
        html.push_str("</slot>");
        
        // Add slot binding
        let slot_kind = if let Some(name) = slot_name {
            SlotBindingKind::Named {
                name,
                content_source: String::new(),
            }
        } else {
            SlotBindingKind::Default {
                content_source: String::new(),
            }
        };
        
        bindings.push(Binding {
            path: current_path.clone(),
            kind: BindingKind::Slot {
                slot_binding: SlotBinding {
                    path: current_path.clone(),
                    kind: slot_kind,
                },
            },
        });
    }

    /// Convert a JSX element to HTML string (for slot fallback content)
    fn element_to_html(&self, element: &JSXElement<'_>) -> String {
        let mut html = String::new();
        let tag_name = TemplateAnalyzer::get_tag_name(element);
        
        html.push('<');
        html.push_str(&tag_name);
        
        // Attributes
        for attr in &element.opening_element.attributes {
            if let JSXAttributeItem::Attribute(attr) = attr {
                let name = match &attr.name {
                    JSXAttributeName::Identifier(ident) => ident.name.as_str(),
                    _ => "",
                };
                if let Some(JSXAttributeValue::StringLiteral(s)) = &attr.value {
                    html.push(' ');
                    html.push_str(name);
                    html.push_str("=\"");
                    html.push_str(&escape_html(s.value.as_str()));
                    html.push('"');
                }
            }
        }
        
        html.push('>');
        
        // Children (simplified - only text and elements)
        for child in &element.children {
            match child {
                JSXChild::Text(text) => {
                    html.push_str(&escape_html(text.value.as_str()));
                }
                JSXChild::Element(child_el) => {
                    html.push_str(&self.element_to_html(child_el));
                }
                JSXChild::Fragment(frag) => {
                    for frag_child in &frag.children {
                        if let JSXChild::Text(text) = frag_child {
                            html.push_str(&escape_html(text.value.as_str()));
                        }
                    }
                }
                _ => {}
            }
        }
        
        html.push_str("</");
        html.push_str(&tag_name);
        html.push('>');
        
        html
    }
}

/// Compute the DOM path for a child at a given index under a parent path
fn compute_child_path(parent_path: &DomPath, child_index: usize) -> DomPath {
    let mut steps = parent_path.steps.clone();
    steps.push(TraversalStep::FirstChild);
    for _ in 0..child_index {
        steps.push(TraversalStep::NextSibling);
    }
    DomPath { steps }
}

/// Compute parent access expression for an insert marker path.
///
/// A marker path is: parent_steps + FirstChild + N*NextSibling.
/// We strip from the last FirstChild onwards to get the parent path.
fn get_parent_access(path: &DomPath, root_var: &str) -> String {
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
            parent_path.to_js_access(root_var)
        }
        None => root_var.to_string(),
    }
}

/// Normalize JSX attribute names to HTML attribute names
fn normalize_attr_name(name: &str) -> String {
    match name {
        "className" => "class".to_string(),
        "htmlFor" => "for".to_string(),
        "tabIndex" => "tabindex".to_string(),
        _ => name.to_string(),
    }
}

/// Escape HTML special characters
    pub fn escape_html(s: &str) -> String {
    s.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Helper to convert JSXMemberExpression to string (standalone function)
fn member_expr_to_string(member: &JSXMemberExpression<'_>) -> String {
    let obj = match &member.object {
        JSXMemberExpressionObject::IdentifierReference(id) => id.name.as_str().to_string(),
        JSXMemberExpressionObject::MemberExpression(m) => member_expr_to_string(m),
        JSXMemberExpressionObject::ThisExpression(_) => "this".to_string(),
    };
    format!("{}.{}", obj, member.property.name)
}
