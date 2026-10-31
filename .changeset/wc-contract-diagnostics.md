---
'@zeus-js/component-analyzer': patch
'@zeus-js/output-wc': patch
---

Implement the remaining RFC-010 build diagnostics. Manifest validation rejects
an array, object or function prop that declares an attribute without a
deserializer (`ZEUS_WC_OBJECT_ATTRIBUTE`), a structured prop that reflects
without a reversible `serialize`/`deserialize` pair (`ZEUS_WC_REFLECT_CODEC`),
and a model whose prop, event or `eventPath` does not exist (`ZEUS_WC_MODEL`).
The analyzer warns about a form-associated element that declares no form
contract and never reads `internals` (`ZEUS_WC_FORM_CONTRACT`).
