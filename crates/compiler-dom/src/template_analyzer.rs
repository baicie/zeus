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
            JSXExpression::RegExpLiteral(lit) => {
                self.extract_source_span(lit.span)
            }
            JSXExpression::StringLiteral(lit) => {
                format!("\"{}\"", lit.value)
            }
            JSXExpression::TemplateLiteral(lit) => {
                self.extract_source_span(lit.span)
            }
            // For all other expressions, use span extraction
            _ => {
                let span = match expr {
                    JSXExpression::Identifier(id) => id.span,
                    JSXExpression::MetaProperty(mp) => mp.span,
                    _ => {
                        // Use the general approach: get span from the expression
                        self.extract_expr_span(expr)
                    }
                };
                self.extract_source_span(span)
            }
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
