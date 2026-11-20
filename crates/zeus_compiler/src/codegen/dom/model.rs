//! The DOM emitter's data model and its construction.
//!
//! Everything here describes a **cloned DOM node and what attaches to it**:
//! `GeneratedComponent` (template, element targets, bindings),
//! `DynamicBinding` (one value bound to one node), `AttributeBindingKind`,
//! and the collectors that build them from the IR.
//!
//! **These are DOM-only.** The SSR emitter builds output straight from
//! `ModuleIr` and never names any of it — `DynamicBinding::Text` describes
//! writing into a cloned text node, which has no SSR analogue. Keeping these in
//! the orchestrator is what made every extraction from `codegen/mod.rs` look
//! like a cycle: the orchestrator owned types only one of its two targets used.
//!
//! `render_template` lives here too, because a template string is a property of
//! a `GeneratedComponent` and nothing else computes one.

use std::collections::HashSet;

use crate::ir::{
    AttributeIr, ChildIr, ComponentBindingIr, ComponentIr, DynamicRegionIr, ElementIr,
    ErrorBoundaryBindingIr, ExpressionIr, ForBindingIr, FragmentIr, NodeId, RootIr, ShowBindingIr,
    StaticAttributeValue, TransitionBindingIr, is_children_expression,
};
use crate::support::html::{is_raw_text_element, is_svg_element, is_void_element};

use crate::codegen::infra::{
    NameAllocator, element_has_spread, escape_html_attribute, escape_html_text,
    is_unescaped_raw_text, root_span,
};

pub(crate) fn render_template(root: &RootIr, locator_attribute: &str) -> String {
    let mut html = String::new();
    match root {
        RootIr::Element(element) => render_element(element, locator_attribute, &mut html),
        RootIr::Fragment(fragment) => render_fragment(fragment, locator_attribute, &mut html),
        RootIr::Component(_)
        | RootIr::Show(_)
        | RootIr::For(_)
        | RootIr::ErrorBoundary(_)
        | RootIr::Transition(_) => {}
    }
    html
}

pub(crate) fn render_fragment(fragment: &FragmentIr, locator_attribute: &str, html: &mut String) {
    for child in &fragment.children {
        render_child_template(child, locator_attribute, html);
    }
}

pub(crate) fn render_child_template(child: &ChildIr, locator_attribute: &str, html: &mut String) {
    match child {
        ChildIr::Element(element) => render_element(element, locator_attribute, html),
        ChildIr::Fragment(fragment) => render_fragment(fragment, locator_attribute, html),
        ChildIr::Text(text) => html.push_str(&escape_html_text(&text.value)),
        ChildIr::DynamicText(_)
        | ChildIr::DynamicRegion(_)
        | ChildIr::Component(_)
        | ChildIr::Show(_)
        | ChildIr::For(_)
        | ChildIr::ErrorBoundary(_)
        | ChildIr::Transition(_) => {
            html.push_str("<!>");
        }
    }
}

pub(crate) fn render_element(element: &ElementIr, locator_attribute: &str, html: &mut String) {
    let is_raw_text = is_raw_text_element(&element.tag_name);
    let is_foreign_raw_text =
        element.namespace == "svg" && is_unescaped_raw_text(&element.tag_name);
    html.push('<');
    html.push_str(&element.tag_name);
    for attribute in &element.attributes {
        if element_has_spread(element) {
            break;
        }
        if let AttributeIr::Static(attribute) = attribute {
            html.push(' ');
            html.push_str(&attribute.name);
            if let StaticAttributeValue::String(value) = &attribute.value {
                html.push_str("=\"");
                html.push_str(&escape_html_attribute(value));
                html.push('"');
            }
        }
    }
    if has_element_binding(element) {
        html.push(' ');
        html.push_str(locator_attribute);
        html.push_str("=\"");
        html.push_str(&element.id.to_string());
        html.push('"');
    }
    html.push('>');

    if is_void_element(&element.tag_name) {
        return;
    }

    if is_raw_text && has_dynamic_raw_text(element) {
        html.push_str("</");
        html.push_str(&element.tag_name);
        html.push('>');
        return;
    }

    for child in &element.children {
        match child {
            ChildIr::Element(element) => render_element(element, locator_attribute, html),
            ChildIr::Fragment(fragment) => render_fragment(fragment, locator_attribute, html),
            ChildIr::Text(text)
                if is_unescaped_raw_text(&element.tag_name) && !is_foreign_raw_text =>
            {
                html.push_str(&text.value);
            }
            ChildIr::Text(text) => html.push_str(&escape_html_text(&text.value)),
            ChildIr::DynamicText(_)
            | ChildIr::DynamicRegion(_)
            | ChildIr::Component(_)
            | ChildIr::Show(_)
            | ChildIr::For(_)
            | ChildIr::ErrorBoundary(_)
            | ChildIr::Transition(_) => html.push_str("<!>"),
        }
    }

    html.push_str("</");
    html.push_str(&element.tag_name);
    html.push('>');
}

