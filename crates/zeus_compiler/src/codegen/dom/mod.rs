//! The DOM emitter's internals.
//!
//! `codegen/mod.rs` is the orchestrator: it decides which sections a module
//! emits, allocates runtime names and drives the writer. Everything only the
//! DOM target uses lives here.
//!
//! One rule: **a type or function used by one target belongs to that target.**
//! `GeneratedComponent` and `DynamicBinding` describe cloned DOM nodes and the
//! bindings attached to them; SSR builds from `ModuleIr` and never names them.

pub(crate) mod emit;
pub(crate) mod model;

pub(crate) use model::{
    AttributeBindingKind, DynamicBinding, GeneratedComponent, collect_dynamic_bindings,
    collect_root_dynamic_bindings, dynamic_binding,
};
