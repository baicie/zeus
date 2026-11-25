---
'@zeus-js/devtools-consumer': minor
---

Publish the DevTools consumer, which had no release path at all.

The package was `private: true`, absent from the fixed release group, absent
from `standalonePublish`'s set and absent from `devtools-release.yml`'s tag
triggers — four separate gates, and no tag could have published it. The Admin
app's DevTools panel therefore could not survive a migration that may only
install published packages: `examples/admin/src/main.tsx` loads it behind
`import.meta.env.DEV` and `?devtools`, creates a panel, connects a consumer and
exposes `window.adminDevtools`. It was real, reachable development capability,
not dead code.

Publishing needed a shape as well as a flag: no `main`, no `exports`, no
`types`, no `buildOptions`, so `getBuildablePackages()` — which requires
`!private && buildOptions` — would have skipped it even after the flag changed.
The output filename follows the directory (`dist/consumer.*`), so `exports`
points there rather than at a name the build never produces.

Minor rather than patch because the package has never been installable by
anyone; there is no prior public surface to keep compatible.

The Admin side is a separate change in `zeus-ecosystem`, and it can only land
after this version is on npm.
