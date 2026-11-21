//! The DOM emit family.
//!
//! Forty-two functions that write DOM code, plus the element finders the
//! hydration path uses. They form a **single recursive unit**: walking a child
//! can reach `emit_inline_root`, which builds a component and calls
//! `emit_component`, which walks that component's children again.
//!
//! That recursion is why earlier attempts to carve bindings and hydration into
//! separate modules failed. The call graph has no cut — every proper subset
//! either leaves a callee behind or needs a function pointer pointing back into
//! the caller. Keeping them in one module makes the import graph a DAG again
//! while leaving the call graph exactly as it was.
//!
//! **What this module is not:** a layer. It is one target's emitter, whole. The
//! orchestrator decides *whether* and *where* to emit; this decides *what* the
//! emitted code is. Nothing here reads `SourceIndex`, and nothing here decides
//! module-level ordering.

use super::names::RuntimeNames;
use crate::codegen::infra::{
    CodeWriter, ForAccessorScope, NameAllocator, attribute_key, element_has_spread,
    is_static_expression, object_key, quote_js,
};
use crate::ir::{
    AttributeIr, ChildIr, ComponentBindingIr, ComponentPropIr, ComponentPropValueIr,
    DynamicRegionExpressionIr, DynamicRegionIr, DynamicRegionValueIr, ElementIr,
    ErrorBoundaryBindingIr, ErrorBoundaryFallbackIr, ExpressionForm, ExpressionIr, ForBindingIr,
    FragmentIr, NodeId, RootIr, ShowBindingIr, StaticAttributeValue, TransitionBindingIr,
    TransitionOptionIr,
};
use crate::support::hydration::{
    component_root_marker_id, element_marker_id, node_marker_id, text_marker_id,
};

use super::model::{
    AttributeBindingKind, DynamicBinding, GeneratedComponent, RootBuiltin, TextContentPart,
    collect_root_dynamic_bindings,
};

/// A hydration marker pair for one dynamic position.
pub(crate) struct EmittedMarker {
    pub(crate) marker_name: String,
    pub(crate) text_name: String,
}

pub(crate) fn emit_component(
    writer: &mut CodeWriter,
    component: &GeneratedComponent,
    runtime: &RuntimeNames,
    locator_attribute: &str,
    names: &mut NameAllocator,
    auto_hydrate: bool,
) {
    if auto_hydrate {
        emit_auto_hydrated_component(writer, component, runtime, locator_attribute, names);
    } else {
        emit_component_create_body(writer, component, runtime, locator_attribute, names);
    }
}

pub(crate) fn emit_auto_hydrated_component(
    writer: &mut CodeWriter,
    component: &GeneratedComponent,
    runtime: &RuntimeNames,
    locator_attribute: &str,
    names: &mut NameAllocator,
) {
    let handle = names.allocate("$zeusHydration");
    writer.push(runtime.auto_hydrate_component());
    writer.push("(");
    writer.push(&component.id().to_string());
    writer.push(", ");
    writer.push(&quote_js(&component_root_marker_id(component.id())));
    writer.push(", (");
    writer.push(&handle);
    writer.push(") => {\n");
    emit_auto_hydration_root(writer, component, &handle, runtime, names);
    writer.push("}, () => ");
    emit_component_create_body(writer, component, runtime, locator_attribute, names);
    writer.push(")");
}

pub(crate) fn emit_auto_hydration_root(
    writer: &mut CodeWriter,
    component: &GeneratedComponent,
    handle: &str,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    emit_hydration_element_targets(writer, component, handle);

    match &component.root {
        RootIr::Component(child) => emit_auto_hydration_component_child(
            writer,
            handle,
            component.id(),
            child,
            runtime,
            names,
        ),
        RootIr::Show(show) => {
            let marker = names.allocate("$zeusHydrationRegion");
            emit_auto_hydration_region(
                writer,
                handle,
                component.id(),
                "show",
                show.id,
                &marker,
                |writer, marker| {
                    emit_show_mount_call(
                        writer,
                        &format!("{marker}.parentNode"),
                        marker,
                        show,
                        runtime,
                        names,
                    );
                },
            );
        }
        RootIr::For(for_binding) => {
            let marker = names.allocate("$zeusHydrationRegion");
            emit_auto_hydration_region(
                writer,
                handle,
                component.id(),
                "for",
                for_binding.id,
                &marker,
                |writer, marker| {
                    emit_for_mount_call(
                        writer,
                        &format!("{marker}.parentNode"),
                        marker,
                        for_binding,
                        runtime,
                        names,
                    );
                },
            );
        }
        RootIr::Transition(transition) => {
            let marker = names.allocate("$zeusHydrationRegion");
            emit_auto_hydration_region(
                writer,
                handle,
                component.id(),
                "transition",
                transition.id,
                &marker,
                |writer, marker| {
                    emit_transition_mount_call(
                        writer,
                        &format!("{marker}.parentNode"),
                        marker,
                        transition,
                        runtime,
                        names,
                    );
                },
            );
        }
        RootIr::ErrorBoundary(_) | RootIr::Element(_) | RootIr::Fragment(_) => {}
    }

    for binding in &component.bindings {
        emit_auto_hydration_binding(
            writer,
            component.id(),
            binding,
            component,
            handle,
            runtime,
            names,
        );
    }
}

pub(crate) fn emit_hydration_element_targets(
    writer: &mut CodeWriter,
    component: &GeneratedComponent,
    handle: &str,
) {
    for target in &component.targets {
        let Some(element) = find_element_in_root(&component.root, target.id) else {
            continue;
        };
        writer.push("const ");
        writer.push(&target.name);
        writer.push(" = ");
        writer.push(handle);
        writer.push(".element(");
        writer.push(&quote_js(&element_marker_id(component.id(), target.id)));
        writer.push(", ");
        emit_hydration_element_shape(writer, element);
        writer.push(");\n");
    }
}

