use serde::{Deserialize, Serialize};

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
