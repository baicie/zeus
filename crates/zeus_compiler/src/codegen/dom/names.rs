//! Runtime binding names for the DOM target.
//!
//! `RuntimeNames` maps each [`RuntimeHelper`] the module needs to the
//! identifier the emitter will use for it, plus the locator attribute and the
//! delegation flag. `HelperUsage` is how the set is decided: it walks the
//! bindings and records which helpers they imply.
//!
//! **Why this is here and not in `codegen/mod.rs`:** SSR has its own
//! `SsrRuntimeNames` and never touches either type, so both are DOM-only. They
//! were in the orchestrator, and `dom/emit.rs` needed them — which made the
//! emitter import the module that owns it, the one remaining back edge in the
//! DOM subsystem.
//!
//! `allocate` stays with the type. It takes `&HelperUsage` and `&mut
//! NameAllocator`; splitting them across modules would move the name-ordering
//! contract away from the thing that defines the names.

use std::collections::{HashMap, HashSet};

use crate::codegen::analysis::RuntimeHelper;
use crate::codegen::analysis::is_delegatable_event;
use crate::codegen::infra::NameAllocator;
use crate::ir::{
    ChildIr, ComponentBindingIr, ComponentPropIr, ComponentPropValueIr, DynamicRegionExpressionIr,
    DynamicRegionIr, DynamicRegionValueIr, ErrorBoundaryBindingIr, ErrorBoundaryFallbackIr,
    ModuleIr, RootIr,
};

use super::model::{
    AttributeBindingKind, DynamicBinding, collect_dynamic_bindings, collect_root_dynamic_bindings,
    dynamic_binding,
};

#[derive(Default)]
pub(crate) struct HelperUsage(pub(crate) HashSet<RuntimeHelper>);

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
                DynamicBinding::Node { .. } => {
                    usage.0.insert(RuntimeHelper::Insert);
                }
                DynamicBinding::TextContent { .. } => {
                    usage.0.insert(RuntimeHelper::BindTextContent);
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
                DynamicBinding::Spread { .. } => {
                    usage.0.insert(RuntimeHelper::BindSpread);
                }
                DynamicBinding::Property { .. } => {
                    usage.0.insert(RuntimeHelper::BindProp);
                }
                DynamicBinding::Event { .. } => {
                    usage.0.insert(RuntimeHelper::BindEvent);
                }
                DynamicBinding::Ref { .. } => {
                    usage.0.insert(RuntimeHelper::BindRef);
                }
                DynamicBinding::Component { component } => {
                    if component.kind == "Slot" {
                        usage.0.insert(RuntimeHelper::CreateSlot);
                    } else {
                        usage.0.insert(RuntimeHelper::CreateComponent);
                    }
                    usage.0.insert(RuntimeHelper::Insert);
                    collect_component_helper_usage(component, &mut usage.0);
                }
                DynamicBinding::ErrorBoundary { boundary } => {
                    usage.0.insert(RuntimeHelper::Insert);
                    collect_error_boundary_helper_usage(boundary, &mut usage.0);
                }
                DynamicBinding::Show { show } => {
                    usage.0.insert(RuntimeHelper::MountShow);
                    collect_builtin_helper_usage(&show.children, &mut usage.0);
                    if let Some(ComponentPropValueIr::Children(children)) = &show.fallback {
                        collect_builtin_helper_usage(children, &mut usage.0);
                    }
                }
                DynamicBinding::For { for_binding } => {
                    usage.0.insert(RuntimeHelper::MountFor);
                    collect_builtin_helper_usage(&for_binding.body, &mut usage.0);
                }
                DynamicBinding::Transition { transition } => {
                    usage.0.insert(RuntimeHelper::MountTransition);
                    collect_builtin_helper_usage(&transition.children, &mut usage.0);
                }
                DynamicBinding::DynamicRegion { region } => {
                    usage.0.insert(RuntimeHelper::MountDynamic);
                    collect_dynamic_region_helper_usage(region, &mut usage.0);
                }
            }
        }
        usage
    }
}

pub(crate) struct RuntimeNames {
    pub(crate) locals: HashMap<RuntimeHelper, String>,
    pub(crate) locator_attribute: String,
    pub(crate) enable_delegation: bool,
}

impl RuntimeNames {
    pub(crate) fn allocate(
        usage: &HelperUsage,
        locator_attribute: &str,
        enable_delegation: bool,
        names: &mut NameAllocator,
    ) -> Self {
        let locals = RuntimeHelper::ORDERED
            .iter()
            .filter(|helper| **helper == RuntimeHelper::Template || usage.0.contains(helper))
            .map(|helper| (*helper, names.allocate(helper.local_base())))
            .collect();
        Self {
            locals,
            locator_attribute: locator_attribute.into(),
            enable_delegation,
        }
    }