pub(crate) fn emit_hydration_element_shape(writer: &mut CodeWriter, element: &ElementIr) {
    writer.push("{ tag: ");
    writer.push(&quote_js(&element.tag_name));

    if !element_has_spread(element) {
        let static_attributes = element
            .attributes
            .iter()
            .filter_map(|attribute| match attribute {
                AttributeIr::Static(attribute) => Some(attribute),
                _ => None,
            })
            .collect::<Vec<_>>();
        if !static_attributes.is_empty() {
            writer.push(", staticAttributes: [");
            for (index, attribute) in static_attributes.iter().enumerate() {
                if index > 0 {
                    writer.push(", ");
                }
                writer.push("[");
                writer.push(&quote_js(&attribute.name));
                writer.push(", ");
                match &attribute.value {
                    StaticAttributeValue::String(value) => writer.push(&quote_js(value)),
                    StaticAttributeValue::Boolean => writer.push("\"\""),
                }
                writer.push("]");
            }
            writer.push("]");
        }
    }

    if !element.children.is_empty()
        && element
            .children
            .iter()
            .all(|child| matches!(child, ChildIr::Element(_)))
    {
        writer.push(", childTags: [");
        for (index, child) in element.children.iter().enumerate() {
            if index > 0 {
                writer.push(", ");
            }
            let ChildIr::Element(child) = child else {
                unreachable!("childTags only contains element children")
            };
            writer.push(&quote_js(&child.tag_name));
        }
        writer.push("]");
    }

    writer.push(" }");
}

pub(crate) fn find_element_in_root(root: &RootIr, id: NodeId) -> Option<&ElementIr> {
    match root {
        RootIr::Element(element) => find_element_in_element(element, id),
        RootIr::Fragment(fragment) => find_element_in_children(&fragment.children, id),
        RootIr::Component(component) => find_element_in_component(component, id),
        RootIr::Show(show) => find_element_in_children(&show.children, id).or_else(|| {
            show.fallback.as_ref().and_then(|fallback| match fallback {
                ComponentPropValueIr::Children(children) => find_element_in_children(children, id),
                ComponentPropValueIr::Expression(_) => None,
            })
        }),
        RootIr::For(for_binding) => find_element_in_children(&for_binding.body, id),
        RootIr::Transition(transition) => find_element_in_children(&transition.children, id),
        RootIr::ErrorBoundary(boundary) => find_element_in_children(&boundary.children, id),
    }
}

pub(crate) fn find_element_in_component(
    component: &ComponentBindingIr,
    id: NodeId,
) -> Option<&ElementIr> {
    component
        .props
        .iter()
        .filter_map(ComponentPropIr::named)
        .find_map(|prop| match &prop.value {
            ComponentPropValueIr::Children(children) => find_element_in_children(children, id),
            ComponentPropValueIr::Expression(_) => None,
        })
}

pub(crate) fn find_element_in_children(children: &[ChildIr], id: NodeId) -> Option<&ElementIr> {
    children.iter().find_map(|child| match child {
        ChildIr::Element(element) => find_element_in_element(element, id),
        ChildIr::Fragment(fragment) => find_element_in_children(&fragment.children, id),
        ChildIr::Component(component) => find_element_in_component(component, id),
        ChildIr::Show(show) => find_element_in_children(&show.children, id).or_else(|| {
            show.fallback.as_ref().and_then(|fallback| match fallback {
                ComponentPropValueIr::Children(children) => find_element_in_children(children, id),
                ComponentPropValueIr::Expression(_) => None,
            })
        }),
        ChildIr::For(for_binding) => find_element_in_children(&for_binding.body, id),
        ChildIr::Transition(transition) => find_element_in_children(&transition.children, id),
        ChildIr::ErrorBoundary(boundary) => find_element_in_children(&boundary.children, id),
        ChildIr::DynamicRegion(_) | ChildIr::Text(_) | ChildIr::DynamicText(_) => None,
    })
}

pub(crate) fn find_element_in_element(element: &ElementIr, id: NodeId) -> Option<&ElementIr> {
    if element.id == id {
        return Some(element);
    }
    find_element_in_children(&element.children, id)
}

pub(crate) fn emit_auto_hydration_component_child(
    writer: &mut CodeWriter,
    handle: &str,
    component_id: NodeId,
    child: &ComponentBindingIr,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    let marker_id = node_marker_id(component_id, "component", child.id);
    if child.kind == "Slot" {
        writer.push(handle);
        writer.push(".slot(");
        writer.push(&quote_js(&marker_id));
        writer.push(");\n");
        return;
    }
    writer.push(handle);
    writer.push(".child(");
    writer.push(&quote_js(&marker_id));
    writer.push(", () => ");
    emit_component_call(writer, child, runtime, names);
    writer.push(");\n");
}

fn emit_auto_hydration_region<F>(
    writer: &mut CodeWriter,
    handle: &str,
    component_id: NodeId,
    kind: &str,
    node_id: NodeId,
    marker: &str,
    mount: F,
) where
    F: FnOnce(&mut CodeWriter, &str),
{
    writer.push("const ");
    writer.push(marker);
    writer.push(" = ");
    writer.push(handle);
    writer.push(".region(");
    writer.push(&quote_js(&node_marker_id(component_id, kind, node_id)));
    writer.push(");\n");
    writer.push(handle);
    writer.push(".mount(() => {\n");
    mount(writer, marker);
    writer.push("});\n");
}

