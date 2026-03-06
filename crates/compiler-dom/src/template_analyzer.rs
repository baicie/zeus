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
}

impl<'s> TemplateAnalyzer<'s> {
    pub fn new(source: &'s str) -> Self {
        Self {
            source,
            template_counter: 0,
            delegated_events: Vec::new(),
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
                    let source = self.extract_source_span(spread.argument.span());
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

    /// Extract source text from a JSXExpression
    fn extract_jsx_expr_source(&self, expr: &JSXExpression<'_>) -> String {
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
    fn compile_expression_value(&self, expr: &Expression<'_>) -> String {
        match expr {
            Expression::JSXElement(elem) => self.compile_expression_child(elem),
            _ => self.extract_source_span(expr.span()),
        }
    }

    /// Compile a `JSXElement` that appears in an expression (not as a direct JSX child).
    /// Components become direct function calls; native elements keep raw source for now.
    fn compile_expression_child(&self, elem: &JSXElement<'_>) -> String {
        let tag_name = TemplateAnalyzer::get_tag_name(elem);
        if TemplateAnalyzer::is_component(&tag_name) {
            self.compile_component_inline(elem, &tag_name)
        } else {
            self.extract_source_span(elem.span())
        }
    }

    /// Generate a direct function-call expression for a component JSX element.
    ///
    /// `<MyComp foo="bar" baz={expr} />` → `MyComp({ foo: "bar", baz: expr })`
    fn compile_component_inline(&self, element: &JSXElement<'_>, component_name: &str) -> String {
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
                                e => self.extract_source_span(e.span()),
                            }
                        }
                        None => "true".to_string(),
                        _ => continue,
                    };
                    props.push(format!("{}: {}", prop_name, prop_value));
                }
                JSXAttributeItem::SpreadAttribute(spread) => {
                    props.push(format!(
                        "...{}",
                        self.extract_source_span(spread.argument.span())
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

    /// Extract just the function name from a CallExpression
    /// e.g., `count()` -> `count`, `items.map(item => ...)` -> `items.map(item => ...)`
    fn extract_call_expression(&self, call: &CallExpression<'_>) -> String {
        // Check if it's a member expression call like items.map(...)
        if let Some(member) = call.callee.as_member_expression() {
            if let MemberExpression::StaticMemberExpression(static_member) = member {
                // This is a method call like obj.method()
                // Extract the full call expression
                return self.extract_source_span(call.span);
            }
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

    fn extract_expr_span(&self, expr: &JSXExpression<'_>) -> Span {
        // Use the expression's span directly via the GetSpan trait
        use oxc::span::GetSpan;
        expr.span()
    }

    /// Get all collected delegated event names
    pub fn get_delegated_events(&self) -> &[String] {
        &self.delegated_events
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
            match attr {
                JSXAttributeItem::Attribute(attr) => {
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
                        if let Some(JSXAttributeValue::ExpressionContainer(expr)) = &attr.value {
                            if let JSXExpression::JSXElement(child_element) = &expr.expression {
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
                _ => {}
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
fn escape_html(s: &str) -> String {
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