pub(crate) fn collect_dynamic_bindings(element: &ElementIr) -> Vec<DynamicBinding> {
    let mut bindings = Vec::new();
    collect_element_bindings(element, &mut bindings);
    bindings
}

pub(crate) fn collect_root_dynamic_bindings(root: &RootIr) -> Vec<DynamicBinding> {
    match root {
        RootIr::Element(element) => collect_dynamic_bindings(element),
        RootIr::Fragment(fragment) => {
            let mut bindings = Vec::new();
            collect_fragment_bindings(fragment, &mut bindings);
            bindings
        }
        RootIr::Component(_)
        | RootIr::Show(_)
        | RootIr::For(_)
        | RootIr::ErrorBoundary(_)
        | RootIr::Transition(_) => Vec::new(),
    }
}

pub(crate) fn collect_element_bindings(element: &ElementIr, bindings: &mut Vec<DynamicBinding>) {
    if element_has_spread(element) {
        bindings.push(DynamicBinding::Spread {
            target_id: element.id,
            attributes: element.attributes.clone(),
        });
    }
    for attribute in &element.attributes {
        if element_has_spread(element) {
            break;
        }
        match attribute {
            AttributeIr::Dynamic(attribute) => bindings.push(DynamicBinding::Attribute {
                target_id: element.id,
                name: attribute.name.clone(),
                expression: attribute.expression.clone(),
                kind: AttributeBindingKind::from_name(&attribute.name),
                once: attribute.once,
            }),
            AttributeIr::Property(attribute) => bindings.push(DynamicBinding::Property {
                target_id: element.id,
                name: attribute.name.clone(),
                expression: attribute.expression.clone(),
                once: attribute.once,
            }),
            AttributeIr::Event(attribute) => bindings.push(DynamicBinding::Event {
                target_id: element.id,
                event_name: attribute.event_name.clone(),
                handler: attribute.handler.clone(),
            }),
            AttributeIr::Ref(attribute) => bindings.push(DynamicBinding::Ref {
                target_id: element.id,
                expression: attribute.expression.clone(),
            }),
            AttributeIr::Static(_) | AttributeIr::Spread(_) => {}
        }
    }

    if is_raw_text_element(&element.tag_name) {
        let parts = collect_text_content_parts(element);
        if parts
            .iter()
            .any(|part| matches!(part, TextContentPart::Dynamic { .. }))
        {
            let once = parts.iter().all(|part| match part {
                TextContentPart::Static(_) => true,
                TextContentPart::Dynamic { once, .. } => *once,
            });
            bindings.push(DynamicBinding::TextContent {
                target_id: element.id,
                parts,
                once,
            });
        }
        return;
    }

    for child in &element.children {
        match child {
            ChildIr::Element(element) => collect_element_bindings(element, bindings),
            ChildIr::Fragment(fragment) => collect_fragment_bindings(fragment, bindings),
            ChildIr::DynamicText(dynamic) => bindings.push(dynamic_binding(dynamic)),
            ChildIr::DynamicRegion(region) => bindings.push(DynamicBinding::DynamicRegion {
                region: region.clone(),
            }),
            ChildIr::Component(component) => bindings.push(DynamicBinding::Component {
                component: component.clone(),
            }),
            ChildIr::ErrorBoundary(boundary) => bindings.push(DynamicBinding::ErrorBoundary {
                boundary: boundary.clone(),
            }),
            ChildIr::Show(show) => bindings.push(DynamicBinding::Show { show: show.clone() }),
            ChildIr::For(for_binding) => bindings.push(DynamicBinding::For {
                for_binding: for_binding.clone(),
            }),
            ChildIr::Transition(transition) => bindings.push(DynamicBinding::Transition {
                transition: transition.clone(),
            }),
            ChildIr::Text(_) => {}
        }
    }
}