// Kept as one exhaustive match so every binding kind stays visible next to the
// hydration protocol it emits; splitting it would spread one contract over many
// small functions.
#[allow(clippy::too_many_lines)]
pub(crate) fn emit_auto_hydration_binding(
    writer: &mut CodeWriter,
    component_id: NodeId,
    binding: &DynamicBinding,
    component: &GeneratedComponent,
    handle: &str,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    match binding {
        DynamicBinding::Text {
            node_id,
            expression,
            once,
        } => {
            let expected = names.allocate("$zeusHydrationExpected");
            let text = names.allocate("$zeusHydrationText");
            writer.push("const ");
            writer.push(&expected);
            writer.push(" = ");
            writer.push_dom_expression(expression);
            writer.push(";\nconst ");
            writer.push(&text);
            writer.push(" = ");
            writer.push(handle);
            writer.push(".text(");
            writer.push(&quote_js(&text_marker_id(component_id, *node_id)));
            writer.push(", ");
            writer.push(&expected);
            writer.push(");\n");
            writer.push(runtime.bind_text());
            writer.push("(");
            writer.push(&text);
            writer.push(", () => (");
            writer.push_dom_expression(expression);
            writer.push(")");
            if *once {
                writer.push(", true");
            }
            writer.push(");\n");
        }
        DynamicBinding::Node {
            node_id,
            expression,
        } => {
            let region = names.allocate("$zeusHydrationTextRegion");
            writer.push("const ");
            writer.push(&region);
            writer.push(" = ");
            writer.push(handle);
            writer.push(".textRegion(");
            writer.push(&quote_js(&text_marker_id(component_id, *node_id)));
            writer.push(");\n");
            writer.push(handle);
            writer.push(".mountText(");
            writer.push(&region);
            writer.push(", () => (");
            writer.push_dom_expression(expression);
            writer.push("));\n");
        }
        DynamicBinding::TextContent {
            target_id,
            parts,
            once,
        } => emit_text_content_binding(
            writer,
            component.target_name(*target_id),
            parts,
            *once,
            runtime,
        ),
        DynamicBinding::Attribute {
            target_id,
            name,
            expression,
            kind,
            once,
        } => emit_attribute_binding(
            writer,
            component.target_name(*target_id),
            name,
            expression,
            *kind,
            *once,
            runtime,
        ),
        DynamicBinding::Spread {
            target_id,
            attributes,
        } => emit_spread_binding(
            writer,
            component.target_name(*target_id),
            attributes,
            runtime,
            names,
        ),
        DynamicBinding::Property {
            target_id,
            name,
            expression,
            once,
        } => emit_property_binding(
            writer,
            component.target_name(*target_id),
            name,
            expression,
            *once,
            runtime,
        ),
        DynamicBinding::Event {
            target_id,
            event_name,
            handler,
        } => emit_event_binding(
            writer,
            component.target_name(*target_id),
            event_name,
            handler,
            runtime,
            names,
        ),
        DynamicBinding::Ref {
            target_id,
            expression,
        } => emit_ref_binding(
            writer,
            component.target_name(*target_id),
            expression,
            runtime,
        ),
        DynamicBinding::Component { component: child } => {
            emit_auto_hydration_component_child(
                writer,
                handle,
                component_id,
                child,
                runtime,
                names,
            );
        }
        DynamicBinding::ErrorBoundary { boundary } => {
            let marker_id = node_marker_id(component_id, "region", boundary.id);
            writer.push(handle);
            writer.push(".unsupported(");
            writer.push(&quote_js(&marker_id));
            writer.push(");\n");
        }
        DynamicBinding::Show { show } => {
            let marker = names.allocate("$zeusHydrationRegion");
            emit_auto_hydration_region(
                writer,
                handle,
                component_id,
                "show",
                show.id,
                &marker,
                |writer, marker| {
                    emit_show_mount_call(
                        writer,
                        &format!("{marker}.parentNode"),
                        marker,
                        show,
                        runtime,
                        names,
                    );
                },
            );
        }
        DynamicBinding::For { for_binding } => {
            let marker = names.allocate("$zeusHydrationRegion");
            emit_auto_hydration_region(
                writer,
                handle,
                component_id,
                "for",
                for_binding.id,
                &marker,
                |writer, marker| {
                    emit_for_mount_call(
                        writer,
                        &format!("{marker}.parentNode"),
                        marker,
                        for_binding,
                        runtime,
                        names,
                    );
                },
            );
        }
        DynamicBinding::Transition { transition } => {
            let marker = names.allocate("$zeusHydrationRegion");
            emit_auto_hydration_region(
                writer,
                handle,
                component_id,
                "transition",
                transition.id,
                &marker,
                |writer, marker| {
                    emit_transition_mount_call(
                        writer,
                        &format!("{marker}.parentNode"),
                        marker,
                        transition,
                        runtime,
                        names,
                    );
                },
            );
        }
        DynamicBinding::DynamicRegion { region } => {
            let marker = names.allocate("$zeusHydrationRegion");
            writer.push("const ");
            writer.push(&marker);
            writer.push(" = ");
            writer.push(handle);
            writer.push(".region(");
            writer.push(&quote_js(&node_marker_id(
                component_id,
                "region",
                region.id,
            )));
            writer.push(");\n");
            writer.push(handle);
            writer.push(".mount(() => {\n");
            writer.push(runtime.mount_dynamic());
            writer.push("(");
            writer.push(&marker);
            writer.push(".parentNode, ");
            writer.push(&marker);
            writer.push(", () => ");
            emit_dynamic_region_value(writer, &region.expression, runtime, names);
            writer.push(");\n});\n");
        }
    }
}

pub(crate) fn emit_spread_binding(
    writer: &mut CodeWriter,
    target: &str,
    attributes: &[AttributeIr],
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    writer.push(runtime.bind_spread());
    writer.push("(");
    writer.push(target);
    writer.push(", ");
    emit_attribute_sources(writer, attributes, Some(names));
    let once = attributes
        .iter()
        .enumerate()
        .filter_map(|(index, attr)| match attr {
            AttributeIr::Dynamic(attr) if attr.once => Some(index),
            AttributeIr::Property(attr) if attr.once => Some(index),
            _ => None,
        })
        .collect::<Vec<_>>();
    if !once.is_empty() {
        writer.push(", [");
        for (index, value) in once.iter().enumerate() {
            if index > 0 {
                writer.push(", ");
            }
            writer.push(&value.to_string());
        }
        writer.push("]");
    }
    writer.push(");\n");
}

