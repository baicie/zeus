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

**The package this bump publishes moves onto the `0.2.0-rc.5` compiler line.**
`0.0.5` declared `@zeus-js/compiler-native@0.1.1-beta.20` and was never
republished when Core cut `0.2.0-rc.0`. Those two compilers do not return the
same thing from `transformModule({ hmr: true })`: `0.1.1-beta.20` returns
`code`, `map`, `diagnostics` and `hydrationPlan`, with no `hmrPlan`. The plugin's
HMR patch path is guarded by `next.hmrPlan && …`, so a missing field sends every
edit down the full-reload path instead — silently, because `native.ts` declares
`hmrPlan` in its result type and TypeScript therefore reports nothing.

It also means every consumer built the plugin against one compiler and ran the
framework from another. `scripts/check/check-vite-plugin-compiler-contract.ts`
now asks the compiler resolved from the plugin's own location what it returns,
so this is caught by behaviour rather than by a version comparison that a stale
manifest satisfies.
