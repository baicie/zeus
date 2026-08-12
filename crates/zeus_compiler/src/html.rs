pub(crate) fn is_void_element(tag_name: &str) -> bool {
    matches_ignore_ascii_case(
        tag_name,
        &[
            "area", "base", "basefont", "bgsound", "br", "col", "embed", "hr", "image", "img",
            "input", "keygen", "link", "meta", "param", "source", "track", "wbr",
        ],
    )
}

pub(crate) fn is_raw_text_element(tag_name: &str) -> bool {
    matches_ignore_ascii_case(tag_name, &["script", "style", "textarea", "title"])
}

pub(crate) fn is_unsupported_raw_text_element(tag_name: &str) -> bool {
    matches_ignore_ascii_case(
        tag_name,
        &[
            "xmp",
            "iframe",
            "noembed",
            "noframes",
            "plaintext",
            "noscript",
        ],
    )
}

pub(crate) fn is_svg_element(tag_name: &str) -> bool {
    matches_ignore_ascii_case(
        tag_name,
        &[
            "svg",
            "circle",
            "clipPath",
            "defs",
            "ellipse",
            "feBlend",
            "feColorMatrix",
            "feComponentTransfer",
            "feComposite",
            "feConvolveMatrix",
            "feDiffuseLighting",
            "feDisplacementMap",
            "feDistantLight",
            "feDropShadow",
            "feFlood",
            "feFuncA",
            "feFuncB",
            "feFuncG",
            "feFuncR",
            "feGaussianBlur",
            "feImage",
            "feMerge",
            "feMergeNode",
            "feMorphology",
            "feOffset",
            "fePointLight",
            "feSpecularLighting",
            "feSpotLight",
            "feTile",
            "feTurbulence",
            "filter",
            "foreignObject",
            "g",
            "image",
            "line",
            "linearGradient",
            "marker",
            "mask",
            "metadata",
            "path",
            "pattern",
            "polygon",
            "polyline",
            "radialGradient",
            "rect",
            "set",
            "stop",
            "symbol",
            "text",
            "textPath",
            "tspan",
            "use",
            "view",
        ],
    )
}

fn matches_ignore_ascii_case(value: &str, candidates: &[&str]) -> bool {
    candidates
        .iter()
        .any(|candidate| value.eq_ignore_ascii_case(candidate))
}
