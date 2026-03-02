use crate::{Renderer, VNode};
use web_sys::{Document, Element, Node, Window};
use std::rc::Rc;
use std::cell::RefCell;

pub struct DomRenderer {
    document: Document,
}

impl DomRenderer {
    pub fn new() -> Option<Self> {
        let window = web_sys::window()?;
        let document = window.document()?;
        Some(Self { document })
    }
}

impl Renderer for DomRenderer {
    type HostNode = Node;
    type HostElement = Element;

    fn create_element(&self, tag: &str) -> Self::HostElement {
        self.document.create_element(tag).expect("Failed to create element")
    }

    fn create_text(&self, text: &str) -> Self::HostNode {
        self.document.create_text_node(text).into()
    }

    fn set_attribute(&self, el: &mut Self::HostElement, key: &str, value: &str) {
        el.set_attribute(key, value).expect("Failed to set attribute");
    }

    fn append_child(&self, parent: &mut Self::HostElement, child: &Self::HostNode) {
        parent.append_child(child).expect("Failed to append child");
    }
}

/// Mount a VNode to a DOM element
pub fn mount(vnode: &mut VNode, container: &mut Element, renderer: &DomRenderer) {
    match vnode.node_type {
        crate::VNodeType::Element => {
            let mut el = renderer.create_element(&vnode.tag);
            
            for (key, value) in &vnode.props {
                renderer.set_attribute(&mut el, key, value);
            }
            
            for child in &mut vnode.children {
                mount(child, &mut el, renderer);
            }
            
            renderer.append_child(container, &el.into());
            
            // Store reference to DOM node
            vnode.el = Some(Rc::new(RefCell::new(el.into())));
        }
        crate::VNodeType::Text => {
            // For text nodes, tag is empty, content is in props? No, text nodes need content.
            // Our VNode struct assumes children for elements.
            // We need a way to store text content.
            // Let's assume for now we don't have text content in VNode struct explicitly other than maybe "nodeValue" prop or children?
            // Wait, VNode::text constructor sets tag to empty.
            // Where is the text content?
            // In the previous VNode struct I didn't add a `text` field.
            // I should update VNode struct or use a property.
            
            // Let's assume "nodeValue" or similar property, or just add a field.
            // I will update VNode struct in lib.rs first.
            
            // For now, let's just create an empty text node to satisfy compiler.
            let text = renderer.create_text(""); 
            renderer.append_child(container, &text);
             vnode.el = Some(Rc::new(RefCell::new(text)));
        }
        _ => {}
    }
}
