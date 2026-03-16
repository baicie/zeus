//! 编译器通用工具函数

/// HTML 转义
///
/// 将字符串中的特殊字符转换为 HTML 实体
pub fn html_escape(s: &str) -> String {
    let mut result = String::with_capacity(s.len());
    for c in s.chars() {
        match c {
            '<' => result.push_str("&lt;"),
            '>' => result.push_str("&gt;"),
            '&' => result.push_str("&amp;"),
            '"' => result.push_str("&quot;"),
            '\'' => result.push_str("&#39;"),
            _ => result.push(c),
        }
    }
    result
}

/// 生成唯一的变量名
pub fn generate_var_name(prefix: &str, counter: &mut usize) -> String {
    let name = format!("{}${}", prefix, *counter);
    *counter += 1;
    name
}

/// 检查名称是否为有效的 DOM 元素名
pub fn is_valid_element_name(name: &str) -> bool {
    // 常见 SVG 元素
    const SVG_ELEMENTS: &[&str] = &[
        "svg", "g", "defs", "desc", "symbol", "use", "path", "rect", "circle", "ellipse",
        "line", "polyline", "polygon", "text", "tspan", "textPath", "clipPath", "mask",
        "linearGradient", "radialGradient", "stop", "filter", "feBlend", "feColorMatrix",
        "feGaussianBlur", "feOffset", "feSpecularLighting", "feTile", "feTurbulence",
    ];

    // 检查是否为小写字母开头
    if name.is_empty() || !name.chars().next().unwrap().is_ascii_lowercase() {
        return false;
    }

    // 检查是否为有效的标识符
    name.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == ':')
        || SVG_ELEMENTS.contains(&name)
}

/// 检查是否为组件（首字母大写）
pub fn is_component_name(name: &str) -> bool {
    name.chars().next().map_or(false, |c| c.is_uppercase())
}

/// 检查事件是否支持委托
pub fn is_delegatable_event(event_name: &str) -> bool {
    // 可以委托的事件
    const DELEGATABLE_EVENTS: &[&str] = &[
        "click", "dblclick", "mousedown", "mouseup", "mouseover", "mouseout", "mousemove",
        "mouseenter", "mouseleave", "touchstart", "touchend", "touchmove", "touchcancel",
        "pointerdown", "pointerup", "pointerover", "pointerout", "pointermove", "pointercancel",
        "pointerenter", "pointerleave", "input", "change", "focus", "blur", "submit",
        "keydown", "keyup", "keypress", "wheel", "scroll", "load", "error", "abort",
    ];

    DELEGATABLE_EVENTS.contains(&event_name)
}

/// 检查属性是否需要使用 setProperty
pub fn is_boolean_attribute(name: &str) -> bool {
    const BOOLEAN_ATTRIBUTES: &[&str] = &[
        "checked", "selected", "disabled", "readonly", "multiple", "required",
        "autofocus", "autoplay", "controls", "loop", "muted", "defer", "async",
        "hidden", "download", "draggable", "spellcheck", "contenteditable", "ismap",
        "novalidate", "open", "allowfullscreen", "allowpaymentrequest", "allowusermedia",
    ];

    BOOLEAN_ATTRIBUTES.contains(&name)
}

/// 检查属性是否应该使用直接属性赋值
pub fn is_direct_property(name: &str) -> bool {
    const DIRECT_PROPERTIES: &[&str] = &[
        "value", "checked", "selected", "disabled", "readonly", "multiple", "innerHTML",
        "textContent", "className", "htmlFor", "formAction", "formEnctype", "formMethod",
        "formNoValidate", "formTarget", "list", "tagName", "parentElement", "children",
    ];

    DIRECT_PROPERTIES.contains(&name) || name.starts_with("data-") || name.starts_with("aria-")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_html_escape() {
        assert_eq!(html_escape("<div>"), "&lt;div&gt;");
        assert_eq!(html_escape("a & b"), "a &amp; b");
        assert_eq!(html_escape("\"quote\""), "&quot;quote&quot;");
    }

    #[test]
    fn test_generate_var_name() {
        let mut counter = 1;
        assert_eq!(generate_var_name("el", &mut counter), "el$1");
        assert_eq!(generate_var_name("el", &mut counter), "el$2");
    }

    #[test]
    fn test_is_component_name() {
        assert!(is_component_name("MyComponent"));
        assert!(is_component_name("X"));
        assert!(!is_component_name("div"));
        assert!(!is_component_name("myComponent"));
    }

    #[test]
    fn test_is_delegatable_event() {
        assert!(is_delegatable_event("click"));
        assert!(is_delegatable_event("input"));
        assert!(!is_delegatable_event("ended"));
        assert!(!is_delegatable_event("load"));
    }

    #[test]
    fn test_is_boolean_attribute() {
        assert!(is_boolean_attribute("checked"));
        assert!(is_boolean_attribute("disabled"));
        assert!(!is_boolean_attribute("class"));
    }
}
