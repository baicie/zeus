# @zeus-js/vite-plugin

## 0.0.6

### Patch Changes

- Copy the compiler source map before returning it to Vite, so a cache hit does
  not hand back a map the previous consumer already rewrote.

- **The compiler this package depends on has changed.** `0.0.5` declared
  `@zeus-js/compiler-native@0.1.1-beta.20` and was never republished when Core
  moved to `0.2.0-rc.5`. Those two compilers do not return the same thing from
  `transformModule({ hmr: true })`: `0.1.1-beta.20` returns `code`, `map`,
  `diagnostics` and `hydrationPlan` with no `hmrPlan`, so the plugin's HMR patch
  path — guarded by `next.hmrPlan && …` — never ran, and every edit reloaded the
  page instead. Silently, because `native.ts` declares `hmrPlan` in its result
  type.

  Every consumer built with one compiler and ran the framework from another.
  `scripts/check/check-vite-plugin-compiler-contract.ts` now asks the compiler
  resolved from the plugin's own location what it returns, so this is caught by
  behaviour rather than by a version comparison a stale manifest satisfies.

  **Note on HMR state:** the plan stops the reload. Component state survives an
  edit only when the application opts in with
  `zeus({ hmr: { preserveBindings: true } })`. Measured through a real Vite dev
  server and a real browser on this version: default → text and class update,
  no reload, state resets; `preserveBindings` → all four hold.