    pub(crate) fn locator_attribute(&self) -> &str {
        &self.locator_attribute
    }

    pub(crate) fn entries(&self) -> Vec<(&'static str, &str)> {
        RuntimeHelper::ORDERED
            .iter()
            .filter_map(|helper| {
                self.locals
                    .get(helper)
                    .map(|local| (helper.exported(), local.as_str()))
            })
            .collect()
    }

    pub(crate) fn get(&self, helper: RuntimeHelper) -> &str {
        self.locals.get(&helper).map_or_else(
            || panic!("{} helper usage was not collected", helper.exported()),
            String::as_str,
        )
    }

    pub(crate) fn template(&self) -> &str {
        self.get(RuntimeHelper::Template)
    }

    pub(crate) fn auto_hydrate_component(&self) -> &str {
        self.get(RuntimeHelper::AutoHydrateComponent)
    }

    pub(crate) fn create_component(&self) -> &str {
        self.get(RuntimeHelper::CreateComponent)
    }

    pub(crate) fn create_slot(&self) -> &str {
        self.get(RuntimeHelper::CreateSlot)
    }

    pub(crate) fn error_boundary(&self) -> &str {
        self.get(RuntimeHelper::ErrorBoundary)
    }

    pub(crate) fn mount_show(&self) -> &str {
        self.get(RuntimeHelper::MountShow)
    }

    pub(crate) fn mount_for(&self) -> &str {
        self.get(RuntimeHelper::MountFor)
    }

    pub(crate) fn mount_transition(&self) -> &str {
        self.get(RuntimeHelper::MountTransition)
    }

    pub(crate) fn mount_dynamic(&self) -> &str {
        self.get(RuntimeHelper::MountDynamic)
    }

    pub(crate) fn insert(&self) -> &str {
        self.get(RuntimeHelper::Insert)
    }

    pub(crate) fn bind_text(&self) -> &str {
        self.get(RuntimeHelper::BindText)
    }

    pub(crate) fn bind_text_content(&self) -> &str {
        self.get(RuntimeHelper::BindTextContent)
    }

    pub(crate) fn bind_attr(&self) -> &str {
        self.get(RuntimeHelper::BindAttr)
    }

    pub(crate) fn bind_class(&self) -> &str {
        self.get(RuntimeHelper::BindClass)
    }

    pub(crate) fn bind_style(&self) -> &str {
        self.get(RuntimeHelper::BindStyle)
    }

    pub(crate) fn bind_spread(&self) -> &str {
        self.get(RuntimeHelper::BindSpread)
    }
    pub(crate) fn merge_props(&self) -> &str {
        self.get(RuntimeHelper::MergeProps)
    }

    pub(crate) fn bind_prop(&self) -> &str {
        self.get(RuntimeHelper::BindProp)
    }

    pub(crate) fn bind_event(&self) -> &str {
        self.get(RuntimeHelper::BindEvent)
    }

    pub(crate) fn bind_ref(&self) -> &str {
        self.get(RuntimeHelper::BindRef)
    }

    pub(crate) fn delegate_events(&self) -> &str {
        self.get(RuntimeHelper::DelegateEvents)
    }

    pub(crate) fn should_delegate_event(&self, event_name: &str) -> bool {
        self.enable_delegation && is_delegatable_event(event_name)
    }
}

pub(crate) fn collect_module_helper_usage(
    module: &ModuleIr,
    binding_sets: &[Vec<DynamicBinding>],
    has_delegated_events: bool,
) -> HelperUsage {
    let mut usage = HelperUsage::from_binding_sets(binding_sets, has_delegated_events);
    for component in &module.components {
        match &component.root {
            RootIr::ErrorBoundary(boundary) => {
                collect_error_boundary_helper_usage(boundary, &mut usage.0);
            }
            RootIr::Show(show) => {
                usage.0.insert(RuntimeHelper::MountShow);
                collect_builtin_helper_usage(&show.children, &mut usage.0);
                if let Some(ComponentPropValueIr::Children(children)) = &show.fallback {
                    collect_builtin_helper_usage(children, &mut usage.0);
                }
            }
            RootIr::For(for_binding) => {
                usage.0.insert(RuntimeHelper::MountFor);
                collect_builtin_helper_usage(&for_binding.body, &mut usage.0);
            }
            RootIr::Transition(transition) => {
                usage.0.insert(RuntimeHelper::MountTransition);
                collect_builtin_helper_usage(&transition.children, &mut usage.0);
            }
            RootIr::Component(component) => {
                collect_component_helper_usage(component, &mut usage.0);
            }
            RootIr::Element(_) | RootIr::Fragment(_) => {}
        }
    }
    usage
}