#[allow(clippy::too_many_lines)]
pub(crate) fn emit_component_create_body(
    writer: &mut CodeWriter,
    component: &GeneratedComponent,
    runtime: &RuntimeNames,
    locator_attribute: &str,
    names: &mut NameAllocator,
) {
    if component.bindings.is_empty() {
        if let Some(root_component) = &component.root_component {
            emit_component_call(writer, root_component, runtime, names);
            return;
        }
        if let Some(root_builtin) = &component.root_builtin {
            emit_root_builtin_call(writer, root_builtin, runtime, names);
            return;
        }
        writer.push(&component.template_name);
        writer.push("()");
        if component.root_id.is_some() {
            writer.push(".firstChild");
        }
        return;
    }

    writer.push("(() => {\nconst ");
    writer.push(&component.element_name);
    writer.push(" = ");
    writer.push(&component.template_name);
    writer.push("()");
    if component.root_id.is_some() {
        writer.push(".firstChild");
    }
    writer.push(";\n");

    emit_element_targets(writer, component, locator_attribute);

    let markers = emit_dynamic_markers(writer, component, names);
    let mut marker_index = 0;

    for binding in &component.bindings {
        match binding {
            DynamicBinding::Text {
                expression, once, ..
            } => {
                emit_text_binding(writer, expression, *once, &markers[marker_index], runtime);
                marker_index += 1;
            }
            DynamicBinding::Node { expression, .. } => {
                emit_node_binding(writer, expression, &markers[marker_index], runtime);
                marker_index += 1;
            }
            DynamicBinding::TextContent {
                target_id,
                parts,
                once,
            } => {
                emit_text_content_binding(
                    writer,
                    component.target_name(*target_id),
                    parts,
                    *once,
                    runtime,
                );
            }
            DynamicBinding::Attribute {
                target_id,
                name,
                expression,
                kind,
                once,
            } => emit_attribute_binding(
                writer,
                component.target_name(*target_id),
                name,
                expression,
                *kind,
                *once,
                runtime,
            ),
            DynamicBinding::Spread {
                target_id,
                attributes,
            } => {
                writer.push(runtime.bind_spread());
                writer.push("(");
                writer.push(component.target_name(*target_id));
                writer.push(", ");
                emit_attribute_sources(writer, attributes, Some(names));
                let once = attributes
                    .iter()
                    .enumerate()
                    .filter_map(|(index, attr)| match attr {
                        AttributeIr::Dynamic(attr) if attr.once => Some(index),
                        AttributeIr::Property(attr) if attr.once => Some(index),
                        _ => None,
                    })
                    .collect::<Vec<_>>();
                if !once.is_empty() {
                    writer.push(", [");
                    for (index, value) in once.iter().enumerate() {
                        if index > 0 {
                            writer.push(", ");
                        }
                        writer.push(&value.to_string());
                    }
                    writer.push("]");
                }
                writer.push(");\n");
            }
            DynamicBinding::Property {
                target_id,
                name,
                expression,
                once,
            } => emit_property_binding(
                writer,
                component.target_name(*target_id),
                name,
                expression,
                *once,
                runtime,
            ),
            DynamicBinding::Event {
                target_id,
                event_name,
                handler,
            } => emit_event_binding(
                writer,
                component.target_name(*target_id),
                event_name,
                handler,
                runtime,
                names,
            ),
            DynamicBinding::Ref {
                target_id,
                expression,
            } => emit_ref_binding(
                writer,
                component.target_name(*target_id),
                expression,
                runtime,
            ),
            DynamicBinding::Component { component: child } => {
                emit_component_binding(writer, &markers[marker_index], child, runtime, names);
                marker_index += 1;
            }
            DynamicBinding::ErrorBoundary { boundary } => {
                let marker = &markers[marker_index];
                writer.push(runtime.insert());
                writer.push("(");
                writer.push(&marker.marker_name);
                writer.push(".parentNode, ");
                emit_error_boundary_call(writer, boundary, runtime, names);
                writer.push(", ");
                writer.push(&marker.marker_name);
                writer.push(");\n");
                writer.push(&marker.marker_name);
                writer.push(".remove();\n");
                marker_index += 1;
            }
            DynamicBinding::Show { show } => {
                emit_show_binding(writer, &markers[marker_index], show, runtime, names);
                marker_index += 1;
            }
            DynamicBinding::For { for_binding } => {
                emit_for_binding(writer, &markers[marker_index], for_binding, runtime, names);
                marker_index += 1;
            }
            DynamicBinding::Transition { transition } => {
                emit_transition_binding(writer, &markers[marker_index], transition, runtime, names);
                marker_index += 1;
            }
            DynamicBinding::DynamicRegion { region } => {
                emit_dynamic_region_binding(writer, &markers[marker_index], region, runtime, names);
                marker_index += 1;
            }
        }
    }

    writer.push("return ");
    writer.push(&component.element_name);
    writer.push(";\n})()");
}

pub(crate) fn emit_event_binding(
    writer: &mut CodeWriter,
    target: &str,
    event_name: &str,
    handler: &ExpressionIr,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    writer.push(runtime.bind_event());
    writer.push("(");
    writer.push(target);
    writer.push(", ");
    writer.push(&quote_js(event_name));
    writer.push(", ");
    emit_event_handler(writer, handler, names);
    if !runtime.should_delegate_event(event_name) {
        writer.push(", false");
    }
    writer.push(");\n");
}

pub(crate) fn emit_element_targets(
    writer: &mut CodeWriter,
    component: &GeneratedComponent,
    locator_attribute: &str,
) {
    for target in &component.targets {
        if component.root_id != Some(target.id) {
            let selector = format!("[{locator_attribute}=\"{}\"]", target.id);
            writer.push("const ");
            writer.push(&target.name);
            writer.push(" = ");
            writer.push(&component.element_name);
            writer.push(".querySelector(");
            writer.push(&quote_js(&selector));
            writer.push(");\n");
        }

        writer.push(&target.name);
        writer.push(".removeAttribute(");
        writer.push(&quote_js(locator_attribute));
        writer.push(");\n");
    }
}

pub(crate) fn emit_dynamic_markers(
    writer: &mut CodeWriter,
    component: &GeneratedComponent,
    names: &mut NameAllocator,
) -> Vec<EmittedMarker> {
    let marker_count = component
        .bindings
        .iter()
        .filter(|binding| {
            matches!(
                binding,
                DynamicBinding::Text { .. }
                    | DynamicBinding::Node { .. }
                    | DynamicBinding::Component { .. }
                    | DynamicBinding::ErrorBoundary { .. }
                    | DynamicBinding::Show { .. }
                    | DynamicBinding::For { .. }
                    | DynamicBinding::Transition { .. }
                    | DynamicBinding::DynamicRegion { .. }
            )
        })
        .count();
    if marker_count == 0 {
        return Vec::new();
    }

    let walker_name = names.allocate("$zeusWalker");
    writer.push("const ");
    writer.push(&walker_name);
    writer.push(" = ");
    writer.push(&component.element_name);
    // NodeFilter.SHOW_COMMENT without relying on a shadowable global.
    writer.push(".ownerDocument.createTreeWalker(");
    writer.push(&component.element_name);
    writer.push(", 128);\n");

    let bindings = (0..marker_count)
        .map(|_| EmittedMarker {
            marker_name: names.allocate("$zeusMarker"),
            text_name: names.allocate("$zeusText"),
        })
        .collect::<Vec<_>>();

    // Resolve every marker before removing any node from the walker's tree.
    for binding in &bindings {
        writer.push("const ");
        writer.push(&binding.marker_name);
        writer.push(" = ");
        writer.push(&walker_name);
        writer.push(".nextNode();\n");
    }

    bindings
}

