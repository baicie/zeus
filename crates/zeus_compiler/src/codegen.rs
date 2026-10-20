use std::collections::{BTreeSet, HashMap, HashSet};

use oxc_sourcemap::SourceMapBuilder;

use crate::{
    PureDefineElementMode, RawSourceMap, TransformModuleResult,
    html::{is_raw_text_element, is_svg_element, is_void_element},
    hydration::{component_root_marker_id, element_marker_id, node_marker_id, text_marker_id},
    ir::{
        AttributeIr, ChildIr, ComponentBindingIr, ComponentIr, ComponentPropIr,
        ComponentPropValueIr, DynamicRegionExpressionIr, DynamicRegionIr, DynamicRegionValueIr,
        ElementIr, ErrorBoundaryBindingIr, ErrorBoundaryFallbackIr, ExpressionForm, ExpressionIr,
        ForBindingIr, FragmentIr, ModuleIr, NodeId, RootIr, ShowBindingIr, StaticAttributeValue,
        TransitionBindingIr, TransitionOptionIr, is_children_expression,
    },
    lower::HmrInfo,
};

#[derive(Clone, Copy)]
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
}

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
    } = *options;
    let mut names = NameAllocator::new(reserved_names);
    let binding_sets = collect_component_bindings(module);
    let delegated_event_names = collect_delegated_events(module, enable_delegation);
    let helper_usage =
        collect_module_helper_usage(module, &binding_sets, !delegated_event_names.is_empty());
    let locator_attribute = allocate_locator_attribute(module);
    let runtime = RuntimeNames::allocate(&helper_usage, &locator_attribute, &mut names);

    let mut generated = module
        .components
        .iter()
        .zip(binding_sets)
        .map(|(component, bindings)| {
            GeneratedComponent::new(component, bindings, &locator_attribute, &mut names)
        })
        .collect::<Vec<_>>();
    intern_static_templates(&mut generated);

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
    push_source_range(&mut writer, source, 0, cursor, &source_insertions, false);
    if cursor > 0 && !writer.code.ends_with('\n') {
        writer.push("\n");
    }
    if !module.components.is_empty() {
        emit_runtime_import(&mut writer, &runtime, runtime_module);
    }
    emit_hmr_boundary(&mut writer, enable_hmr, hmr, &hmr_disposers);

    emit_templates(&mut writer, &generated, &runtime);

    let mut component_emitter = ComponentEmitter {
        runtime: &runtime,
        locator_attribute: &locator_attribute,
        names: &mut names,
    };
    cursor = emit_components(
        &mut writer,
        source,
        cursor,
        &generated,
        &source_insertions,
        &mut component_emitter,
    );
    push_source_range(
        &mut writer,
        source,
        cursor,
        source.len(),
        &source_insertions,
        true,
    );
    emit_delegated_events(&mut writer, &runtime, &delegated_event_names);

    let map = source_map.then(|| build_source_map(filename, source, &writer.mappings));

    TransformModuleResult {
        code: writer.code,
        map,
        diagnostics: Vec::new(),
        hydration_plan: None,
    }
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
        if component.template_html.is_empty() || !emitted.insert(component.template_name.as_str()) {
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
}

