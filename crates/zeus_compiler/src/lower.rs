use oxc_allocator::Allocator;
use oxc_ast::ast::{
    Expression, JSXAttribute, JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXChild,
    JSXElement, JSXElementName, JSXExpression, JSXExpressionContainer, JSXFragment,
};
use oxc_ast_visit::Visit;
use oxc_diagnostics::{OxcDiagnostic, Severity};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::{GetSpan, SourceType, Span};
use oxc_syntax::xml_entities::decode_entities;

use crate::{
    diagnostic::{CompilerDiagnostic, DiagnosticSeverity},
    ir::{
        AttrBindingIr, AttributeIr, ChildIr, ComponentIr, DynamicTextIr, ElementIr, EventBindingIr,
        ExpressionForm, ExpressionIr, IrRef, ModuleIr, NodeId, PropBindingIr, RefBindingIr,
        StaticAttributeIr, StaticAttributeValue, TextIr,
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

    let scoping = semantic_result.semantic.scoping();
    let mut reserved_names = scoping
        .iter_bindings()
        .flat_map(|(_, bindings)| bindings.keys().map(ToString::to_string))
        .collect::<Vec<_>>();
    reserved_names.extend(
        scoping
            .root_unresolved_references()
            .iter()
            .map(|(name, _)| name.to_string()),
    );
    reserved_names.sort_unstable();
    reserved_names.dedup();

    let mut lowerer = Lowerer::new(source, filename, &allocator);
    lowerer.visit_program(&parsed.program);
    let preamble_end = parsed
        .program
        .directives
        .last()
        .map(|node| node.span.end)
        .or_else(|| parsed.program.hashbang.as_ref().map(|node| node.span.end))
        .unwrap_or_default();

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
            preamble_end,
            components: lowerer.components,
        }),
        diagnostics: Vec::new(),
        reserved_names,
    }
}

struct Lowerer<'source, 'allocator> {
    source: &'source str,
    filename: &'source str,
    allocator: &'allocator Allocator,
    source_index: SourceIndex<'source>,
    next_id: NodeId,
    components: Vec<ComponentIr>,
    diagnostics: Vec<CompilerDiagnostic>,
}