pub(crate) fn collect_fragment_bindings(fragment: &FragmentIr, bindings: &mut Vec<DynamicBinding>) {
    for child in &fragment.children {
        match child {
            ChildIr::Element(element) => collect_element_bindings(element, bindings),
            ChildIr::Fragment(fragment) => collect_fragment_bindings(fragment, bindings),
            ChildIr::DynamicText(dynamic) => bindings.push(dynamic_binding(dynamic)),
            ChildIr::DynamicRegion(region) => bindings.push(DynamicBinding::DynamicRegion {
                region: region.clone(),
            }),
            ChildIr::Component(component) => bindings.push(DynamicBinding::Component {
                component: component.clone(),
            }),
            ChildIr::ErrorBoundary(boundary) => bindings.push(DynamicBinding::ErrorBoundary {
                boundary: boundary.clone(),
            }),
            ChildIr::Show(show) => bindings.push(DynamicBinding::Show { show: show.clone() }),
            ChildIr::For(for_binding) => bindings.push(DynamicBinding::For {
                for_binding: for_binding.clone(),
            }),
            ChildIr::Transition(transition) => bindings.push(DynamicBinding::Transition {
                transition: transition.clone(),
            }),
            ChildIr::Text(_) => {}
        }
    }
}

pub(crate) fn dynamic_binding(dynamic: &crate::ir::DynamicTextIr) -> DynamicBinding {
    if is_children_expression(&dynamic.expression.code) {
        DynamicBinding::Node {
            node_id: dynamic.reference.node_id,
            expression: dynamic.expression.clone(),
        }
    } else {
        DynamicBinding::Text {
            node_id: dynamic.reference.node_id,
            expression: dynamic.expression.clone(),
            once: dynamic.once,
        }
    }
}

pub(crate) fn has_element_binding(element: &ElementIr) -> bool {
    element.attributes.iter().any(|attribute| {
        matches!(
            attribute,
            AttributeIr::Dynamic(_)
                | AttributeIr::Property(_)
                | AttributeIr::Event(_)
                | AttributeIr::Ref(_)
                | AttributeIr::Spread(_)
        )
    }) || (is_raw_text_element(&element.tag_name) && has_dynamic_raw_text(element))
}

pub(crate) fn has_dynamic_raw_text(element: &ElementIr) -> bool {
    element
        .children
        .iter()
        .any(|child| matches!(child, ChildIr::DynamicText(_)))
}

pub(crate) fn collect_text_content_parts(element: &ElementIr) -> Vec<TextContentPart> {
    element
        .children
        .iter()
        .filter_map(|child| match child {
            ChildIr::Text(text) => Some(TextContentPart::Static(text.value.clone())),
            ChildIr::DynamicText(text) => Some(TextContentPart::Dynamic {
                expression: text.expression.clone(),
                once: text.once,
            }),
            ChildIr::Element(_)
            | ChildIr::Fragment(_)
            | ChildIr::DynamicRegion(_)
            | ChildIr::Component(_)
            | ChildIr::Show(_)
            | ChildIr::For(_)
            | ChildIr::ErrorBoundary(_)
            | ChildIr::Transition(_) => None,
        })
        .collect()
}

pub(crate) enum RootBuiltin {
    ErrorBoundary(ErrorBoundaryBindingIr),
    Show(ShowBindingIr),
    For(ForBindingIr),
    Transition(TransitionBindingIr),
}