pub(crate) fn collect_component_helper_usage(
    component: &ComponentBindingIr,
    usage: &mut HashSet<RuntimeHelper>,
) {
    if component.kind == "Slot" {
        usage.insert(RuntimeHelper::CreateSlot);
    } else {
        usage.insert(RuntimeHelper::CreateComponent);
    }
    if component
        .props
        .iter()
        .any(|prop| matches!(prop, ComponentPropIr::Spread(_)))
    {
        usage.insert(RuntimeHelper::MergeProps);
    }
    for prop in component.props.iter().filter_map(ComponentPropIr::named) {
        let ComponentPropValueIr::Children(children) = &prop.value else {
            continue;
        };
        for child in children {
            match child {
                ChildIr::Element(element) => {
                    for binding in collect_dynamic_bindings(element) {
                        collect_binding_helper_usage(&binding, usage);
                    }
                }
                ChildIr::Fragment(fragment) => {
                    for binding in
                        collect_root_dynamic_bindings(&RootIr::Fragment(fragment.clone()))
                    {
                        collect_binding_helper_usage(&binding, usage);
                    }
                }
                ChildIr::Component(component) => collect_component_helper_usage(component, usage),
                ChildIr::ErrorBoundary(boundary) => {
                    collect_error_boundary_helper_usage(boundary, usage);
                }
                ChildIr::Show(show) => {
                    usage.insert(RuntimeHelper::MountShow);
                    collect_builtin_helper_usage(&show.children, usage);
                    if let Some(ComponentPropValueIr::Children(children)) = &show.fallback {
                        collect_builtin_helper_usage(children, usage);
                    }
                }
                ChildIr::For(for_binding) => {
                    usage.insert(RuntimeHelper::MountFor);
                    collect_builtin_helper_usage(&for_binding.body, usage);
                }
                ChildIr::Transition(transition) => {
                    usage.insert(RuntimeHelper::MountTransition);
                    collect_builtin_helper_usage(&transition.children, usage);
                }
                ChildIr::DynamicText(dynamic) => {
                    collect_binding_helper_usage(&dynamic_binding(dynamic), usage);
                }
                ChildIr::DynamicRegion(region) => {
                    collect_binding_helper_usage(
                        &DynamicBinding::DynamicRegion {
                            region: region.clone(),
                        },
                        usage,
                    );
                }
                ChildIr::Text(_) => {}
            }
        }
    }
}

pub(crate) fn collect_error_boundary_helper_usage(
    boundary: &ErrorBoundaryBindingIr,
    usage: &mut HashSet<RuntimeHelper>,
) {
    usage.insert(RuntimeHelper::ErrorBoundary);
    collect_builtin_helper_usage(&boundary.children, usage);
    if let ErrorBoundaryFallbackIr::Render(render) = &boundary.fallback {
        collect_builtin_helper_usage(&render.body, usage);
    }
}

pub(crate) fn collect_builtin_helper_usage(
    children: &[ChildIr],
    usage: &mut HashSet<RuntimeHelper>,
) {
    for child in children {
        match child {
            ChildIr::Element(element) => {
                for binding in collect_dynamic_bindings(element) {
                    collect_binding_helper_usage(&binding, usage);
                }
            }
            ChildIr::Fragment(fragment) => {
                for binding in collect_root_dynamic_bindings(&RootIr::Fragment(fragment.clone())) {
                    collect_binding_helper_usage(&binding, usage);
                }
            }
            ChildIr::Component(component) => collect_component_helper_usage(component, usage),
            ChildIr::ErrorBoundary(boundary) => {
                collect_error_boundary_helper_usage(boundary, usage);
            }
            ChildIr::Show(show) => {
                usage.insert(RuntimeHelper::MountShow);
                collect_builtin_helper_usage(&show.children, usage);
                if let Some(ComponentPropValueIr::Children(children)) = &show.fallback {
                    collect_builtin_helper_usage(children, usage);
                }
            }
            ChildIr::For(for_binding) => {
                usage.insert(RuntimeHelper::MountFor);
                collect_builtin_helper_usage(&for_binding.body, usage);
            }
            ChildIr::Transition(transition) => {
                usage.insert(RuntimeHelper::MountTransition);
                collect_builtin_helper_usage(&transition.children, usage);
            }
            ChildIr::DynamicText(dynamic) => {
                collect_binding_helper_usage(&dynamic_binding(dynamic), usage);
            }
            ChildIr::DynamicRegion(region) => {
                collect_binding_helper_usage(
                    &DynamicBinding::DynamicRegion {
                        region: region.clone(),
                    },
                    usage,
                );
            }
            ChildIr::Text(_) => {}
        }
    }
}

