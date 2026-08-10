use oxc_allocator::Allocator;
use oxc_ast::ast::{
    JSXAttribute, JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXChild, JSXElement,
    JSXElementName, JSXExpression, JSXFragment,
};
use oxc_ast_visit::Visit;
use oxc_diagnostics::{OxcDiagnostic, Severity};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::{GetSpan, SourceType, Span};

use crate::{
    diagnostic::{CompilerDiagnostic, DiagnosticSeverity},
    ir::{
        AttributeIr, ChildIr, ComponentIr, DynamicTextIr, ElementIr, ExpressionIr, IrRef, ModuleIr,
        NodeId, StaticAttributeIr, TextIr,
    },
    span::SourceIndex,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LowerResult {
    pub ir: Option<ModuleIr>,
    pub diagnostics: Vec<CompilerDiagnostic>,
    pub(crate) reserved_names: Vec<String>,
}

pub fn lower_module(source: &str, filename: &str) -> LowerResult {
    let source_type = match SourceType::from_path(filename) {
        Ok(source_type) => source_type,
        Err(error) => {
            return LowerResult {
                ir: None,
                diagnostics: vec![CompilerDiagnostic::error(
                    "ZEUS_UNSUPPORTED_SOURCE_TYPE",
                    error.to_string(),
                    filename,
                    None,
                )],
                reserved_names: Vec::new(),
            };
        }
    };

    let allocator = Allocator::default();
    let parsed = Parser::new(&allocator, source, source_type).parse();
    let source_index = SourceIndex::new(source);

    if !parsed.diagnostics.is_empty() {
        return LowerResult {
            ir: None,
            diagnostics: parsed
                .diagnostics
                .iter()
                .map(|diagnostic| {
                    from_oxc_diagnostic(diagnostic, "ZEUS_PARSE_ERROR", filename, &source_index)
                })
                .collect(),
            reserved_names: Vec::new(),
        };
    }

    let semantic_result = SemanticBuilder::new_compiler().build(&parsed.program);
    if !semantic_result.diagnostics.is_empty() {
        return LowerResult {
            ir: None,
            diagnostics: semantic_result
                .diagnostics
                .iter()
                .map(|diagnostic| {
                    from_oxc_diagnostic(diagnostic, "ZEUS_SEMANTIC_ERROR", filename, &source_index)
                })
                .collect(),
            reserved_names: Vec::new(),
        };
    }

    let mut reserved_names = semantic_result
        .semantic
        .scoping()
        .iter_bindings()
        .flat_map(|(_, bindings)| bindings.keys().map(ToString::to_string))
        .collect::<Vec<_>>();
    reserved_names.sort_unstable();
    reserved_names.dedup();

    let mut lowerer = Lowerer::new(source, filename);
    lowerer.visit_program(&parsed.program);

    if !lowerer.diagnostics.is_empty() {
        return LowerResult {
            ir: None,
            diagnostics: lowerer.diagnostics,
            reserved_names,
        };
    }

    LowerResult {
        ir: Some(ModuleIr {
            id: 0,
            kind: "Module".into(),
            components: lowerer.components,
        }),
        diagnostics: Vec::new(),
        reserved_names,
    }
}

struct Lowerer<'source> {
    source: &'source str,
    filename: &'source str,
    source_index: SourceIndex<'source>,
    next_id: NodeId,
    components: Vec<ComponentIr>,
    diagnostics: Vec<CompilerDiagnostic>,
}

impl<'source> Lowerer<'source> {
    fn new(source: &'source str, filename: &'source str) -> Self {
        Self {
            source,
            filename,
            source_index: SourceIndex::new(source),
            next_id: 1,
            components: Vec::new(),
            diagnostics: Vec::new(),
        }
    }

    fn allocate_id(&mut self) -> NodeId {
        let id = self.next_id;
        self.next_id = self.next_id.saturating_add(1);
        id
    }

