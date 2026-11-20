//! Code emission.
//!
//! DOM and SSR targets share `CodeWriter` (positions and source map mappings)
//! and `NameAllocator` (identifiers), and nothing else. Each target keeps its
//! own emitter so a change to one is not read as a change to both.

mod analysis;
mod emit_plan;
mod infra;
mod ssr;

pub(crate) use ssr::{SsrModuleOptions, emit_ssr_module};

use infra::{
    CodeWriter, ForAccessorScope, NameAllocator, attribute_key, build_source_map,
    element_has_spread, escape_html_attribute, escape_html_text, is_static_expression,
    is_unescaped_raw_text, object_key, quote_js, root_span,
};

use analysis::{RuntimeHelper, analyse_module, is_delegatable_event};
use emit_plan::EmitPlan;

use std::collections::{HashMap, HashSet};

use crate::{
    PureDefineElementMode, TransformModuleResult,
    ir::{
        AttributeIr, ChildIr, ComponentBindingIr, ComponentIr, ComponentPropIr,
        ComponentPropValueIr, DynamicRegionExpressionIr, DynamicRegionIr, DynamicRegionValueIr,
        ElementIr, ErrorBoundaryBindingIr, ErrorBoundaryFallbackIr, ExpressionForm, ExpressionIr,
        ForBindingIr, FragmentIr, ModuleIr, NodeId, RootIr, ShowBindingIr, StaticAttributeValue,
        TransitionBindingIr, TransitionOptionIr, is_children_expression,
    },
    span::SourceIndex,
    stage_contracts::HmrInfo,
    support::html::{is_raw_text_element, is_svg_element, is_void_element},
    support::hydration::{
        component_root_marker_id, element_marker_id, node_marker_id, text_marker_id,
    },
};

#[derive(Clone, Copy)]
// These flags are independent compiler switches rather than mutually exclusive
// states, so collapsing them into enums would only obscure the public options.
#[allow(clippy::struct_excessive_bools)]
pub(crate) struct EmitModuleOptions<'a> {
    pub(crate) source: &'a str,
    pub(crate) filename: &'a str,
    pub(crate) runtime_module: &'a str,
    pub(crate) enable_delegation: bool,
    pub(crate) source_map: bool,
    pub(crate) module: &'a ModuleIr,
    pub(crate) reserved_names: &'a [String],
    pub(crate) enable_hmr: bool,
    pub(crate) hmr: &'a HmrInfo,
    pub(crate) pure_define_element: PureDefineElementMode,
    pub(crate) pure_define_element_calls: &'a [oxc_span::Span],
    pub(crate) auto_hydrate: bool,
}

#[allow(clippy::too_many_lines)]
pub(crate) fn emit_module(options: &EmitModuleOptions<'_>) -> TransformModuleResult {
    let EmitModuleOptions {
        source,
        filename,
        runtime_module,
        enable_delegation,
        source_map,
        module,
        reserved_names,
        enable_hmr,
        hmr,
        pure_define_element,
        pure_define_element_calls,
        auto_hydrate,
    } = *options;
    let mut names = NameAllocator::new(reserved_names);
    let hmr_module = prepare_hmr_module(options, &mut names);
    let module = hmr_module.as_ref().map_or(module, |hmr| &hmr.module);
    // Every fact below is decided here, once, and then consumed. The emitter
    // does not re-walk the IR to answer a question analysis already answered.
    let facts = analyse_module(module, enable_delegation);
    let binding_sets = collect_component_bindings(module);
    let mut helper_usage =
        collect_module_helper_usage(module, &binding_sets, !facts.delegated_events.is_empty());
    if auto_hydrate {
        helper_usage.0.insert(RuntimeHelper::AutoHydrateComponent);
    }
    let locator_attribute = &facts.locator_attribute;
    let runtime = RuntimeNames::allocate(
        &helper_usage,
        locator_attribute,
        enable_delegation,
        &mut names,
    );

    // What will be emitted, decided before the writer is touched. The
    // conditions used to be inline `is_empty()` calls scattered through the
    // emitter; naming them here means "when is the runtime import needed?" is
    // answered in one place, next to the facts it depends on.
    let plan = EmitPlan::for_module(
        !module.components.is_empty(),
        hmr_module.is_some(),
        !facts.delegated_events.is_empty(),
    );

    let mut generated = module
        .components
        .iter()
        .zip(binding_sets)
        .map(|(component, bindings)| {
            GeneratedComponent::new(component, bindings, locator_attribute, &mut names)
        })
        .collect::<Vec<_>>();
    intern_static_templates(&mut generated);

    let source_index = SourceIndex::new(source);
    let mut writer = CodeWriter::default();
    let mut cursor = usize::try_from(module.preamble_end)
        .unwrap_or(usize::MAX)
        .min(source.len());
    let (hmr_disposers, hmr_insertions) = allocate_hmr_insertions(enable_hmr, hmr, &mut names);
    let source_insertions = allocate_source_insertions(
        &hmr_insertions,
        &hmr_disposers,
        pure_define_element.is_enabled(),
        pure_define_element_calls,
    );
    push_source_range(
        &mut writer,
        &source_index,
        0,
        cursor,
        &source_insertions,
        false,
    );
    if cursor > 0 && !writer.ends_with_newline() {
        writer.push("\n");
    }
    if plan.runtime_import.is_written() {
        emit_runtime_import(&mut writer, &runtime, runtime_module);
    }
    emit_hmr_state(
        &mut writer,
        hmr_module.as_ref(),
        runtime_module,
        filename,
        &mut names,
    );
    emit_hmr_boundary(
        &mut writer,
        enable_hmr,
        hmr,
        &hmr_disposers,
        hmr_module.as_ref(),
    );

    emit_templates(&mut writer, &generated, &runtime);

    let mut component_emitter = ComponentEmitter {
        runtime: &runtime,
        locator_attribute,
        names: &mut names,
        auto_hydrate,
    };
    cursor = emit_components(
        &mut writer,
        &source_index,
        cursor,
        &generated,
        &source_insertions,
        &mut component_emitter,
    );
    push_source_range(
        &mut writer,
        &source_index,
        cursor,
        source.len(),
        &source_insertions,
        true,
    );
    emit_delegated_events(&mut writer, &runtime, &facts.delegated_events);

    // The map is built first: `into_generated` consumes the writer.
    let map = source_map.then(|| build_source_map(filename, source, writer.recorded_mappings()));
    let code = writer.into_generated();

    TransformModuleResult {
        code,
        map,
        diagnostics: Vec::new(),
        hydration_plan: None,
        hmr_plan: hmr_module.map(|hmr| hmr.plan),
    }
}