pub(crate) fn collect_binding_helper_usage(
    binding: &DynamicBinding,
    usage: &mut HashSet<RuntimeHelper>,
) {
    match binding {
        DynamicBinding::Text { .. } => {
            usage.insert(RuntimeHelper::Insert);
            usage.insert(RuntimeHelper::BindText);
        }
        DynamicBinding::Node { .. } => {
            usage.insert(RuntimeHelper::Insert);
        }
        DynamicBinding::TextContent { .. } => {
            usage.insert(RuntimeHelper::BindTextContent);
        }
        DynamicBinding::Attribute { kind, .. } => {
            usage.insert(match kind {
                AttributeBindingKind::Attribute => RuntimeHelper::BindAttr,
                AttributeBindingKind::Class => RuntimeHelper::BindClass,
                AttributeBindingKind::Style => RuntimeHelper::BindStyle,
            });
        }
        DynamicBinding::Spread { .. } => {
            usage.insert(RuntimeHelper::BindSpread);
        }
        DynamicBinding::Property { .. } => {
            usage.insert(RuntimeHelper::BindProp);
        }
        DynamicBinding::Event { .. } => {
            usage.insert(RuntimeHelper::BindEvent);
        }
        DynamicBinding::Ref { .. } => {
            usage.insert(RuntimeHelper::BindRef);
        }
        DynamicBinding::Component { component } => {
            if component.kind == "Slot" {
                usage.insert(RuntimeHelper::CreateSlot);
            } else {
                usage.insert(RuntimeHelper::CreateComponent);
            }
            usage.insert(RuntimeHelper::Insert);
            collect_component_helper_usage(component, usage);
        }
        DynamicBinding::ErrorBoundary { boundary } => {
            usage.insert(RuntimeHelper::Insert);
            collect_error_boundary_helper_usage(boundary, usage);
        }
        DynamicBinding::Show { show } => {
            usage.insert(RuntimeHelper::MountShow);
            collect_builtin_helper_usage(&show.children, usage);
            if let Some(ComponentPropValueIr::Children(children)) = &show.fallback {
                collect_builtin_helper_usage(children, usage);
            }
        }
        DynamicBinding::For { for_binding } => {
            usage.insert(RuntimeHelper::MountFor);
            collect_builtin_helper_usage(&for_binding.body, usage);
        }
        DynamicBinding::Transition { transition } => {
            usage.insert(RuntimeHelper::MountTransition);
            collect_builtin_helper_usage(&transition.children, usage);
        }
        DynamicBinding::DynamicRegion { region } => {
            usage.insert(RuntimeHelper::MountDynamic);
            collect_dynamic_region_helper_usage(region, usage);
        }
    }
}

pub(crate) fn collect_dynamic_region_helper_usage(
    region: &DynamicRegionIr,
    usage: &mut HashSet<RuntimeHelper>,
) {
    match &region.expression {
        DynamicRegionExpressionIr::Value { .. } => {}
        DynamicRegionExpressionIr::Conditional {
            consequent,
            alternate,
            ..
        } => {
            collect_dynamic_region_value_helper_usage(consequent, usage);
            collect_dynamic_region_value_helper_usage(alternate, usage);
        }
        DynamicRegionExpressionIr::Logical { right, .. } => {
            collect_dynamic_region_value_helper_usage(right, usage);
        }
        DynamicRegionExpressionIr::ArrayMap { body, .. } => {
            collect_builtin_helper_usage(body, usage);
        }
        DynamicRegionExpressionIr::ArrayLiteral { items } => {
            for item in items {
                collect_dynamic_region_value_helper_usage(item, usage);
            }
        }
    }
}

pub(crate) fn collect_dynamic_region_value_helper_usage(
    value: &DynamicRegionValueIr,
    usage: &mut HashSet<RuntimeHelper>,
) {
    if let DynamicRegionValueIr::Children(children) = value {
        collect_builtin_helper_usage(children, usage);
    }
}
