use std::fmt;

use serde::{
    Deserialize, Deserializer, Serialize, Serializer,
    de::{self, Visitor},
};

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
    pub root: RootIr,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum RootIr {
    Element(ElementIr),
    Fragment(FragmentIr),
    Component(ComponentBindingIr),
    Show(ShowBindingIr),
    For(ForBindingIr),
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

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum StaticAttributeValue {
    String(String),
    Boolean,
}

impl Serialize for StaticAttributeValue {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: Serializer,
    {
        match self {
            Self::String(value) => serializer.serialize_str(value),
            Self::Boolean => serializer.serialize_bool(true),
        }
    }
}

impl<'de> Deserialize<'de> for StaticAttributeValue {
    fn deserialize<D>(deserializer: D) -> Result<Self, D::Error>
    where
        D: Deserializer<'de>,
    {
        deserializer.deserialize_any(StaticAttributeValueVisitor)
    }
}

struct StaticAttributeValueVisitor;

impl Visitor<'_> for StaticAttributeValueVisitor {
    type Value = StaticAttributeValue;

    fn expecting(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str("a string or the boolean literal true")
    }

    fn visit_bool<E>(self, value: bool) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        if value {
            Ok(StaticAttributeValue::Boolean)
        } else {
            Err(E::custom("static boolean attributes must be true"))
        }
    }

    fn visit_str<E>(self, value: &str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Ok(StaticAttributeValue::String(value.to_owned()))
    }

    fn visit_borrowed_str<E>(self, value: &'_ str) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        self.visit_str(value)
    }

    fn visit_string<E>(self, value: String) -> Result<Self::Value, E>
    where
        E: de::Error,
    {
        Ok(StaticAttributeValue::String(value))
    }
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
    Fragment(FragmentIr),
    Component(ComponentBindingIr),
    Show(ShowBindingIr),
    For(ForBindingIr),
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

impl From<FragmentIr> for ChildIr {
    fn from(value: FragmentIr) -> Self {
        Self::Fragment(value)
    }
}

impl From<ComponentBindingIr> for ChildIr {
    fn from(value: ComponentBindingIr) -> Self {
        Self::Component(value)
    }
}

impl From<ShowBindingIr> for ChildIr {
    fn from(value: ShowBindingIr) -> Self {
        Self::Show(value)
    }
}

impl From<ForBindingIr> for ChildIr {
    fn from(value: ForBindingIr) -> Self {
        Self::For(value)
    }
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct FragmentIr {
    pub id: NodeId,
    pub kind: String,
    pub span: SourceSpan,
    pub children: Vec<ChildIr>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentBindingIr {
    pub id: NodeId,
    pub kind: String,
    pub callee: ExpressionIr,
    pub props: Vec<ComponentPropIr>,
    pub span: SourceSpan,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ComponentPropIr {
    pub id: NodeId,
    pub name: String,
    pub value: ComponentPropValueIr,
    pub span: SourceSpan,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(untagged)]
pub enum ComponentPropValueIr {
    Expression(ExpressionIr),
    Children(Vec<ChildIr>),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ShowBindingIr {
    pub id: NodeId,
    pub kind: String,
    pub when: ExpressionIr,
    pub children: Vec<ChildIr>,
    pub fallback: Option<ComponentPropValueIr>,
    pub span: SourceSpan,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ForBindingIr {
    pub id: NodeId,
    pub kind: String,
    pub each: ExpressionIr,
    pub by: Option<ExpressionIr>,
    pub item: String,
    pub index: Option<String>,
    pub body: Vec<ChildIr>,
    pub span: SourceSpan,
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
