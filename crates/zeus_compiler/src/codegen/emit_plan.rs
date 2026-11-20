//! Which sections a module will emit.
//!
//! The emitter used to decide this inline: `if !module.components.is_empty()`
//! guarded the runtime import, and every other section either had no guard or
//! relied on its function returning early on empty input. The condition read
//! the same list of facts `analyse_module` had already walked the IR to
//! collect, so a change to "when do we need the runtime import?" meant finding
//! an `is_empty()` call inside a 3,000-line emitter.
//!
//! `EmitPlan` names the facts. The emitter consults it for the guard that was
//! previously implicit; the other sections are guarded by their own functions
//! having nothing to write, which is the same answer and costs no second
//! condition to keep in sync.
//!
//! There is deliberately no section-order table here. An earlier draft had
//! one, plus text markers to reconcile the table against the output — and it
//! was wrong three times in a row, because the markers depended on the runtime
//! module name, on the event names, and on whether the source had its own
//! `import {` before the generated one. The order is instead pinned where it
//! can be observed honestly: `tests/emit_order.rs` compiles a known module and
//! asserts the positions of the sections it knows are in the result.

/// Whether a section will be written.
///
/// A bare `bool` reads the same in five fields and says nothing at the call
/// site (`plan.hmr` — does that mean "has HMR" or "emit the HMR section?").
/// The two variants are also the only two answers, so the type says that.
///
/// `Copy` because a plan is passed by value and the emitter reads several
/// fields of it in a row.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum Section {
    Written,
    Absent,
}

impl Section {
    pub(crate) const fn if_(condition: bool) -> Self {
        if condition { Self::Written } else { Self::Absent }
    }

    pub(crate) const fn is_written(self) -> bool {
        matches!(self, Self::Written)
    }
}

/// What this module will emit.
///
/// A module with no components emits neither a runtime import nor templates;
/// one with delegated events emits a `delegateEvents` call. These are facts
/// about the module, so they are computed once and passed around as a value
/// rather than re-derived at each guard.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) struct EmitPlan {
    pub(crate) runtime_import: Section,
    pub(crate) hmr: Section,
    pub(crate) templates: Section,
    pub(crate) components: Section,
    pub(crate) delegated_events: Section,
}

impl EmitPlan {
    /// The plan for a module with components and, optionally, HMR state.
    ///
    /// Constructing a plan from the two facts that actually decide it — "does
    /// this module have components?" and "did HMR produce a module?" — keeps
    /// the derived sections consistent. Writing the five fields by hand is how
    /// a plan ends up claiming templates for a module with no components.
    pub(crate) fn for_module(has_components: bool, has_hmr: bool, has_delegated_events: bool) -> Self {
        Self {
            runtime_import: Section::if_(has_components),
            hmr: Section::if_(has_hmr),
            templates: Section::if_(has_components),
            components: Section::if_(has_components),
            delegated_events: Section::if_(has_delegated_events),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn a_module_without_components_plans_no_runtime_import_or_templates() {
        let plan = EmitPlan::for_module(false, false, false);
        assert!(!plan.runtime_import.is_written());
        assert!(!plan.templates.is_written());
        assert!(!plan.components.is_written());
    }

    #[test]
    fn templates_and_components_follow_the_component_fact() {
        // The two must agree: a template with no component to use it is dead
        // code, and a component with no template copy would be wrong output.
        for has_components in [true, false] {
            let plan = EmitPlan::for_module(has_components, false, false);
            assert_eq!(plan.templates, plan.components);
        }
    }

    #[test]
    fn delegated_events_are_independent_of_components() {
        let plan = EmitPlan::for_module(false, false, true);
        assert!(plan.delegated_events.is_written());
        assert!(!plan.components.is_written());
    }
}
