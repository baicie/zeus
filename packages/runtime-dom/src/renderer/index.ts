// Low-level DOM node operations (utility functions)

export const nodeOps = {
  createElement: (tag: string): Element => document.createElement(tag),

  createText: (text: string): Text => document.createTextNode(text),

  setElementText: (el: Element, text: string): void => {
    el.textContent = text
  },

  insert: (child: Node, parent: Element, anchor?: Node | null): void => {
    parent.insertBefore(child, anchor || null)
  },

  remove: (child: Node): void => {
    const parent = child.parentNode
    if (parent) {
      parent.removeChild(child)
    }
  },
}