pub(crate) struct GeneratedComponent {
    pub(crate) id: NodeId,
    pub(crate) start: u32,
    pub(crate) end: u32,
    pub(crate) root: RootIr,
    pub(crate) root_id: Option<NodeId>,
    pub(crate) template_name: String,
    pub(crate) element_name: String,
    pub(crate) template_html: String,
    pub(crate) is_svg: bool,
    pub(crate) root_component: Option<ComponentBindingIr>,
    pub(crate) root_builtin: Option<RootBuiltin>,
    pub(crate) bindings: Vec<DynamicBinding>,
    pub(crate) targets: Vec<ElementTarget>,
}

impl GeneratedComponent {
    pub(crate) fn new(
        component: &ComponentIr,
        bindings: Vec<DynamicBinding>,
        locator_attribute: &str,
        names: &mut NameAllocator,
    ) -> Self {
        let template_name = names.allocate("$zeusTmpl");
        let element_name = names.allocate("$zeusEl");
        let root_id = match &component.root {
            RootIr::Element(element) => Some(element.id),
            RootIr::Fragment(_)
            | RootIr::Component(_)
            | RootIr::Show(_)
            | RootIr::For(_)
            | RootIr::ErrorBoundary(_)
            | RootIr::Transition(_) => None,
        };
        let mut seen = HashSet::new();
        let targets = bindings
            .iter()
            .filter_map(DynamicBinding::target_id)
            .filter(|id| seen.insert(*id))
            .map(|id| ElementTarget {
                id,
                name: if Some(id) == root_id {
                    element_name.clone()
                } else {
                    names.allocate("$zeusNode")
                },
            })
            .collect();

        Self {
            id: component.id,
            start: root_span(&component.root).start.offset,
            end: root_span(&component.root).end.offset,
            root: component.root.clone(),
            root_id,
            template_name,
            element_name,
            template_html: render_template(&component.root, locator_attribute),
            is_svg: matches!(&component.root, RootIr::Element(element) if is_svg_element(&element.tag_name)),
            root_component: match &component.root {
                RootIr::Component(component) => Some(component.clone()),
                RootIr::Element(_)
                | RootIr::Fragment(_)
                | RootIr::Show(_)
                | RootIr::For(_)
                | RootIr::ErrorBoundary(_)
                | RootIr::Transition(_) => None,
            },
            root_builtin: match &component.root {
                RootIr::Show(show) => Some(RootBuiltin::Show(show.clone())),
                RootIr::For(for_binding) => Some(RootBuiltin::For(for_binding.clone())),
                RootIr::ErrorBoundary(boundary) => {
                    Some(RootBuiltin::ErrorBoundary(boundary.clone()))
                }
                RootIr::Transition(transition) => Some(RootBuiltin::Transition(transition.clone())),
                RootIr::Element(_) | RootIr::Fragment(_) | RootIr::Component(_) => None,
            },
            bindings,
            targets,
        }
    }

