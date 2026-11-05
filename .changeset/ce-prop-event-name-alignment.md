---
'@zeus-js/compiler': patch
'@zeus-js/runtime-dom': patch
---

Align custom-element event and property names with the declarations Zeus
generates, and stop rewriting a custom element property that already holds the
value being bound.

`prop:selection-mode` used to compile to `element["selection-mode"] = value`,
which is a property no element has, so the value was dropped without a word. The
compiler now reports `ZEUS_INVALID_PROP_NAME` and names the camelCase spelling
in the hint. `onValueChange` on a custom element used to listen for
`valuechange`, while the element dispatches `value-change`; camel-case words now
become kebab-case on custom elements, matching the generated JSX declarations.
Native elements keep the lowercase rule (`onClick` is `click`), and `on:name`
still binds a name verbatim.

`bindProp` used to rewrite a custom element property on every effect run, even
when the value was unchanged. It now remembers the value it wrote and skips the
redundant assignment, without reading the element's own accessor — a custom
element may not be upgraded yet, and a third-party accessor may have side
effects.
