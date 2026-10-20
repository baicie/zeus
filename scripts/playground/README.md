# Static compiler playground fixtures

`fixtures/counter.tsx` is compiled by the public `transformModule` API. The
generated DOM/SSR modules, parse diagnostic, and measured byte sizes are checked
into `docs/public/playground/counter.json` for the static VitePress page.

The page distinguishes generated-module size (excluding dependencies) from
production bundle size. Rolldown bundles the exported `Counter` with its complete
transitive runtime package dependencies from the current built public entries,
with production export conditions, tree-shaking, ES2022 ESM output and
minification. DOM targets browsers; SSR targets Node and lists host-provided
Node built-ins separately. The bundle excludes application mounting, HTML/CSS,
and hydration. It is an example measurement, not the size of the whole framework
or a complete application. The JSON records the exact Rolldown version and
included module paths. Raw, gzip and Brotli sizes are byte counts; compression
uses Node zlib default parameters. Complete measured bundles are written to
`temp/playground/{dom,ssr}.bundle.mjs` for inspection.

The displayed IR is serialized directly from Rust `lower_module` and is an
internal debugging fixture. It is not part of `transformModule`'s return value
or a stable public API. The Rust integration test checks that fixture against
the current lowering output.

Refresh after changing the TSX sample or compiler semantics:

```sh
ZEUS_UPDATE_PLAYGROUND_IR=1 cargo test -p zeus_compiler --test playground
pnpm build
pnpm playground:update
pnpm playground:check
pnpm playground:smoke
cargo test -p zeus_compiler --test playground
```

`playground:smoke` serves the actual static page below a deployment prefix and
runs Chromium, Firefox and WebKit. It checks all five views, roving keyboard
focus, loading state and retry, and real clipboard copy/paste for both source
and each selected-view URL. Every shared URL restores that view on navigation
and reload. A separately denied clipboard verifies selectable manual-copy
fallback for source and URL. No clipboard mock is used on the success path.
CI runs the snapshot and browser gates; reports and screenshots are preserved
from `temp/playground`. This remains a static compiler example, not an online
editor or execution sandbox.
