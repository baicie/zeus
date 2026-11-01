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

/// Valid custom element names always contain a hyphen; no HTML element does.
pub(crate) fn is_custom_element(tag_name: &str) -> bool {
    tag_name.contains('-')
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

/// HTML elements that switch the parser into the SVG namespace.
const SVG_ROOT_TAGS: &[&str] = &["svg"];

/// SVG elements whose children are parsed as HTML again. `<foreignObject>` is
/// the only one Zeus needs to model: it is the standard HTML island.
const HTML_INTEGRATION_TAGS: &[&str] = &["foreignObject", "foreignobject"];

/// The namespace an element is parsed in.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub(crate) enum ElementNamespace {
    #[default]
    Html,
    Svg,
}

impl ElementNamespace {
    pub(crate) const fn as_str(self) -> &'static str {
        match self {
            Self::Html => "html",
            Self::Svg => "svg",
        }
    }
}

/// Resolves the namespace of an element from the namespace its parent's
/// content is parsed in.
///
/// `<svg>` is the only HTML element that enters the SVG namespace, and every
/// element inside SVG (including `<foreignObject>` itself) stays in it.
pub(crate) fn element_namespace(
    parent: ElementNamespace,
    tag_name: &str,
) -> ElementNamespace {
    match parent {
        ElementNamespace::Html => {
            if matches_ignore_ascii_case(tag_name, SVG_ROOT_TAGS) {
                ElementNamespace::Svg
            } else {
                ElementNamespace::Html
            }
        }
        ElementNamespace::Svg => ElementNamespace::Svg,
    }
}

/// Resolves the namespace the children of `tag_name` are parsed in.
///
/// Only `<foreignObject>` leaves SVG. MathML is deliberately out of scope: the
/// compiler rejects the elements whose text handling would differ, and
/// `<style>`/`<script>` cannot appear in the accepted MathML subset.
pub(crate) fn content_namespace(
    namespace: ElementNamespace,
    tag_name: &str,
) -> ElementNamespace {
    match namespace {
        ElementNamespace::Html => ElementNamespace::Html,
        ElementNamespace::Svg => {
            if matches_ignore_ascii_case(tag_name, HTML_INTEGRATION_TAGS) {
                ElementNamespace::Html
            } else {
                ElementNamespace::Svg
            }
        }
    }
}