fn emit_components(
    writer: &mut CodeWriter,
    source: &str,
    mut cursor: usize,
    components: &[GeneratedComponent],
    source_insertions: &[SourceInsertion],
    emitter: &mut ComponentEmitter<'_>,
) -> usize {
    for component in components {
        let start = usize::try_from(component.start).unwrap_or(usize::MAX);
        let end = usize::try_from(component.end).unwrap_or(usize::MAX);
        if start < cursor || end > source.len() {
            continue;
        }
        push_source_range(writer, source, cursor, start, source_insertions, false);
        emit_component(
            writer,
            component,
            emitter.runtime,
            emitter.locator_attribute,
            emitter.names,
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
    source: &str,
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
        writer.push(&source[cursor..insertion.offset]);
        writer.push(&insertion.text);
        cursor = insertion.offset;
    }
    writer.push(&source[cursor..end]);
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
            text: format!("({hmr_disposers}.push("),
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

fn emit_hmr_boundary(writer: &mut CodeWriter, enabled: bool, hmr: &HmrInfo, disposers: &str) {
    if !enabled || hmr.manual_boundary || disposers.is_empty() {
        return;
    }
    if !writer.code.ends_with('\n') {
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
    writer.push("      }\n    }\n  })\n}\n");
}

pub(crate) struct SsrModuleOptions<'a> {
    pub(crate) source: &'a str,
    pub(crate) filename: &'a str,
    pub(crate) runtime_module: &'a str,
    pub(crate) source_map: bool,
    pub(crate) module: &'a ModuleIr,
    pub(crate) reserved_names: &'a [String],
    pub(crate) define_element_calls: &'a [oxc_span::Span],
    pub(crate) ssr_runtime_imports: &'a [oxc_span::Span],
}

pub(crate) fn emit_ssr_module(options: &SsrModuleOptions<'_>) -> TransformModuleResult {
    let SsrModuleOptions {
        source,
        filename,
        runtime_module,
        source_map,
        module,
        reserved_names,
        define_element_calls,
        ssr_runtime_imports,
    } = *options;
    let mut names = NameAllocator::new(reserved_names);
    let runtime = SsrRuntimeNames::allocate(&mut names);
    let source_emitter = SsrSourceEmitter {
        source,
        runtime_module,
        define_element_calls,
        ssr_runtime_imports,
        runtime: &runtime,
    };
    let mut writer = CodeWriter::default();
    let mut cursor = usize::try_from(module.preamble_end)
        .unwrap_or(usize::MAX)
        .min(source.len());
    source_emitter.emit(&mut writer, 0, cursor);
    if cursor > 0 && !writer.code.ends_with('\n') {
        writer.push("\n");
    }
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

    for component in &module.components {
        let start = usize::try_from(root_span(&component.root).start.offset).unwrap_or(usize::MAX);
        let end = usize::try_from(root_span(&component.root).end.offset).unwrap_or(usize::MAX);
        if start < cursor || end > source.len() {
            continue;
        }
        source_emitter.emit(&mut writer, cursor, start);
        emit_ssr_root(&mut writer, &component.root, &runtime, component.id);
        cursor = end;
    }
    source_emitter.emit(&mut writer, cursor, source.len());

    let map = source_map.then(|| build_source_map(filename, source, &writer.mappings));
    TransformModuleResult {
        code: writer.code,
        map,
        diagnostics: Vec::new(),
        hydration_plan: None,
    }
}

struct SsrSourceEmitter<'a> {
    source: &'a str,
    runtime_module: &'a str,
    define_element_calls: &'a [oxc_span::Span],
    ssr_runtime_imports: &'a [oxc_span::Span],
    runtime: &'a SsrRuntimeNames,
}

impl SsrSourceEmitter<'_> {
    fn emit(&self, writer: &mut CodeWriter, start: usize, end: usize) {
        let mut replacements = self
            .define_element_calls
            .iter()
            .filter_map(|span| {
                let start = usize::try_from(span.start).ok()?;
                let name_end = identifier_end(self.source, start, self.source.len())?;
                Some((start, name_end, self.runtime.define_element().to_string()))
            })
            .chain(self.ssr_runtime_imports.iter().filter_map(|span| {
                let start = usize::try_from(span.start).ok()?;
                let end = usize::try_from(span.end).ok()?;
                Some((start, end, quote_js(self.runtime_module)))
            }))
            .filter(|(replacement_start, replacement_end, _)| {
                *replacement_start >= start
                    && *replacement_start < end
                    && *replacement_end <= end
                    && *replacement_end > *replacement_start
            })
            .collect::<Vec<_>>();
        replacements.sort_by_key(|replacement| replacement.0);

        let mut cursor = start;
        for (replacement_start, replacement_end, replacement) in replacements {
            if replacement_start < cursor {
                continue;
            }
            writer.push(&self.source[cursor..replacement_start]);
            writer.push(&replacement);
            cursor = replacement_end;
        }
        writer.push(&self.source[cursor..end]);
    }
}

fn identifier_end(source: &str, start: usize, limit: usize) -> Option<usize> {
    let mut end = start;
    for (offset, character) in source[start..limit].char_indices() {
        let valid = if offset == 0 {
            character == '_' || character == '$' || character.is_alphabetic()
        } else {
            character == '_' || character == '$' || character.is_alphanumeric()
        };
        if !valid {
            break;
        }
        end = start + offset + character.len_utf8();
    }
    (end > start).then_some(end)
}

fn emit_ssr_root(
    writer: &mut CodeWriter,
    root: &RootIr,
    runtime: &SsrRuntimeNames,
    component_id: NodeId,
) {
    writer.push("[");
    emit_ssr_marker(writer, runtime, &component_root_marker_id(component_id));
    writer.push(", ");
    match root {
        RootIr::Element(element) => emit_ssr_element(writer, element, runtime, component_id),
        RootIr::Fragment(fragment) => {
            emit_ssr_children(writer, &fragment.children, runtime, false, component_id);
        }
        RootIr::Component(component) => {
            emit_ssr_component(writer, component, runtime, component_id);
        }
        RootIr::Show(show) => emit_ssr_show(writer, show, runtime, component_id),
        RootIr::For(for_binding) => emit_ssr_for(writer, for_binding, runtime, component_id),
        RootIr::Transition(transition) => {
            emit_ssr_transition(writer, transition, runtime, component_id);
        }
        RootIr::ErrorBoundary(_) => unreachable!("ErrorBoundary SSR is rejected before codegen"),
    }
    writer.push("]");
}

