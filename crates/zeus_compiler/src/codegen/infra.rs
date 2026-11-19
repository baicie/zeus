//! Emission infrastructure shared by the DOM and SSR targets.
//!
//! `CodeWriter` tracks generated position and source-map mappings; `NameAllocator`
//! hands out unique identifiers. Both emitters use them and neither owns them,
//! so they live here rather than in either target.
//!
//! This module imports neither emitter. That direction is what makes the two
//! targets independent instead of siblings reaching into one another.
//!
//! Nothing here knows what a component, a slot or an attribute is. If a helper
//! starts needing to, it belongs in the emitter that needs it, not here.

use std::collections::{HashMap, HashSet};

use oxc_sourcemap::SourceMapBuilder;

use crate::RawSourceMap;
use crate::ir::{AttributeIr, ElementIr, ExpressionForm, ExpressionIr, NodeId, RootIr};
use crate::support::span::SourceIndex;

#[derive(Default)]
pub(crate) struct CodeWriter {
    code: String,
    line: u32,
    column: u32,
    mappings: Vec<Mapping>,
    for_accessor_scopes: Vec<ForAccessorScope>,
}

impl CodeWriter {
    /// The mappings recorded so far, for the source map builder.
    pub(super) fn recorded_mappings(&self) -> &[Mapping] {
        &self.mappings
    }

    /// Whether the output ends with a line break.
    pub(super) fn ends_with_newline(&self) -> bool {
        self.code.ends_with('\n')
    }

    /// Consumes the writer and returns the generated source.
    pub(super) fn into_generated(self) -> String {
        self.code
    }

