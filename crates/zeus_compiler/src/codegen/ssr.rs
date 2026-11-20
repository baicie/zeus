//! The SSR target emitter.
//!
//! SSR shares `CodeWriter` and `NameAllocator` with DOM emission but no
//! semantics: it produces a string-building module rather than DOM operations.
//! Keeping it in its own file is what stops a change to one target from being
//! read as a change to both.
//!
//! The hydration markers this emitter writes (`<!--zeus:hydrate:*-->`) are a
//! contract with the client runtime and with `support::hydration`; the golden
//! fixtures pin their exact form.

use crate::TransformModuleResult;
use crate::ir::{
    AttributeIr, ChildIr, ComponentBindingIr, ComponentPropIr, ComponentPropValueIr,
    DynamicRegionExpressionIr, DynamicRegionIr, DynamicRegionValueIr, ElementIr, ExpressionIr,
    ForBindingIr, ModuleIr, NodeId, RootIr, ShowBindingIr, TransitionBindingIr,
};
use crate::support::html::{is_custom_element, is_void_element};
use crate::support::hydration::{
    component_root_marker_id, element_marker_id, node_marker_id, text_marker_id,
};

use crate::stage_contracts::{SsrImportReplacement, SsrImportRewrite};
use crate::support::span::SourceIndex;

use crate::codegen::infra::{
    CodeWriter, NameAllocator, attribute_key, build_source_map, element_has_spread,
    escape_html_text, is_static_expression, is_unescaped_raw_text, object_key, quote_js, root_span,
};
use crate::ir::StaticAttributeValue;

// ---- Symbols only SSR uses ------------------------------------------------
//
// These lived in the parent module while only this emitter referenced them,
// which made the two targets look like they shared more than they do.

/// Closes an SSR dynamic text node; `hydrate` in `@zeus-js/runtime-dom` reads
/// it as `zeus:hydrate:/`.
pub(super) const SSR_TEXT_END_MARKER: &str = "<!--zeus:hydrate:/-->";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(super) enum SsrTextContext {
    Normal,
    Raw,
    Rcdata,
    /// `<script>`/`<style>` inside SVG. The HTML parser does not treat those
    /// as raw text in foreign content, so the content uses ordinary escaping.
    ForeignRaw,
}

pub(super) struct SsrRuntimeNames {
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
    auto_hydrate: bool,
}

