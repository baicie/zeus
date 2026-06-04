---
'@zeus-js/component-analyzer': patch
'@zeus-js/output-react-wrapper': patch
'@zeus-js/output-vue-wrapper': patch
'@zeus-js/output-wc': minor
'@zeus-js/preset-component-library': minor
'@zeus-js/web-c-runtime': patch
---

Tighten lazy Web Component output semantics: report non-static runtime props, avoid serializing defaults into lazy manifests, sync Vue event-bridge props only when provided, remove unused React event-bridge output, and make manifest/loader mandatory lazy outputs.
