---
'@zeus-js/runtime-dom': patch
---

Skip redundant `style` attribute removals when a style binding is already empty,
while still repairing styles added by external DOM mutations.
