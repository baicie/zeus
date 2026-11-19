//! Facts read from the IR before emission.
//!
//! These walk the lowered module to answer questions codegen will ask: which
//! events can be delegated to the document, which attribute names the author
//! already used (so the locator attribute can avoid them), and which of the
//! builtin bindings introduce helper usage.
//!
//! They are analysis, not emission: nothing here writes output. The reason they
//! live apart from the emitters is that a rule change — say, a new event that
//! does not bubble — should be reviewable without reading five thousand lines
//! of code generation.

use std::collections::{BTreeSet, HashSet};

use crate::ir::{
    AttributeIr, ChildIr, ComponentBindingIr, ComponentPropIr, ComponentPropValueIr,
    DynamicRegionExpressionIr, DynamicRegionIr, DynamicRegionValueIr, ElementIr,
    ErrorBoundaryBindingIr, ErrorBoundaryFallbackIr, FragmentIr, ModuleIr, RootIr, ShowBindingIr,
};

use super::{RuntimeHelper, collect_builtin_helper_usage};

pub(super) fn collect_delegated_events(module: &ModuleIr, enable_delegation: bool) -> Vec<String> {
    if !enable_delegation {
        return Vec::new();
    }

    let mut names = BTreeSet::new();
    for component in &module.components {
        collect_root_delegated_events(&component.root, &mut names);
    }
    names.into_iter().collect()
}

fn collect_root_delegated_events(root: &RootIr, names: &mut BTreeSet<String>) {
    match root {
        RootIr::Element(element) => collect_element_delegated_events(element, names),
        RootIr::Fragment(fragment) => collect_child_delegated_events(&fragment.children, names),
        RootIr::Component(component) => collect_component_delegated_events(component, names),
        RootIr::ErrorBoundary(boundary) => collect_error_boundary_delegated_events(boundary, names),
        RootIr::Show(show) => collect_show_delegated_events(show, names),
        RootIr::For(for_binding) => collect_child_delegated_events(&for_binding.body, names),
        RootIr::Transition(transition) => {
            collect_child_delegated_events(&transition.children, names);
        }
    }
}

fn collect_element_delegated_events(element: &ElementIr, names: &mut BTreeSet<String>) {
    for attribute in &element.attributes {
        if let AttributeIr::Event(event) = attribute
            && is_delegatable_event(&event.event_name)
        {
            names.insert(event.event_name.clone());
        }
    }
    collect_child_delegated_events(&element.children, names);
}

/// Events that do not bubble to `document` (or only fire on `window`) cannot be
/// observed by the delegated document listener and are bound on the element.
/// Hyphenated or case-sensitive names are custom events, which the dispatcher
/// may send without bubbling, so they are bound on the element too.
pub(super) fn is_delegatable_event(event_name: &str) -> bool {
    if event_name
        .bytes()
        .any(|byte| byte == b'-' || byte.is_ascii_uppercase())
    {
        return false;
    }
    !matches!(
        event_name,
        "abort"
            | "beforeprint"
            | "beforetoggle"
            | "beforeunload"
            | "cancel"
            | "canplay"
            | "canplaythrough"
            | "close"
            | "cuechange"
            | "durationchange"
            | "emptied"
            | "ended"
            | "error"
            | "invalid"
            | "load"
            | "loadeddata"
            | "loadedmetadata"
            | "loadend"
            | "loadstart"
            | "mouseenter"
            | "mouseleave"
            | "pause"
            | "play"
            | "playing"
            | "pointerenter"
            | "pointerleave"
            | "progress"
            | "ratechange"
            | "resize"
            | "scroll"
            | "scrollend"
            | "seeked"
            | "seeking"
            | "slotchange"
            | "stalled"
            | "suspend"
            | "timeupdate"
            | "toggle"
            | "unload"
            | "volumechange"
            | "waiting"
    )
}

fn collect_component_delegated_events(
    component: &ComponentBindingIr,
    names: &mut BTreeSet<String>,
) {
    for prop in component.props.iter().filter_map(ComponentPropIr::named) {
        if let ComponentPropValueIr::Children(children) = &prop.value {
            collect_child_delegated_events(children, names);
        }
    }
}

fn collect_error_boundary_delegated_events(
    boundary: &ErrorBoundaryBindingIr,
    names: &mut BTreeSet<String>,
) {
    collect_child_delegated_events(&boundary.children, names);
    if let ErrorBoundaryFallbackIr::Render(render) = &boundary.fallback {
        collect_child_delegated_events(&render.body, names);
    }
}

pub(super) fn collect_error_boundary_attribute_names(
    boundary: &ErrorBoundaryBindingIr,
    names: &mut HashSet<String>,
) {
    collect_builtin_attribute_names(&boundary.children, names);
    if let ErrorBoundaryFallbackIr::Render(render) = &boundary.fallback {
        collect_builtin_attribute_names(&render.body, names);
    }
}

