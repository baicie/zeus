---
'@zeus-js/vite-plugin': patch
---

Copy the compiler source map before returning it to Vite. Vite normalizes the
map it receives in place — it fills `sourcesContent`, appends to
`x_google_ignoreList` and, in dev, replaces `sources` with paths relative to the
module — so a cache hit used to hand back a map the previous consumer had
already rewritten. Each transform now returns its own copy of the mutable map
fields while the cached result stays untouched.

The cache benchmark now gives every entry its own transform result instead of
sharing one tiny value across all 5,000 modules, so its per-entry memory figure
reflects what a warm cache actually holds.