pub(crate) fn emit_component_binding(
    writer: &mut CodeWriter,
    marker: &EmittedMarker,
    component: &ComponentBindingIr,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    writer.push("const ");
    let child_name = names.allocate("$zeusChild");
    writer.push(&child_name);
    writer.push(" = ");
    emit_component_call(writer, component, runtime, names);
    writer.push(";\n");
    writer.push(runtime.insert());
    writer.push("(");
    writer.push(&marker.marker_name);
    writer.push(".parentNode, ");
    writer.push(&child_name);
    writer.push(", ");
    writer.push(&marker.marker_name);
    writer.push(");\n");
    writer.push(&marker.marker_name);
    writer.push(".remove();\n");
}

pub(crate) fn emit_error_boundary_call(
    writer: &mut CodeWriter,
    boundary: &ErrorBoundaryBindingIr,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    writer.push(runtime.error_boundary());
    writer.push("({ children: () => ");
    emit_children_value(writer, &boundary.children, runtime, names);
    writer.push(", fallback: ");
    match &boundary.fallback {
        ErrorBoundaryFallbackIr::Expression(expression) => writer.push_dom_expression(expression),
        ErrorBoundaryFallbackIr::Render(render) => {
            writer.push("(");
            writer.push(&render.parameters.join(", "));
            writer.push(") => ");
            emit_children_value(writer, &render.body, runtime, names);
        }
    }
    if let Some(on_error) = &boundary.on_error {
        writer.push(", onError: ");
        writer.push_dom_expression(on_error);
    }
    writer.push(" })");
}

pub(crate) fn emit_component_call(
    writer: &mut CodeWriter,
    component: &ComponentBindingIr,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    if component.kind == "Slot" {
        emit_slot_call(writer, component, runtime, names);
        return;
    }
    writer.push(runtime.create_component());
    writer.push("(");
    writer.push_dom_expression(&component.callee);
    writer.push(", ");
    let spread = component
        .props
        .iter()
        .any(|prop| matches!(prop, ComponentPropIr::Spread(_)));
    if spread {
        writer.push(runtime.merge_props());
        writer.push("([");
    } else {
        writer.push("{");
    }
    for (index, entry) in component.props.iter().enumerate() {
        if index > 0 {
            writer.push(", ");
        }
        match entry {
            ComponentPropIr::Spread(prop) => {
                writer.push("() => (");
                writer.push_dom_expression(&prop.expression);
                writer.push(")");
            }
            ComponentPropIr::Named(prop) => {
                if spread {
                    writer.push("() => ({");
                }
                match &prop.value {
                    ComponentPropValueIr::Expression(expression) => {
                        if is_static_expression(expression) {
                            writer.push(&object_key(&prop.name));
                            writer.push(": ");
                            writer.push_dom_expression(expression);
                        } else {
                            writer.push("get ");
                            writer.push(&object_key(&prop.name));
                            writer.push("() { return ");
                            writer.push_dom_expression(expression);
                            writer.push(" }");
                        }
                    }
                    ComponentPropValueIr::Children(children) => {
                        writer.push("get ");
                        writer.push(&object_key(&prop.name));
                        writer.push("() { return ");
                        emit_children_value(writer, children, runtime, names);
                        writer.push(" }");
                    }
                }

                if spread {
                    writer.push("})");
                }
            }
        }
    }
    if spread {
        writer.push("])");
    } else {
        writer.push("}");
    }
    writer.push(")");
}
pub(crate) fn emit_slot_call(
    writer: &mut CodeWriter,
    component: &ComponentBindingIr,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    let name = component
        .props
        .iter()
        .filter_map(ComponentPropIr::named)
        .find_map(|prop| (prop.name == "name").then_some(&prop.value));
    writer.push(runtime.create_slot());
    writer.push("(");
    match name {
        Some(ComponentPropValueIr::Expression(expression)) => {
            emit_expression_value(writer, expression);
        }
        _ => writer.push("undefined"),
    }
    let children = component
        .props
        .iter()
        .filter_map(ComponentPropIr::named)
        .find_map(|prop| (prop.name == "children").then_some(&prop.value));
    if let Some(ComponentPropValueIr::Children(children)) = children {
        writer.push(", () => ");
        emit_children_value(writer, children, runtime, names);
    }
    writer.push(")");
}

pub(crate) fn emit_expression_value(writer: &mut CodeWriter, expression: &ExpressionIr) {
    writer.push_dom_expression(expression);
}

pub(crate) fn emit_root_builtin_call(
    writer: &mut CodeWriter,
    builtin: &RootBuiltin,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    if let RootBuiltin::ErrorBoundary(boundary) = builtin {
        emit_error_boundary_call(writer, boundary, runtime, names);
        return;
    }
    let region = names.allocate("$zeusRegion");
    let marker = names.allocate("$zeusRegionMarker");
    writer.push("(() => {\nconst ");
    writer.push(&region);
    writer.push(" = ");
    writer.push(runtime.template());
    writer.push("(\"<!>\")();\nconst ");
    writer.push(&marker);
    writer.push(" = ");
    writer.push(&region);
    writer.push(".firstChild;\n");

    match builtin {
        RootBuiltin::ErrorBoundary(_) => unreachable!("ErrorBoundary was emitted above"),
        RootBuiltin::Show(show) => {
            emit_show_mount_call(writer, &region, &marker, show, runtime, names);
        }
        RootBuiltin::For(for_binding) => {
            emit_for_mount_call(writer, &region, &marker, for_binding, runtime, names);
        }
        RootBuiltin::Transition(transition) => {
            emit_transition_mount_call(writer, &region, &marker, transition, runtime, names);
        }
    }

    writer.push("return ");
    writer.push(&region);
    writer.push(";\n})()");
}

