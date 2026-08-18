use std::collections::{HashMap, HashSet};

use oxc_allocator::Allocator;
use oxc_ast::ast::{
    BindingPattern, Declaration, Expression, FunctionType, ImportDeclarationSpecifier,
    JSXAttribute, JSXAttributeItem, JSXAttributeName, JSXAttributeValue, JSXChild, JSXElement,
    JSXElementName, JSXExpression, JSXExpressionContainer, JSXFragment, MemberExpression,
    ModuleDeclaration, Statement, VariableDeclarator,
};
use oxc_ast_visit::{Visit, walk};
use oxc_diagnostics::{OxcDiagnostic, Severity};
use oxc_parser::Parser;
use oxc_semantic::SemanticBuilder;
use oxc_span::{GetSpan, SourceType, Span};
use oxc_syntax::xml_entities::decode_entities;

use crate::html::{is_raw_text_element, is_unsupported_raw_text_element, is_void_element};
use crate::{
    diagnostic::{CompilerDiagnostic, DiagnosticSeverity},
    ir::{
        AttrBindingIr, AttributeIr, ChildIr, ComponentBindingIr, ComponentIr, ComponentPropIr,
        ComponentPropValueIr, DynamicTextIr, ElementIr, EventBindingIr, ExpressionForm,
        ExpressionIr, ForBindingIr, FragmentIr, IrRef, ModuleIr, NodeId, PropBindingIr,
        RefBindingIr, RootIr, ShowBindingIr, StaticAttributeIr, StaticAttributeValue, TextIr,
        is_children_expression,
    },
    span::SourceIndex,
};

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct LowerResult {
    pub ir: Option<ModuleIr>,
    pub diagnostics: Vec<CompilerDiagnostic>,
    pub(crate) reserved_names: Vec<String>,
    pub(crate) hmr: HmrInfo,
}

