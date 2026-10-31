---
'@zeus-js/component-analyzer': patch
'@zeus-js/output-wc': patch
'@zeus-js/output-react-wrapper': patch
'@zeus-js/output-vue-wrapper': patch
'@zeus-js/web-c-runtime': patch
'@zeus-js/runtime-dom': patch
---

Derive Web Component attribute names in one place. Eager `defineElement` now
observes the attribute of an array or object prop that declares a
`deserialize`, as the lazy loader already did, and every output lowercases
`attr` aliases the way the browser reports them. React and Vue wrappers write
attributes only for primitive values. Generated loaders import
`ZEUS_WC_RUNTIME_ABI_1` from `@zeus-js/web-c-runtime`, so a consumer build that
pairs a component package with an incompatible runtime fails with a
missing-export error instead of misbehaving at runtime.
