# Static compiler playground fixtures

`fixtures/counter.tsx` is compiled by the public `transformModule` API. The
generated DOM/SSR modules, parse diagnostic, and generated-module plus static
artifact byte sizes are checked into `docs/public/playground/counter.json` for
the static VitePress page. The module size describes one generated JS module;
the artifact size describes the complete JSON payload used by this static page.

The displayed IR is serialized directly from Rust `lower_module` and is an
internal debugging fixture. It is not part of `transformModule`'s return value
or a stable public API. The Rust integration test checks that fixture against
the current lowering output.

Refresh after changing the TSX sample or compiler semantics:

```sh
ZEUS_UPDATE_PLAYGROUND_IR=1 cargo test -p zeus_compiler --test playground
pnpm playground:update
pnpm playground:check
cargo test -p zeus_compiler --test playground
```