struct HmrModule {
    module: ModuleIr,
    plan: crate::support::hmr::HmrPlan,
    state_name: String,
}

fn emit_hmr_state(
    writer: &mut CodeWriter,
    hmr: Option<&HmrModule>,
    runtime_module: &str,
    filename: &str,
    names: &mut NameAllocator,
) {
    let Some(hmr) = hmr else {
        return;
    };
    let helper = names.allocate("_zeusCreateHmrState");
    let state_name = &hmr.state_name;
    writer.push(&format!(
        "import {{ createHmrState as {helper} }} from {};\nconst {state_name} = {helper}(import.meta.hot, {}, {});\n",
        quote_js(runtime_module), quote_js(filename), serde_json::to_string(&hmr.plan).expect("HMR plan is JSON data"),
    ));
}

fn prepare_hmr_module(
    options: &EmitModuleOptions<'_>,
    names: &mut NameAllocator,
) -> Option<HmrModule> {
    if !options.enable_hmr || options.hmr.manual_boundary || options.hmr.render_calls.is_empty() {
        return None;
    }
    let state_name = names.allocate("_zeusHmrState");
    let mut module = options.module.clone();
    let plan = crate::passes::hmr::prepare(
        &mut module,
        options.source,
        options.runtime_module,
        options.enable_delegation,
        &state_name,
    )?;
    Some(HmrModule {
        module,
        plan,
        state_name,
    })
}

fn intern_static_templates(components: &mut [GeneratedComponent]) {
    let mut templates = HashMap::<(bool, String), String>::new();
    for component in components {
        if !component.bindings.is_empty() || component.template_html.is_empty() {
            continue;
        }
        let key = (component.is_svg, component.template_html.clone());
        if let Some(template_name) = templates.get(&key) {
            component.template_name.clone_from(template_name);
        } else {
            templates.insert(key, component.template_name.clone());
        }
    }
}

fn collect_component_bindings(module: &ModuleIr) -> Vec<Vec<DynamicBinding>> {
    module
        .components
        .iter()
        .map(|component| collect_root_dynamic_bindings(&component.root))
        .collect()
}

fn collect_module_helper_usage(
    module: &ModuleIr,
    binding_sets: &[Vec<DynamicBinding>],
    has_delegated_events: bool,
) -> HelperUsage {
    let mut usage = HelperUsage::from_binding_sets(binding_sets, has_delegated_events);
    for component in &module.components {
        match &component.root {
            RootIr::ErrorBoundary(boundary) => {
                collect_error_boundary_helper_usage(boundary, &mut usage.0);
            }
            RootIr::Show(show) => {
                usage.0.insert(RuntimeHelper::MountShow);
                collect_builtin_helper_usage(&show.children, &mut usage.0);
                if let Some(ComponentPropValueIr::Children(children)) = &show.fallback {
                    collect_builtin_helper_usage(children, &mut usage.0);
                }
            }
            RootIr::For(for_binding) => {
                usage.0.insert(RuntimeHelper::MountFor);
                collect_builtin_helper_usage(&for_binding.body, &mut usage.0);
            }
            RootIr::Transition(transition) => {
                usage.0.insert(RuntimeHelper::MountTransition);
                collect_builtin_helper_usage(&transition.children, &mut usage.0);
            }
            RootIr::Component(component) => {
                collect_component_helper_usage(component, &mut usage.0);
            }
            RootIr::Element(_) | RootIr::Fragment(_) => {}
        }
    }
    usage
}

