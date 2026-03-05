//! Template IR (Intermediate Representation) for compiled JSX
//!
//! Represents the analysis result of a JSX element tree:
//! static HTML for template(), dynamic bindings for runtime wiring.

/// Compiled JSX template with static and dynamic parts
#[derive(Debug)]
pub struct TemplateIR {
    /// Static HTML string for `template("...")`
    pub html: String,
    /// Unique template variable name (e.g., "_tmpl$1")
    pub template_var: String,
    /// Dynamic bindings that need runtime wiring
    pub bindings: Vec<Binding>,
    /// Delegated event names (for `delegateEvents([...])` call)
    pub delegated_events: Vec<String>,
}

/// A path from the root cloned element to a specific child node
/// using firstChild/nextSibling traversal
#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub struct DomPath {
    pub steps: Vec<TraversalStep>,
}

impl DomPath {
    pub fn root() -> Self {
        Self { steps: vec![] }
    }

    /// Check if this path is a descendant of (has the same prefix as) another path
    pub fn is_descendant_of(&self, other: &DomPath) -> bool {
        if other.steps.len() >= self.steps.len() {
            return false;
        }
        self.steps[..other.steps.len()] == other.steps[..]
    }

    /// Generate JS code for this path from a root variable
    /// e.g., "_el$.firstChild.nextSibling"
    pub fn to_js_access(&self, root_var: &str) -> String {
        let mut access = root_var.to_string();
        for step in &self.steps {
            match step {
                TraversalStep::FirstChild => access.push_str(".firstChild"),
                TraversalStep::NextSibling => access.push_str(".nextSibling"),
            }
        }
        access
    }

    /// Generate JS code for a partial path (remaining steps from a base variable)
    /// e.g., if base is "_el$2" and remaining_steps is 2, returns "_el$2.firstChild.nextSibling"
    pub fn partial_to_js_access(&self, base_var: &str, remaining_steps: usize) -> String {
        let mut access = base_var.to_string();
        let start_idx = self.steps.len() - remaining_steps;
        for step in self.steps.iter().skip(start_idx) {
            match step {
                TraversalStep::FirstChild => access.push_str(".firstChild"),
                TraversalStep::NextSibling => access.push_str(".nextSibling"),
            }
        }
        access
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Hash)]
pub enum TraversalStep {
    FirstChild,
    NextSibling,
}

/// A dynamic binding connecting an expression to a DOM location
#[derive(Debug)]
pub struct Binding {
    /// Path to the target DOM node from the root
    pub path: DomPath,
    /// What kind of binding
    pub kind: BindingKind,
}

/// Slot binding for Light DOM slots
#[derive(Debug)]
pub enum SlotBindingKind {
    /// Named slot (e.g., <slot name="header" />)
    Named {
        /// Slot name
        name: String,
        /// Slot content expression source
        content_source: String,
    },
    /// Default slot (e.g., <slot />)
    Default {
        /// Slot content expression source
        content_source: String,
    },
    /// Slot with fallback content
    Fallback {
        /// Slot name
        name: Option<String>,
        /// Fallback content source
        fallback_source: String,
    },
}

/// A slot binding
#[derive(Debug)]
pub struct SlotBinding {
    /// Path to the slot element
    pub path: DomPath,
    /// Kind of slot binding
    pub kind: SlotBindingKind,
}

#[derive(Debug)]
pub enum BindingKind {
    /// `insert(node, () => expr)` — reactive text/child content
    Insert { expression_source: String },
    /// Slot rendering: `renderSlot("name", fallback?)`
    Slot { slot_binding: SlotBinding },
    /// `node.$$click = handler` — delegated event
    DelegatedEvent {
        event_name: String,
        handler_source: String,
    },
    /// `node.addEventListener(name, handler)` — direct (non-bubbling) event
    DirectEvent {
        event_name: String,
        handler_source: String,
    },
    /// `setAttribute(node, name, value)` or reactive attribute
    Attribute {
        name: String,
        value_source: String,
        is_dynamic: bool,
    },
    /// `className(node, value)`
    ClassName {
        value_source: String,
        is_dynamic: bool,
    },
    /// `style(node, value)`
    Style {
        value_source: String,
        is_dynamic: bool,
    },
    /// `ref(node)` — ref callback
    Ref { ref_source: String },
    /// `spread(node, props)` — spread props
    Spread { props_source: String },
}