pub(crate) fn emit_show_binding(
    writer: &mut CodeWriter,
    marker: &EmittedMarker,
    show: &ShowBindingIr,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    emit_show_mount_call(
        writer,
        &format!("{}.parentNode", marker.marker_name),
        &marker.marker_name,
        show,
        runtime,
        names,
    );
}

pub(crate) fn emit_show_mount_call(
    writer: &mut CodeWriter,
    parent: &str,
    marker: &str,
    show: &ShowBindingIr,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    writer.push(runtime.mount_show());
    writer.push("(");
    writer.push(parent);
    writer.push(", ");
    writer.push(marker);
    writer.push(", () => ");
    writer.push_dom_expression(&show.when);
    writer.push(", () => ");
    emit_children_value(writer, &show.children, runtime, names);
    writer.push(", ");
    if show.fallback.is_some() {
        writer.push("() => ");
        emit_fallback_value(writer, show.fallback.as_ref(), runtime, names);
    } else {
        writer.push("undefined");
    }
    writer.push(");\n");
}

pub(crate) fn emit_for_binding(
    writer: &mut CodeWriter,
    marker: &EmittedMarker,
    for_binding: &ForBindingIr,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    emit_for_mount_call(
        writer,
        &format!("{}.parentNode", marker.marker_name),
        &marker.marker_name,
        for_binding,
        runtime,
        names,
    );
}

pub(crate) fn emit_for_mount_call(
    writer: &mut CodeWriter,
    parent: &str,
    marker: &str,
    for_binding: &ForBindingIr,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    writer.push(runtime.mount_for());
    writer.push("(");
    writer.push(parent);
    writer.push(", ");
    writer.push(marker);
    writer.push(", () => ");
    writer.push_dom_expression(&for_binding.each);
    writer.push(", ");
    if let Some(by) = &for_binding.by {
        writer.push_dom_expression(by);
    } else {
        writer.push("undefined");
    }

    let item_accessor = names.allocate("$zeusItem");
    let index_accessor = for_binding
        .index
        .as_ref()
        .map(|_| names.allocate("$zeusIndex"));
    writer.push(", (");
    writer.push(&item_accessor);
    if let Some(index_accessor) = &index_accessor {
        writer.push(", ");
        writer.push(index_accessor);
    }
    writer.push(") => ");
    writer.push_for_accessor_scope(ForAccessorScope {
        for_id: for_binding.id,
        item: for_binding.item.clone(),
        index: for_binding.index.clone(),
        item_accessor,
        index_accessor,
    });
    emit_children_value(writer, &for_binding.body, runtime, names);
    writer.pop_for_accessor_scope();
    writer.push(");\n");
}

pub(crate) fn emit_transition_binding(
    writer: &mut CodeWriter,
    marker: &EmittedMarker,
    transition: &TransitionBindingIr,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    emit_transition_mount_call(
        writer,
        &format!("{}.parentNode", marker.marker_name),
        &marker.marker_name,
        transition,
        runtime,
        names,
    );
}

pub(crate) fn emit_transition_mount_call(
    writer: &mut CodeWriter,
    parent: &str,
    marker: &str,
    transition: &TransitionBindingIr,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    writer.push(runtime.mount_transition());
    writer.push("(");
    writer.push(parent);
    writer.push(", ");
    writer.push(marker);
    writer.push(", () => ");
    writer.push_dom_expression(&transition.when);
    writer.push(", () => ");
    emit_children_value(writer, &transition.children, runtime, names);
    writer.push(", ");
    emit_transition_options(writer, &transition.options, names);
    writer.push(");\n");
}

pub(crate) fn emit_transition_options(
    writer: &mut CodeWriter,
    options: &[TransitionOptionIr],
    _names: &mut NameAllocator,
) {
    if options.is_empty() {
        writer.push("{}");
        return;
    }
    writer.push("{");
    for (index, option) in options.iter().enumerate() {
        if index > 0 {
            writer.push(", ");
        }
        if is_static_expression(&option.expression) {
            writer.push(&object_key(&option.name));
            writer.push(": ");
            writer.push_dom_expression(&option.expression);
        } else {
            writer.push("get ");
            writer.push(&object_key(&option.name));
            writer.push("() { return ");
            writer.push_dom_expression(&option.expression);
            writer.push(" }");
        }
    }
    writer.push("}");
}

pub(crate) fn emit_dynamic_region_binding(
    writer: &mut CodeWriter,
    marker: &EmittedMarker,
    region: &DynamicRegionIr,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    writer.push(runtime.mount_dynamic());
    writer.push("(");
    writer.push(&marker.marker_name);
    writer.push(".parentNode, ");
    writer.push(&marker.marker_name);
    writer.push(", () => ");
    emit_dynamic_region_value(writer, &region.expression, runtime, names);
    writer.push(");\n");
}

pub(crate) fn emit_dynamic_region_value(
    writer: &mut CodeWriter,
    expression: &DynamicRegionExpressionIr,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    match expression {
        DynamicRegionExpressionIr::Value { expression } => writer.push_dom_expression(expression),
        DynamicRegionExpressionIr::Conditional {
            test,
            consequent,
            alternate,
        } => {
            writer.push("(");
            writer.push_dom_expression(test);
            writer.push(" ? ");
            emit_region_branch_value(writer, consequent, runtime, names);
            writer.push(" : ");
            emit_region_branch_value(writer, alternate, runtime, names);
            writer.push(")");
        }
        DynamicRegionExpressionIr::Logical {
            left,
            operator,
            right,
        } => {
            writer.push("(");
            writer.push_dom_expression(left);
            writer.push(" ");
            writer.push(operator);
            writer.push(" ");
            emit_region_branch_value(writer, right, runtime, names);
            writer.push(")");
        }
        DynamicRegionExpressionIr::ArrayMap {
            each,
            item,
            index,
            body,
        } => {
            writer.push("(");
            writer.push_dom_expression(each);
            writer.push(" ?? []).map((");
            writer.push(item);
            if let Some(index) = index {
                writer.push(", ");
                writer.push(index);
            }
            writer.push(") => ");
            emit_children_value(writer, body, runtime, names);
            writer.push(")");
        }
        DynamicRegionExpressionIr::ArrayLiteral { items } => {
            writer.push("[");
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    writer.push(", ");
                }
                emit_region_branch_value(writer, item, runtime, names);
            }
            writer.push("]");
        }
    }
}

