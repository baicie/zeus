//! Core Runtime for Zeus Framework
//!
//! This crate provides the Virtual DOM implementation and reactivity system integration.

use std::collections::HashMap;
use std::rc::Rc;
use std::cell::RefCell;

pub mod dom_renderer;

/// Virtual Node Types
#[derive(Debug, Clone, PartialEq)]
pub enum VNodeType {
    Text,
    Element,
    Component,
    Fragment,
}

/// Virtual Node
#[derive(Debug, Clone)]
pub struct VNode {
    pub tag: String,
    pub props: HashMap<String, String>,
    pub children: Vec<VNode>,
    pub node_type: VNodeType,
    pub el: Option<Rc<RefCell<web_sys::Node>>>, // For DOM diffing (if we were running in browser via wasm-bindgen)
    // But since we are targeting Node.js/Rust, this might be abstract or a pointer.
    // For MVP, we will keep it simple and focus on structure.
}

impl VNode {
    /// Create a new element VNode
    pub fn h(tag: &str, props: HashMap<String, String>, children: Vec<VNode>) -> Self {
        Self {
            tag: tag.to_string(),
            props,
            children,
            node_type: VNodeType::Element,
            el: None,
        }
    }

    /// Create a text VNode
    pub fn text(content: &str) -> Self {
        Self {
            tag: String::new(),
            props: HashMap::new(),
            children: vec![], // Text nodes don't have children in this simple model
            node_type: VNodeType::Text,
            el: None,
        }
    }
}

/// Renderer Interface
pub trait Renderer {
    type HostNode;
    type HostElement;

    fn create_element(&self, tag: &str) -> Self::HostElement;
    fn create_text(&self, text: &str) -> Self::HostNode;
    fn set_attribute(&self, el: &mut Self::HostElement, key: &str, value: &str);
    fn append_child(&self, parent: &mut Self::HostElement, child: &Self::HostNode);
}

// Note: In a real implementation, we would implement `Renderer` for DOM (web-sys)
// and maybe for server-side rendering (string concatenation).