impl<'source, 'allocator> Lowerer<'source, 'allocator> {
    fn new(source: &'source str, filename: &'source str, allocator: &'allocator Allocator) -> Self {
        Self {
            source,
            filename,
            allocator,
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
        let tag_name = identifier.name.as_str();
        if matches!(
            tag_name,
            "script"
                | "style"
                | "textarea"
                | "title"
                | "xmp"
                | "iframe"
                | "noembed"
                | "noframes"
                | "plaintext"
                | "noscript"
        ) {
            self.unsupported(
                "ZEUS_UNSUPPORTED_RAW_TEXT_ELEMENT",
                "Raw-text elements need dedicated text binding code generation.",
                identifier.span,
            );
            return None;
        }
        if matches!(tag_name, "html" | "head" | "body" | "frameset" | "frame") {
            self.unsupported(
                "ZEUS_UNSUPPORTED_DOCUMENT_ELEMENT",
                "Document-structure elements cannot be cloned as component roots.",
                identifier.span,
            );
            return None;
        }
        if tag_name == "template" {
            self.unsupported(
                "ZEUS_UNSUPPORTED_TEMPLATE_ELEMENT",
                "Template element children need dedicated anchor code generation.",
                identifier.span,
            );
            return None;
        }
        if !element.children.is_empty()
            && matches!(
                tag_name,
                "area"
                    | "base"
                    | "basefont"
                    | "bgsound"
                    | "br"
                    | "col"
                    | "embed"
                    | "hr"
                    | "image"
                    | "img"
                    | "input"
                    | "keygen"
                    | "link"
                    | "meta"
                    | "param"
                    | "source"
                    | "track"
                    | "wbr"
            )
        {
            self.unsupported(
                "ZEUS_UNSUPPORTED_VOID_ELEMENT_CHILDREN",
                "Void elements cannot contain child bindings.",
                element.span,
            );
            return None;
        }

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
        let (name, is_property) = self.lower_attribute_name(&attribute.name)?;

        match &attribute.value {
            None => {
                if name == "ref" {
                    self.unsupported(
                        "ZEUS_EMPTY_EXPRESSION",
                        "ref requires an expression target.",
                        attribute.span,
                    );
                    return None;
                }
                if is_property {
                    self.unsupported(
                        "ZEUS_INVALID_PROPERTY_BINDING",
                        "Property bindings require an expression value.",
                        attribute.span,
                    );
                    return None;
                }

                Some(AttributeIr::Static(StaticAttributeIr {
                    id: self.allocate_id(),
                    name,
                    value: StaticAttributeValue::Boolean(true),
                    span: self.source_index.span(attribute.span),
                }))
            }
            Some(JSXAttributeValue::StringLiteral(value)) => {
                if name == "ref" {
                    self.unsupported(
                        "ZEUS_INVALID_REF_USAGE",
                        "String refs are not supported.",
                        attribute.span,
                    );
                    return None;
                }
                if is_property {
                    self.unsupported(
                        "ZEUS_INVALID_PROPERTY_BINDING",
                        "Property bindings require an expression value.",
                        attribute.span,
                    );
                    return None;
                }

                Some(AttributeIr::Static(StaticAttributeIr {
                    id: self.allocate_id(),
                    name,
                    value: StaticAttributeValue::String(decode_jsx_entities(
                        value.value.as_str(),
                        self.allocator,
                    )),
                    span: self.source_index.span(attribute.span),
                }))
            }
            Some(JSXAttributeValue::ExpressionContainer(container)) => {
                self.lower_expression_attribute(attribute, container, name, is_property)
            }
            Some(JSXAttributeValue::Element(_) | JSXAttributeValue::Fragment(_)) => {
                self.unsupported(
                    "ZEUS_UNSUPPORTED_JSX_ATTRIBUTE_VALUE",
                    "JSX values inside attributes are not supported by this compiler slice.",
                    attribute.span,
                );
                None
            }
        }
    }

    fn lower_attribute_name(&mut self, name: &JSXAttributeName<'_>) -> Option<(String, bool)> {
        match name {
            JSXAttributeName::Identifier(identifier) => {
                Some((normalize_attribute_name(identifier.name.as_str()), false))
            }
            JSXAttributeName::NamespacedName(namespaced) if namespaced.namespace.name == "prop" => {
                Some((namespaced.name.name.to_string(), true))
            }
            JSXAttributeName::NamespacedName(_) => {
                self.unsupported(
                    "ZEUS_UNSUPPORTED_NAMESPACED_ATTRIBUTE",
                    "Only the prop:name namespace is supported in DOM attributes.",
                    name.span(),
                );
                None
            }
        }
    }

    fn lower_expression_attribute(
        &mut self,
        attribute: &JSXAttribute<'_>,
        container: &JSXExpressionContainer<'_>,
        name: String,
        is_property: bool,
    ) -> Option<AttributeIr> {
        if matches!(&container.expression, JSXExpression::EmptyExpression(_)) {
            self.unsupported(
                "ZEUS_EMPTY_EXPRESSION",
                "Attribute expressions cannot be empty.",
                container.span,
            );
            return None;
        }

        let expression = container.expression.to_expression();
        if contains_jsx(expression) {
            self.unsupported(
                "ZEUS_UNSUPPORTED_JSX_ATTRIBUTE_VALUE",
                "JSX values inside attributes are not supported.",
                container.span,
            );
            return None;
        }

        let expression = self.lower_expression(expression);
        let id = self.allocate_id();
        let span = self.source_index.span(attribute.span);

        if is_property {
            return Some(AttributeIr::Property(PropBindingIr {
                id,
                name,
                expression,
                span,
            }));
        }
        if name == "ref" {
            return Some(AttributeIr::Ref(RefBindingIr {
                id,
                expression,
                span,
            }));
        }
        if is_event_attribute_name(&name) {
            return Some(AttributeIr::Event(EventBindingIr {
                id,
                event_name: name[2..].to_ascii_lowercase(),
                handler: expression,
                span,
            }));
        }

        Some(AttributeIr::Dynamic(AttrBindingIr {
            id,
            name,
            expression,
            span,
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
                let cooked = decode_jsx_entities(text.value.as_str(), self.allocator);
                let value = normalize_jsx_text(&cooked);
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
                let expression = container.expression.to_expression();
                if contains_jsx(expression) {
                    self.unsupported(
                        "ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION",
                        "Nested JSX expressions are not supported by this compiler slice.",
                        container.span,
                    );
                    return;
                }

                let dynamic_id = self.allocate_id();
                lowered.push(ChildIr::DynamicText(DynamicTextIr {
                    id: dynamic_id,
                    kind: "DynamicText".into(),
                    reference: IrRef {
                        node_id: dynamic_id,
                    },
                    expression: self.lower_expression(expression),
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

    fn lower_expression(&self, expression: &Expression<'_>) -> ExpressionIr {
        let span = expression.span();
        ExpressionIr {
            kind: "Expression".into(),
            code: span.source_text(self.source).to_owned(),
            span: self.source_index.span(span),
            form: expression_form(expression),
        }
    }
}

impl<'ast> Visit<'ast> for Lowerer<'_, '_> {
    fn visit_jsx_element(&mut self, element: &JSXElement<'ast>) {
        // lower_element handles supported descendants; walking again would create extra roots.
        self.lower_root(element);
    }

    fn visit_jsx_fragment(&mut self, fragment: &JSXFragment<'ast>) {
        self.unsupported_fragment(fragment);
    }
}

struct JsxDetector(bool);

impl<'ast> Visit<'ast> for JsxDetector {
    fn visit_jsx_element(&mut self, _element: &JSXElement<'ast>) {
        self.0 = true;
    }

    fn visit_jsx_fragment(&mut self, _fragment: &JSXFragment<'ast>) {
        self.0 = true;
    }
}

fn contains_jsx(expression: &Expression<'_>) -> bool {
    let mut detector = JsxDetector(false);
    detector.visit_expression(expression);
    detector.0
}

fn normalize_attribute_name(name: &str) -> String {
    if name == "className" {
        "class".into()
    } else {
        name.into()
    }
}

fn is_event_attribute_name(name: &str) -> bool {
    name.get(..2)
        .is_some_and(|prefix| prefix.eq_ignore_ascii_case("on") && name.len() > 2)
}

fn expression_form(expression: &Expression<'_>) -> ExpressionForm {
    match expression {
        Expression::ArrowFunctionExpression(_) | Expression::FunctionExpression(_) => {
            ExpressionForm::Getter
        }
        expression if expression.is_member_expression() => ExpressionForm::Member,
        Expression::ChainExpression(chain) if chain.expression.is_member_expression() => {
            ExpressionForm::Member
        }
        Expression::ParenthesizedExpression(expression) => expression_form(&expression.expression),
        Expression::TSAsExpression(expression) => expression_form(&expression.expression),
        Expression::TSSatisfiesExpression(expression) => expression_form(&expression.expression),
        Expression::TSNonNullExpression(expression) => expression_form(&expression.expression),
        Expression::TSInstantiationExpression(expression) => {
            expression_form(&expression.expression)
        }
        _ => ExpressionForm::Value,
    }
}

fn decode_jsx_entities(value: &str, allocator: &Allocator) -> String {
    let mut decoded = None;
    decode_entities(value, &mut decoded, value.len(), allocator);

    decoded.map_or_else(|| value.to_owned(), |value| value.as_str().to_owned())
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
