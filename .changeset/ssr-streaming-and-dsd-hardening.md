---
'@zeus-js/runtime-ssr': minor
'@zeus-js/runtime-dom': patch
'@zeus-js/zeus': patch
'@zeus-js/compiler-native': patch
'@zeus-js/shared': patch
---

Add the experimental streaming SSR entry and harden the SSR/DSD contracts.

`@zeus-js/zeus/server` and `@zeus-js/runtime-ssr` gain `renderToStream()`: a
versioned experimental entry (`SSR_STREAMING_API_VERSION`) that renders an SSR
node or an async iterable into a web `ReadableStream`. It chunks real serialized
output, honors native backpressure, ends an aborted stream with `AbortError`,
keeps already-flushed chunks when the source throws, escapes every chunk with the
synchronous serializer, and gives each request its own reactive root and context
owner. `renderToString()` is unchanged and stays strictly synchronous; RFC-004's
non-goal now points to RFC-018.

The server facade also exports `Portal`, `Transition`, `prop()`, `event()`, and
the owner-scoped context API, so a module that declares an element schema,
context, or portal compiles to the SSR target without importing
`@zeus-js/runtime-dom`. The compiler now splits mixed `@zeus-js/zeus` imports
specifier by specifier: facade names move to the SSR runtime and client-only
names keep the public entry, instead of leaving the whole statement on the DOM
runtime. SVG content records its namespace in the IR and serializes
`<script>`/`<style>` as escaped foreign markup rather than raw text.

Light DOM custom elements now recognize server-rendered internals through
explicit `zeus:light:root` / `zeus:light:child` comment markers (constants in
`@zeus-js/shared`, internal): the client upgrade reuses projected consumer
children, mounts `styles` before content in the same order as the server, and
falls back to a fresh mount when the markers are absent. SSR also serializes
`defaultValue`/`defaultChecked` like their equivalent attributes.