pub(crate) fn emit_region_branch_value(
    writer: &mut CodeWriter,
    value: &DynamicRegionValueIr,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    match value {
        DynamicRegionValueIr::Expression(expression) => writer.push_dom_expression(expression),
        DynamicRegionValueIr::Children(children) => {
            emit_children_value(writer, children, runtime, names);
        }
    }
}

pub(crate) fn emit_fallback_value(
    writer: &mut CodeWriter,
    fallback: Option<&ComponentPropValueIr>,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    match fallback {
        Some(ComponentPropValueIr::Expression(expression)) => {
            writer.push_dom_expression(expression);
        }
        Some(ComponentPropValueIr::Children(children)) => {
            emit_children_value(writer, children, runtime, names);
        }
        None => writer.push("null"),
    }
}

pub(crate) fn emit_children_value(
    writer: &mut CodeWriter,
    children: &[ChildIr],
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    match children {
        [] => writer.push("null"),
        [child] => emit_inline_child_value(writer, child, runtime, names),
        _ => {
            writer.push("[");
            for (index, child) in children.iter().enumerate() {
                if index > 0 {
                    writer.push(", ");
                }
                emit_inline_child_value(writer, child, runtime, names);
            }
            writer.push("]");
        }
    }
}

pub(crate) fn emit_inline_child_value(
    writer: &mut CodeWriter,
    child: &ChildIr,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    match child {
        ChildIr::Text(text) => writer.push(&quote_js(&text.value)),
        ChildIr::DynamicText(text) => {
            emit_inline_root(
                writer,
                &RootIr::Fragment(FragmentIr {
                    id: text.id,
                    kind: "Fragment".into(),
                    span: text.span,
                    children: vec![ChildIr::DynamicText(text.clone())],
                }),
                runtime,
                names,
            );
        }
        ChildIr::Element(element) => {
            emit_inline_root(writer, &RootIr::Element(element.clone()), runtime, names);
        }
        ChildIr::Fragment(fragment) => {
            emit_inline_root(writer, &RootIr::Fragment(fragment.clone()), runtime, names);
        }
        ChildIr::Component(component) => emit_component_call(writer, component, runtime, names),
        ChildIr::ErrorBoundary(boundary) => {
            emit_error_boundary_call(writer, boundary, runtime, names);
        }
        ChildIr::Show(show) => {
            emit_root_builtin_call(writer, &RootBuiltin::Show(show.clone()), runtime, names);
        }
        ChildIr::For(for_binding) => {
            emit_root_builtin_call(
                writer,
                &RootBuiltin::For(for_binding.clone()),
                runtime,
                names,
            );
        }
        ChildIr::Transition(transition) => {
            emit_root_builtin_call(
                writer,
                &RootBuiltin::Transition(transition.clone()),
                runtime,
                names,
            );
        }
        ChildIr::DynamicRegion(region) => {
            emit_dynamic_region_root_call(writer, region, runtime, names);
        }
    }
}

pub(crate) fn emit_dynamic_region_root_call(
    writer: &mut CodeWriter,
    region: &DynamicRegionIr,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    let fragment = names.allocate("$zeusRegion");
    let marker = names.allocate("$zeusRegionMarker");
    writer.push("(() => {\nconst ");
    writer.push(&fragment);
    writer.push(" = ");
    writer.push(runtime.template());
    writer.push("(\"<!>\")();\nconst ");
    writer.push(&marker);
    writer.push(" = ");
    writer.push(&fragment);
    writer.push(".firstChild;\n");
    writer.push(runtime.mount_dynamic());
    writer.push("(");
    writer.push(&fragment);
    writer.push(", ");
    writer.push(&marker);
    writer.push(", () => ");
    emit_dynamic_region_value(writer, &region.expression, runtime, names);
    writer.push(");\nreturn ");
    writer.push(&fragment);
    writer.push(";\n})()");
}

pub(crate) fn emit_inline_root(
    writer: &mut CodeWriter,
    root: &RootIr,
    runtime: &RuntimeNames,
    names: &mut NameAllocator,
) {
    let bindings = collect_root_dynamic_bindings(root);
    let locator_attribute = runtime.locator_attribute();
    let generated = GeneratedComponent::new_inline(root, bindings, locator_attribute, names);
    writer.push("(() => {\nconst ");
    writer.push(&generated.template_name);
    writer.push(" = ");
    writer.push(runtime.template());
    writer.push("(");
    writer.push(&quote_js(&generated.template_html));
    if generated.is_svg {
        writer.push(", false, true");
    }
    writer.push(");\nreturn ");
    emit_component(writer, &generated, runtime, locator_attribute, names, false);
    writer.push(";\n})()");
}

pub(crate) fn emit_text_binding(
    writer: &mut CodeWriter,
    expression: &ExpressionIr,
    once: bool,
    binding: &EmittedMarker,
    runtime: &RuntimeNames,
) {
    writer.push("const ");
    writer.push(&binding.text_name);
    writer.push(" = ");
    writer.push(&binding.marker_name);
    writer.push(".ownerDocument.createTextNode(\"\");\n");
    writer.push(runtime.insert());
    writer.push("(");
    writer.push(&binding.marker_name);
    writer.push(".parentNode, ");
    writer.push(&binding.text_name);
    writer.push(", ");
    writer.push(&binding.marker_name);
    writer.push(");\n");
    writer.push(&binding.marker_name);
    writer.push(".remove();\n");
    writer.push(runtime.bind_text());
    writer.push("(");
    writer.push(&binding.text_name);
    writer.push(", () => (");
    writer.push_dom_expression(expression);
    writer.push(")");
    if once {
        writer.push(", true");
    }
    writer.push(");\n");
}

