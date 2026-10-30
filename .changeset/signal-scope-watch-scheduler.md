---
'@zeus-js/signal': patch
---

Fix three reactivity engine failures found against `@vue/reactivity` 3.5.44:
stopping a scope no longer throws when a cleanup stops a sibling scope, a
`once` watcher stops even if its callback throws, and watch callbacks no longer
add dependencies to the effect that triggered them. The internal job scheduler
now runs every queued job when one throws and rethrows the first error.
