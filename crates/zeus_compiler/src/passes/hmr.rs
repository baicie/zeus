//! The HMR pass: derives a hot-reload signature and rewrites the IR for it.
//!
//! This is a pass, not a leaf helper. It walks the module IR, finds literal
//! bindings, masks them out of the signature, and rewrites each expression to
//! read through the HMR state slot. `support/hmr.rs` keeps only the `HmrPlan`
//! and `HmrBinding` types, which are a public data contract consumed by the
//! native host and must not move between stages.
//!
//! The rewrite operates on a *copy* of the module: hydration reads the original
//! IR, and a masking rewrite applied in place would change the markers it
//! derives.

use oxc_allocator::Allocator;
use oxc_ast::ast::Expression;
use oxc_parser::Parser;
use oxc_span::SourceType;

use crate::ir::{
    AttributeIr, ChildIr, ComponentPropValueIr, ElementIr, ExpressionIr, ModuleIr, RootIr,
};
use crate::support::hmr::{HmrBinding, HmrPlan};
use crate::support::html::{is_custom_element, is_raw_text_element};

/// A literal binding the pass masks out of the signature.
struct Slot {
    start: usize,
    end: usize,
    binding: HmrBinding,
}

pub(crate) fn prepare(
    module: &mut ModuleIr,
    source: &str,
    runtime_module: &str,
    delegate_events: bool,
    state_name: &str,
) -> Option<HmrPlan> {
    let mut slots = Vec::new();
    for component in &mut module.components {
        match &mut component.root {
            RootIr::Element(element) => rewrite_element(element, state_name, &mut slots),
            RootIr::Fragment(fragment) => {
                rewrite_children(&mut fragment.children, state_name, &mut slots);
            }
            RootIr::Show(show) => {
                rewrite_children(&mut show.children, state_name, &mut slots);
                if let Some(ComponentPropValueIr::Children(children)) = &mut show.fallback {
                    rewrite_children(children, state_name, &mut slots);
                }
            }
            RootIr::For(for_binding) => {
                rewrite_children(&mut for_binding.body, state_name, &mut slots);
            }
            _ => {}
        }
    }
    if slots.is_empty() {
        return None;
    }
    slots.sort_by_key(|slot| slot.start);
    let mut source_segments = Vec::with_capacity(slots.len() + 1);
    let mut cursor = 0;
    for slot in &slots {
        source_segments.push(source.get(cursor..slot.start)?);
        cursor = slot.end;
    }
    source_segments.push(source.get(cursor..)?);
    let schema = slots
        .iter()
        .map(|slot| (slot.binding.id, slot.binding.kind.as_str()))
        .collect::<Vec<_>>();
    let signature =
        serde_json::to_string(&(runtime_module, delegate_events, schema, source_segments)).ok()?;
    Some(HmrPlan {
        version: 1,
        // Exact equality, not a lossy hash or a guess about JS equivalence.
        signature,
        bindings: slots.into_iter().map(|slot| slot.binding).collect(),
    })
}

fn rewrite_element(element: &mut ElementIr, state_name: &str, slots: &mut Vec<Slot>) {
    if element.namespace != "html"
        || is_custom_element(&element.tag_name)
        || is_raw_text_element(&element.tag_name)
    {
        return;
    }
    let has_spread = element
        .attributes
        .iter()
        .any(|attribute| matches!(attribute, AttributeIr::Spread(_)));
    if !has_spread {
        for name in ["class", "style"] {
            let count = element
                .attributes
                .iter()
                .filter(|attribute| match attribute {
                    AttributeIr::Static(attribute) => {
                        attribute.name == name || (name == "class" && attribute.name == "className")
                    }
                    AttributeIr::Dynamic(attribute) => {
                        attribute.name == name || (name == "class" && attribute.name == "className")
                    }
                    _ => false,
                })
                .count();
            if count != 1 {
                continue;
            }
            for attribute in &mut element.attributes {
                if let AttributeIr::Dynamic(attribute) = attribute
                    && attribute.name == name
                    && !attribute.once
                {
                    rewrite_expression(
                        &mut attribute.expression,
                        attribute.id,
                        name,
                        state_name,
                        slots,
                    );
                }
            }
        }
    }
    rewrite_children(&mut element.children, state_name, slots);
}

fn rewrite_children(children: &mut [ChildIr], state_name: &str, slots: &mut Vec<Slot>) {
    for child in children {
        match child {
            ChildIr::Element(element) => rewrite_element(element, state_name, slots),
            ChildIr::Fragment(fragment) => {
                rewrite_children(&mut fragment.children, state_name, slots);
            }
            ChildIr::DynamicText(text) if !text.once => {
                rewrite_expression(&mut text.expression, text.id, "text", state_name, slots);
            }
            ChildIr::Show(show) => {
                rewrite_children(&mut show.children, state_name, slots);
                if let Some(ComponentPropValueIr::Children(children)) = &mut show.fallback {
                    rewrite_children(children, state_name, slots);
                }
            }
            ChildIr::For(for_binding) => rewrite_children(&mut for_binding.body, state_name, slots),
            _ => {}
        }
    }
}

fn rewrite_expression(
    expression: &mut ExpressionIr,
    id: u32,
    kind: &str,
    state_name: &str,
    slots: &mut Vec<Slot>,
) {
    let allocator = Allocator::default();
    let Ok(Expression::StringLiteral(literal)) =
        Parser::new(&allocator, &expression.code, SourceType::tsx()).parse_expression()
    else {
        return;
    };
    // serde_json strings cannot carry Oxc's encoded lone-surrogate sentinel.
    // Leave these expressions untouched instead of changing their JS value.
    if literal.lone_surrogates {
        return;
    }
    slots.push(Slot {
        start: expression.span.start.offset as usize,
        end: expression.span.end.offset as usize,
        binding: HmrBinding {
            id,
            kind: kind.into(),
            value: literal.value.to_string(),
        },
    });
    expression.code = format!("{state_name}.read({id})");
}