fn emit_templates(
    writer: &mut CodeWriter,
    components: &[GeneratedComponent],
    runtime: &RuntimeNames,
) {
    let mut emitted = HashSet::new();
    for component in components {
        if !emitted.insert(component.template_name.as_str()) {
            continue;
        }
        writer.push("const ");
        writer.push(&component.template_name);
        writer.push(" = /* @__PURE__ */ ");
        writer.push(runtime.template());
        writer.push("(");
        writer.push(&quote_js(&component.template_html));
        if component.is_svg {
            writer.push(", false, true");
        }
        writer.push(");\n");
    }
}

struct ComponentEmitter<'a> {
    runtime: &'a RuntimeNames,
    locator_attribute: &'a str,
    names: &'a mut NameAllocator,
    auto_hydrate: bool,
}

fn emit_components(
    writer: &mut CodeWriter,
    source_index: &SourceIndex<'_>,
    mut cursor: usize,
    components: &[GeneratedComponent],
    source_insertions: &[SourceInsertion],
    emitter: &mut ComponentEmitter<'_>,
) -> usize {
    for component in components {
        let start = usize::try_from(component.start).unwrap_or(usize::MAX);
        let end = usize::try_from(component.end).unwrap_or(usize::MAX);
        if start < cursor || end > source_index.source().len() {
            continue;
        }
        push_source_range(
            writer,
            source_index,
            cursor,
            start,
            source_insertions,
            false,
        );
        emit_component(
            writer,
            component,
            emitter.runtime,
            emitter.locator_attribute,
            emitter.names,
            emitter.auto_hydrate,
        );
        cursor = end;
    }
    cursor
}

#[derive(Debug, Clone)]
struct HmrInsertion {
    start: usize,
    end: usize,
    terminate_statement: bool,
}

fn allocate_hmr_insertions(
    enabled: bool,
    hmr: &HmrInfo,
    names: &mut NameAllocator,
) -> (String, Vec<HmrInsertion>) {
    if !enabled || hmr.manual_boundary || hmr.render_calls.is_empty() {
        return (String::new(), Vec::new());
    }

    let disposers = names.allocate("_zeusHmrDisposers");
    let insertions = hmr
        .render_calls
        .iter()
        .filter_map(|call| {
            Some(HmrInsertion {
                start: usize::try_from(call.offset).ok()?,
                end: usize::try_from(call.end).ok()?,
                terminate_statement: call.terminate_statement,
            })
        })
        .collect();
    (disposers, insertions)
}

fn push_source_range(
    writer: &mut CodeWriter,
    source_index: &SourceIndex<'_>,
    start: usize,
    end: usize,
    insertions: &[SourceInsertion],
    include_end: bool,
) {
    let mut cursor = start;
    for insertion in insertions {
        if insertion.offset < start
            || insertion.offset > end
            || (insertion.offset == end && !include_end)
        {
            continue;
        }
        writer.push_original(source_index, cursor, insertion.offset);
        writer.push(&insertion.text);
        cursor = insertion.offset;
    }
    writer.push_original(source_index, cursor, end);
}

#[derive(Debug, Clone)]
struct SourceInsertion {
    offset: usize,
    text: String,
}

fn allocate_source_insertions(
    hmr_insertions: &[HmrInsertion],
    hmr_disposers: &str,
    pure_define_element: bool,
    pure_define_element_calls: &[oxc_span::Span],
) -> Vec<SourceInsertion> {
    let mut insertions = Vec::with_capacity(hmr_insertions.len() * 2);
    for insertion in hmr_insertions {
        insertions.push(SourceInsertion {
            offset: insertion.start,
            // A statement-level wrapper starts with "("; without a leading
            // semicolon, a preceding declaration without an explicit
            // semicolon is parsed as a call on that declaration's value.
            text: if insertion.terminate_statement {
                format!(";({hmr_disposers}.push(")
            } else {
                format!("({hmr_disposers}.push(")
            },
        });
        insertions.push(SourceInsertion {
            offset: insertion.end,
            text: format!(
                "), {hmr_disposers}[{hmr_disposers}.length - 1]){}",
                if insertion.terminate_statement {
                    ";"
                } else {
                    ""
                }
            ),
        });
    }
    if pure_define_element {
        insertions.extend(
            pure_define_element_calls
                .iter()
                .map(|span| SourceInsertion {
                    offset: usize::try_from(span.start).unwrap_or(usize::MAX),
                    text: "/* @__PURE__ */ ".into(),
                }),
        );
    }
    insertions.sort_by_key(|insertion| insertion.offset);
    insertions
}