fn emit_ssr_child(
    writer: &mut CodeWriter,
    child: &ChildIr,
    runtime: &SsrRuntimeNames,
    raw_text: bool,
    component_id: NodeId,
) {
    match child {
        ChildIr::Element(element) => {
            emit_ssr_element_with_context(writer, element, runtime, raw_text, component_id);
        }
        ChildIr::Fragment(fragment) => {
            emit_ssr_children(writer, &fragment.children, runtime, raw_text, component_id);
        }
        ChildIr::Text(text) => {
            if raw_text {
                writer.push(&quote_js(&text.value));
            } else {
                writer.push(runtime.static_text());
                writer.push("(");
                writer.push(&quote_js(&text.value));
                writer.push(")");
            }
        }
        ChildIr::DynamicText(text) => {
            if raw_text {
                writer.push_mapped(&text.expression.code, &text.expression);
            } else {
                writer.push("[");
                emit_ssr_marker(
                    writer,
                    runtime,
                    &text_marker_id(component_id, text.reference.node_id),
                );
                writer.push(", ");
                writer.push(runtime.text());
                writer.push("(");
                writer.push_mapped(&text.expression.code, &text.expression);
                writer.push(")");
                writer.push("]");
            }
        }
        ChildIr::Component(component) => {
            emit_ssr_component(writer, component, runtime, component_id);
        }
        ChildIr::Show(show) => emit_ssr_show(writer, show, runtime, component_id),
        ChildIr::For(for_binding) => {
            emit_ssr_for(writer, for_binding, runtime, component_id);
        }
        ChildIr::Transition(transition) => {
            emit_ssr_transition(writer, transition, runtime, component_id);
        }
        ChildIr::ErrorBoundary(_) => unreachable!("ErrorBoundary SSR is rejected before codegen"),
        ChildIr::DynamicRegion(region) => {
            emit_ssr_dynamic_region(writer, region, runtime, component_id);
        }
    }
}

fn emit_ssr_children(
    writer: &mut CodeWriter,
    children: &[ChildIr],
    runtime: &SsrRuntimeNames,
    raw_text: bool,
    component_id: NodeId,
) {
    if children.len() == 1 {
        emit_ssr_child(writer, &children[0], runtime, raw_text, component_id);
        return;
    }
    writer.push("[");
    for (index, child) in children.iter().enumerate() {
        if index > 0 {
            writer.push(", ");
        }
        emit_ssr_child(writer, child, runtime, raw_text, component_id);
    }
    writer.push("]");
}

fn emit_ssr_dynamic_region(
    writer: &mut CodeWriter,
    region: &DynamicRegionIr,
    runtime: &SsrRuntimeNames,
    component_id: NodeId,
) {
    writer.push("[");
    emit_ssr_marker(
        writer,
        runtime,
        &node_marker_id(component_id, "region", region.id),
    );
    writer.push(", ");
    match &region.expression {
        DynamicRegionExpressionIr::Value { expression } => {
            writer.push_mapped(&expression.code, expression);
        }
        DynamicRegionExpressionIr::Conditional {
            test,
            consequent,
            alternate,
        } => {
            writer.push("(");
            writer.push_mapped(&test.code, test);
            writer.push(" ? ");
            emit_ssr_dynamic_region_value(writer, consequent, runtime, component_id);
            writer.push(" : ");
            emit_ssr_dynamic_region_value(writer, alternate, runtime, component_id);
            writer.push(")");
        }
        DynamicRegionExpressionIr::Logical {
            left,
            operator,
            right,
        } => {
            writer.push("(");
            writer.push_mapped(&left.code, left);
            writer.push(" ");
            writer.push(operator);
            writer.push(" ");
            emit_ssr_dynamic_region_value(writer, right, runtime, component_id);
            writer.push(")");
        }
        DynamicRegionExpressionIr::ArrayMap {
            each,
            item,
            index,
            body,
        } => {
            writer.push("(");
            writer.push_mapped(&each.code, each);
            writer.push(" ?? []).map((");
            writer.push(item);
            if let Some(index) = index {
                writer.push(", ");
                writer.push(index);
            }
            writer.push(") => ");
            emit_ssr_children(writer, body, runtime, false, component_id);
            writer.push(")");
        }
        DynamicRegionExpressionIr::ArrayLiteral { items } => {
            writer.push("[");
            for (index, item) in items.iter().enumerate() {
                if index > 0 {
                    writer.push(", ");
                }
                emit_ssr_dynamic_region_value(writer, item, runtime, component_id);
            }
            writer.push("]");
        }
    }
    writer.push("]");
}

fn emit_ssr_dynamic_region_value(
    writer: &mut CodeWriter,
    value: &DynamicRegionValueIr,
    runtime: &SsrRuntimeNames,
    component_id: NodeId,
) {
    match value {
        DynamicRegionValueIr::Expression(expression) => {
            writer.push_mapped(&expression.code, expression);
        }
        DynamicRegionValueIr::Children(children) => {
            emit_ssr_children(writer, children, runtime, false, component_id);
        }
    }
}

fn emit_ssr_element(
    writer: &mut CodeWriter,
    element: &ElementIr,
    runtime: &SsrRuntimeNames,
    component_id: NodeId,
) {
    emit_ssr_element_with_context(writer, element, runtime, false, component_id);
}

