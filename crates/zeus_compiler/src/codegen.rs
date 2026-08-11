use std::collections::HashSet;

use oxc_sourcemap::SourceMapBuilder;

use crate::{
    RawSourceMap, TransformModuleResult,
    ir::{AttributeIr, ChildIr, ElementIr, ExpressionIr, ModuleIr},
};

pub(crate) fn emit_module(
    source: &str,
    filename: &str,
    runtime_module: &str,
    source_map: bool,
    module: &ModuleIr,
    reserved_names: &[String],
) -> TransformModuleResult {
    let mut names = NameAllocator::new(reserved_names);
    let template_helper = names.allocate("$zeusTemplate");
    let insert_helper = names.allocate("$zeusInsert");
    let bind_text_helper = names.allocate("$zeusBindText");

    let generated = module
        .components
        .iter()
        .map(|component| GeneratedComponent {
            start: component.root.span.start.offset,
            end: component.root.span.end.offset,
            template_name: names.allocate("$zeusTmpl"),
            element_name: names.allocate("$zeusEl"),
            template_html: render_template(&component.root),
            bindings: collect_dynamic_bindings(&component.root),
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
    writer.push("import { template as ");
    writer.push(&template_helper);
    writer.push(", insert as ");
    writer.push(&insert_helper);
    writer.push(", bindText as ");
    writer.push(&bind_text_helper);
    writer.push(" } from ");
    writer.push(&quote_js(runtime_module));
    writer.push(";\n");

    for component in &generated {
        writer.push("const ");
        writer.push(&component.template_name);
        writer.push(" = /* @__PURE__ */ ");
        writer.push(&template_helper);
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
            &insert_helper,
            &bind_text_helper,
            &mut names,
        );
        cursor = end;
    }
    writer.push(&source[cursor..]);

    let map = source_map.then(|| build_source_map(filename, source, &writer.mappings));

    TransformModuleResult {
        code: writer.code,
        map,
        diagnostics: Vec::new(),
    }
}

fn emit_component(
    writer: &mut CodeWriter,
    component: &GeneratedComponent,
    insert_helper: &str,
    bind_text_helper: &str,
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

    let walker_name = names.allocate("$zeusWalker");
    writer.push("const ");
    writer.push(&walker_name);
    writer.push(" = ");
    writer.push(&component.element_name);
    // NodeFilter.SHOW_COMMENT without relying on a shadowable global.
    writer.push(".ownerDocument.createTreeWalker(");
    writer.push(&component.element_name);
    writer.push(", 128);\n");

    let bindings = component
        .bindings
        .iter()
        .map(|binding| EmittedBinding {
            binding,
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

    for binding in &bindings {
        writer.push("const ");
        writer.push(&binding.text_name);
        writer.push(" = ");
        writer.push(&binding.marker_name);
        writer.push(".ownerDocument.createTextNode(\"\");\n");
        writer.push(insert_helper);
        writer.push("(");
        writer.push(&binding.marker_name);
        writer.push(".parentNode");
        writer.push(", ");
        writer.push(&binding.text_name);
        writer.push(", ");
        writer.push(&binding.marker_name);
        writer.push(");\n");
        writer.push(&binding.marker_name);
        writer.push(".remove();\n");
        writer.push(bind_text_helper);
        writer.push("(");
        writer.push(&binding.text_name);
        writer.push(", () => (");
        writer.push_mapped(
            &binding.binding.expression.code,
            &binding.binding.expression,
        );
        writer.push("));\n");
    }

    writer.push("return ");
    writer.push(&component.element_name);
    writer.push(";\n})()");
}

fn render_template(element: &ElementIr) -> String {
    let mut html = String::new();
    render_element(element, &mut html);
    html
}

fn render_element(element: &ElementIr, html: &mut String) {
    html.push('<');
    html.push_str(&element.tag_name);
    for attribute in &element.attributes {
        if let AttributeIr::Static(attribute) = attribute {
            html.push(' ');
            html.push_str(&attribute.name);
            html.push_str("=\"");
            html.push_str(&escape_html_attribute(&attribute.value));
            html.push('"');
        }
    }
    html.push('>');

    for child in &element.children {
        match child {
            ChildIr::Element(element) => render_element(element, html),
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
    for child in &element.children {
        match child {
            ChildIr::Element(element) => collect_element_bindings(element, bindings),
            ChildIr::DynamicText(dynamic) => bindings.push(DynamicBinding {
                expression: dynamic.expression.clone(),
            }),
            ChildIr::Text(_) => {}
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
    template_name: String,
    element_name: String,
    template_html: String,
    bindings: Vec<DynamicBinding>,
}

struct DynamicBinding {
    expression: ExpressionIr,
}

struct EmittedBinding<'a> {
    binding: &'a DynamicBinding,
    marker_name: String,
    text_name: String,
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
