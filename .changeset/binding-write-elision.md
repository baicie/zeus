---
'@zeus-js/runtime-dom': patch
---

Skip redundant attribute writes and avoid re-serializing an unchanged style
binding, so reactive bindings that re-run with identical values no longer pay
a DOM write per element.