fn emit_hmr_boundary(
    writer: &mut CodeWriter,
    enabled: bool,
    hmr: &HmrInfo,
    disposers: &str,
    state: Option<&HmrModule>,
) {
    if !enabled || hmr.manual_boundary || disposers.is_empty() {
        return;
    }
    if !writer.ends_with_newline() {
        writer.push("\n");
    }
    writer.push("const ");
    writer.push(disposers);
    writer.push(" = [];\nif (import.meta.hot) {\n");
    writer.push("  import.meta.hot.accept()\n");
    writer.push("  import.meta.hot.dispose(() => {\n");
    writer.push("    for (const dispose of ");
    writer.push(disposers);
    writer.push(".splice(0).reverse()) {\n");
    writer.push("      try { dispose() } catch (error) {\n");
    writer.push("        console.error('[Zeus HMR] root disposal failed', error)\n");
    writer.push("      }\n    }\n");
    if let Some(state) = state {
        writer.push(&format!("    {}.dispose()\n", state.state_name));
    }
    writer.push("  })\n}\n");
}

fn emit_delegated_events(
    writer: &mut CodeWriter,
    runtime: &RuntimeNames,
    delegated_events: &[String],
) {
    if delegated_events.is_empty() {
        return;
    }
    if !writer.ends_with_newline() {
        writer.push("\n");
    }
    writer.push(runtime.delegate_events());
    writer.push("([");
    for (index, event_name) in delegated_events.iter().enumerate() {
        if index > 0 {
            writer.push(", ");
        }
        writer.push(&quote_js(event_name));
    }
    writer.push("]);\n");
}

fn emit_runtime_import(writer: &mut CodeWriter, runtime: &RuntimeNames, runtime_module: &str) {
    writer.push("import { ");
    for (index, (exported, local)) in runtime.entries().iter().enumerate() {
        if index > 0 {
            writer.push(", ");
        }
        writer.push(exported);
        writer.push(" as ");
        writer.push(local);
    }
    writer.push(" } from ");
    writer.push(&quote_js(runtime_module));
    writer.push(";\n");
}