    pub(super) fn push(&mut self, value: &str) {
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

    /// Copies `start..end` of the original source verbatim, mapping the first
    /// token of every line and every identifier back to its original position.
    pub(super) fn push_original(
        &mut self,
        source_index: &SourceIndex<'_>,
        start: usize,
        end: usize,
    ) {
        if start >= end {
            return;
        }
        let origin = source_index.position(u32::try_from(start).unwrap_or(u32::MAX));
        let mut original_line = origin.line.saturating_sub(1);
        let mut original_column = origin.column;
        let mut at_line_start = true;
        let mut in_identifier = false;
        for character in source_index.source()[start..end].chars() {
            let identifier = character == '_' || character == '$' || character.is_alphanumeric();
            if (at_line_start && !character.is_whitespace()) || (identifier && !in_identifier) {
                self.mappings.push(Mapping {
                    generated_line: self.line,
                    generated_column: self.column,
                    original: Some((original_line, original_column)),
                });
                at_line_start = false;
            }
            in_identifier = identifier;
            self.code.push(character);
            if character == '\n' {
                self.line = self.line.saturating_add(1);
                self.column = 0;
                original_line = original_line.saturating_add(1);
                original_column = 0;
                at_line_start = true;
            } else {
                let width = u32::try_from(character.len_utf16()).unwrap_or(u32::MAX);
                self.column = self.column.saturating_add(width);
                original_column = original_column.saturating_add(width);
            }
        }
        self.end_mapping();
    }

    /// Stops attributing the generated code that follows on this line to the
    /// last original token.
    pub(super) fn end_mapping(&mut self) {
        let Some(last) = self.mappings.last() else {
            return;
        };
        if last.original.is_none() || last.generated_line != self.line {
            return;
        }
        if last.generated_column == self.column {
            self.mappings.pop();
        }
        self.mappings.push(Mapping {
            generated_line: self.line,
            generated_column: self.column,
            original: None,
        });
    }

    pub(super) fn push_mapped(&mut self, value: &str, expression: &ExpressionIr) {
        self.mappings.push(Mapping {
            generated_line: self.line,
            generated_column: self.column,
            original: Some((
                expression.span.start.line.saturating_sub(1),
                expression.span.start.column,
            )),
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
                    original: Some((original_line, original_column)),
                });
            }
        }
        self.push(value);
        self.end_mapping();
    }

    pub(super) fn push_for_accessor_scope(&mut self, scope: ForAccessorScope) {
        self.for_accessor_scopes.push(scope);
    }

    pub(super) fn pop_for_accessor_scope(&mut self) {
        self.for_accessor_scopes
            .pop()
            .expect("For accessor scopes must be balanced");
    }

    pub(super) fn for_accessor_uses(&self, expression: &ExpressionIr) -> Vec<ForAccessorUse> {
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

    pub(super) fn expression_uses_for_accessors(&self, expression: &ExpressionIr) -> bool {
        !self.for_accessor_uses(expression).is_empty()
    }

    pub(super) fn push_for_accessor_prefix(&mut self, uses: &[ForAccessorUse]) {
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

    pub(super) fn push_for_accessor_suffix(&mut self, uses: &[ForAccessorUse]) {
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

    pub(super) fn push_dom_expression(&mut self, expression: &ExpressionIr) {
        let uses = self.for_accessor_uses(expression);
        self.push_for_accessor_prefix(&uses);

        self.push_mapped(&expression.code, expression);
        self.push_for_accessor_suffix(&uses);
    }

    pub(super) fn push_dom_invocation(
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

pub(super) struct Mapping {
    generated_line: u32,
    generated_column: u32,
    /// `None` marks the start of generated code that has no original source.
    original: Option<(u32, u32)>,
}

pub(crate) struct NameAllocator {
    used: HashSet<String>,
    /// Next suffix to try for a base name. Without it, allocating the same
    /// base N times rescans suffixes 0..N and makes deep regions quadratic.
    next_suffix: HashMap<String, u32>,
}

impl NameAllocator {
    pub(super) fn new(reserved_names: &[String]) -> Self {
        Self {
            used: reserved_names.iter().cloned().collect(),
            next_suffix: HashMap::new(),
        }
    }

    pub(super) fn allocate(&mut self, base: &str) -> String {
        if self.used.insert(base.to_owned()) {
            self.next_suffix.entry(base.to_owned()).or_insert(0);
            return base.to_owned();
        }

        let suffix = self.next_suffix.entry(base.to_owned()).or_insert(0);
        loop {
            let candidate = format!("{base}{suffix}");
            *suffix = suffix
                .checked_add(1)
                .expect("u32 identifier suffixes cannot be exhausted in one module");
            if self.used.insert(candidate.clone()) {
                return candidate;
            }
        }
    }
}

#[derive(Clone)]
pub(super) struct ForAccessorScope {
    pub(super) for_id: NodeId,
    pub(super) item: String,
    pub(super) index: Option<String>,
    pub(super) item_accessor: String,
    pub(super) index_accessor: Option<String>,
}

pub(super) struct ForAccessorUse {
    scope: ForAccessorScope,
    item: bool,
    index: bool,
}

pub(super) fn build_source_map(filename: &str, source: &str, mappings: &[Mapping]) -> RawSourceMap {
    let mut builder = SourceMapBuilder::default();
    builder.set_file(filename);
    let source_name = filename
        .rsplit(['/', '\\'])
        .next()
        .filter(|name| !name.is_empty())
        .unwrap_or(filename);
    let source_id = builder.add_source_and_content(source_name, source);

    for mapping in mappings {
        let (original_line, original_column) = mapping.original.unwrap_or_default();
        builder.add_token(
            mapping.generated_line,
            mapping.generated_column,
            original_line,
            original_column,
            mapping.original.map(|_| source_id),
            None,
        );
    }

    serde_json::from_str(&builder.into_sourcemap().to_json_string())
        .expect("oxc_sourcemap always emits valid Source Map v3 JSON")
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

// ---- Utilities both emitters use -----------------------------------------
//
// Reachable only through the parent module before, which is what forced
// `use super::{…}` in both emitters. They depend on the IR and nothing else.

pub(super) fn element_has_spread(element: &ElementIr) -> bool {
    element
        .attributes
        .iter()
        .any(|attribute| matches!(attribute, AttributeIr::Spread(_)))
}

pub(super) fn escape_html_text(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
}

pub(super) fn escape_html_attribute(value: &str) -> String {
    escape_html_text(value).replace('"', "&quot;")
}

pub(super) fn is_static_expression(expression: &ExpressionIr) -> bool {
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

pub(super) fn is_unescaped_raw_text(tag_name: &str) -> bool {
    tag_name.eq_ignore_ascii_case("script") || tag_name.eq_ignore_ascii_case("style")
}

pub(super) fn object_key(name: &str) -> String {
    if is_valid_identifier(name) {
        name.to_owned()
    } else {
        quote_js(name)
    }
}

pub(super) fn quote_js(value: &str) -> String {
    serde_json::to_string(value).expect("strings always serialize as JSON")
}

pub(super) fn root_span(root: &RootIr) -> &crate::support::span::SourceSpan {
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

/// The key an attribute occupies in a runtime attribute array.
///
/// Shared by both targets: the DOM emitter writes it into a props object and
/// the SSR emitter into a serialised attribute list, and the spelling must
/// match or the runtime reads the wrong field.
pub(super) fn attribute_key(attribute: &AttributeIr) -> String {
    match attribute {
        AttributeIr::Static(attr) => attr.name.clone(),
        AttributeIr::Dynamic(attr) => attr.name.clone(),
        AttributeIr::Property(attr) => format!("prop:{}", attr.name),
        AttributeIr::Event(attr) => format!("on{}", attr.event_name),
        AttributeIr::Ref(_) => "ref".into(),
        AttributeIr::Spread(_) => String::new(),
    }
}
