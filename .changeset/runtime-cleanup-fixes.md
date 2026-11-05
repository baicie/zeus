---
'@zeus-js/runtime-dom': patch
'@zeus-js/signal': patch
---

Release every subtree when a cleanup throws. Keyed lists dispose all removed
records before committing the next list, and a failed reconciliation rolls back
every record it created without hiding the reconciliation error. `Show`,
dynamic regions, `Portal` and `defineElement` now finish releasing the previous
branch, the target anchors and the injected styles before rethrowing a cleanup
failure. `render` releases the bindings and owner it created when setup throws,
and disposes an owner it was given only when that owner is handed over
internally; a public `options.owner` is borrowed. Runtime diagnostics now count
a disposal on the session that was active when the resource was created, not
whichever session happens to be active when it is released, and the shared
`delegateEvents` document listeners are excluded because they outlive every
render scope.
