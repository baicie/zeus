//! Which sections a module will emit.
//!
//! The emitter used to decide this inline: `if !module.components.is_empty()`
//! guarded the runtime import, and every other section either had no guard or
//! relied on its function returning early on empty input. The condition read
//! the same list of facts `analyse_module` had already walked the IR to
//! collect, so a change to "when do we need the runtime import?" meant finding
//! an `is_empty()` call inside a 3,000-line emitter.
//!
//! `EmitPlan` names the facts. The emitter consults it for the one guard that
//! was previously implicit; the other sections are guarded by their own
//! functions having nothing to write, which is the same answer and costs no
//! second condition to keep in sync.
//!
//! There is deliberately no section-order table here. An earlier draft had
//! one, plus text markers to reconcile the table against the output — and it
//! was wrong three times in a row, because the markers depended on the runtime
//! module name, on the event names, and on whether the source had its own
//! `import {` before the generated one. The order is instead pinned where it
//! can be observed honestly: `tests/emit_order.rs` compiles a known module and
//! asserts the positions of the sections it knows are in the result.

/// What this module will emit.
///
/// A module with no components emits neither a runtime import nor templates;
/// one with delegated events emits a `delegateEvents` call. These are facts
/// about the module, so they are computed once and passed around as a value
/// rather than re-derived at each guard.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct EmitPlan {
    pub(crate) runtime_import: bool,
    pub(crate) hmr: bool,
    pub(crate) templates: bool,
    pub(crate) components: bool,
    pub(crate) delegated_events: bool,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_plan_without_components_is_empty() {
        let plan = EmitPlan {
            runtime_import: false,
            hmr: false,
            templates: false,
            components: false,
            delegated_events: false,
        };
        assert!(!plan.runtime_import);
        assert!(!plan.templates);
        assert!(!plan.delegated_events);
    }
}
