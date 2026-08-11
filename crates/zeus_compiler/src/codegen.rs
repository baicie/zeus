use std::collections::{BTreeSet, HashMap, HashSet};

use oxc_sourcemap::SourceMapBuilder;

use crate::{
    RawSourceMap, TransformModuleResult,
    ir::{
        AttributeIr, ChildIr, ComponentIr, ElementIr, ExpressionForm, ExpressionIr, ModuleIr,
        NodeId, StaticAttributeValue,
    },
};

pub(crate) fn emit_module(
    source: &str,
    filename: &str,
    runtime_module: &str,
    enable_delegation: bool,
    source_map: bool,
    module: &ModuleIr,
    reserved_names: &[String],
) -> TransformModuleResult {
    let mut names = NameAllocator::new(reserved_names);
    let binding_sets = module
        .components
        .iter()
        .map(|component| collect_dynamic_bindings(&component.root))
        .collect::<Vec<_>>();
    let delegated_event_names = collect_delegated_events(&binding_sets, enable_delegation);
    let helper_usage =
        HelperUsage::from_binding_sets(&binding_sets, !delegated_event_names.is_empty());
    let runtime = RuntimeNames::allocate(&helper_usage, &mut names);
    let locator_attribute = allocate_locator_attribute(module);

    let generated = module
        .components
        .iter()
        .zip(binding_sets)
        .map(|(component, bindings)| {
            GeneratedComponent::new(component, bindings, &locator_attribute, &mut names)
        })
        .collect::<Vec<_>>();

    let mut writer = CodeWriter::default();
    let mut cursor = usize::try_from(module.preamble_end)
        .unwrap_or(usize::MAX)
        .min(source.len());
    writer.push(&source[..cursor]);
    if cursor > 0 && !writer.code.ends_with('\n') {
        writer.push("\n");
    }
    emit_runtime_import(&mut writer, &runtime, runtime_module);

    for component in &generated {
        writer.push("const ");
        writer.push(&component.template_name);
        writer.push(" = /* @__PURE__ */ ");
        writer.push(runtime.template());
        writer.push("(");
        writer.push(&quote_js(&component.template_html));
        writer.push(");\n");
    }

    for component in &generated {
        let start = usize::try_from(component.start).unwrap_or(usize::MAX);
        let end = usize::try_from(component.end).unwrap_or(usize::MAX);
        if start < cursor || end > source.len() {
            continue;
        }

        writer.push(&source[cursor..start]);
        emit_component(
            &mut writer,
            component,
            &runtime,
            &locator_attribute,
            &mut names,
        );
        cursor = end;
    }
    writer.push(&source[cursor..]);
    emit_delegated_events(&mut writer, &runtime, &delegated_event_names);

    let map = source_map.then(|| build_source_map(filename, source, &writer.mappings));

    TransformModuleResult {
        code: writer.code,
        map,
        diagnostics: Vec::new(),
    }
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

fn emit_component(
    writer: &mut CodeWriter,
    component: &GeneratedComponent,
    runtime: &RuntimeNames,
    locator_attribute: &str,
    names: &mut NameAllocator,
) {
    if component.bindings.is_empty() {
        writer.push(&component.template_name);
        writer.push("().firstChild");
        return;
    }

    writer.push("(() => {\nconst ");
    writer.push(&component.element_name);
    writer.push(" = ");
    writer.push(&component.template_name);
    writer.push("().firstChild;\n");

    emit_element_targets(writer, component, locator_attribute);

    let text_markers = emit_text_markers(writer, component, names);
    let mut text_marker_index = 0;

    for binding in &component.bindings {
        match binding {
            DynamicBinding::Text { expression } => {
                emit_text_binding(
                    writer,
                    expression,
                    &text_markers[text_marker_index],
                    runtime,
                );
                text_marker_index += 1;
            }
            DynamicBinding::Attribute {
                target_id,
                name,
                expression,
                kind,
            } => emit_attribute_binding(
                writer,
                component.target_name(*target_id),
                name,
                expression,
                *kind,
                runtime,
            ),
            DynamicBinding::Property {
                target_id,
                name,
                expression,
            } => emit_property_binding(
                writer,
                component.target_name(*target_id),
                name,
                expression,
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
    if handler.form != ExpressionForm::Member {
        writer.push_mapped(&handler.code, handler);
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
        if target.id != component.root_id {
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

fn emit_text_markers(
    writer: &mut CodeWriter,
    component: &GeneratedComponent,
    names: &mut NameAllocator,
) -> Vec<EmittedTextBinding> {
    let text_count = component
        .bindings
        .iter()
        .filter(|binding| matches!(binding, DynamicBinding::Text { .. }))
        .count();
    if text_count == 0 {
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

    let bindings = (0..text_count)
        .map(|_| EmittedTextBinding {
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

fn emit_text_binding(
    writer: &mut CodeWriter,
    expression: &ExpressionIr,
    binding: &EmittedTextBinding,
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
    writer.push_mapped(&expression.code, expression);
    writer.push("));\n");
}

fn emit_attribute_binding(
    writer: &mut CodeWriter,
    target: &str,
    name: &str,
    expression: &ExpressionIr,
    kind: AttributeBindingKind,
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
    writer.push(");\n");
}

fn emit_property_binding(
    writer: &mut CodeWriter,
    target: &str,
    name: &str,
    expression: &ExpressionIr,
    runtime: &RuntimeNames,
) {
    writer.push(runtime.bind_prop());
    writer.push("(");
    writer.push(target);
    writer.push(", ");
    writer.push(&quote_js(name));
    writer.push(", ");
    emit_getter(writer, expression);
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
    writer.push_mapped(&expression.code, expression);
    writer.push(");\n");
}

fn emit_getter(writer: &mut CodeWriter, expression: &ExpressionIr) {
    if expression.form == ExpressionForm::Getter {
        writer.push_mapped(&expression.code, expression);
        return;
    }

    writer.push("() => (");
    writer.push_mapped(&expression.code, expression);
    writer.push(")");
}

fn render_template(element: &ElementIr, locator_attribute: &str) -> String {
    let mut html = String::new();
    render_element(element, locator_attribute, &mut html);
    html
}

fn render_element(element: &ElementIr, locator_attribute: &str, html: &mut String) {
    html.push('<');
    html.push_str(&element.tag_name);
    for attribute in &element.attributes {
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

    for child in &element.children {
        match child {
            ChildIr::Element(element) => render_element(element, locator_attribute, html),
            ChildIr::Text(text) => html.push_str(&escape_html_text(&text.value)),
            ChildIr::DynamicText(_) => html.push_str("<!>"),
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

fn collect_element_bindings(element: &ElementIr, bindings: &mut Vec<DynamicBinding>) {
    for attribute in &element.attributes {
        match attribute {
            AttributeIr::Dynamic(attribute) => bindings.push(DynamicBinding::Attribute {
                target_id: element.id,
                name: attribute.name.clone(),
                expression: attribute.expression.clone(),
                kind: AttributeBindingKind::from_name(&attribute.name),
            }),
            AttributeIr::Property(attribute) => bindings.push(DynamicBinding::Property {
                target_id: element.id,
                name: attribute.name.clone(),
                expression: attribute.expression.clone(),
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
            AttributeIr::Static(_) => {}
        }
    }

    for child in &element.children {
        match child {
            ChildIr::Element(element) => collect_element_bindings(element, bindings),
            ChildIr::DynamicText(dynamic) => bindings.push(DynamicBinding::Text {
                expression: dynamic.expression.clone(),
            }),
            ChildIr::Text(_) => {}
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
        )
    })
}

fn collect_delegated_events(
    binding_sets: &[Vec<DynamicBinding>],
    enable_delegation: bool,
) -> Vec<String> {
    if !enable_delegation {
        return Vec::new();
    }

    binding_sets
        .iter()
        .flatten()
        .filter_map(|binding| match binding {
            DynamicBinding::Event { event_name, .. } => Some(event_name.clone()),
            _ => None,
        })
        .collect::<BTreeSet<_>>()
        .into_iter()
        .collect()
}

fn allocate_locator_attribute(module: &ModuleIr) -> String {
    let mut used = HashSet::new();
    for component in &module.components {
        collect_attribute_names(&component.root, &mut used);
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

fn collect_attribute_names(element: &ElementIr, names: &mut HashSet<String>) {
    for attribute in &element.attributes {
        let name = match attribute {
            AttributeIr::Static(attribute) => &attribute.name,
            AttributeIr::Dynamic(attribute) => &attribute.name,
            AttributeIr::Property(attribute) => &attribute.name,
            AttributeIr::Event(_) | AttributeIr::Ref(_) => continue,
        };
        names.insert(name.to_ascii_lowercase());
    }
    for child in &element.children {
        if let ChildIr::Element(element) = child {
            collect_attribute_names(element, names);
        }
    }
}

fn build_source_map(filename: &str, source: &str, mappings: &[Mapping]) -> RawSourceMap {
    let mut builder = SourceMapBuilder::default();
    builder.set_file(filename);
    let source_id = builder.add_source_and_content(filename, source);

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

struct GeneratedComponent {
    start: u32,
    end: u32,
    root_id: NodeId,
    template_name: String,
    element_name: String,
    template_html: String,
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
        let mut seen = HashSet::new();
        let targets = bindings
            .iter()
            .filter_map(DynamicBinding::target_id)
            .filter(|id| seen.insert(*id))
            .map(|id| ElementTarget {
                id,
                name: if id == component.root.id {
                    element_name.clone()
                } else {
                    names.allocate("$zeusNode")
                },
            })
            .collect();

        Self {
            start: component.root.span.start.offset,
            end: component.root.span.end.offset,
            root_id: component.root.id,
            template_name,
            element_name,
            template_html: render_template(&component.root, locator_attribute),
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
    },
    Attribute {
        target_id: NodeId,
        name: String,
        expression: ExpressionIr,
        kind: AttributeBindingKind,
    },
    Property {
        target_id: NodeId,
        name: String,
        expression: ExpressionIr,
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
}

impl DynamicBinding {
    fn target_id(&self) -> Option<NodeId> {
        match self {
            Self::Text { .. } => None,
            Self::Attribute { target_id, .. }
            | Self::Property { target_id, .. }
            | Self::Event { target_id, .. }
            | Self::Ref { target_id, .. } => Some(*target_id),
        }
    }
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

struct EmittedTextBinding {
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
                DynamicBinding::Property { .. } => {
                    usage.0.insert(RuntimeHelper::BindProp);
                }
                DynamicBinding::Event { .. } => {
                    usage.0.insert(RuntimeHelper::BindEvent);
                }
                DynamicBinding::Ref { .. } => {
                    usage.0.insert(RuntimeHelper::BindRef);
                }
            }
        }
        usage
    }
}

struct RuntimeNames {
    locals: HashMap<RuntimeHelper, String>,
}

impl RuntimeNames {
    fn allocate(usage: &HelperUsage, names: &mut NameAllocator) -> Self {
        let locals = RuntimeHelper::ORDERED
            .iter()
            .filter(|helper| **helper == RuntimeHelper::Template || usage.0.contains(helper))
            .map(|helper| (*helper, names.allocate(helper.local_base())))
            .collect();
        Self { locals }
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

    fn insert(&self) -> &str {
        self.get(RuntimeHelper::Insert)
    }

    fn bind_text(&self) -> &str {
        self.get(RuntimeHelper::BindText)
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
    Insert,
    BindText,
    BindAttr,
    BindClass,
    BindStyle,
    BindProp,
    BindEvent,
    BindRef,
    DelegateEvents,
}

impl RuntimeHelper {
    const ORDERED: [Self; 10] = [
        Self::Template,
        Self::Insert,
        Self::BindText,
        Self::BindAttr,
        Self::BindClass,
        Self::BindStyle,
        Self::BindProp,
        Self::BindEvent,
        Self::BindRef,
        Self::DelegateEvents,
    ];

    const fn exported(self) -> &'static str {
        match self {
            Self::Template => "template",
            Self::Insert => "insert",
            Self::BindText => "bindText",
            Self::BindAttr => "bindAttr",
            Self::BindClass => "bindClass",
            Self::BindStyle => "bindStyle",
            Self::BindProp => "bindProp",
            Self::BindEvent => "bindEvent",
            Self::BindRef => "bindRef",
            Self::DelegateEvents => "delegateEvents",
        }
    }

    const fn local_base(self) -> &'static str {
        match self {
            Self::Template => "$zeusTemplate",
            Self::Insert => "$zeusInsert",
            Self::BindText => "$zeusBindText",
            Self::BindAttr => "$zeusBindAttr",
            Self::BindClass => "$zeusBindClass",
            Self::BindStyle => "$zeusBindStyle",
            Self::BindProp => "$zeusBindProp",
            Self::BindEvent => "$zeusBindEvent",
            Self::BindRef => "$zeusBindRef",
            Self::DelegateEvents => "$zeusDelegateEvents",
        }
    }
}

#[derive(Default)]
struct CodeWriter {
    code: String,
    line: u32,
    column: u32,
    mappings: Vec<Mapping>,
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
        self.push(value);
    }
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
