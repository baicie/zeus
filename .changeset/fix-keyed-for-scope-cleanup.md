---
'@zeus-js/runtime-dom': patch
---

Dispose each keyed `For` record's reactive scope when the record leaves the list, preventing detached DOM bindings and event handlers from accumulating during virtualized scrolling.