fn emit_ssr_element_with_context(
    writer: &mut CodeWriter,
    element: &ElementIr,
    runtime: &SsrRuntimeNames,
    _raw_text: bool,
    component_id: NodeId,
) {
    writer.push("[");
    emit_ssr_marker(
        writer,
        runtime,
        &element_marker_id(component_id, element.reference.node_id),
    );
    writer.push(", ");
    writer.push(runtime.element());
    writer.push("(");
    writer.push(&quote_js(&element.tag_name));
    writer.push(", ");
    if element_has_spread(element) {
        writer.push(&runtime.spread);
        writer.push("(");
        emit_attribute_sources(writer, &element.attributes, None);
        writer.push(")");
    } else {
        writer.push("[");
        let mut first = true;
        for attribute in &element.attributes {
            match attribute {
                AttributeIr::Static(attribute) => {
                    if !first {
                        writer.push(", ");
                    }
                    first = false;
                    writer.push(runtime.attr());
                    writer.push("(");
                    writer.push(&quote_js(&attribute.name));
                    writer.push(", ");
                    match &attribute.value {
                        StaticAttributeValue::String(value) => writer.push(&quote_js(value)),
                        StaticAttributeValue::Boolean => writer.push("true"),
                    }
                    writer.push(")");
                }
                AttributeIr::Dynamic(attribute) => {
                    if !first {
                        writer.push(", ");
                    }
                    first = false;
                    writer.push(runtime.attr());
                    writer.push("(");
                    writer.push(&quote_js(&attribute.name));
                    writer.push(", ");
                    emit_ssr_expression_value(writer, &attribute.expression);
                    writer.push(")");
                }
                AttributeIr::Property(attribute) => {
                    if !first {
                        writer.push(", ");
                    }
                    first = false;
                    writer.push(runtime.prop());
                    writer.push("(");
                    writer.push(&quote_js(&attribute.name));
                    writer.push(", ");
                    emit_ssr_expression_value(writer, &attribute.expression);
                    writer.push(")");
                }
                AttributeIr::Event(_) | AttributeIr::Ref(_) | AttributeIr::Spread(_) => {}
            }
        }
        writer.push("]");
    }
    if !element.children.is_empty() && !is_void_element(&element.tag_name) {
        writer.push(", ");
        emit_ssr_children(
            writer,
            &element.children,
            runtime,
            is_unescaped_raw_text(&element.tag_name),
            component_id,
        );
    } else if is_void_element(&element.tag_name) {
        writer.push(", undefined, true");
    }
    writer.push(")");
    writer.push("]");
}

fn emit_ssr_expression_value(writer: &mut CodeWriter, expression: &ExpressionIr) {
    writer.push_mapped(&expression.code, expression);
}

fn emit_ssr_marker(writer: &mut CodeWriter, runtime: &SsrRuntimeNames, id: &str) {
    writer.push(runtime.hydration_marker());
    writer.push("(");
    writer.push(&quote_js(id));
    writer.push(")");
}