pub(crate) fn emit_node_binding(
    writer: &mut CodeWriter,
    expression: &ExpressionIr,
    binding: &EmittedMarker,
    runtime: &RuntimeNames,
) {
    writer.push(runtime.insert());
    writer.push("(");
    writer.push(&binding.marker_name);
    writer.push(".parentNode, ");
    writer.push_dom_expression(expression);
    writer.push(", ");
    writer.push(&binding.marker_name);
    writer.push(");\n");
    writer.push(&binding.marker_name);
    writer.push(".remove();\n");
}

pub(crate) fn emit_text_content_binding(
    writer: &mut CodeWriter,
    target: &str,
    parts: &[TextContentPart],
    once: bool,
    runtime: &RuntimeNames,
) {
    writer.push(runtime.bind_text_content());
    writer.push("(");
    writer.push(target);
    writer.push(", () => (");

    if parts.len() == 1 {
        emit_text_content_part(writer, &parts[0]);
    } else {
        writer.push("[");
        for (index, part) in parts.iter().enumerate() {
            if index > 0 {
                writer.push(", ");
            }
            emit_text_content_part(writer, part);
        }
        writer.push("]");
    }

    writer.push(")");
    if once {
        writer.push(", true");
    }
    writer.push(");\n");
}

pub(crate) fn emit_text_content_part(writer: &mut CodeWriter, part: &TextContentPart) {
    match part {
        TextContentPart::Static(value) => writer.push(&quote_js(value)),
        TextContentPart::Dynamic { expression, .. } => {
            writer.push_dom_expression(expression);
        }
    }
}

pub(crate) fn emit_attribute_binding(
    writer: &mut CodeWriter,
    target: &str,
    name: &str,
    expression: &ExpressionIr,
    kind: AttributeBindingKind,
    once: bool,
    runtime: &RuntimeNames,
) {
    let helper = match kind {
        AttributeBindingKind::Attribute => runtime.bind_attr(),
        AttributeBindingKind::Class => runtime.bind_class(),
        AttributeBindingKind::Style => runtime.bind_style(),
    };
    writer.push(helper);
    writer.push("(");
    writer.push(target);
    if kind == AttributeBindingKind::Attribute {
        writer.push(", ");
        writer.push(&quote_js(name));
    }
    writer.push(", ");
    emit_getter(writer, expression);
    if once {
        writer.push(", true");
    }
    writer.push(");\n");
}

pub(crate) fn emit_property_binding(
    writer: &mut CodeWriter,
    target: &str,
    name: &str,
    expression: &ExpressionIr,
    once: bool,
    runtime: &RuntimeNames,
) {
    writer.push(runtime.bind_prop());
    writer.push("(");
    writer.push(target);
    writer.push(", ");
    writer.push(&quote_js(name));
    writer.push(", ");
    emit_getter(writer, expression);
    if once {
        writer.push(", true");
    }
    writer.push(");\n");
}

pub(crate) fn emit_ref_binding(
    writer: &mut CodeWriter,
    target: &str,
    expression: &ExpressionIr,
    runtime: &RuntimeNames,
) {
    writer.push(runtime.bind_ref());
    writer.push("(");
    writer.push(target);
    writer.push(", ");
    writer.push_dom_expression(expression);
    writer.push(");\n");
}

pub(crate) fn emit_getter(writer: &mut CodeWriter, expression: &ExpressionIr) {
    writer.push("() => (");
    writer.push_dom_expression(expression);
    writer.push(")");
}

pub(crate) fn emit_event_handler(
    writer: &mut CodeWriter,
    handler: &ExpressionIr,
    names: &mut NameAllocator,
) {
    if !writer.expression_uses_for_accessors(handler) && handler.form != ExpressionForm::Member {
        writer.push_mapped(&handler.code, handler);
        return;
    }

    if writer.expression_uses_for_accessors(handler) {
        let invoke = names.allocate("$zeusInvoke");
        let receiver = names.allocate("$zeusReceiver");
        let invoke_arguments = names.allocate("$zeusInvokeArgs");
        let event_arguments = names.allocate("$zeusEventArgs");
        writer.push("(() => {\nconst ");
        writer.push(&invoke);
        writer.push(" = (");
        writer.push(&receiver);
        writer.push(", ");
        writer.push(&invoke_arguments);
        writer.push(") => ");
        writer.push_dom_invocation(handler, &invoke_arguments, &receiver, true);
        writer.push(";\nreturn function (...");
        writer.push(&event_arguments);
        writer.push(") { return ");
        writer.push(&invoke);
        writer.push("(this, ");
        writer.push(&event_arguments);
        writer.push("); };\n})()");
        return;
    }

    let event_name = names.allocate("$zeusEvent");
    writer.push(&event_name);
    writer.push(" => (");
    writer.push_mapped(&handler.code, handler);
    writer.push(")?.(");
    writer.push(&event_name);
    writer.push(")");
}

pub(super) fn emit_attribute_sources(
    writer: &mut CodeWriter,
    attributes: &[AttributeIr],
    mut names: Option<&mut NameAllocator>,
) {
    writer.push("[");
    for (index, attribute) in attributes.iter().enumerate() {
        if index > 0 {
            writer.push(", ");
        }
        writer.push("() => (");
        if let AttributeIr::Spread(spread) = attribute {
            writer.push_dom_expression(&spread.expression);
        } else {
            writer.push("{");
            let name = attribute_key(attribute);
            writer.push(&quote_js(&name));
            writer.push(": ");
            match attribute {
                AttributeIr::Static(attr) => match &attr.value {
                    StaticAttributeValue::String(value) => writer.push(&quote_js(value)),
                    StaticAttributeValue::Boolean => writer.push("true"),
                },
                AttributeIr::Dynamic(attr) => writer.push_dom_expression(&attr.expression),
                AttributeIr::Property(attr) => writer.push_dom_expression(&attr.expression),
                AttributeIr::Event(attr) => {
                    if let Some(names) = names.as_deref_mut() {
                        emit_event_handler(writer, &attr.handler, names);
                    } else {
                        writer.push("undefined");
                    }
                }
                AttributeIr::Ref(attr) => {
                    if names.is_some() {
                        writer.push_dom_expression(&attr.expression);
                    } else {
                        writer.push("undefined");
                    }
                }
                AttributeIr::Spread(_) => unreachable!(),
            }
            writer.push("}");
        }
        writer.push(")");
    }
    writer.push("]");
}
