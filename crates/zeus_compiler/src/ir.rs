use serde::{Deserialize, Serialize};

use crate::span::SourceSpan;

pub type NodeId = u32;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ModuleIr {
    pub id: NodeId,
    pub kind: String,
    pub preamble_end: u32,
    pub components: Vec<ComponentIr>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentIr {
    pub id: NodeId,
    pub kind: String,
    pub span: SourceSpan,
    pub root: ElementIr,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct IrRef {
    pub node_id: NodeId,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ElementIr {
    pub id: NodeId,
    pub kind: String,
    #[serde(rename = "ref")]
    pub reference: IrRef,
    pub tag_name: String,
    pub span: SourceSpan,
    pub attributes: Vec<AttributeIr>,
    pub children: Vec<ChildIr>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind")]
pub enum AttributeIr {
    #[serde(rename = "StaticAttribute")]
    Static(StaticAttributeIr),
    #[serde(rename = "AttrBinding")]
    Dynamic(AttrBindingIr),
    #[serde(rename = "PropBinding")]
    Property(PropBindingIr),
    #[serde(rename = "EventBinding")]
    Event(EventBindingIr),
    #[serde(rename = "RefBinding")]
    Ref(RefBindingIr),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StaticAttributeIr {
    pub id: NodeId,
    pub name: String,
    pub value: StaticAttributeValue,
    pub span: SourceSpan,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum StaticAttributeValue {
    String(String),
    Boolean(bool),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AttrBindingIr {
    pub id: NodeId,
    pub name: String,
    #[serde(rename = "expr")]
    pub expression: ExpressionIr,
    pub span: SourceSpan,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PropBindingIr {
    pub id: NodeId,
    pub name: String,
    #[serde(rename = "expr")]
    pub expression: ExpressionIr,
    pub span: SourceSpan,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EventBindingIr {
    pub id: NodeId,
    pub event_name: String,
    pub handler: ExpressionIr,
    pub span: SourceSpan,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefBindingIr {
    pub id: NodeId,
    #[serde(rename = "expr")]
    pub expression: ExpressionIr,
    pub span: SourceSpan,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ChildIr {
    Element(ElementIr),
    Text(TextIr),
    DynamicText(DynamicTextIr),
}

impl From<ElementIr> for ChildIr {
    fn from(value: ElementIr) -> Self {
        Self::Element(value)
    }
}

impl From<TextIr> for ChildIr {
    fn from(value: TextIr) -> Self {
        Self::Text(value)
    }
}

impl From<DynamicTextIr> for ChildIr {
    fn from(value: DynamicTextIr) -> Self {
        Self::DynamicText(value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TextIr {
    pub id: NodeId,
    pub kind: String,
    pub value: String,
    pub span: SourceSpan,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DynamicTextIr {
    pub id: NodeId,
    pub kind: String,
    #[serde(rename = "ref")]
    pub reference: IrRef,
    pub expression: ExpressionIr,
    pub span: SourceSpan,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ExpressionIr {
    pub kind: String,
    pub code: String,
    pub span: SourceSpan,
    pub form: ExpressionForm,
}

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ExpressionForm {
    #[default]
    Value,
    Getter,
    Member,
}