    fn lower_root(&mut self, element: &JSXElement<'_>) {
        let id = self.allocate_id();
        if let Some(root) = self.lower_element(element) {
            self.components.push(ComponentIr {
                id,
                kind: "Component".into(),
                span: self.source_index.span(element.span),
                root,
            });
        }
    }

    fn lower_element(&mut self, element: &JSXElement<'_>) -> Option<ElementIr> {
        let JSXElementName::Identifier(identifier) = &element.opening_element.name else {
            self.unsupported(
                "ZEUS_UNSUPPORTED_COMPONENT",
                "The first Rust compiler slice only supports native DOM elements.",
                element.opening_element.name.span(),
            );
            return None;
        };

        let id = self.allocate_id();

        Some(ElementIr {
            id,
            kind: "Element".into(),
            reference: IrRef { node_id: id },
            tag_name: identifier.name.to_string(),
            span: self.source_index.span(element.span),
            attributes: self.lower_attributes(&element.opening_element.attributes),
            children: self.lower_children(&element.children),
        })
    }

    fn lower_attributes(&mut self, attributes: &[JSXAttributeItem<'_>]) -> Vec<AttributeIr> {
        let mut lowered = Vec::with_capacity(attributes.len());

        for attribute in attributes {
            match attribute {
                JSXAttributeItem::Attribute(attribute) => {
                    if let Some(attribute) = self.lower_attribute(attribute) {
                        lowered.push(attribute);
                    }
                }
                JSXAttributeItem::SpreadAttribute(attribute) => self.unsupported(
                    "ZEUS_UNSUPPORTED_SPREAD_ATTRIBUTE",
                    "JSX spread attributes are not supported by this compiler slice.",
                    attribute.span,
                ),
            }
        }

        lowered
    }

    fn lower_attribute(&mut self, attribute: &JSXAttribute<'_>) -> Option<AttributeIr> {
        let JSXAttributeName::Identifier(identifier) = &attribute.name else {
            self.unsupported(
                "ZEUS_UNSUPPORTED_NAMESPACED_ATTRIBUTE",
                "Namespaced JSX attributes are not supported by this compiler slice.",
                attribute.name.span(),
            );
            return None;
        };

        let value = match &attribute.value {
            None => String::new(),
            Some(JSXAttributeValue::StringLiteral(value)) => value.value.to_string(),
            Some(JSXAttributeValue::ExpressionContainer(_)) => {
                self.unsupported(
                    "ZEUS_UNSUPPORTED_DYNAMIC_ATTRIBUTE",
                    "Dynamic JSX attributes are outside the first Rust compiler slice.",
                    attribute.span,
                );
                return None;
            }
            Some(JSXAttributeValue::Element(_) | JSXAttributeValue::Fragment(_)) => {
                self.unsupported(
                    "ZEUS_UNSUPPORTED_JSX_ATTRIBUTE_VALUE",
                    "JSX values inside attributes are not supported by this compiler slice.",
                    attribute.span,
                );
                return None;
            }
        };

        Some(AttributeIr::Static(StaticAttributeIr {
            id: self.allocate_id(),
            kind: "StaticAttribute".into(),
            name: identifier.name.to_string(),
            value,
            span: self.source_index.span(attribute.span),
        }))
    }

    fn lower_children(&mut self, children: &[JSXChild<'_>]) -> Vec<ChildIr> {
        let mut lowered = Vec::with_capacity(children.len());

        for child in children {
            self.lower_child(child, &mut lowered);
        }

        lowered
    }

    fn lower_child(&mut self, child: &JSXChild<'_>, lowered: &mut Vec<ChildIr>) {
        match child {
            JSXChild::Text(text) => {
                let value = normalize_jsx_text(text.value.as_str());
                if !value.is_empty() {
                    lowered.push(ChildIr::Text(TextIr {
                        id: self.allocate_id(),
                        kind: "Text".into(),
                        value,
                        span: self.source_index.span(text.span),
                    }));
                }
            }
            JSXChild::Element(element) => {
                if let Some(element) = self.lower_element(element) {
                    lowered.push(ChildIr::Element(element));
                }
            }
            JSXChild::ExpressionContainer(container) => {
                if matches!(&container.expression, JSXExpression::EmptyExpression(_)) {
                    return;
                }
                if matches!(
                    &container.expression,
                    JSXExpression::JSXElement(_) | JSXExpression::JSXFragment(_)
                ) {
                    self.unsupported(
                        "ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION",
                        "Nested JSX expressions are not supported by this compiler slice.",
                        container.span,
                    );
                    return;
                }

                let expression_span = container.expression.to_expression().span();
                let dynamic_id = self.allocate_id();
                lowered.push(ChildIr::DynamicText(DynamicTextIr {
                    id: dynamic_id,
                    kind: "DynamicText".into(),
                    reference: IrRef {
                        node_id: dynamic_id,
                    },
                    expression: ExpressionIr {
                        kind: "Expression".into(),
                        code: expression_span.source_text(self.source).to_owned(),
                        span: self.source_index.span(expression_span),
                    },
                    span: self.source_index.span(container.span),
                }));
            }
            JSXChild::Fragment(fragment) => self.unsupported_fragment(fragment),
            JSXChild::Spread(spread) => self.unsupported(
                "ZEUS_UNSUPPORTED_SPREAD_CHILD",
                "JSX spread children are not supported by this compiler slice.",
                spread.span,
            ),
        }
    }

    fn unsupported_fragment(&mut self, fragment: &JSXFragment<'_>) {
        self.unsupported(
            "ZEUS_UNSUPPORTED_FRAGMENT",
            "Fragments are outside the first Rust compiler slice.",
            fragment.span,
        );
    }

    fn unsupported(&mut self, code: &str, message: &str, span: Span) {
        self.diagnostics.push(
            CompilerDiagnostic::error(
                code,
                message,
                self.filename,
                Some(self.source_index.span(span)),
            )
            .with_hint("Use a native element with static attributes and dynamic text."),
        );
    }
}

impl<'ast> Visit<'ast> for Lowerer<'_> {
    fn visit_jsx_element(&mut self, element: &JSXElement<'ast>) {
        self.lower_root(element);
    }

    fn visit_jsx_fragment(&mut self, fragment: &JSXFragment<'ast>) {
        self.unsupported_fragment(fragment);
    }
}

fn from_oxc_diagnostic(
    diagnostic: &OxcDiagnostic,
    code: &str,
    filename: &str,
    source_index: &SourceIndex<'_>,
) -> CompilerDiagnostic {
    let span = diagnostic.labels.first().map(|label| {
        source_index.span(Span::new(
            label.offset(),
            label.offset().saturating_add(label.len()),
        ))
    });

    CompilerDiagnostic {
        code: code.into(),
        message: diagnostic.message.to_string(),
        severity: if diagnostic.severity == Severity::Warning {
            DiagnosticSeverity::Warning
        } else {
            DiagnosticSeverity::Error
        },
        filename: filename.into(),
        hint: diagnostic.help.as_ref().map(ToString::to_string),
        span,
    }
}

fn normalize_jsx_text(value: &str) -> String {
    if !value.contains(['\n', '\r']) {
        return value.to_owned();
    }

    let lines = value.lines().collect::<Vec<_>>();
    let mut normalized = String::new();

    for (index, line) in lines.iter().enumerate() {
        let mut line = line.replace('\t', " ");
        if index != 0 {
            line = line.trim_start().to_owned();
        }
        if index + 1 != lines.len() {
            line = line.trim_end().to_owned();
        }
        if line.is_empty() {
            continue;
        }
        if !normalized.is_empty() && index != 0 {
            normalized.push(' ');
        }
        normalized.push_str(&line);
    }

    normalized
}
