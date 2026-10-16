---
'@zeus-js/runtime-dom': patch
---

Avoid allocating an updater closure when keyed `For` reuses a slot for an ordinary item value.
