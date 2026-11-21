//! Code emission.
//!
//! DOM and SSR targets share `CodeWriter` (positions and source map mappings)
//! and `NameAllocator` (identifiers), and nothing else. Each target keeps its
//! own emitter so a change to one is not read as a change to both.

mod analysis;
mod dom;
mod emit_plan;
mod infra;
mod ssr;

pub(crate) use ssr::{SsrModuleOptions, emit_ssr_module};

use infra::{CodeWriter, NameAllocator, build_source_map, quote_js};

use analysis::{RuntimeHelper, analyse_module};
use dom::emit::emit_component;
use dom::names::{RuntimeNames, collect_module_helper_usage};
use dom::{DynamicBinding, GeneratedComponent, collect_root_dynamic_bindings};
use emit_plan::EmitPlan;

use std::collections::{HashMap, HashSet};

use crate::{
    PureDefineElementMode, TransformModuleResult, ir::ModuleIr, span::SourceIndex,
    stage_contracts::HmrInfo,
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