pub(super) fn collect_error_boundary_helper_usage(
    boundary: &ErrorBoundaryBindingIr,
    usage: &mut HashSet<RuntimeHelper>,
) {
    usage.insert(RuntimeHelper::ErrorBoundary);
    collect_builtin_helper_usage(&boundary.children, usage);
    if let ErrorBoundaryFallbackIr::Render(render) = &boundary.fallback {
        collect_builtin_helper_usage(&render.body, usage);
    }
}

fn collect_show_delegated_events(show: &ShowBindingIr, names: &mut BTreeSet<String>) {
    collect_child_delegated_events(&show.children, names);
    if let Some(ComponentPropValueIr::Children(children)) = &show.fallback {
        collect_child_delegated_events(children, names);
    }
}

pub(super) fn collect_child_delegated_events(children: &[ChildIr], names: &mut BTreeSet<String>) {
    for child in children {
        match child {
            ChildIr::Element(element) => collect_element_delegated_events(element, names),
            ChildIr::Fragment(fragment) => {
                collect_child_delegated_events(&fragment.children, names);
            }
            ChildIr::Component(component) => collect_component_delegated_events(component, names),
            ChildIr::ErrorBoundary(boundary) => {
                collect_error_boundary_delegated_events(boundary, names);
            }
            ChildIr::Show(show) => collect_show_delegated_events(show, names),
            ChildIr::For(for_binding) => {
                collect_child_delegated_events(&for_binding.body, names);
            }
            ChildIr::Transition(transition) => {
                collect_child_delegated_events(&transition.children, names);
            }
            ChildIr::DynamicRegion(region) => {
                collect_dynamic_region_delegated_events(region, names);
            }
            ChildIr::Text(_) | ChildIr::DynamicText(_) => {}
        }
    }
}

pub(super) fn collect_dynamic_region_delegated_events(
    region: &DynamicRegionIr,
    names: &mut BTreeSet<String>,
) {
    match &region.expression {
        DynamicRegionExpressionIr::Value { .. } => {}
        DynamicRegionExpressionIr::Conditional {
            consequent,
            alternate,
            ..
        } => {
            collect_dynamic_region_value_delegated_events(consequent, names);
            collect_dynamic_region_value_delegated_events(alternate, names);
        }
        DynamicRegionExpressionIr::Logical { right, .. } => {
            collect_dynamic_region_value_delegated_events(right, names);
        }
        DynamicRegionExpressionIr::ArrayMap { body, .. } => {
            collect_child_delegated_events(body, names);
        }
        DynamicRegionExpressionIr::ArrayLiteral { items } => {
            for item in items {
                collect_dynamic_region_value_delegated_events(item, names);
            }
        }
    }
}

fn collect_dynamic_region_value_delegated_events(
    value: &DynamicRegionValueIr,
    names: &mut BTreeSet<String>,
) {
    if let DynamicRegionValueIr::Children(children) = value {
        collect_child_delegated_events(children, names);
    }
}

pub(super) fn allocate_locator_attribute(module: &ModuleIr) -> String {
    let mut used = HashSet::new();
    for component in &module.components {
        collect_root_attribute_names(&component.root, &mut used);
    }

    let base = "data-zeus-node";
    if !used.contains(base) {
        return base.into();
    }
    for suffix in 0_u32.. {
        let candidate = format!("{base}-{suffix}");
        if !used.contains(&candidate) {
            return candidate;
        }
    }

    unreachable!("u32 locator suffixes cannot be exhausted in one module")
}

fn collect_root_attribute_names(root: &RootIr, names: &mut HashSet<String>) {
    match root {
        RootIr::Element(element) => collect_attribute_names(element, names),
        RootIr::Fragment(fragment) => collect_fragment_attribute_names(fragment, names),
        RootIr::Component(component) => collect_component_attribute_names(component, names),
        RootIr::ErrorBoundary(boundary) => collect_error_boundary_attribute_names(boundary, names),
        RootIr::Show(show) => collect_show_attribute_names(show, names),
        RootIr::For(for_binding) => collect_builtin_attribute_names(&for_binding.body, names),
        RootIr::Transition(transition) => {
            collect_builtin_attribute_names(&transition.children, names);
        }
    }
}

fn collect_attribute_names(element: &ElementIr, names: &mut HashSet<String>) {
    for attribute in &element.attributes {
        let name = match attribute {
            AttributeIr::Static(attribute) => &attribute.name,
            AttributeIr::Dynamic(attribute) => &attribute.name,
            AttributeIr::Property(attribute) => &attribute.name,
            AttributeIr::Event(_) | AttributeIr::Ref(_) | AttributeIr::Spread(_) => continue,
        };
        names.insert(name.to_ascii_lowercase());
    }
    for child in &element.children {
        if let ChildIr::Element(element) = child {
            collect_attribute_names(element, names);
        } else if let ChildIr::Fragment(fragment) = child {
            collect_fragment_attribute_names(fragment, names);
        } else if let ChildIr::Component(component) = child {
            collect_component_attribute_names(component, names);
        } else if let ChildIr::ErrorBoundary(boundary) = child {
            collect_error_boundary_attribute_names(boundary, names);
        } else if let ChildIr::Show(show) = child {
            collect_show_attribute_names(show, names);
        } else if let ChildIr::For(for_binding) = child {
            collect_builtin_attribute_names(&for_binding.body, names);
        } else if let ChildIr::Transition(transition) = child {
            collect_builtin_attribute_names(&transition.children, names);
        } else if let ChildIr::DynamicRegion(region) = child {
            collect_dynamic_region_attribute_names(region, names);
        }
    }
}

