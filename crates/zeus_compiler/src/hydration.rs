use serde::{Deserialize, Serialize};

use crate::html::is_raw_text_element;
use crate::ir::{
    AttributeIr, ChildIr, ComponentBindingIr, ComponentPropIr, ComponentPropValueIr,
    DynamicRegionExpressionIr, DynamicRegionIr, DynamicRegionValueIr, ElementIr, ForBindingIr,
    ModuleIr, RootIr, ShowBindingIr, TransitionBindingIr,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydrationPlan {
    pub version: u8,
    pub components: Vec<HydrationComponentPlan>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydrationComponentPlan {
    pub id: u32,
    pub template_id: String,
    pub nodes: Vec<HydrationNodePlan>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydrationNodePlan {
    pub id: String,
    pub node_id: u32,
    pub kind: String,
    pub optional: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tag_name: Option<String>,
    pub bindings: Vec<HydrationBindingPlan>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HydrationBindingPlan {
    pub id: u32,
    pub kind: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub name: Option<String>,
    pub once: bool,
}

pub(crate) fn build_hydration_plan(module: &ModuleIr) -> Option<HydrationPlan> {
    if module.components.is_empty() {
        return None;
    }

    Some(HydrationPlan {
        version: 1,
        components: module
            .components
            .iter()
            .map(|component| HydrationComponentPlan {
                id: component.id,
                template_id: component_root_marker_id(component.id),
                nodes: collect_component_nodes(component.id, &component.root),
            })
            .collect(),
    })
}

pub(crate) fn component_root_marker_id(component_id: u32) -> String {
    format!("c{component_id}.root")
}

pub(crate) fn element_marker_id(component_id: u32, node_id: u32) -> String {
    format!("c{component_id}.e{node_id}")
}

pub(crate) fn text_marker_id(component_id: u32, node_id: u32) -> String {
    format!("c{component_id}.t{node_id}")
}

pub(crate) fn node_marker_id(component_id: u32, kind: &str, node_id: u32) -> String {
    let short = match kind {
        "component" => "c",
        "show" => "s",
        "for" => "f",
        "transition" => "x",
        "region" => "r",
        _ => "n",
    };
    format!("c{component_id}.{short}{node_id}")
}

fn collect_component_nodes(component_id: u32, root: &RootIr) -> Vec<HydrationNodePlan> {
    let mut nodes = vec![HydrationNodePlan {
        id: component_root_marker_id(component_id),
        node_id: component_id,
        kind: "root".into(),
        optional: false,
        tag_name: None,
        bindings: Vec::new(),
    }];
    match root {
        RootIr::Element(element) => collect_element(component_id, element, &mut nodes, false),
        RootIr::Fragment(fragment) => {
            collect_children(component_id, &fragment.children, &mut nodes, false);
        }
        RootIr::Component(component) => {
            collect_component(component_id, component, &mut nodes, false);
        }
        RootIr::Show(show) => collect_show(component_id, show, &mut nodes, false),
        RootIr::For(for_binding) => collect_for(component_id, for_binding, &mut nodes, false),
        RootIr::Transition(transition) => {
            collect_transition(component_id, transition, &mut nodes, false);
        }
        RootIr::ErrorBoundary(_) => {}
    }
    nodes
}

fn collect_children(
    component_id: u32,
    children: &[ChildIr],
    nodes: &mut Vec<HydrationNodePlan>,
    optional: bool,
) {
    collect_children_with_raw_text(component_id, children, nodes, false, optional);
}

fn collect_children_with_raw_text(
    component_id: u32,
    children: &[ChildIr],
    nodes: &mut Vec<HydrationNodePlan>,
    raw_text: bool,
    optional: bool,
) {
    for child in children {
        match child {
            ChildIr::Element(element) => collect_element(component_id, element, nodes, optional),
            ChildIr::DynamicText(text) if !raw_text => {
                nodes.push(HydrationNodePlan {
                    id: text_marker_id(component_id, text.reference.node_id),
                    node_id: text.reference.node_id,
                    kind: "text".into(),
                    optional,
                    tag_name: None,
                    bindings: vec![HydrationBindingPlan {
                        id: text.id,
                        kind: "text".into(),
                        name: None,
                        once: text.once,
                    }],
                });
            }
            ChildIr::Fragment(fragment) => {
                collect_children(component_id, &fragment.children, nodes, optional);
            }
            ChildIr::Component(component) => {
                collect_component(component_id, component, nodes, optional);
            }
            ChildIr::Show(show) => collect_show(component_id, show, nodes, optional),
            ChildIr::For(for_binding) => collect_for(component_id, for_binding, nodes, optional),
            ChildIr::Transition(transition) => {
                collect_transition(component_id, transition, nodes, optional);
            }
            ChildIr::DynamicRegion(region) => {
                collect_region(component_id, region, nodes, optional);
            }
            ChildIr::DynamicText(_) | ChildIr::ErrorBoundary(_) | ChildIr::Text(_) => {}
        }
    }
}

fn collect_element(
    component_id: u32,
    element: &ElementIr,
    nodes: &mut Vec<HydrationNodePlan>,
    optional: bool,
) {
    let bindings = element
        .attributes
        .iter()
        .filter_map(|attribute| match attribute {
            AttributeIr::Dynamic(binding) => Some(HydrationBindingPlan {
                id: binding.id,
                kind: "attr".into(),
                name: Some(binding.name.clone()),
                once: binding.once,
            }),
            AttributeIr::Property(binding) => Some(HydrationBindingPlan {
                id: binding.id,
                kind: "prop".into(),
                name: Some(binding.name.clone()),
                once: binding.once,
            }),
            AttributeIr::Event(binding) => Some(HydrationBindingPlan {
                id: binding.id,
                kind: "event".into(),
                name: Some(binding.event_name.clone()),
                once: false,
            }),
            AttributeIr::Spread(binding) => Some(HydrationBindingPlan {
                id: binding.id,
                kind: "spread".into(),
                name: Some(binding.target.clone()),
                once: false,
            }),
            AttributeIr::Static(_) | AttributeIr::Ref(_) => None,
        })
        .collect();
    nodes.push(HydrationNodePlan {
        id: element_marker_id(component_id, element.reference.node_id),
        node_id: element.reference.node_id,
        kind: "element".into(),
        optional,
        tag_name: Some(element.tag_name.clone()),
        bindings,
    });
    collect_children_with_raw_text(
        component_id,
        &element.children,
        nodes,
        is_raw_text_element(&element.tag_name),
        optional,
    );
}

fn collect_component(
    component_id: u32,
    component: &ComponentBindingIr,
    nodes: &mut Vec<HydrationNodePlan>,
    optional: bool,
) {
    nodes.push(HydrationNodePlan {
        id: node_marker_id(component_id, "component", component.id),
        node_id: component.id,
        kind: "component".into(),
        optional,
        tag_name: None,
        bindings: component
            .props
            .iter()
            .filter_map(|prop| match prop {
                ComponentPropIr::Spread(binding) => Some(HydrationBindingPlan {
                    id: binding.id,
                    kind: "spread".into(),
                    name: Some(binding.target.clone()),
                    once: false,
                }),
                ComponentPropIr::Named(_) => None,
            })
            .collect(),
    });
    for prop in &component.props {
        if let ComponentPropIr::Named(named) = prop
            && let ComponentPropValueIr::Children(children) = &named.value
        {
            collect_children(component_id, children, nodes, optional);
        }
    }
}

fn collect_show(
    component_id: u32,
    show: &ShowBindingIr,
    nodes: &mut Vec<HydrationNodePlan>,
    optional: bool,
) {
    nodes.push(node_plan(component_id, "show", show.id, optional));
    collect_children(component_id, &show.children, nodes, true);
    if let Some(ComponentPropValueIr::Children(children)) = &show.fallback {
        collect_children(component_id, children, nodes, true);
    }
}

fn collect_for(
    component_id: u32,
    for_binding: &ForBindingIr,
    nodes: &mut Vec<HydrationNodePlan>,
    optional: bool,
) {
    nodes.push(node_plan(component_id, "for", for_binding.id, optional));
    collect_children(component_id, &for_binding.body, nodes, true);
}

fn collect_transition(
    component_id: u32,
    transition: &TransitionBindingIr,
    nodes: &mut Vec<HydrationNodePlan>,
    optional: bool,
) {
    nodes.push(node_plan(
        component_id,
        "transition",
        transition.id,
        optional,
    ));
    collect_children(component_id, &transition.children, nodes, true);
}

fn collect_region(
    component_id: u32,
    region: &DynamicRegionIr,
    nodes: &mut Vec<HydrationNodePlan>,
    optional: bool,
) {
    nodes.push(node_plan(component_id, "region", region.id, optional));
    match &region.expression {
        DynamicRegionExpressionIr::Conditional {
            consequent,
            alternate,
            ..
        } => {
            collect_region_value(component_id, consequent, nodes, true);
            collect_region_value(component_id, alternate, nodes, true);
        }
        DynamicRegionExpressionIr::Logical { right, .. } => {
            collect_region_value(component_id, right, nodes, true);
        }
        DynamicRegionExpressionIr::ArrayMap { body, .. } => {
            collect_children(component_id, body, nodes, true);
        }
        DynamicRegionExpressionIr::ArrayLiteral { items } => {
            for item in items {
                collect_region_value(component_id, item, nodes, true);
            }
        }
        DynamicRegionExpressionIr::Value { .. } => {}
    }
}

fn collect_region_value(
    component_id: u32,
    value: &DynamicRegionValueIr,
    nodes: &mut Vec<HydrationNodePlan>,
    optional: bool,
) {
    if let DynamicRegionValueIr::Children(children) = value {
        collect_children(component_id, children, nodes, optional);
    }
}

fn node_plan(component_id: u32, kind: &str, node_id: u32, optional: bool) -> HydrationNodePlan {
    HydrationNodePlan {
        id: node_marker_id(component_id, kind, node_id),
        node_id,
        kind: kind.into(),
        optional,
        tag_name: None,
        bindings: Vec::new(),
    }
}