fn emit_ssr_component(
    writer: &mut CodeWriter,
    component: &ComponentBindingIr,
    runtime: &SsrRuntimeNames,
    component_id: NodeId,
) {
    writer.push("[");
    emit_ssr_marker(
        writer,
        runtime,
        &node_marker_id(component_id, "component", component.id),
    );
    writer.push(", ");
    let builtin = match component.kind.as_str() {
        "Host" => Some(runtime.host()),
        "Slot" => Some(runtime.slot()),
        _ => None,
    };
    writer.push(builtin.unwrap_or_else(|| runtime.component()));
    writer.push("(");
    if builtin.is_none() {
        writer.push_mapped(&component.callee.code, &component.callee);
        writer.push(", ");
    }
    let spread = component
        .props
        .iter()
        .any(|prop| matches!(prop, ComponentPropIr::Spread(_)));
    if spread {
        writer.push(&runtime.merge_props);
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
                    ComponentPropValueIr::Expression(expression)
                        if is_static_expression(expression) =>
                    {
                        writer.push(&object_key(&prop.name));
                        writer.push(": ");
                        writer.push_mapped(&expression.code, expression);
                    }
                    ComponentPropValueIr::Expression(expression) => {
                        writer.push("get ");
                        writer.push(&object_key(&prop.name));
                        writer.push("() { return ");
                        emit_ssr_expression_value(writer, expression);
                        writer.push(" }");
                    }
                    ComponentPropValueIr::Children(children) => {
                        writer.push("get ");
                        writer.push(&object_key(&prop.name));
                        writer.push("() { return ");
                        emit_ssr_children(writer, children, runtime, false, component_id);
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
    writer.push("]");
}
fn emit_ssr_show(
    writer: &mut CodeWriter,
    show: &ShowBindingIr,
    runtime: &SsrRuntimeNames,
    component_id: NodeId,
) {
    writer.push("[");
    emit_ssr_marker(
        writer,
        runtime,
        &node_marker_id(component_id, "show", show.id),
    );
    writer.push(", ");
    writer.push(runtime.show());
    writer.push("(() => ");
    writer.push_mapped(&show.when.code, &show.when);
    writer.push(", () => ");
    emit_ssr_children(writer, &show.children, runtime, false, component_id);
    if let Some(fallback) = &show.fallback {
        writer.push(", () => ");
        match fallback {
            ComponentPropValueIr::Expression(expression) => {
                emit_ssr_expression_value(writer, expression);
            }
            ComponentPropValueIr::Children(children) => {
                emit_ssr_children(writer, children, runtime, false, component_id);
            }
        }
    }
    writer.push(")");
    writer.push("]");
}

fn emit_ssr_for(
    writer: &mut CodeWriter,
    for_binding: &ForBindingIr,
    runtime: &SsrRuntimeNames,
    component_id: NodeId,
) {
    writer.push("[");
    emit_ssr_marker(
        writer,
        runtime,
        &node_marker_id(component_id, "for", for_binding.id),
    );
    writer.push(", ");
    writer.push(runtime.for_each());
    writer.push("(() => ");
    writer.push_mapped(&for_binding.each.code, &for_binding.each);
    writer.push(", (");
    writer.push(&for_binding.item);
    if let Some(index) = &for_binding.index {
        writer.push(", ");
        writer.push(index);
    }
    writer.push(") => ");
    emit_ssr_children(writer, &for_binding.body, runtime, false, component_id);
    writer.push(")");
    writer.push("]");
}

fn emit_ssr_transition(
    writer: &mut CodeWriter,
    transition: &TransitionBindingIr,
    runtime: &SsrRuntimeNames,
    component_id: NodeId,
) {
    // SSR has no animation lifecycle. Preserve the runtime's initial visibility
    // decision and serialize only the mounted branch.
    writer.push("[");
    emit_ssr_marker(
        writer,
        runtime,
        &node_marker_id(component_id, "transition", transition.id),
    );
    writer.push(", (");
    writer.push_mapped(&transition.when.code, &transition.when);
    writer.push(" ? ");
    emit_ssr_children(writer, &transition.children, runtime, false, component_id);
    writer.push(" : null)]");
}

fn emit_delegated_events(
    writer: &mut CodeWriter,
    runtime: &RuntimeNames,
    delegated_events: &[String],
) {
    if delegated_events.is_empty() {
        return;
    }
    if !writer.code.ends_with('\n') {
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
            DynamicBinding::Text { expression, once } => {
                emit_text_binding(writer, expression, *once, &markers[marker_index], runtime);
                marker_index += 1;
            }
            DynamicBinding::Node { expression } => {
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
    writer.push(");\n");
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
    emit_component(writer, &generated, runtime, locator_attribute, names);
    writer.push(";\n})()");
}

fn object_key(name: &str) -> String {
    if is_valid_identifier(name) {
        name.to_owned()
    } else {
        quote_js(name)
    }
}

fn is_valid_identifier(name: &str) -> bool {
    let mut chars = name.chars();
    let Some(first) = chars.next() else {
        return false;
    };
    (first == '_' || first == '$' || first.is_ascii_alphabetic())
        && chars.all(|character| {
            character == '_' || character == '$' || character.is_ascii_alphanumeric()
        })
}

fn is_static_expression(expression: &ExpressionIr) -> bool {
    expression.form == ExpressionForm::Value
        && (expression.code == "true"
            || expression.code == "false"
            || expression.code == "null"
            || expression.code.starts_with('"')
            || expression.code.starts_with('\'')
            || expression
                .code
                .chars()
                .next()
                .is_some_and(|c| c.is_ascii_digit()))
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

fn emit_attribute_sources(
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
            let name = match attribute {
                AttributeIr::Static(attr) => attr.name.clone(),
                AttributeIr::Dynamic(attr) => attr.name.clone(),
                AttributeIr::Property(attr) => format!("prop:{}", attr.name),
                AttributeIr::Event(attr) => format!("on{}", attr.event_name),
                AttributeIr::Ref(_) => "ref".into(),
                AttributeIr::Spread(_) => unreachable!(),
            };
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
            ChildIr::Text(text) if is_unescaped_raw_text(&element.tag_name) => {
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

fn element_has_spread(element: &ElementIr) -> bool {
    element
        .attributes
        .iter()
        .any(|attribute| matches!(attribute, AttributeIr::Spread(_)))
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
            expression: dynamic.expression.clone(),
        }
    } else {
        DynamicBinding::Text {
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

fn is_unescaped_raw_text(tag_name: &str) -> bool {
    tag_name.eq_ignore_ascii_case("script") || tag_name.eq_ignore_ascii_case("style")
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

fn collect_delegated_events(module: &ModuleIr, enable_delegation: bool) -> Vec<String> {
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
        if let AttributeIr::Event(event) = attribute {
            names.insert(event.event_name.clone());
        }
    }
    collect_child_delegated_events(&element.children, names);
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

fn collect_error_boundary_attribute_names(
    boundary: &ErrorBoundaryBindingIr,
    names: &mut HashSet<String>,
) {
    collect_builtin_attribute_names(&boundary.children, names);
    if let ErrorBoundaryFallbackIr::Render(render) = &boundary.fallback {
        collect_builtin_attribute_names(&render.body, names);
    }
}

fn collect_error_boundary_helper_usage(
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

fn collect_child_delegated_events(children: &[ChildIr], names: &mut BTreeSet<String>) {
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

fn collect_dynamic_region_delegated_events(region: &DynamicRegionIr, names: &mut BTreeSet<String>) {
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

fn allocate_locator_attribute(module: &ModuleIr) -> String {
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

fn build_source_map(filename: &str, source: &str, mappings: &[Mapping]) -> RawSourceMap {
    let mut builder = SourceMapBuilder::default();
    builder.set_file(filename);
    let source_name = filename
        .rsplit(['/', '\\'])
        .next()
        .filter(|name| !name.is_empty())
        .unwrap_or(filename);
    let source_id = builder.add_source_and_content(source_name, source);

    for mapping in mappings {
        builder.add_token(
            mapping.generated_line,
            mapping.generated_column,
            mapping.original_line,
            mapping.original_column,
            Some(source_id),
            None,
        );
    }

    serde_json::from_str(&builder.into_sourcemap().to_json_string())
        .expect("oxc_sourcemap always emits valid Source Map v3 JSON")
}

fn quote_js(value: &str) -> String {
    serde_json::to_string(value).expect("strings always serialize as JSON")
}

fn escape_html_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

fn escape_html_attribute(value: &str) -> String {
    escape_html_text(value).replace('"', "&quot;")
}

enum RootBuiltin {
    ErrorBoundary(ErrorBoundaryBindingIr),
    Show(ShowBindingIr),
    For(ForBindingIr),
    Transition(TransitionBindingIr),
}

struct GeneratedComponent {
    start: u32,
    end: u32,
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

fn root_span(root: &RootIr) -> &crate::span::SourceSpan {
    match root {
        RootIr::Element(element) => &element.span,
        RootIr::Fragment(fragment) => &fragment.span,
        RootIr::Component(component) => &component.span,
        RootIr::Show(show) => &show.span,
        RootIr::For(for_binding) => &for_binding.span,
        RootIr::ErrorBoundary(boundary) => &boundary.span,
        RootIr::Transition(transition) => &transition.span,
    }
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
            start: root_span(&component.root).start.offset,
            end: root_span(&component.root).end.offset,
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
            start: root_span(root).start.offset,
            end: root_span(root).end.offset,
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
}

struct ElementTarget {
    id: NodeId,
    name: String,
}

enum DynamicBinding {
    Text {
        expression: ExpressionIr,
        once: bool,
    },
    Node {
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

fn collect_builtin_helper_usage(children: &[ChildIr], usage: &mut HashSet<RuntimeHelper>) {
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
}

struct SsrRuntimeNames {
    static_text: String,
    text: String,
    element: String,
    attr: String,
    prop: String,
    component: String,
    show: String,
    for_each: String,
    spread: String,
    merge_props: String,
    hydration_marker: String,
    define_element: String,
    host: String,
    slot: String,
}

impl SsrRuntimeNames {
    fn allocate(names: &mut NameAllocator) -> Self {
        Self {
            static_text: names.allocate("$zeusSsrStatic"),
            text: names.allocate("$zeusSsrText"),
            element: names.allocate("$zeusSsrElement"),
            attr: names.allocate("$zeusSsrAttr"),
            prop: names.allocate("$zeusSsrProp"),
            component: names.allocate("$zeusSsrComponent"),
            show: names.allocate("$zeusSsrShow"),
            for_each: names.allocate("$zeusSsrFor"),
            spread: names.allocate("$zeusSsrSpread"),
            merge_props: names.allocate("$zeusMergeProps"),
            hydration_marker: names.allocate("$zeusHydrationMarker"),
            define_element: names.allocate("$zeusSsrDefineElement"),
            host: names.allocate("$zeusSsrHost"),
            slot: names.allocate("$zeusSsrSlot"),
        }
    }

    fn entries(&self) -> [(&'static str, &str); 14] {
        [
            ("ssrStatic", &self.static_text),
            ("ssrText", &self.text),
            ("ssrElement", &self.element),
            ("ssrAttr", &self.attr),
            ("ssrProp", &self.prop),
            ("ssrComponent", &self.component),
            ("ssrShow", &self.show),
            ("ssrFor", &self.for_each),
            ("ssrSpread", &self.spread),
            ("mergeProps", &self.merge_props),
            ("ssrHydrationMarker", &self.hydration_marker),
            ("defineElement", &self.define_element),
            ("Host", &self.host),
            ("Slot", &self.slot),
        ]
    }

    fn static_text(&self) -> &str {
        &self.static_text
    }
    fn text(&self) -> &str {
        &self.text
    }
    fn element(&self) -> &str {
        &self.element
    }
    fn attr(&self) -> &str {
        &self.attr
    }
    fn prop(&self) -> &str {
        &self.prop
    }
    fn component(&self) -> &str {
        &self.component
    }
    fn show(&self) -> &str {
        &self.show
    }
    fn for_each(&self) -> &str {
        &self.for_each
    }
    fn hydration_marker(&self) -> &str {
        &self.hydration_marker
    }
    fn define_element(&self) -> &str {
        &self.define_element
    }
    fn host(&self) -> &str {
        &self.host
    }
    fn slot(&self) -> &str {
        &self.slot
    }
}

impl RuntimeNames {
    fn allocate(usage: &HelperUsage, locator_attribute: &str, names: &mut NameAllocator) -> Self {
        let locals = RuntimeHelper::ORDERED
            .iter()
            .filter(|helper| **helper == RuntimeHelper::Template || usage.0.contains(helper))
            .map(|helper| (*helper, names.allocate(helper.local_base())))
            .collect();
        Self {
            locals,
            locator_attribute: locator_attribute.into(),
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
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
enum RuntimeHelper {
    Template,
    CreateComponent,
    CreateSlot,
    ErrorBoundary,
    MountShow,
    MountFor,
    MountTransition,
    MountDynamic,
    Insert,
    BindText,
    BindTextContent,
    BindAttr,
    BindClass,
    BindStyle,
    BindProp,
    BindSpread,
    MergeProps,
    BindEvent,
    BindRef,
    DelegateEvents,
}

impl RuntimeHelper {
    const ORDERED: [Self; 20] = [
        Self::Template,
        Self::CreateComponent,
        Self::CreateSlot,
        Self::ErrorBoundary,
        Self::MountShow,
        Self::MountFor,
        Self::MountTransition,
        Self::MountDynamic,
        Self::Insert,
        Self::BindText,
        Self::BindTextContent,
        Self::BindAttr,
        Self::BindClass,
        Self::BindStyle,
        Self::BindProp,
        Self::BindSpread,
        Self::MergeProps,
        Self::BindEvent,
        Self::BindRef,
        Self::DelegateEvents,
    ];

    const fn exported(self) -> &'static str {
        match self {
            Self::Template => "template",
            Self::CreateComponent => "createComponent",
            Self::CreateSlot => "createSlot",
            Self::ErrorBoundary => "ErrorBoundary",
            Self::MountShow => "mountShow",
            Self::MountFor => "mountFor",
            Self::MountTransition => "mountTransition",
            Self::MountDynamic => "mountDynamic",
            Self::Insert => "insert",
            Self::BindText => "bindText",
            Self::BindTextContent => "bindTextContent",
            Self::BindAttr => "bindAttr",
            Self::BindClass => "bindClass",
            Self::BindStyle => "bindStyle",
            Self::BindProp => "bindProp",
            Self::BindSpread => "bindSpread",
            Self::MergeProps => "mergeProps",
            Self::BindEvent => "bindEvent",
            Self::BindRef => "bindRef",
            Self::DelegateEvents => "delegateEvents",
        }
    }

    const fn local_base(self) -> &'static str {
        match self {
            Self::Template => "$zeusTemplate",
            Self::CreateComponent => "$zeusCreateComponent",
            Self::CreateSlot => "$zeusCreateSlot",
            Self::ErrorBoundary => "$zeusErrorBoundary",
            Self::MountShow => "$zeusMountShow",
            Self::MountFor => "$zeusMountFor",
            Self::MountTransition => "$zeusMountTransition",
            Self::MountDynamic => "$zeusMountDynamic",
            Self::Insert => "$zeusInsert",
            Self::BindText => "$zeusBindText",
            Self::BindTextContent => "$zeusBindTextContent",
            Self::BindAttr => "$zeusBindAttr",
            Self::BindClass => "$zeusBindClass",
            Self::BindStyle => "$zeusBindStyle",
            Self::BindProp => "$zeusBindProp",
            Self::BindSpread => "$zeusBindSpread",
            Self::MergeProps => "$zeusMergeProps",
            Self::BindEvent => "$zeusBindEvent",
            Self::BindRef => "$zeusBindRef",
            Self::DelegateEvents => "$zeusDelegateEvents",
        }
    }
}

#[derive(Clone)]
struct ForAccessorScope {
    for_id: NodeId,
    item: String,
    index: Option<String>,
    item_accessor: String,
    index_accessor: Option<String>,
}

struct ForAccessorUse {
    scope: ForAccessorScope,
    item: bool,
    index: bool,
}

#[derive(Default)]
struct CodeWriter {
    code: String,
    line: u32,
    column: u32,
    mappings: Vec<Mapping>,
    for_accessor_scopes: Vec<ForAccessorScope>,
}

impl CodeWriter {
    fn push(&mut self, value: &str) {
        self.code.push_str(value);
        for character in value.chars() {
            if character == '\n' {
                self.line = self.line.saturating_add(1);
                self.column = 0;
            } else {
                self.column = self
                    .column
                    .saturating_add(u32::try_from(character.len_utf16()).unwrap_or(u32::MAX));
            }
        }
    }

    fn push_mapped(&mut self, value: &str, expression: &ExpressionIr) {
        self.mappings.push(Mapping {
            generated_line: self.line,
            generated_column: self.column,
            original_line: expression.span.start.line.saturating_sub(1),
            original_column: expression.span.start.column,
        });
        if value == expression.code {
            for offset in identifier_offsets(value) {
                if offset == 0 {
                    continue;
                }
                let (generated_line, generated_column) =
                    advance_position(self.line, self.column, &value[..offset]);
                let (original_line, original_column) = advance_position(
                    expression.span.start.line.saturating_sub(1),
                    expression.span.start.column,
                    &expression.code[..offset],
                );
                self.mappings.push(Mapping {
                    generated_line,
                    generated_column,
                    original_line,
                    original_column,
                });
            }
        }
        self.push(value);
    }

    fn push_for_accessor_scope(&mut self, scope: ForAccessorScope) {
        self.for_accessor_scopes.push(scope);
    }

    fn pop_for_accessor_scope(&mut self) {
        self.for_accessor_scopes
            .pop()
            .expect("For accessor scopes must be balanced");
    }

    fn for_accessor_uses(&self, expression: &ExpressionIr) -> Vec<ForAccessorUse> {
        expression
            .for_accessors
            .iter()
            .filter_map(|accessor| {
                self.for_accessor_scopes
                    .iter()
                    .find(|scope| scope.for_id == accessor.for_id)
                    .map(|scope| ForAccessorUse {
                        scope: scope.clone(),
                        item: accessor.item,
                        index: accessor.index,
                    })
            })
            .collect()
    }

    fn expression_uses_for_accessors(&self, expression: &ExpressionIr) -> bool {
        !self.for_accessor_uses(expression).is_empty()
    }

    fn push_for_accessor_prefix(&mut self, uses: &[ForAccessorUse]) {
        for usage in uses {
            self.push("((");
            let mut needs_separator = false;
            if usage.item {
                self.push(&usage.scope.item);
                needs_separator = true;
            }
            if usage.index {
                if needs_separator {
                    self.push(", ");
                }
                self.push(
                    usage
                        .scope
                        .index
                        .as_deref()
                        .expect("an index use must have an index binding"),
                );
            }
            self.push(") => (");
        }
    }

    fn push_for_accessor_suffix(&mut self, uses: &[ForAccessorUse]) {
        for usage in uses.iter().rev() {
            self.push("))(");
            let mut needs_separator = false;
            if usage.item {
                self.push(&usage.scope.item_accessor);
                self.push("()");
                needs_separator = true;
            }
            if usage.index {
                if needs_separator {
                    self.push(", ");
                }
                self.push(
                    usage
                        .scope
                        .index_accessor
                        .as_deref()
                        .expect("an index use must have an index accessor"),
                );
                self.push("()");
            }
            self.push(")");
        }
    }

    fn push_dom_expression(&mut self, expression: &ExpressionIr) {
        let uses = self.for_accessor_uses(expression);
        self.push_for_accessor_prefix(&uses);

        self.push_mapped(&expression.code, expression);
        self.push_for_accessor_suffix(&uses);
    }

    fn push_dom_invocation(
        &mut self,
        expression: &ExpressionIr,
        arguments: &str,
        receiver: &str,
        optional: bool,
    ) {
        let uses = self.for_accessor_uses(expression);
        self.push_for_accessor_prefix(&uses);

        self.push("(");
        self.push_mapped(&expression.code, expression);
        self.push(")");
        if optional && expression.form != ExpressionForm::Member {
            self.push("?.apply(");
            self.push(receiver);
            self.push(", ");
            self.push(arguments);
            self.push(")");
        } else if optional {
            self.push("?.(");
            self.push("...");
            self.push(arguments);
            self.push(")");
        } else {
            self.push("(");
            self.push("...");
            self.push(arguments);
            self.push(")");
        }
        self.push_for_accessor_suffix(&uses);
    }
}

fn identifier_offsets(value: &str) -> Vec<usize> {
    let bytes = value.as_bytes();
    let mut offsets = Vec::new();
    let mut index = 0;
    while index < bytes.len() {
        let is_start =
            bytes[index] == b'_' || bytes[index] == b'$' || bytes[index].is_ascii_alphabetic();
        if !is_start {
            index += 1;
            continue;
        }
        offsets.push(index);
        index += 1;
        while index < bytes.len()
            && (bytes[index] == b'_'
                || bytes[index] == b'$'
                || bytes[index].is_ascii_alphanumeric())
        {
            index += 1;
        }
    }
    offsets
}

fn advance_position(line: u32, column: u32, value: &str) -> (u32, u32) {
    let mut line = line;
    let mut column = column;
    for character in value.chars() {
        if character == '\n' {
            line = line.saturating_add(1);
            column = 0;
        } else {
            column =
                column.saturating_add(u32::try_from(character.len_utf16()).unwrap_or(u32::MAX));
        }
    }
    (line, column)
}

struct Mapping {
    generated_line: u32,
    generated_column: u32,
    original_line: u32,
    original_column: u32,
}

struct NameAllocator {
    used: HashSet<String>,
}

impl NameAllocator {
    fn new(reserved_names: &[String]) -> Self {
        Self {
            used: reserved_names.iter().cloned().collect(),
        }
    }

    fn allocate(&mut self, base: &str) -> String {
        if self.used.insert(base.to_owned()) {
            return base.to_owned();
        }

        for suffix in 0_u32.. {
            let candidate = format!("{base}{suffix}");
            if self.used.insert(candidate.clone()) {
                return candidate;
            }
        }

        unreachable!("u32 identifier suffixes cannot be exhausted in one module")
    }
}
