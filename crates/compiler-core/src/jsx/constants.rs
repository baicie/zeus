//! JSX 编译器常量定义模块
//!
//! 定义 HTML 元素、属性、事件等常量集合

/// 自闭合 (Void) HTML 元素列表
pub const VOID_ELEMENTS: &[&str] = &[
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "keygen", "link", "menuitem", "meta", "param", "source", "track", "wbr",
];

/// 需要始终闭合的元素
pub const ALWAYS_CLOSE_ELEMENTS: &[&str] = &[
    "title", "style", "a", "strong", "small", "b", "u", "i", "em", "s",
    "code", "object", "table", "button", "textarea", "select", "iframe",
    "script", "noscript", "template", "fieldset",
];

/// 内联元素
pub const INLINE_ELEMENTS: &[&str] = &[
    "a", "abbr", "acronym", "b", "bdi", "bdo", "big", "br", "button",
    "canvas", "cite", "code", "data", "datalist", "del", "dfn", "em",
    "embed", "i", "iframe", "img", "input", "ins", "kbd", "label", "map",
    "mark", "meter", "noscript", "object", "output", "picture", "progress",
    "q", "ruby", "s", "samp", "script", "select", "slot", "small", "span",
    "strong", "sub", "sup", "svg", "template", "textarea", "time", "u",
    "tt", "var", "video",
];

/// 块级元素
pub const BLOCK_ELEMENTS: &[&str] = &[
    "address", "article", "aside", "blockquote", "dd", "details", "dialog",
    "div", "dl", "dt", "fieldset", "figcaption", "figure", "footer", "form",
    "h1", "h2", "h3", "h4", "h5", "h6", "header", "hgroup", "hr", "li",
    "main", "menu", "nav", "ol", "p", "pre", "section", "table", "ul",
];

/// DOM 属性集合 (需要通过 property 赋值而非 setAttribute)
pub const DOM_PROPERTIES: &[&str] = &[
    "className", "value", "readOnly", "noValidate", "formNoValidate",
    "isMap", "noModule", "playsInline", "allowFullscreen", "defaultChecked",
    "disabled", "hidden", "indeterminate", "multiple", "muted", "open",
    "required", "selected",
];

/// 子节点属性 (会替换子节点内容)
pub const CHILD_PROPERTIES: &[&str] = &[
    "innerHTML", "innerText", "textContent", "children",
];

/// 布尔 HTML 属性 (存在即为 true)
pub const BOOLEAN_ATTRIBUTES: &[&str] = &[
    "allowfullscreen", "async", "autofocus", "autoplay", "checked", "controls",
    "default", "defer", "disabled", "formnovalidate", "hidden", "indeterminate",
    "inert", "ismap", "loop", "multiple", "muted", "nomodule", "novalidate",
    "open", "playsinline", "readonly", "required", "reversed", "selected",
];

/// SVG 元素集合
pub const SVG_ELEMENTS: &[&str] = &[
    "altGlyph", "altGlyphDef", "circle", "clipPath", "defs", "ellipse",
    "feBlend", "feColorMatrix", "feComposite", "feConvolveMatrix",
    "feDiffuseLighting", "feDisplacementMap", "feDistantLight",
    "feDropShadow", "feFlood", "feGaussianBlur", "feImage", "feMerge",
    "feMergeNode", "feMorphology", "feOffset", "fePointLight",
    "feSpecularLighting", "feSpotLight", "feTile", "feTurbulence",
    "filter", "font", "foreignObject", "g", "glyph", "glyphRef",
    "hkern", "image", "line", "linearGradient", "marker", "mask",
    "metadata", "missing-glyph", "mpath", "path", "pattern", "polygon",
    "polyline", "radialGradient", "rect", "set", "stop", "svg",
    "switch", "symbol", "text", "textPath", "tref", "tspan", "use",
    "view", "vkern",
];

/// 委托事件集合
pub const DELEGATED_EVENTS: &[&str] = &[
    "beforeinput", "click", "dblclick", "contextmenu",
    "focusin", "focusout", "input", "keydown", "keyup",
    "mousedown", "mousemove", "mouseout", "mouseover", "mouseup",
    "pointerdown", "pointermove", "pointerout", "pointerover", "pointerup",
    "touchend", "touchmove", "touchstart",
];

/// 保留的命名空间前缀
pub const RESERVED_NAMESPACES: &[&str] = &[
    "class", "on", "oncapture", "style", "use", "prop", "attr", "bool",
];

/// 属性别名 (React 兼容)
pub const ATTR_ALIASES: &[(&str, &str)] = &[
    ("className", "class"),
    ("htmlFor", "for"),
];

/// 需要使用 importNode 的元素
pub const IMPORT_NODE_ELEMENTS: &[&str] = &[
    "img", "iframe",
];

/// 检测是否为 void 元素
#[inline]
pub fn is_void_element(tag: &str) -> bool {
    VOID_ELEMENTS.contains(&tag)
}

/// 检测是否为 SVG 元素
#[inline]
pub fn is_svg_element(tag: &str) -> bool {
    SVG_ELEMENTS.contains(&tag)
}

/// 检测是否为 DOM 属性
#[inline]
pub fn is_dom_property(attr: &str) -> bool {
    DOM_PROPERTIES.contains(&attr)
}

/// 检测是否为子节点属性
#[inline]
pub fn is_child_property(attr: &str) -> bool {
    CHILD_PROPERTIES.contains(&attr)
}

/// 检测是否为布尔属性
#[inline]
pub fn is_boolean_attribute(attr: &str) -> bool {
    BOOLEAN_ATTRIBUTES.contains(&attr)
}

/// 检测是否为委托事件
#[inline]
pub fn is_delegated_event(event: &str) -> bool {
    DELEGATED_EVENTS.contains(&event)
}

/// 检测是否为保留的命名空间前缀
#[inline]
pub fn is_reserved_namespace(ns: &str) -> bool {
    RESERVED_NAMESPACES.contains(&ns)
}

/// 检测是否为 importNode 元素
#[inline]
pub fn is_import_node_element(tag: &str) -> bool {
    IMPORT_NODE_ELEMENTS.contains(&tag)
}

/// 解析属性别名
#[inline]
pub fn resolve_attr_alias(attr: &str) -> &str {
    for (alias, actual) in ATTR_ALIASES {
        if *alias == attr {
            return actual;
        }
    }
    attr
}