impl SsrRuntimeNames {
    fn allocate(names: &mut NameAllocator, auto_hydrate: bool) -> Self {
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
            auto_hydrate,
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

pub(super) fn ssr_text_context(element: &ElementIr) -> SsrTextContext {
    if is_unescaped_raw_text(&element.tag_name) {
        if element.namespace == "svg" {
            SsrTextContext::ForeignRaw
        } else {
            SsrTextContext::Raw
        }
    } else if element.tag_name.eq_ignore_ascii_case("textarea")
        || element.tag_name.eq_ignore_ascii_case("title")
    {
        SsrTextContext::Rcdata
    } else {
        SsrTextContext::Normal
    }
}

pub(crate) struct SsrModuleOptions<'a> {
    pub(crate) source: &'a str,
    pub(crate) filename: &'a str,
    pub(crate) runtime_module: &'a str,
    pub(crate) source_map: bool,
    pub(crate) module: &'a ModuleIr,
    pub(crate) reserved_names: &'a [String],
    pub(crate) define_element_calls: &'a [oxc_span::Span],
    pub(crate) ssr_runtime_imports: &'a [SsrImportRewrite],
    pub(crate) auto_hydrate: bool,
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
        auto_hydrate,
    } = *options;
    let mut names = NameAllocator::new(reserved_names);
    let runtime = SsrRuntimeNames::allocate(&mut names, auto_hydrate);
    let source_index = SourceIndex::new(source);
    let source_emitter = SsrSourceEmitter {
        source,
        source_index: &source_index,
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
    if cursor > 0 && !writer.ends_with_newline() {
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
        emit_ssr_root(
            &mut writer,
            &component.root,
            &runtime,
            component.id,
            auto_hydrate,
        );
        cursor = end;
    }
    source_emitter.emit(&mut writer, cursor, source.len());

    let map = source_map.then(|| build_source_map(filename, source, writer.recorded_mappings()));
    TransformModuleResult {
        code: writer.into_generated(),
        map,
        diagnostics: Vec::new(),
        hydration_plan: None,
        hmr_plan: None,
    }
}

struct SsrSourceEmitter<'a> {
    source: &'a str,
    source_index: &'a SourceIndex<'a>,
    runtime_module: &'a str,
    define_element_calls: &'a [oxc_span::Span],
    ssr_runtime_imports: &'a [SsrImportRewrite],
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
            .chain(self.ssr_runtime_imports.iter().filter_map(|rewrite| {
                let start = usize::try_from(rewrite.span.start).ok()?;
                let end = usize::try_from(rewrite.span.end).ok()?;
                let replacement = match &rewrite.replacement {
                    SsrImportReplacement::ModuleSource => quote_js(self.runtime_module),
                    SsrImportReplacement::Split {
                        facade,
                        client,
                        module,
                    } => format!(
                        "import {{ {} }} from {}; import {{ {} }} from {};",
                        facade.join(", "),
                        quote_js(self.runtime_module),
                        client.join(", "),
                        quote_js(module),
                    ),
                };
                Some((start, end, replacement))
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
            writer.push_original(self.source_index, cursor, replacement_start);
            writer.push(&replacement);
            cursor = replacement_end;
        }
        writer.push_original(self.source_index, cursor, end);
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
    auto_hydrate: bool,
) {
    writer.push("[");
    emit_ssr_marker(writer, runtime, &component_root_marker_id(component_id));
    writer.push(", ");
    match root {
        RootIr::Element(element) => emit_ssr_element(writer, element, runtime, component_id),
        RootIr::Fragment(fragment) => {
            emit_ssr_children(
                writer,
                &fragment.children,
                runtime,
                SsrTextContext::Normal,
                component_id,
            );
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
    if auto_hydrate {
        writer.push(", ");
        emit_ssr_close_marker(writer, runtime, &component_root_marker_id(component_id));
    }
    writer.push("]");
}

fn emit_ssr_child(
    writer: &mut CodeWriter,
    child: &ChildIr,
    runtime: &SsrRuntimeNames,
    text_context: SsrTextContext,
    component_id: NodeId,
) {
    match child {
        ChildIr::Element(element) => {
            emit_ssr_element(writer, element, runtime, component_id);
        }
        ChildIr::Fragment(fragment) => {
            emit_ssr_children(
                writer,
                &fragment.children,
                runtime,
                text_context,
                component_id,
            );
        }
        ChildIr::Text(text) => {
            if text_context == SsrTextContext::Raw {
                writer.push(&quote_js(&text.value));
            } else {
                writer.push(runtime.static_text());
                writer.push("(");
                writer.push(&quote_js(&escape_html_text(&text.value)));
                writer.push(")");
            }
        }
        ChildIr::DynamicText(text) => match text_context {
            SsrTextContext::Raw => {
                writer.push_mapped(&text.expression.code, &text.expression);
            }
            // Foreign content is escaped like text, even though the tag name is
            // `script` or `style`: the parser reads it as ordinary markup there.
            // RCDATA content is bound through textContent on the client, so it
            // is escaped like normal text but carries no hydration marker.
            SsrTextContext::ForeignRaw | SsrTextContext::Rcdata => {
                writer.push(runtime.text());
                writer.push("(");
                writer.push_mapped(&text.expression.code, &text.expression);
                writer.push(")");
            }
            // The end boundary keeps the HTML parser from merging the value
            // with adjacent static text and gives an empty value a position.
            SsrTextContext::Normal => {
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
                writer.push("), ");
                writer.push(runtime.static_text());
                writer.push("(");
                writer.push(&quote_js(SSR_TEXT_END_MARKER));
                writer.push(")]");
            }
        },
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
    text_context: SsrTextContext,
    component_id: NodeId,
) {
    if children.len() == 1 {
        emit_ssr_child(writer, &children[0], runtime, text_context, component_id);
        return;
    }
    writer.push("[");
    for (index, child) in children.iter().enumerate() {
        if index > 0 {
            writer.push(", ");
        }
        emit_ssr_child(writer, child, runtime, text_context, component_id);
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
            emit_ssr_children(writer, body, runtime, SsrTextContext::Normal, component_id);
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
    if runtime.auto_hydrate {
        writer.push(", ");
        emit_ssr_close_marker(
            writer,
            runtime,
            &node_marker_id(component_id, "region", region.id),
        );
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
            emit_ssr_children(
                writer,
                children,
                runtime,
                SsrTextContext::Normal,
                component_id,
            );
        }
    }
}

fn emit_ssr_element(
    writer: &mut CodeWriter,
    element: &ElementIr,
    runtime: &SsrRuntimeNames,
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
        emit_ssr_attribute_sources(writer, &element.attributes);
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
                // Custom element properties are client-only on the server.
                AttributeIr::Property(_) if is_custom_element(&element.tag_name) => {}
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
            ssr_text_context(element),
            component_id,
        );
    } else if is_void_element(&element.tag_name) {
        writer.push(", undefined, true");
    }
    if element.namespace == "svg" && is_unescaped_raw_text(&element.tag_name) {
        // Foreign `<script>`/`<style>` are ordinary elements to the parser, so
        // the runtime must use text escaping instead of raw-text rewriting.
        writer.push(", undefined, undefined, true");
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

fn emit_ssr_close_marker(writer: &mut CodeWriter, runtime: &SsrRuntimeNames, id: &str) {
    writer.push(runtime.static_text());
    writer.push("(");
    writer.push(&quote_js(&format!("<!--zeus:hydrate:/{id}-->")));
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
                        emit_ssr_children(
                            writer,
                            children,
                            runtime,
                            SsrTextContext::Normal,
                            component_id,
                        );
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
    emit_ssr_children(
        writer,
        &show.children,
        runtime,
        SsrTextContext::Normal,
        component_id,
    );
    if let Some(fallback) = &show.fallback {
        writer.push(", () => ");
        match fallback {
            ComponentPropValueIr::Expression(expression) => {
                emit_ssr_expression_value(writer, expression);
            }
            ComponentPropValueIr::Children(children) => {
                emit_ssr_children(
                    writer,
                    children,
                    runtime,
                    SsrTextContext::Normal,
                    component_id,
                );
            }
        }
    }
    writer.push(")");
    if runtime.auto_hydrate {
        writer.push(", ");
        emit_ssr_close_marker(
            writer,
            runtime,
            &node_marker_id(component_id, "show", show.id),
        );
    }
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
    emit_ssr_children(
        writer,
        &for_binding.body,
        runtime,
        SsrTextContext::Normal,
        component_id,
    );
    writer.push(")");
    if runtime.auto_hydrate {
        writer.push(", ");
        emit_ssr_close_marker(
            writer,
            runtime,
            &node_marker_id(component_id, "for", for_binding.id),
        );
    }
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
    emit_ssr_children(
        writer,
        &transition.children,
        runtime,
        SsrTextContext::Normal,
        component_id,
    );
    writer.push(" : null)");
    if runtime.auto_hydrate {
        writer.push(", ");
        emit_ssr_close_marker(
            writer,
            runtime,
            &node_marker_id(component_id, "transition", transition.id),
        );
    }
    writer.push("]");
}

/// Emits the attribute array SSR passes to a runtime helper.
///
/// This is SSR's own copy rather than the DOM emitter's: the DOM version pushes
/// expressions through `push_dom_expression`, which resolves For accessor
/// scopes that only the DOM pass maintains. Sharing it would have meant SSR
/// importing a DOM-specific writer path — the coupling this module exists to
/// remove. The attribute *key* spelling is shared, because the runtime reads
/// both.
fn emit_ssr_attribute_sources(writer: &mut CodeWriter, attributes: &[AttributeIr]) {
    writer.push("[");
    for (index, attribute) in attributes.iter().enumerate() {
        if index > 0 {
            writer.push(", ");
        }
        writer.push("() => (");
        if let AttributeIr::Spread(spread) = attribute {
            emit_ssr_expression_value(writer, &spread.expression);
        } else {
            writer.push("{");
            writer.push(&quote_js(&attribute_key(attribute)));
            writer.push(": ");
            match attribute {
                AttributeIr::Static(attr) => match &attr.value {
                    StaticAttributeValue::String(value) => writer.push(&quote_js(value)),
                    StaticAttributeValue::Boolean => writer.push("true"),
                },
                AttributeIr::Dynamic(attr) => emit_ssr_expression_value(writer, &attr.expression),
                AttributeIr::Property(attr) => emit_ssr_expression_value(writer, &attr.expression),
                // SSR has no event handlers or refs to bind; the runtime reads
                // `undefined` and leaves the binding to hydration.
                AttributeIr::Event(_) | AttributeIr::Ref(_) => writer.push("undefined"),
                AttributeIr::Spread(_) => unreachable!(),
            }
            writer.push("}");
        }
        writer.push(")");
    }
    writer.push("]");
}