    pub(crate) fn new_inline(
        root: &RootIr,
        bindings: Vec<DynamicBinding>,
        locator_attribute: &str,
        names: &mut NameAllocator,
    ) -> Self {
        let template_name = names.allocate("$zeusInlineTemplate");
        let element_name = names.allocate("$zeusInlineElement");
        let root_id = match root {
            RootIr::Element(element) => Some(element.id),
            RootIr::Fragment(_)
            | RootIr::Component(_)
            | RootIr::Show(_)
            | RootIr::For(_)
            | RootIr::ErrorBoundary(_)
            | RootIr::Transition(_) => None,
        };
        let mut seen = HashSet::new();
        let targets = bindings
            .iter()
            .filter_map(DynamicBinding::target_id)
            .filter(|id| seen.insert(*id))
            .map(|id| ElementTarget {
                id,
                name: if Some(id) == root_id {
                    element_name.clone()
                } else {
                    names.allocate("$zeusInlineNode")
                },
            })
            .collect();
        let root_component = match root {
            RootIr::Component(component) => Some(component.clone()),
            RootIr::Element(_)
            | RootIr::Fragment(_)
            | RootIr::Show(_)
            | RootIr::For(_)
            | RootIr::ErrorBoundary(_)
            | RootIr::Transition(_) => None,
        };
        let root_builtin = match root {
            RootIr::Show(show) => Some(RootBuiltin::Show(show.clone())),
            RootIr::For(for_binding) => Some(RootBuiltin::For(for_binding.clone())),
            RootIr::ErrorBoundary(boundary) => Some(RootBuiltin::ErrorBoundary(boundary.clone())),
            RootIr::Transition(transition) => Some(RootBuiltin::Transition(transition.clone())),
            RootIr::Element(_) | RootIr::Fragment(_) | RootIr::Component(_) => None,
        };
        let template_html = render_template(root, locator_attribute);
        let is_svg = matches!(root, RootIr::Element(element) if is_svg_element(&element.tag_name));
        Self {
            id: 0,
            start: root_span(root).start.offset,
            end: root_span(root).end.offset,
            root: root.clone(),
            root_id,
            template_name,
            element_name,
            template_html,
            is_svg,
            root_component,
            root_builtin,
            bindings,
            targets,
        }
    }

    pub(crate) fn target_name(&self, id: NodeId) -> &str {
        self.targets
            .iter()
            .find(|target| target.id == id)
            .map(|target| target.name.as_str())
            .expect("every element binding has a generated target")
    }

    pub(crate) fn id(&self) -> NodeId {
        self.id
    }
}

pub(crate) struct ElementTarget {
    pub(crate) id: NodeId,
    pub(crate) name: String,
}

pub(crate) enum DynamicBinding {
    Text {
        node_id: NodeId,
        expression: ExpressionIr,
        once: bool,
    },
    Node {
        node_id: NodeId,
        expression: ExpressionIr,
    },
    TextContent {
        target_id: NodeId,
        parts: Vec<TextContentPart>,
        once: bool,
    },
    Attribute {
        target_id: NodeId,
        name: String,
        expression: ExpressionIr,
        kind: AttributeBindingKind,
        once: bool,
    },
    Spread {
        target_id: NodeId,
        attributes: Vec<AttributeIr>,
    },
    Property {
        target_id: NodeId,
        name: String,
        expression: ExpressionIr,
        once: bool,
    },
    Event {
        target_id: NodeId,
        event_name: String,
        handler: ExpressionIr,
    },
    Ref {
        target_id: NodeId,
        expression: ExpressionIr,
    },
    Component {
        component: ComponentBindingIr,
    },
    ErrorBoundary {
        boundary: ErrorBoundaryBindingIr,
    },
    Show {
        show: ShowBindingIr,
    },
    For {
        for_binding: ForBindingIr,
    },
    Transition {
        transition: TransitionBindingIr,
    },
    DynamicRegion {
        region: DynamicRegionIr,
    },
}

impl DynamicBinding {
    pub(crate) fn target_id(&self) -> Option<NodeId> {
        match self {
            Self::Text { .. }
            | Self::Node { .. }
            | Self::Component { .. }
            | Self::ErrorBoundary { .. }
            | Self::Show { .. }
            | Self::For { .. }
            | Self::Transition { .. }
            | Self::DynamicRegion { .. } => None,
            Self::TextContent { target_id, .. }
            | Self::Attribute { target_id, .. }
            | Self::Spread { target_id, .. }
            | Self::Property { target_id, .. }
            | Self::Event { target_id, .. }
            | Self::Ref { target_id, .. } => Some(*target_id),
        }
    }
}

pub(crate) enum TextContentPart {
    Static(String),
    Dynamic {
        expression: ExpressionIr,
        once: bool,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum AttributeBindingKind {
    Attribute,
    Class,
    Style,
}

impl AttributeBindingKind {
    pub(crate) fn from_name(name: &str) -> Self {
        match name {
            "class" => Self::Class,
            "style" => Self::Style,
            _ => Self::Attribute,
        }
    }
}
