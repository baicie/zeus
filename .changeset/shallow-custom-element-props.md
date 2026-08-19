---
'@zeus-js/runtime-dom': minor
'@zeus-js/zeus': minor
---

Add opt-in shallow reactivity for `defineElement` props. Shallow props track
top-level reference replacement while preserving the original object or array
identity and leaving nested mutations untracked.