#[derive(Debug, Clone, PartialEq, Eq, Default)]
pub(crate) struct HmrInfo {
    pub manual_boundary: bool,
    pub render_calls: Vec<HmrRenderCall>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub(crate) struct HmrRenderCall {
    pub offset: u32,
    pub disposer: Option<String>,
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
                hmr: HmrInfo::default(),
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
            hmr: HmrInfo::default(),
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
            hmr: HmrInfo::default(),
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

    let builtin_names = collect_builtin_names(&parsed.program);
    let hmr = collect_hmr_info(&parsed.program);
    let (define_element_setup_spans, host_root_spans) =
        collect_define_element_spans(&parsed.program, &builtin_names);
    let mut lowerer = Lowerer::new(
        source,
        filename,
        &allocator,
        builtin_names,
        define_element_setup_spans,
        host_root_spans,
    );
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
            hmr,
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
        hmr,
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
    builtin_names: HashMap<String, BuiltinKind>,
    define_element_setup_spans: Vec<Span>,
    host_root_spans: HashSet<u32>,
    host_depth: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum BuiltinKind {
    Show,
    For,
    Host,
    Slot,
}

impl<'source, 'allocator> Lowerer<'source, 'allocator> {
    fn new(
        source: &'source str,
        filename: &'source str,
        allocator: &'allocator Allocator,
        builtin_names: HashMap<String, BuiltinKind>,
        define_element_setup_spans: Vec<Span>,
        host_root_spans: HashSet<u32>,
    ) -> Self {
        Self {
            source,
            filename,
            allocator,
            source_index: SourceIndex::new(source),
            next_id: 1,
            components: Vec::new(),
            diagnostics: Vec::new(),
            builtin_names,
            define_element_setup_spans,
            host_root_spans,
            host_depth: 0,
        }
    }

    fn allocate_id(&mut self) -> NodeId {
        let id = self.next_id;
        self.next_id = self.next_id.saturating_add(1);
        id
    }

    fn lower_root(&mut self, element: &JSXElement<'_>) {
        let id = self.allocate_id();
        let root = if let Some(kind) = self.builtin_kind(element) {
            match kind {
                BuiltinKind::Show => RootIr::Show(self.lower_show(element)),
                BuiltinKind::For => RootIr::For(self.lower_for(element)),
                BuiltinKind::Host => {
                    if !self.is_host_root(element) {
                        self.unsupported(
                            "ZEUS_INVALID_HOST_USAGE",
                            "<Host> can only be the root returned by a defineElement setup.",
                            element.span,
                        );
                    }
                    RootIr::Component(self.lower_special_component(element, "Host"))
                }
                BuiltinKind::Slot => {
                    self.unsupported(
                        "ZEUS_INVALID_SLOT_USAGE",
                        "<Slot> can only be used inside a defineElement Host boundary.",
                        element.span,
                    );
                    RootIr::Component(self.lower_special_component(element, "Slot"))
                }
            }
        } else if is_component_element(element) {
            RootIr::Component(self.lower_component(element))
        } else {
            let Some(root) = self.lower_element(element) else {
                return;
            };
            RootIr::Element(root)
        };
        self.components.push(ComponentIr {
            id,
            kind: "Component".into(),
            span: self.source_index.span(element.span),
            root,
        });
    }

    fn lower_root_fragment(&mut self, fragment: &JSXFragment<'_>) {
        let id = self.allocate_id();
        let root = self.lower_fragment(fragment);
        self.components.push(ComponentIr {
            id,
            kind: "Component".into(),
            span: self.source_index.span(fragment.span),
            root: RootIr::Fragment(root),
        });
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
        if is_unsupported_raw_text_element(tag_name) {
            self.unsupported(
                "ZEUS_UNSUPPORTED_RAW_TEXT_ELEMENT",
                "This raw-text element has no dedicated DOM text binding path.",
                identifier.span,
            );
            return None;
        }
        if is_raw_text_element(tag_name)
            && element.children.iter().any(|child| {
                matches!(
                    child,
                    JSXChild::Element(_) | JSXChild::Fragment(_) | JSXChild::Spread(_)
                )
            })
        {
            self.unsupported(
                "ZEUS_UNSUPPORTED_RAW_TEXT_CHILD",
                "Raw-text elements may only contain text and dynamic expressions.",
                element.span,
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
        if !element.children.is_empty() && is_void_element(tag_name) {
            self.unsupported(
                "ZEUS_UNSUPPORTED_VOID_ELEMENT_CHILDREN",
                "Void elements cannot contain child bindings.",
                element.span,
            );
            return None;
        }

        let id = self.allocate_id();

        let attributes = self.lower_attributes(&element.opening_element.attributes);
        let children = self.lower_children(&element.children);

        if is_raw_text_element(tag_name) {
            let mut has_once = false;
            let mut has_reactive = false;
            for child in &children {
                if let ChildIr::DynamicText(text) = child {
                    has_once |= text.once;
                    has_reactive |= !text.once;
                }
            }
            if has_once && has_reactive {
                self.unsupported(
                    "ZEUS_MIXED_RAW_TEXT_BINDING_MODE",
                    "Raw-text elements cannot mix @once and reactive dynamic expressions.",
                    element.span,
                );
                return None;
            }
        }

        Some(ElementIr {
            id,
            kind: "Element".into(),
            reference: IrRef { node_id: id },
            tag_name: identifier.name.to_string(),
            span: self.source_index.span(element.span),
            attributes,
            children,
        })
    }

    fn lower_component(&mut self, element: &JSXElement<'_>) -> ComponentBindingIr {
        self.lower_component_with_kind(element, "Component")
    }

    fn lower_special_component(
        &mut self,
        element: &JSXElement<'_>,
        kind: &str,
    ) -> ComponentBindingIr {
        self.lower_component_with_kind(element, kind)
    }

    fn lower_component_with_kind(
        &mut self,
        element: &JSXElement<'_>,
        kind: &str,
    ) -> ComponentBindingIr {
        let id = self.allocate_id();
        let callee = self.lower_component_callee(&element.opening_element.name);
        let mut props = Vec::new();

        for attribute in &element.opening_element.attributes {
            match attribute {
                JSXAttributeItem::SpreadAttribute(attribute) => self.unsupported(
                    "ZEUS_UNSUPPORTED_COMPONENT_PROP",
                    "Component spread props are not supported by this compiler slice.",
                    attribute.span,
                ),
                JSXAttributeItem::Attribute(attribute) => {
                    if let Some(prop) = self.lower_component_prop(attribute) {
                        props.push(prop);
                    }
                }
            }
        }

        if !element.children.is_empty() {
            let span = self.source_index.span(element.span);
            let children = if kind == "Host" {
                self.host_depth += 1;
                let children = self.lower_inline_value_children(&element.children);
                self.host_depth = self.host_depth.saturating_sub(1);
                children
            } else {
                self.lower_inline_value_children(&element.children)
            };
            props.push(ComponentPropIr {
                id: self.allocate_id(),
                name: "children".into(),
                value: ComponentPropValueIr::Children(children),
                span,
            });
        }

        ComponentBindingIr {
            id,
            kind: kind.into(),
            callee,
            props,
            span: self.source_index.span(element.span),
        }
    }

    fn builtin_kind(&self, element: &JSXElement<'_>) -> Option<BuiltinKind> {
        let name = match &element.opening_element.name {
            JSXElementName::Identifier(identifier) => identifier.name.as_str(),
            JSXElementName::IdentifierReference(identifier) => identifier.name.as_str(),
            JSXElementName::MemberExpression(_)
            | JSXElementName::NamespacedName(_)
            | JSXElementName::ThisExpression(_) => return None,
        };
        self.builtin_names.get(name).copied()
    }

    fn is_host_root(&self, element: &JSXElement<'_>) -> bool {
        self.host_depth == 0
            && (self.host_root_spans.is_empty()
                || self.host_root_spans.contains(&element.span.start))
            && self.is_inside_define_element_setup(element.span)
    }

    fn is_inside_define_element_setup(&self, span: Span) -> bool {
        self.define_element_setup_spans
            .iter()
            .any(|setup| setup.start <= span.start && span.end <= setup.end)
    }

    fn lower_show(&mut self, element: &JSXElement<'_>) -> ShowBindingIr {
        let id = self.allocate_id();
        let Some(when) = self.lower_builtin_expression_attr(element, "when", true) else {
            return ShowBindingIr {
                id,
                kind: "Show".into(),
                when: self.empty_expression(element.span),
                children: Vec::new(),
                fallback: None,
                span: self.source_index.span(element.span),
            };
        };
        let fallback = self.lower_show_fallback(element);
        ShowBindingIr {
            id,
            kind: "Show".into(),
            when,
            children: self.lower_inline_value_children(&element.children),
            fallback,
            span: self.source_index.span(element.span),
        }
    }

    fn lower_for(&mut self, element: &JSXElement<'_>) -> ForBindingIr {
        let id = self.allocate_id();
        let each = self
            .lower_builtin_expression_attr(element, "each", true)
            .unwrap_or_else(|| self.empty_expression(element.span));
        let by = self.lower_builtin_expression_attr(element, "by", false);
        let mut item = "item".into();
        let mut index = None;
        let mut body = Vec::new();

        let rejected_once_callback = element.children.iter().any(|child| {
            let JSXChild::ExpressionContainer(container) = child else {
                return false;
            };
            !matches!(&container.expression, JSXExpression::EmptyExpression(_))
                && self.reject_once_marker(container)
        });
        let callback = element.children.iter().find_map(|child| {
            let JSXChild::ExpressionContainer(container) = child else {
                return None;
            };
            let expression = unwrap_expression(container.expression.as_expression()?);
            let Expression::ArrowFunctionExpression(function) = expression else {
                return None;
            };
            Some(function)
        });
        let has_only_callback_and_whitespace = element.children.iter().all(|child| match child {
            JSXChild::Text(text) => normalize_jsx_text(text.value.as_str()).is_empty(),
            JSXChild::ExpressionContainer(container) => container
                .expression
                .as_expression()
                .is_some_and(|expression| {
                    let expression = unwrap_expression(expression);
                    matches!(expression, Expression::ArrowFunctionExpression(_))
                }),
            _ => false,
        });
        if !rejected_once_callback
            && has_only_callback_and_whitespace
            && let Some(function) = callback
        {
            item = function
                .params
                .items
                .first()
                .and_then(|parameter| binding_name(&parameter.pattern))
                .unwrap_or_else(|| "item".into());
            index = function
                .params
                .items
                .get(1)
                .and_then(|parameter| binding_name(&parameter.pattern));
            match &function.body {
                oxc_ast::ast::ArrowFunctionBody::FunctionBody(body_block) => {
                    if body_block.statements.len() == 1
                        && let Statement::ReturnStatement(statement) = &body_block.statements[0]
                        && let Some(argument) = &statement.argument
                        && let Some(child) = self.lower_expression_child(argument)
                    {
                        body.push(child);
                    }
                }
                arrow_body => {
                    if let Some(expression) = arrow_body.as_expression() {
                        let expression = unwrap_expression(expression);
                        if let Some(child) = self.lower_expression_child(expression) {
                            body.push(child);
                        } else if !contains_jsx(expression) {
                            let id = self.allocate_id();
                            body.push(ChildIr::DynamicText(DynamicTextIr {
                                id,
                                kind: "DynamicText".into(),
                                reference: IrRef { node_id: id },
                                expression: self.lower_expression(expression),
                                once: false,
                                span: self.source_index.span(expression.span()),
                            }));
                        }
                    }
                }
            }
        }

        if body.is_empty() && !rejected_once_callback {
            self.unsupported(
                "ZEUS_INVALID_FOR_CHILD",
                "<For> requires a single item callback returning JSX or a value.",
                element.span,
            );
        }

        ForBindingIr {
            id,
            kind: "For".into(),
            each,
            by,
            item,
            index,
            body,
            span: self.source_index.span(element.span),
        }
    }

    fn lower_show_fallback(&mut self, element: &JSXElement<'_>) -> Option<ComponentPropValueIr> {
        let attribute = element
            .opening_element
            .attributes
            .iter()
            .find_map(|attribute| {
                let JSXAttributeItem::Attribute(attribute) = attribute else {
                    return None;
                };
                let JSXAttributeName::Identifier(name) = &attribute.name else {
                    return None;
                };
                (name.name == "fallback").then_some(attribute)
            })?;
        match &attribute.value {
            None => Some(ComponentPropValueIr::Expression(
                self.literal_expression("true", attribute.span),
            )),
            Some(JSXAttributeValue::StringLiteral(value)) => {
                Some(ComponentPropValueIr::Expression(self.literal_expression(
                    &serde_json::to_string(value.value.as_str()).expect("string serializes"),
                    attribute.span,
                )))
            }
            Some(JSXAttributeValue::ExpressionContainer(container)) => {
                if matches!(&container.expression, JSXExpression::EmptyExpression(_)) {
                    return None;
                }
                let expression = container.expression.to_expression();
                if self.reject_once_marker(container) {
                    return None;
                }
                if let Some(child) = self.lower_expression_child(expression) {
                    Some(ComponentPropValueIr::Children(vec![child]))
                } else if contains_jsx(expression) {
                    self.unsupported(
                        "ZEUS_INVALID_SHOW_FALLBACK",
                        "Show fallback JSX could not be lowered.",
                        container.span,
                    );
                    None
                } else {
                    Some(ComponentPropValueIr::Expression(
                        self.lower_expression(expression),
                    ))
                }
            }
            Some(JSXAttributeValue::Element(_) | JSXAttributeValue::Fragment(_)) => None,
        }
    }

    fn lower_builtin_expression_attr(
        &mut self,
        element: &JSXElement<'_>,
        name: &str,
        required: bool,
    ) -> Option<ExpressionIr> {
        let attribute = element
            .opening_element
            .attributes
            .iter()
            .find_map(|attribute| {
                let JSXAttributeItem::Attribute(attribute) = attribute else {
                    return None;
                };
                let JSXAttributeName::Identifier(attribute_name) = &attribute.name else {
                    return None;
                };
                (attribute_name.name == name).then_some(attribute)
            });
        let Some(attribute) = attribute else {
            if required {
                self.unsupported(
                    "ZEUS_INVALID_BUILTIN_USAGE",
                    &format!("Builtin requires the `{name}` attribute."),
                    element.span,
                );
            }
            return None;
        };
        let Some(JSXAttributeValue::ExpressionContainer(container)) = &attribute.value else {
            self.unsupported(
                "ZEUS_INVALID_BUILTIN_USAGE",
                &format!("Builtin attribute `{name}` must be an expression."),
                attribute.span,
            );
            return None;
        };
        if matches!(&container.expression, JSXExpression::EmptyExpression(_)) {
            self.unsupported(
                "ZEUS_EMPTY_EXPRESSION",
                "Builtin expressions cannot be empty.",
                container.span,
            );
            return None;
        }
        let expression = container.expression.to_expression();
        if self.reject_once_marker(container) {
            return None;
        }
        if contains_jsx(expression) {
            self.unsupported(
                "ZEUS_UNSUPPORTED_JSX_ATTRIBUTE_VALUE",
                "Builtin expressions cannot contain JSX.",
                container.span,
            );
            return None;
        }
        Some(self.lower_expression(expression))
    }

    fn lower_expression_child(&mut self, expression: &Expression<'_>) -> Option<ChildIr> {
        let expression = unwrap_expression(expression);
        match expression {
            Expression::JSXElement(element) => Some(self.lower_element_child(element)),
            Expression::JSXFragment(fragment) => {
                Some(ChildIr::Fragment(self.lower_fragment(fragment)))
            }
            _ => None,
        }
    }

    fn lower_element_child(&mut self, element: &JSXElement<'_>) -> ChildIr {
        if let Some(kind) = self.builtin_kind(element) {
            return match kind {
                BuiltinKind::Show => ChildIr::Show(self.lower_show(element)),
                BuiltinKind::For => ChildIr::For(self.lower_for(element)),
                BuiltinKind::Host => {
                    self.unsupported(
                        "ZEUS_INVALID_HOST_USAGE",
                        "Nested <Host> boundaries are not supported.",
                        element.span,
                    );
                    ChildIr::Component(self.lower_special_component(element, "Host"))
                }
                BuiltinKind::Slot => {
                    if self.host_depth == 0 {
                        self.unsupported(
                            "ZEUS_INVALID_SLOT_USAGE",
                            "<Slot> can only be used inside a defineElement Host boundary.",
                            element.span,
                        );
                    }
                    ChildIr::Component(self.lower_special_component(element, "Slot"))
                }
            };
        }
        if is_component_element(element) {
            ChildIr::Component(self.lower_component(element))
        } else {
            self.lower_element(element).map_or_else(
                || {
                    ChildIr::Text(TextIr {
                        id: self.allocate_id(),
                        kind: "Text".into(),
                        value: String::new(),
                        span: self.source_index.span(element.span),
                    })
                },
                ChildIr::Element,
            )
        }
    }

    fn empty_expression(&self, span: Span) -> ExpressionIr {
        self.literal_expression("false", span)
    }

    fn literal_expression(&self, code: &str, span: Span) -> ExpressionIr {
        ExpressionIr {
            kind: "Expression".into(),
            code: code.into(),
            span: self.source_index.span(span),
            form: ExpressionForm::Value,
        }
    }

    fn lower_component_callee(&mut self, name: &JSXElementName<'_>) -> ExpressionIr {
        let span = self.source_index.span(name.span());
        let code = match name {
            JSXElementName::Identifier(identifier) => identifier.name.to_string(),
            JSXElementName::IdentifierReference(identifier) => identifier.name.to_string(),
            JSXElementName::MemberExpression(_) | JSXElementName::ThisExpression(_) => {
                name.span().source_text(self.source).to_owned()
            }
            JSXElementName::NamespacedName(_) => {
                self.unsupported(
                    "ZEUS_UNSUPPORTED_COMPONENT_NAME",
                    "Namespaced component names are not supported.",
                    name.span(),
                );
                name.span().source_text(self.source).to_owned()
            }
        };
        ExpressionIr {
            kind: "Expression".into(),
            code,
            span,
            form: ExpressionForm::Value,
        }
    }

    fn lower_component_prop(&mut self, attribute: &JSXAttribute<'_>) -> Option<ComponentPropIr> {
        let name = match &attribute.name {
            JSXAttributeName::Identifier(identifier) => {
                normalize_attribute_name(identifier.name.as_str())
            }
            JSXAttributeName::NamespacedName(namespaced) => {
                format!("{}:{}", namespaced.namespace.name, namespaced.name.name)
            }
        };
        let span = self.source_index.span(attribute.span);
        let value = match &attribute.value {
            None => ExpressionIr {
                kind: "Expression".into(),
                code: "true".into(),
                span,
                form: ExpressionForm::Value,
            },
            Some(JSXAttributeValue::StringLiteral(value)) => ExpressionIr {
                kind: "Expression".into(),
                code: serde_json::to_string(value.value.as_str()).expect("string serializes"),
                span,
                form: ExpressionForm::Value,
            },
            Some(JSXAttributeValue::ExpressionContainer(container)) => {
                if matches!(&container.expression, JSXExpression::EmptyExpression(_)) {
                    self.unsupported(
                        "ZEUS_EMPTY_EXPRESSION",
                        "Component prop expressions cannot be empty.",
                        container.span,
                    );
                    return None;
                }
                let expression = container.expression.to_expression();
                if self.reject_once_marker(container) {
                    return None;
                }
                if contains_jsx(expression) {
                    self.unsupported(
                        "ZEUS_UNSUPPORTED_JSX_ATTRIBUTE_VALUE",
                        "JSX values inside component props are not supported.",
                        container.span,
                    );
                    return None;
                }
                self.lower_expression(expression)
            }
            Some(JSXAttributeValue::Element(_) | JSXAttributeValue::Fragment(_)) => {
                self.unsupported(
                    "ZEUS_UNSUPPORTED_JSX_ATTRIBUTE_VALUE",
                    "JSX values inside component props are not supported.",
                    attribute.span,
                );
                return None;
            }
        };

        Some(ComponentPropIr {
            id: self.allocate_id(),
            name,
            value: ComponentPropValueIr::Expression(value),
            span,
        })
    }

    fn lower_fragment(&mut self, fragment: &JSXFragment<'_>) -> FragmentIr {
        let id = self.allocate_id();
        FragmentIr {
            id,
            kind: "Fragment".into(),
            span: self.source_index.span(fragment.span),
            children: self.lower_children(&fragment.children),
        }
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
                    value: StaticAttributeValue::Boolean,
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
        let once = self.has_once_marker(container);
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

        if once && !is_property && (name == "ref" || is_event_attribute_name(&name)) {
            self.invalid_once_target(container.span);
            return None;
        }

        if is_property {
            return Some(AttributeIr::Property(PropBindingIr {
                id,
                name,
                expression,
                once,
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
            once,
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

    fn lower_inline_value_children(&mut self, children: &[JSXChild<'_>]) -> Vec<ChildIr> {
        let mut lowered = Vec::with_capacity(children.len());

        for child in children {
            if let JSXChild::ExpressionContainer(container) = child
                && !matches!(&container.expression, JSXExpression::EmptyExpression(_))
                && self.reject_once_marker(container)
            {
                continue;
            }
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
                lowered.push(self.lower_element_child(element));
            }
            JSXChild::ExpressionContainer(container) => {
                if matches!(&container.expression, JSXExpression::EmptyExpression(_)) {
                    return;
                }
                let expression = container.expression.to_expression();
                let once = self.has_once_marker(container);
                if contains_jsx(expression) {
                    self.unsupported(
                        "ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION",
                        "Nested JSX expressions are not supported by this compiler slice.",
                        container.span,
                    );
                    return;
                }

                let expression = self.lower_expression(expression);
                if once && is_children_expression(&expression.code) {
                    self.invalid_once_target(container.span);
                    return;
                }
                let dynamic_id = self.allocate_id();
                lowered.push(ChildIr::DynamicText(DynamicTextIr {
                    id: dynamic_id,
                    kind: "DynamicText".into(),
                    reference: IrRef {
                        node_id: dynamic_id,
                    },
                    expression,
                    once,
                    span: self.source_index.span(container.span),
                }));
            }
            JSXChild::Fragment(fragment) => {
                lowered.push(ChildIr::Fragment(self.lower_fragment(fragment)));
            }
            JSXChild::Spread(spread) => self.unsupported(
                "ZEUS_UNSUPPORTED_SPREAD_CHILD",
                "JSX spread children are not supported by this compiler slice.",
                spread.span,
            ),
        }
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

    fn reject_once_marker(&mut self, container: &JSXExpressionContainer<'_>) -> bool {
        if !self.has_once_marker(container) {
            return false;
        }

        self.invalid_once_target(container.span);
        true
    }

    fn invalid_once_target(&mut self, span: Span) {
        self.unsupported(
            "ZEUS_INVALID_ONCE_TARGET",
            "@once can only mark native DOM text, attribute, or property bindings.",
            span,
        );
    }

    fn has_once_marker(&self, container: &JSXExpressionContainer<'_>) -> bool {
        let Some(expression) = container.expression.as_expression() else {
            return false;
        };
        let start = container.span.start.saturating_add(1) as usize;
        let end = expression.span().start as usize;
        let Some(trivia) = self.source.get(start..end) else {
            return false;
        };

        trivia_contains_once_marker(trivia)
    }
}

fn trivia_contains_once_marker(trivia: &str) -> bool {
    let mut offset = 0;

    while offset < trivia.len() {
        let rest = &trivia[offset..];
        let Some(character) = rest.chars().next() else {
            break;
        };

        if character.is_whitespace() {
            offset += character.len_utf8();
            continue;
        }

        if let Some(comment) = rest.strip_prefix("/*") {
            let Some(end) = comment.find("*/") else {
                return false;
            };
            if comment[..end].trim() == "@once" {
                return true;
            }
            offset += 2 + end + 2;
            continue;
        }

        if rest.starts_with("//") {
            offset += rest.find('\n').unwrap_or(rest.len());
            continue;
        }

        return false;
    }

    false
}

impl<'ast> Visit<'ast> for Lowerer<'_, '_> {
    fn visit_jsx_element(&mut self, element: &JSXElement<'ast>) {
        // lower_element handles supported descendants; walking again would create extra roots.
        self.lower_root(element);
    }

    fn visit_jsx_fragment(&mut self, fragment: &JSXFragment<'ast>) {
        self.lower_root_fragment(fragment);
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

fn unwrap_expression<'ast, 'expr>(expression: &'expr Expression<'ast>) -> &'expr Expression<'ast> {
    match expression {
        Expression::ParenthesizedExpression(expression) => {
            unwrap_expression(&expression.expression)
        }
        Expression::TSAsExpression(expression) => unwrap_expression(&expression.expression),
        Expression::TSSatisfiesExpression(expression) => unwrap_expression(&expression.expression),
        Expression::TSNonNullExpression(expression) => unwrap_expression(&expression.expression),
        Expression::TSInstantiationExpression(expression) => {
            unwrap_expression(&expression.expression)
        }
        _ => expression,
    }
}

fn normalize_attribute_name(name: &str) -> String {
    if name == "className" {
        "class".into()
    } else {
        name.into()
    }
}

fn collect_builtin_names(program: &oxc_ast::ast::Program<'_>) -> HashMap<String, BuiltinKind> {
    let mut names = HashMap::new();
    for statement in &program.body {
        let Some(ModuleDeclaration::ImportDeclaration(import)) = statement.as_module_declaration()
        else {
            continue;
        };
        let source = import.source.value.as_str();
        if source != "@zeus-js/zeus" && source != "@zeus-js/runtime-dom" {
            continue;
        }
        let Some(specifiers) = &import.specifiers else {
            continue;
        };
        for specifier in specifiers {
            let ImportDeclarationSpecifier::ImportSpecifier(specifier) = specifier else {
                continue;
            };
            let imported = match &specifier.imported {
                oxc_ast::ast::ModuleExportName::IdentifierName(name) => name.name.as_str(),
                oxc_ast::ast::ModuleExportName::IdentifierReference(name) => name.name.as_str(),
                oxc_ast::ast::ModuleExportName::StringLiteral(name) => name.value.as_str(),
            };
            let kind = match imported {
                "Show" => BuiltinKind::Show,
                "For" => BuiltinKind::For,
                "Host" => BuiltinKind::Host,
                "Slot" => BuiltinKind::Slot,
                _ => continue,
            };
            names.insert(specifier.local.name.to_string(), kind);
        }
    }
    names
}

fn collect_define_element_spans(
    program: &oxc_ast::ast::Program<'_>,
    builtin_names: &HashMap<String, BuiltinKind>,
) -> (Vec<Span>, HashSet<u32>) {
    let define_names = collect_imported_names(program, "defineElement");
    if define_names.is_empty() {
        return (Vec::new(), HashSet::new());
    }

    let host_names = builtin_names
        .iter()
        .filter_map(|(name, kind)| (*kind == BuiltinKind::Host).then_some(name.clone()))
        .collect::<HashSet<_>>();
    let setup_functions = collect_setup_functions(program, &host_names);
    let mut collector = DefineElementCollector {
        define_names,
        host_names,
        setup_functions,
        setup_spans: Vec::new(),
        host_root_spans: HashSet::new(),
    };
    collector.visit_program(program);
    (collector.setup_spans, collector.host_root_spans)
}

fn collect_imported_names(
    program: &oxc_ast::ast::Program<'_>,
    imported_name: &str,
) -> HashSet<String> {
    let mut names = HashSet::new();
    for statement in &program.body {
        let Some(ModuleDeclaration::ImportDeclaration(import)) = statement.as_module_declaration()
        else {
            continue;
        };
        if import.source.value.as_str() != "@zeus-js/zeus"
            && import.source.value.as_str() != "@zeus-js/runtime-dom"
        {
            continue;
        }
        let Some(specifiers) = &import.specifiers else {
            continue;
        };
        for specifier in specifiers {
            let ImportDeclarationSpecifier::ImportSpecifier(specifier) = specifier else {
                continue;
            };
            let imported = match &specifier.imported {
                oxc_ast::ast::ModuleExportName::IdentifierName(name) => name.name.as_str(),
                oxc_ast::ast::ModuleExportName::IdentifierReference(name) => name.name.as_str(),
                oxc_ast::ast::ModuleExportName::StringLiteral(name) => name.value.as_str(),
            };
            if imported == imported_name {
                names.insert(specifier.local.name.to_string());
            }
        }
    }
    names
}

fn collect_hmr_info(program: &oxc_ast::ast::Program<'_>) -> HmrInfo {
    let render_names = collect_render_names(program);
    if render_names.is_empty() {
        return HmrInfo {
            manual_boundary: has_manual_hmr_boundary(program),
            render_calls: Vec::new(),
        };
    }

    let mut render_calls = Vec::new();
    for statement in &program.body {
        match statement {
            Statement::ExpressionStatement(statement) => {
                if let Some(call) = render_call(&statement.expression, &render_names) {
                    render_calls.push(HmrRenderCall {
                        offset: call.start,
                        disposer: None,
                    });
                }
            }
            _ if matches!(
                statement.as_declaration(),
                Some(Declaration::VariableDeclaration(_))
            ) =>
            {
                let Some(Declaration::VariableDeclaration(declaration)) =
                    statement.as_declaration()
                else {
                    unreachable!()
                };
                collect_variable_render_calls(
                    &declaration.declarations,
                    &render_names,
                    &mut render_calls,
                );
            }
            _ if matches!(
                statement.as_module_declaration(),
                Some(ModuleDeclaration::ExportDeclaration(_))
            ) =>
            {
                let Some(ModuleDeclaration::ExportDeclaration(export)) =
                    statement.as_module_declaration()
                else {
                    unreachable!()
                };
                if let Declaration::VariableDeclaration(declaration) = &export.declaration {
                    collect_variable_render_calls(
                        &declaration.declarations,
                        &render_names,
                        &mut render_calls,
                    );
                }
            }
            _ => {}
        }
    }

    HmrInfo {
        manual_boundary: has_manual_hmr_boundary(program),
        render_calls,
    }
}

fn collect_render_names(program: &oxc_ast::ast::Program<'_>) -> HashSet<String> {
    let mut names = HashSet::new();
    for statement in &program.body {
        let Some(ModuleDeclaration::ImportDeclaration(import)) = statement.as_module_declaration()
        else {
            continue;
        };
        let source = import.source.value.as_str();
        if source != "@zeus-js/runtime-dom" && source != "@zeus-js/zeus" {
            continue;
        }
        let Some(specifiers) = &import.specifiers else {
            continue;
        };
        for specifier in specifiers {
            let ImportDeclarationSpecifier::ImportSpecifier(specifier) = specifier else {
                continue;
            };
            let imported = match &specifier.imported {
                oxc_ast::ast::ModuleExportName::IdentifierName(name) => name.name.as_str(),
                oxc_ast::ast::ModuleExportName::IdentifierReference(name) => name.name.as_str(),
                oxc_ast::ast::ModuleExportName::StringLiteral(name) => name.value.as_str(),
            };
            if imported == "render" {
                names.insert(specifier.local.name.to_string());
            }
        }
    }
    names
}

fn collect_variable_render_calls<'a>(
    declarations: &oxc_allocator::Vec<'a, VariableDeclarator<'a>>,
    render_names: &HashSet<String>,
    render_calls: &mut Vec<HmrRenderCall>,
) {
    for declaration in declarations {
        let Some(initializer) = &declaration.init else {
            continue;
        };
        let Some(call) = render_call(initializer, render_names) else {
            continue;
        };
        let disposer = binding_name(&declaration.id);
        render_calls.push(HmrRenderCall {
            offset: call.start,
            disposer,
        });
    }
}

fn render_call(expression: &Expression<'_>, render_names: &HashSet<String>) -> Option<Span> {
    match expression {
        Expression::CallExpression(call) => match &call.callee {
            Expression::Identifier(identifier)
                if render_names.contains(identifier.name.as_str()) =>
            {
                Some(call.span)
            }
            _ => None,
        },
        Expression::ParenthesizedExpression(expression) => {
            render_call(&expression.expression, render_names)
        }
        Expression::TSInstantiationExpression(expression) => {
            render_call(&expression.expression, render_names)
        }
        _ => None,
    }
}

fn has_manual_hmr_boundary(program: &oxc_ast::ast::Program<'_>) -> bool {
    let mut detector = ManualHmrDetector(false);
    detector.visit_program(program);
    detector.0
}

struct ManualHmrDetector(bool);

impl<'ast> Visit<'ast> for ManualHmrDetector {
    fn visit_member_expression(&mut self, expression: &MemberExpression<'ast>) {
        if is_import_meta_hot(expression) {
            self.0 = true;
        }
        walk::walk_member_expression(self, expression);
    }
}

fn is_import_meta_hot(expression: &MemberExpression<'_>) -> bool {
    let MemberExpression::StaticMemberExpression(expression) = expression else {
        return false;
    };
    if expression.property.name.as_str() != "hot" {
        return false;
    }
    match &expression.object {
        Expression::ImportMeta(_) => true,
        Expression::StaticMemberExpression(meta) => {
            meta.property.name.as_str() == "meta"
                && matches!(meta.object, Expression::ImportMeta(_))
        }
        _ => false,
    }
}

struct DefineElementCollector {
    define_names: HashSet<String>,
    host_names: HashSet<String>,
    setup_functions: HashMap<String, SetupFunctionInfo>,
    setup_spans: Vec<Span>,
    host_root_spans: HashSet<u32>,
}

#[derive(Clone, Copy)]
struct SetupFunctionInfo {
    span: Span,
    host_root: Option<Span>,
}

fn collect_setup_functions(
    program: &oxc_ast::ast::Program<'_>,
    host_names: &HashSet<String>,
) -> HashMap<String, SetupFunctionInfo> {
    let mut collector = SetupFunctionCollector {
        host_names,
        functions: HashMap::new(),
    };
    collector.visit_program(program);
    collector.functions
}

struct SetupFunctionCollector<'a> {
    host_names: &'a HashSet<String>,
    functions: HashMap<String, SetupFunctionInfo>,
}

impl<'ast> Visit<'ast> for SetupFunctionCollector<'_> {
    fn visit_variable_declarator(&mut self, declarator: &VariableDeclarator<'ast>) {
        if let Some(name) = binding_name(&declarator.id)
            && let Some(init) = &declarator.init
            && let Some(info) = setup_function_info(init, self.host_names)
        {
            self.functions.insert(name, info);
        }
        walk::walk_variable_declarator(self, declarator);
    }

    fn visit_function(
        &mut self,
        function: &oxc_ast::ast::Function<'ast>,
        flags: oxc_syntax::scope::ScopeFlags,
    ) {
        if function.r#type == FunctionType::FunctionDeclaration
            && let Some(identifier) = &function.id
        {
            self.functions.insert(
                identifier.name.to_string(),
                SetupFunctionInfo {
                    span: function.span,
                    host_root: function_setup_root(function, self.host_names),
                },
            );
        }
        walk::walk_function(self, function, flags);
    }
}

fn setup_function_info(
    expression: &Expression<'_>,
    host_names: &HashSet<String>,
) -> Option<SetupFunctionInfo> {
    match expression {
        Expression::ArrowFunctionExpression(function) => Some(SetupFunctionInfo {
            span: function.span,
            host_root: arrow_setup_root(function, host_names),
        }),
        Expression::FunctionExpression(function) => Some(SetupFunctionInfo {
            span: function.span,
            host_root: function_setup_root(function, host_names),
        }),
        Expression::ParenthesizedExpression(expression) => {
            setup_function_info(&expression.expression, host_names)
        }
        Expression::TSAsExpression(expression) => {
            setup_function_info(&expression.expression, host_names)
        }
        Expression::TSSatisfiesExpression(expression) => {
            setup_function_info(&expression.expression, host_names)
        }
        Expression::TSNonNullExpression(expression) => {
            setup_function_info(&expression.expression, host_names)
        }
        Expression::TSInstantiationExpression(expression) => {
            setup_function_info(&expression.expression, host_names)
        }
        _ => None,
    }
}

fn setup_function_reference(expression: &Expression<'_>) -> Option<String> {
    match expression {
        Expression::Identifier(identifier) => Some(identifier.name.to_string()),
        Expression::ParenthesizedExpression(expression) => {
            setup_function_reference(&expression.expression)
        }
        Expression::TSAsExpression(expression) => setup_function_reference(&expression.expression),
        Expression::TSSatisfiesExpression(expression) => {
            setup_function_reference(&expression.expression)
        }
        Expression::TSNonNullExpression(expression) => {
            setup_function_reference(&expression.expression)
        }
        Expression::TSInstantiationExpression(expression) => {
            setup_function_reference(&expression.expression)
        }
        _ => None,
    }
}

impl<'ast> Visit<'ast> for DefineElementCollector {
    fn visit_call_expression(&mut self, expression: &oxc_ast::ast::CallExpression<'ast>) {
        if let Expression::Identifier(callee) = &expression.callee
            && self.define_names.contains(callee.name.as_str())
            && let Some(argument) = expression.arguments.get(2)
            && let Some(setup) = argument.as_expression()
        {
            let info = setup_function_info(setup, &self.host_names).or_else(|| {
                setup_function_reference(setup)
                    .and_then(|name| self.setup_functions.get(&name).copied())
            });
            if let Some(info) = info {
                self.setup_spans.push(info.span);
                if let Some(root) = info.host_root {
                    self.host_root_spans.insert(root.start);
                }
            }
        }
        walk::walk_call_expression(self, expression);
    }
}

fn arrow_setup_root(
    function: &oxc_ast::ast::ArrowFunctionExpression<'_>,
    host_names: &HashSet<String>,
) -> Option<Span> {
    function
        .body
        .as_expression()
        .and_then(|expression| jsx_host_span(expression, host_names))
        .or_else(|| {
            let oxc_ast::ast::ArrowFunctionBody::FunctionBody(body) = &function.body else {
                return None;
            };
            body.statements.iter().find_map(|statement| {
                let Statement::ReturnStatement(return_statement) = statement else {
                    return None;
                };
                return_statement
                    .argument
                    .as_ref()
                    .and_then(|expression| jsx_host_span(expression, host_names))
            })
        })
}

fn function_setup_root(
    function: &oxc_ast::ast::Function<'_>,
    host_names: &HashSet<String>,
) -> Option<Span> {
    function.body.as_ref().and_then(|body| {
        body.statements.iter().find_map(|statement| {
            let Statement::ReturnStatement(return_statement) = statement else {
                return None;
            };
            return_statement
                .argument
                .as_ref()
                .and_then(|expression| jsx_host_span(expression, host_names))
        })
    })
}

fn jsx_host_span(expression: &Expression<'_>, host_names: &HashSet<String>) -> Option<Span> {
    let Expression::JSXElement(element) = expression else {
        return None;
    };
    let name = match &element.opening_element.name {
        JSXElementName::Identifier(identifier) => identifier.name.as_str(),
        JSXElementName::IdentifierReference(identifier) => identifier.name.as_str(),
        _ => return None,
    };
    host_names.contains(name).then_some(element.span)
}

fn is_component_element(element: &JSXElement<'_>) -> bool {
    match &element.opening_element.name {
        JSXElementName::Identifier(identifier) => identifier
            .name
            .chars()
            .next()
            .is_some_and(|character| character.is_ascii_uppercase()),
        JSXElementName::IdentifierReference(_)
        | JSXElementName::NamespacedName(_)
        | JSXElementName::MemberExpression(_)
        | JSXElementName::ThisExpression(_) => true,
    }
}

fn binding_name(pattern: &BindingPattern<'_>) -> Option<String> {
    match pattern {
        BindingPattern::BindingIdentifier(identifier) => Some(identifier.name.to_string()),
        BindingPattern::ObjectPattern(_)
        | BindingPattern::ArrayPattern(_)
        | BindingPattern::AssignmentPattern(_) => None,
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
