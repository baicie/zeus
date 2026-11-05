---
'@zeus-js/runtime-dom': patch
---

`defineElement` now derives each prop's attribute name once, with the same rule
as the lazy loader and the generated manifests. A mixed-case alias such as
`attr: 'dataURL'` now receives initial markup and `setAttribute('dataurl', ...)`
writes instead of ignoring them.
