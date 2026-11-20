//! Experimental HMR data slots derived from the same IR used by DOM codegen.
//! Only literal binding values may be masked out of the module signature.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HmrPlan {
    pub version: u8,
    pub signature: String,
    pub bindings: Vec<HmrBinding>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HmrBinding {
    pub id: u32,
    pub kind: String,
    pub value: String,
}