fn collect_fragment_attribute_names(fragment: &FragmentIr, names: &mut HashSet<String>) {
    for child in &fragment.children {
        match child {
            ChildIr::Element(element) => collect_attribute_names(element, names),
            ChildIr::Fragment(fragment) => collect_fragment_attribute_names(fragment, names),
            ChildIr::Component(component) => collect_component_attribute_names(component, names),
            ChildIr::ErrorBoundary(boundary) => {
                collect_error_boundary_attribute_names(boundary, names);
            }
            ChildIr::Show(show) => collect_show_attribute_names(show, names),
            ChildIr::For(for_binding) => collect_builtin_attribute_names(&for_binding.body, names),
            ChildIr::Transition(transition) => {
                collect_builtin_attribute_names(&transition.children, names);
            }
            ChildIr::DynamicRegion(region) => collect_dynamic_region_attribute_names(region, names),
            ChildIr::Text(_) | ChildIr::DynamicText(_) => {}
        }
    }
}

fn collect_component_attribute_names(component: &ComponentBindingIr, names: &mut HashSet<String>) {
    for prop in component.props.iter().filter_map(ComponentPropIr::named) {
        if let ComponentPropValueIr::Children(children) = &prop.value {
            for child in children {
                match child {
                    ChildIr::Element(element) => collect_attribute_names(element, names),
                    ChildIr::Fragment(fragment) => {
                        collect_fragment_attribute_names(fragment, names);
                    }
                    ChildIr::Component(component) => {
                        collect_component_attribute_names(component, names);
                    }
                    ChildIr::ErrorBoundary(boundary) => {
                        collect_error_boundary_attribute_names(boundary, names);
                    }
                    ChildIr::Show(show) => collect_show_attribute_names(show, names),
                    ChildIr::For(for_binding) => {
                        collect_builtin_attribute_names(&for_binding.body, names);
                    }
                    ChildIr::Transition(transition) => {
                        collect_builtin_attribute_names(&transition.children, names);
                    }
                    ChildIr::DynamicRegion(region) => {
                        collect_dynamic_region_attribute_names(region, names);
                    }
                    ChildIr::Text(_) | ChildIr::DynamicText(_) => {}
                }
            }
        }
    }
}

fn collect_builtin_attribute_names(children: &[ChildIr], names: &mut HashSet<String>) {
    for child in children {
        match child {
            ChildIr::Element(element) => collect_attribute_names(element, names),
            ChildIr::Fragment(fragment) => collect_fragment_attribute_names(fragment, names),
            ChildIr::Component(component) => collect_component_attribute_names(component, names),
            ChildIr::ErrorBoundary(boundary) => {
                collect_error_boundary_attribute_names(boundary, names);
            }
            ChildIr::Show(show) => collect_show_attribute_names(show, names),
            ChildIr::For(for_binding) => collect_builtin_attribute_names(&for_binding.body, names),
            ChildIr::Transition(transition) => {
                collect_builtin_attribute_names(&transition.children, names);
            }
            ChildIr::DynamicRegion(region) => collect_dynamic_region_attribute_names(region, names),
            ChildIr::Text(_) | ChildIr::DynamicText(_) => {}
        }
    }
}

fn collect_show_attribute_names(show: &ShowBindingIr, names: &mut HashSet<String>) {
    collect_builtin_attribute_names(&show.children, names);
    if let Some(ComponentPropValueIr::Children(fallback)) = &show.fallback {
        collect_builtin_attribute_names(fallback, names);
    }
}

fn collect_dynamic_region_attribute_names(region: &DynamicRegionIr, names: &mut HashSet<String>) {
    match &region.expression {
        DynamicRegionExpressionIr::Value { .. } => {}
        DynamicRegionExpressionIr::Conditional {
            consequent,
            alternate,
            ..
        } => {
            collect_dynamic_region_value_attribute_names(consequent, names);
            collect_dynamic_region_value_attribute_names(alternate, names);
        }
        DynamicRegionExpressionIr::Logical { right, .. } => {
            collect_dynamic_region_value_attribute_names(right, names);
        }
        DynamicRegionExpressionIr::ArrayMap { body, .. } => {
            collect_builtin_attribute_names(body, names);
        }
        DynamicRegionExpressionIr::ArrayLiteral { items } => {
            for item in items {
                collect_dynamic_region_value_attribute_names(item, names);
            }
        }
    }
}

fn collect_dynamic_region_value_attribute_names(
    value: &DynamicRegionValueIr,
    names: &mut HashSet<String>,
) {
    if let DynamicRegionValueIr::Children(children) = value {
        collect_builtin_attribute_names(children, names);
    }
}