#[allow(clippy::too_many_lines)]
fn emit_component(
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

fn emit_auto_hydrated_component(
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

fn emit_auto_hydration_root(
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

fn emit_hydration_element_targets(
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

fn emit_hydration_element_shape(writer: &mut CodeWriter, element: &ElementIr) {
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

fn find_element_in_root(root: &RootIr, id: NodeId) -> Option<&ElementIr> {
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

fn find_element_in_component(component: &ComponentBindingIr, id: NodeId) -> Option<&ElementIr> {
    component
        .props
        .iter()
        .filter_map(ComponentPropIr::named)
        .find_map(|prop| match &prop.value {
            ComponentPropValueIr::Children(children) => find_element_in_children(children, id),
            ComponentPropValueIr::Expression(_) => None,
        })
}

fn find_element_in_children(children: &[ChildIr], id: NodeId) -> Option<&ElementIr> {
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

fn find_element_in_element(element: &ElementIr, id: NodeId) -> Option<&ElementIr> {
    if element.id == id {
        return Some(element);
    }
    find_element_in_children(&element.children, id)
}

fn emit_auto_hydration_component_child(
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
fn emit_auto_hydration_binding(
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

fn emit_spread_binding(
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
fn emit_component_create_body(
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

fn emit_event_binding(
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

fn emit_element_targets(
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

fn emit_dynamic_markers(
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

fn emit_component_binding(
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

fn emit_error_boundary_call(
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

fn emit_component_call(
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
fn emit_slot_call(
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

fn emit_expression_value(writer: &mut CodeWriter, expression: &ExpressionIr) {
    writer.push_dom_expression(expression);
}

fn emit_root_builtin_call(
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

fn emit_show_binding(
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

fn emit_show_mount_call(
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

fn emit_for_binding(
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

fn emit_for_mount_call(
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

fn emit_transition_binding(
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

fn emit_transition_mount_call(
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

fn emit_transition_options(
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

fn emit_dynamic_region_binding(
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

fn emit_dynamic_region_value(
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

fn emit_region_branch_value(
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

fn emit_fallback_value(
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

fn emit_children_value(
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

fn emit_inline_child_value(
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

fn emit_dynamic_region_root_call(
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

fn emit_inline_root(
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

fn emit_text_binding(
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

fn emit_node_binding(
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

fn emit_text_content_binding(
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

fn emit_text_content_part(writer: &mut CodeWriter, part: &TextContentPart) {
    match part {
        TextContentPart::Static(value) => writer.push(&quote_js(value)),
        TextContentPart::Dynamic { expression, .. } => {
            writer.push_dom_expression(expression);
        }
    }
}

fn emit_attribute_binding(
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

fn emit_property_binding(
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

fn emit_ref_binding(
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

fn emit_getter(writer: &mut CodeWriter, expression: &ExpressionIr) {
    writer.push("() => (");
    writer.push_dom_expression(expression);
    writer.push(")");
}

fn render_template(root: &RootIr, locator_attribute: &str) -> String {
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

fn render_fragment(fragment: &FragmentIr, locator_attribute: &str, html: &mut String) {
    for child in &fragment.children {
        render_child_template(child, locator_attribute, html);
    }
}

fn render_child_template(child: &ChildIr, locator_attribute: &str, html: &mut String) {
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

fn render_element(element: &ElementIr, locator_attribute: &str, html: &mut String) {
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

fn collect_dynamic_bindings(element: &ElementIr) -> Vec<DynamicBinding> {
    let mut bindings = Vec::new();
    collect_element_bindings(element, &mut bindings);
    bindings
}

fn collect_root_dynamic_bindings(root: &RootIr) -> Vec<DynamicBinding> {
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

fn collect_element_bindings(element: &ElementIr, bindings: &mut Vec<DynamicBinding>) {
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

fn collect_fragment_bindings(fragment: &FragmentIr, bindings: &mut Vec<DynamicBinding>) {
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

fn dynamic_binding(dynamic: &crate::ir::DynamicTextIr) -> DynamicBinding {
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

fn has_element_binding(element: &ElementIr) -> bool {
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

fn has_dynamic_raw_text(element: &ElementIr) -> bool {
    element
        .children
        .iter()
        .any(|child| matches!(child, ChildIr::DynamicText(_)))
}

fn collect_text_content_parts(element: &ElementIr) -> Vec<TextContentPart> {
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

enum RootBuiltin {
    ErrorBoundary(ErrorBoundaryBindingIr),
    Show(ShowBindingIr),
    For(ForBindingIr),
    Transition(TransitionBindingIr),
}

struct GeneratedComponent {
    id: NodeId,
    start: u32,
    end: u32,
    root: RootIr,
    root_id: Option<NodeId>,
    template_name: String,
    element_name: String,
    template_html: String,
    is_svg: bool,
    root_component: Option<ComponentBindingIr>,
    root_builtin: Option<RootBuiltin>,
    bindings: Vec<DynamicBinding>,
    targets: Vec<ElementTarget>,
}

impl GeneratedComponent {
    fn new(
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

    fn new_inline(
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

    fn target_name(&self, id: NodeId) -> &str {
        self.targets
            .iter()
            .find(|target| target.id == id)
            .map(|target| target.name.as_str())
            .expect("every element binding has a generated target")
    }

    fn id(&self) -> NodeId {
        self.id
    }
}

struct ElementTarget {
    id: NodeId,
    name: String,
}

enum DynamicBinding {
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
    fn target_id(&self) -> Option<NodeId> {
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

enum TextContentPart {
    Static(String),
    Dynamic {
        expression: ExpressionIr,
        once: bool,
    },
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum AttributeBindingKind {
    Attribute,
    Class,
    Style,
}

impl AttributeBindingKind {
    fn from_name(name: &str) -> Self {
        match name {
            "class" => Self::Class,
            "style" => Self::Style,
            _ => Self::Attribute,
        }
    }
}

struct EmittedMarker {
    marker_name: String,
    text_name: String,
}

#[derive(Default)]
struct HelperUsage(HashSet<RuntimeHelper>);

impl HelperUsage {
    fn from_binding_sets(
        binding_sets: &[Vec<DynamicBinding>],
        needs_delegate_events: bool,
    ) -> Self {
        let mut usage = Self::default();
        if needs_delegate_events {
            usage.0.insert(RuntimeHelper::DelegateEvents);
        }
        for binding in binding_sets.iter().flatten() {
            match binding {
                DynamicBinding::Text { .. } => {
                    usage.0.insert(RuntimeHelper::Insert);
                    usage.0.insert(RuntimeHelper::BindText);
                }
                DynamicBinding::Node { .. } => {
                    usage.0.insert(RuntimeHelper::Insert);
                }
                DynamicBinding::TextContent { .. } => {
                    usage.0.insert(RuntimeHelper::BindTextContent);
                }
                DynamicBinding::Attribute { kind, .. } => match kind {
                    AttributeBindingKind::Attribute => {
                        usage.0.insert(RuntimeHelper::BindAttr);
                    }
                    AttributeBindingKind::Class => {
                        usage.0.insert(RuntimeHelper::BindClass);
                    }
                    AttributeBindingKind::Style => {
                        usage.0.insert(RuntimeHelper::BindStyle);
                    }
                },
                DynamicBinding::Spread { .. } => {
                    usage.0.insert(RuntimeHelper::BindSpread);
                }
                DynamicBinding::Property { .. } => {
                    usage.0.insert(RuntimeHelper::BindProp);
                }
                DynamicBinding::Event { .. } => {
                    usage.0.insert(RuntimeHelper::BindEvent);
                }
                DynamicBinding::Ref { .. } => {
                    usage.0.insert(RuntimeHelper::BindRef);
                }
                DynamicBinding::Component { component } => {
                    if component.kind == "Slot" {
                        usage.0.insert(RuntimeHelper::CreateSlot);
                    } else {
                        usage.0.insert(RuntimeHelper::CreateComponent);
                    }
                    usage.0.insert(RuntimeHelper::Insert);
                    collect_component_helper_usage(component, &mut usage.0);
                }
                DynamicBinding::ErrorBoundary { boundary } => {
                    usage.0.insert(RuntimeHelper::Insert);
                    collect_error_boundary_helper_usage(boundary, &mut usage.0);
                }
                DynamicBinding::Show { show } => {
                    usage.0.insert(RuntimeHelper::MountShow);
                    collect_builtin_helper_usage(&show.children, &mut usage.0);
                    if let Some(ComponentPropValueIr::Children(children)) = &show.fallback {
                        collect_builtin_helper_usage(children, &mut usage.0);
                    }
                }
                DynamicBinding::For { for_binding } => {
                    usage.0.insert(RuntimeHelper::MountFor);
                    collect_builtin_helper_usage(&for_binding.body, &mut usage.0);
                }
                DynamicBinding::Transition { transition } => {
                    usage.0.insert(RuntimeHelper::MountTransition);
                    collect_builtin_helper_usage(&transition.children, &mut usage.0);
                }
                DynamicBinding::DynamicRegion { region } => {
                    usage.0.insert(RuntimeHelper::MountDynamic);
                    collect_dynamic_region_helper_usage(region, &mut usage.0);
                }
            }
        }
        usage
    }
}

fn collect_component_helper_usage(
    component: &ComponentBindingIr,
    usage: &mut HashSet<RuntimeHelper>,
) {
    if component.kind == "Slot" {
        usage.insert(RuntimeHelper::CreateSlot);
    } else {
        usage.insert(RuntimeHelper::CreateComponent);
    }
    if component
        .props
        .iter()
        .any(|prop| matches!(prop, ComponentPropIr::Spread(_)))
    {
        usage.insert(RuntimeHelper::MergeProps);
    }
    for prop in component.props.iter().filter_map(ComponentPropIr::named) {
        let ComponentPropValueIr::Children(children) = &prop.value else {
            continue;
        };
        for child in children {
            match child {
                ChildIr::Element(element) => {
                    for binding in collect_dynamic_bindings(element) {
                        collect_binding_helper_usage(&binding, usage);
                    }
                }
                ChildIr::Fragment(fragment) => {
                    for binding in
                        collect_root_dynamic_bindings(&RootIr::Fragment(fragment.clone()))
                    {
                        collect_binding_helper_usage(&binding, usage);
                    }
                }
                ChildIr::Component(component) => collect_component_helper_usage(component, usage),
                ChildIr::ErrorBoundary(boundary) => {
                    collect_error_boundary_helper_usage(boundary, usage);
                }
                ChildIr::Show(show) => {
                    usage.insert(RuntimeHelper::MountShow);
                    collect_builtin_helper_usage(&show.children, usage);
                    if let Some(ComponentPropValueIr::Children(children)) = &show.fallback {
                        collect_builtin_helper_usage(children, usage);
                    }
                }
                ChildIr::For(for_binding) => {
                    usage.insert(RuntimeHelper::MountFor);
                    collect_builtin_helper_usage(&for_binding.body, usage);
                }
                ChildIr::Transition(transition) => {
                    usage.insert(RuntimeHelper::MountTransition);
                    collect_builtin_helper_usage(&transition.children, usage);
                }
                ChildIr::DynamicText(dynamic) => {
                    collect_binding_helper_usage(&dynamic_binding(dynamic), usage);
                }
                ChildIr::DynamicRegion(region) => {
                    collect_binding_helper_usage(
                        &DynamicBinding::DynamicRegion {
                            region: region.clone(),
                        },
                        usage,
                    );
                }
                ChildIr::Text(_) => {}
            }
        }
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

pub(super) fn collect_builtin_helper_usage(
    children: &[ChildIr],
    usage: &mut HashSet<RuntimeHelper>,
) {
    for child in children {
        match child {
            ChildIr::Element(element) => {
                for binding in collect_dynamic_bindings(element) {
                    collect_binding_helper_usage(&binding, usage);
                }
            }
            ChildIr::Fragment(fragment) => {
                for binding in collect_root_dynamic_bindings(&RootIr::Fragment(fragment.clone())) {
                    collect_binding_helper_usage(&binding, usage);
                }
            }
            ChildIr::Component(component) => collect_component_helper_usage(component, usage),
            ChildIr::ErrorBoundary(boundary) => {
                collect_error_boundary_helper_usage(boundary, usage);
            }
            ChildIr::Show(show) => {
                usage.insert(RuntimeHelper::MountShow);
                collect_builtin_helper_usage(&show.children, usage);
                if let Some(ComponentPropValueIr::Children(children)) = &show.fallback {
                    collect_builtin_helper_usage(children, usage);
                }
            }
            ChildIr::For(for_binding) => {
                usage.insert(RuntimeHelper::MountFor);
                collect_builtin_helper_usage(&for_binding.body, usage);
            }
            ChildIr::Transition(transition) => {
                usage.insert(RuntimeHelper::MountTransition);
                collect_builtin_helper_usage(&transition.children, usage);
            }
            ChildIr::DynamicText(dynamic) => {
                collect_binding_helper_usage(&dynamic_binding(dynamic), usage);
            }
            ChildIr::DynamicRegion(region) => {
                collect_binding_helper_usage(
                    &DynamicBinding::DynamicRegion {
                        region: region.clone(),
                    },
                    usage,
                );
            }
            ChildIr::Text(_) => {}
        }
    }
}

fn collect_binding_helper_usage(binding: &DynamicBinding, usage: &mut HashSet<RuntimeHelper>) {
    match binding {
        DynamicBinding::Text { .. } => {
            usage.insert(RuntimeHelper::Insert);
            usage.insert(RuntimeHelper::BindText);
        }
        DynamicBinding::Node { .. } => {
            usage.insert(RuntimeHelper::Insert);
        }
        DynamicBinding::TextContent { .. } => {
            usage.insert(RuntimeHelper::BindTextContent);
        }
        DynamicBinding::Attribute { kind, .. } => {
            usage.insert(match kind {
                AttributeBindingKind::Attribute => RuntimeHelper::BindAttr,
                AttributeBindingKind::Class => RuntimeHelper::BindClass,
                AttributeBindingKind::Style => RuntimeHelper::BindStyle,
            });
        }
        DynamicBinding::Spread { .. } => {
            usage.insert(RuntimeHelper::BindSpread);
        }
        DynamicBinding::Property { .. } => {
            usage.insert(RuntimeHelper::BindProp);
        }
        DynamicBinding::Event { .. } => {
            usage.insert(RuntimeHelper::BindEvent);
        }
        DynamicBinding::Ref { .. } => {
            usage.insert(RuntimeHelper::BindRef);
        }
        DynamicBinding::Component { component } => {
            if component.kind == "Slot" {
                usage.insert(RuntimeHelper::CreateSlot);
            } else {
                usage.insert(RuntimeHelper::CreateComponent);
            }
            usage.insert(RuntimeHelper::Insert);
            collect_component_helper_usage(component, usage);
        }
        DynamicBinding::ErrorBoundary { boundary } => {
            usage.insert(RuntimeHelper::Insert);
            collect_error_boundary_helper_usage(boundary, usage);
        }
        DynamicBinding::Show { show } => {
            usage.insert(RuntimeHelper::MountShow);
            collect_builtin_helper_usage(&show.children, usage);
            if let Some(ComponentPropValueIr::Children(children)) = &show.fallback {
                collect_builtin_helper_usage(children, usage);
            }
        }
        DynamicBinding::For { for_binding } => {
            usage.insert(RuntimeHelper::MountFor);
            collect_builtin_helper_usage(&for_binding.body, usage);
        }
        DynamicBinding::Transition { transition } => {
            usage.insert(RuntimeHelper::MountTransition);
            collect_builtin_helper_usage(&transition.children, usage);
        }
        DynamicBinding::DynamicRegion { region } => {
            usage.insert(RuntimeHelper::MountDynamic);
            collect_dynamic_region_helper_usage(region, usage);
        }
    }
}

fn collect_dynamic_region_helper_usage(
    region: &DynamicRegionIr,
    usage: &mut HashSet<RuntimeHelper>,
) {
    match &region.expression {
        DynamicRegionExpressionIr::Value { .. } => {}
        DynamicRegionExpressionIr::Conditional {
            consequent,
            alternate,
            ..
        } => {
            collect_dynamic_region_value_helper_usage(consequent, usage);
            collect_dynamic_region_value_helper_usage(alternate, usage);
        }
        DynamicRegionExpressionIr::Logical { right, .. } => {
            collect_dynamic_region_value_helper_usage(right, usage);
        }
        DynamicRegionExpressionIr::ArrayMap { body, .. } => {
            collect_builtin_helper_usage(body, usage);
        }
        DynamicRegionExpressionIr::ArrayLiteral { items } => {
            for item in items {
                collect_dynamic_region_value_helper_usage(item, usage);
            }
        }
    }
}

fn collect_dynamic_region_value_helper_usage(
    value: &DynamicRegionValueIr,
    usage: &mut HashSet<RuntimeHelper>,
) {
    if let DynamicRegionValueIr::Children(children) = value {
        collect_builtin_helper_usage(children, usage);
    }
}

struct RuntimeNames {
    locals: HashMap<RuntimeHelper, String>,
    locator_attribute: String,
    enable_delegation: bool,
}

impl RuntimeNames {
    fn allocate(
        usage: &HelperUsage,
        locator_attribute: &str,
        enable_delegation: bool,
        names: &mut NameAllocator,
    ) -> Self {
        let locals = RuntimeHelper::ORDERED
            .iter()
            .filter(|helper| **helper == RuntimeHelper::Template || usage.0.contains(helper))
            .map(|helper| (*helper, names.allocate(helper.local_base())))
            .collect();
        Self {
            locals,
            locator_attribute: locator_attribute.into(),
            enable_delegation,
        }
    }

    fn locator_attribute(&self) -> &str {
        &self.locator_attribute
    }

    fn entries(&self) -> Vec<(&'static str, &str)> {
        RuntimeHelper::ORDERED
            .iter()
            .filter_map(|helper| {
                self.locals
                    .get(helper)
                    .map(|local| (helper.exported(), local.as_str()))
            })
            .collect()
    }

    fn get(&self, helper: RuntimeHelper) -> &str {
        self.locals.get(&helper).map_or_else(
            || panic!("{} helper usage was not collected", helper.exported()),
            String::as_str,
        )
    }

    fn template(&self) -> &str {
        self.get(RuntimeHelper::Template)
    }

    fn auto_hydrate_component(&self) -> &str {
        self.get(RuntimeHelper::AutoHydrateComponent)
    }

    fn create_component(&self) -> &str {
        self.get(RuntimeHelper::CreateComponent)
    }

    fn create_slot(&self) -> &str {
        self.get(RuntimeHelper::CreateSlot)
    }

    fn error_boundary(&self) -> &str {
        self.get(RuntimeHelper::ErrorBoundary)
    }

    fn mount_show(&self) -> &str {
        self.get(RuntimeHelper::MountShow)
    }

    fn mount_for(&self) -> &str {
        self.get(RuntimeHelper::MountFor)
    }

    fn mount_transition(&self) -> &str {
        self.get(RuntimeHelper::MountTransition)
    }

    fn mount_dynamic(&self) -> &str {
        self.get(RuntimeHelper::MountDynamic)
    }

    fn insert(&self) -> &str {
        self.get(RuntimeHelper::Insert)
    }

    fn bind_text(&self) -> &str {
        self.get(RuntimeHelper::BindText)
    }

    fn bind_text_content(&self) -> &str {
        self.get(RuntimeHelper::BindTextContent)
    }

    fn bind_attr(&self) -> &str {
        self.get(RuntimeHelper::BindAttr)
    }

    fn bind_class(&self) -> &str {
        self.get(RuntimeHelper::BindClass)
    }

    fn bind_style(&self) -> &str {
        self.get(RuntimeHelper::BindStyle)
    }

    fn bind_spread(&self) -> &str {
        self.get(RuntimeHelper::BindSpread)
    }
    fn merge_props(&self) -> &str {
        self.get(RuntimeHelper::MergeProps)
    }

    fn bind_prop(&self) -> &str {
        self.get(RuntimeHelper::BindProp)
    }

    fn bind_event(&self) -> &str {
        self.get(RuntimeHelper::BindEvent)
    }

    fn bind_ref(&self) -> &str {
        self.get(RuntimeHelper::BindRef)
    }

    fn delegate_events(&self) -> &str {
        self.get(RuntimeHelper::DelegateEvents)
    }

    fn should_delegate_event(&self, event_name: &str) -> bool {
        self.enable_delegation && is_delegatable_event(event_name)
    }
}

fn emit_event_handler(writer: &mut CodeWriter, handler: &ExpressionIr, names: &mut NameAllocator) {
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

#[cfg(test)]
mod tests {
    use super::NameAllocator;

    #[test]
    fn allocator_advances_suffixes_without_rescanning_or_skipping_reserved_names() {
        let mut names = NameAllocator::new(&["$x".into(), "$x0".into()]);

        assert_eq!(names.allocate("$x"), "$x1");
        assert_eq!(names.allocate("$x"), "$x2");
        assert_eq!(names.allocate("$y"), "$y");
        assert_eq!(names.allocate("$y"), "$y0");
    }
}
