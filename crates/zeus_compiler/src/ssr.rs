//! SSR-only validation over the target-neutral IR.

use crate::{
    diagnostic::CompilerDiagnostic,
    ir::{
        AttributeIr, ChildIr, ComponentPropIr, ComponentPropValueIr, DynamicRegionExpressionIr,
        DynamicRegionValueIr, ElementIr, ErrorBoundaryFallbackIr, ModuleIr, RootIr,
    },
};

/// Reports `prop:` bindings that have no deterministic HTML representation.
///
/// Mirrors `getSSRPropertySerialization` in `@zeus-js/runtime-ssr`; keep the
/// two tables in sync.
pub(crate) fn validate_ssr_properties(
    module: &ModuleIr,
    filename: &str,
) -> Vec<CompilerDiagnostic> {
    let mut validator = PropertyValidator {
        filename,
        diagnostics: Vec::new(),
    };
    for component in &module.components {
        match &component.root {
            RootIr::Element(element) => validator.element(element),
            RootIr::Fragment(fragment) => validator.children(&fragment.children),
            RootIr::Component(component) => validator.component_props(&component.props),
            RootIr::Show(show) => {
                validator.children(&show.children);
                if let Some(fallback) = &show.fallback {
                    validator.prop_value(fallback);
                }
            }
            RootIr::For(for_binding) => validator.children(&for_binding.body),
            RootIr::ErrorBoundary(boundary) => {
                validator.children(&boundary.children);
                if let ErrorBoundaryFallbackIr::Render(fallback) = &boundary.fallback {
                    validator.children(&fallback.body);
                }
            }
            RootIr::Transition(transition) => validator.children(&transition.children),
        }
    }
    validator.diagnostics
}

struct PropertyValidator<'a> {
    filename: &'a str,
    diagnostics: Vec<CompilerDiagnostic>,
}

impl PropertyValidator<'_> {
    fn element(&mut self, element: &ElementIr) {
        for attribute in &element.attributes {
            if let AttributeIr::Property(property) = attribute
                && !is_serializable_property(&element.tag_name, &property.name)
            {
                self.diagnostics.push(
                    CompilerDiagnostic::error(
                        "ZEUS_UNSUPPORTED_SSR_PROPERTY",
                        format!(
                            "SSR cannot serialize property \"{}\" on <{}>: it has no equivalent static HTML.",
                            property.name, element.tag_name
                        ),
                        self.filename,
                        Some(property.span),
                    )
                    .with_hint(
                        "Use an attribute binding, or set the property on the client in an effect.",
                    ),
                );
            }
        }
        self.children(&element.children);
    }

    fn children(&mut self, children: &[ChildIr]) {
        for child in children {
            match child {
                ChildIr::Element(element) => self.element(element),
                ChildIr::Fragment(fragment) => self.children(&fragment.children),
                ChildIr::Component(component) => self.component_props(&component.props),
                ChildIr::Show(show) => {
                    self.children(&show.children);
                    if let Some(fallback) = &show.fallback {
                        self.prop_value(fallback);
                    }
                }
                ChildIr::For(for_binding) => self.children(&for_binding.body),
                ChildIr::ErrorBoundary(boundary) => {
                    self.children(&boundary.children);
                    if let ErrorBoundaryFallbackIr::Render(fallback) = &boundary.fallback {
                        self.children(&fallback.body);
                    }
                }
                ChildIr::Transition(transition) => self.children(&transition.children),
                ChildIr::DynamicRegion(region) => match &region.expression {
                    DynamicRegionExpressionIr::Value { .. } => {}
                    DynamicRegionExpressionIr::Conditional {
                        consequent,
                        alternate,
                        ..
                    } => {
                        self.region_value(consequent);
                        self.region_value(alternate);
                    }
                    DynamicRegionExpressionIr::Logical { right, .. } => self.region_value(right),
                    DynamicRegionExpressionIr::ArrayMap { body, .. } => self.children(body),
                    DynamicRegionExpressionIr::ArrayLiteral { items } => {
                        for item in items {
                            self.region_value(item);
                        }
                    }
                },
                ChildIr::Text(_) | ChildIr::DynamicText(_) => {}
            }
        }
    }

    fn component_props(&mut self, props: &[ComponentPropIr]) {
        for prop in props {
            if let ComponentPropIr::Named(prop) = prop {
                self.prop_value(&prop.value);
            }
        }
    }

    fn prop_value(&mut self, value: &ComponentPropValueIr) {
        if let ComponentPropValueIr::Children(children) = value {
            self.children(children);
        }
    }

    fn region_value(&mut self, value: &DynamicRegionValueIr) {
        if let DynamicRegionValueIr::Children(children) = value {
            self.children(children);
        }
    }
}

fn is_serializable_property(tag_name: &str, name: &str) -> bool {
    let tag = tag_name.to_ascii_lowercase();
    let tag = tag.as_str();
    match name {
        "tabIndex" => true,
        "htmlFor" => tag == "label",
        "value" => matches!(tag, "button" | "input" | "option" | "textarea"),
        "checked" => tag == "input",
        "disabled" => matches!(
            tag,
            "button" | "fieldset" | "input" | "optgroup" | "option" | "select" | "textarea"
        ),
        "multiple" => matches!(tag, "input" | "select"),
        "readOnly" => matches!(tag, "input" | "textarea"),
        "selected" => tag == "option",
        _ => false,
    }
}
