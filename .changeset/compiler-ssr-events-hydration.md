---
'@zeus-js/compiler-native': patch
'@zeus-js/runtime-dom': patch
'@zeus-js/runtime-ssr': patch
'@zeus-js/zeus': patch
---

Fix the compiler defects found by the semantic matrix. SSR escapes static JSX
text, keeps hydration markers out of `<textarea>` and `<title>`, and closes
every dynamic text value with `<!--zeus:hydrate:/-->` so hydration keeps
adjacent static text and rebinds empty values. Events that do not bubble, and
every event with `delegateEvents: false`, are bound on the element and never
dispatched twice. Async components, `await`/`yield` in JSX, unsafe
`prop:innerHTML`/`prop:outerHTML`, invalid component and event names, and SSR
properties without an HTML equivalent are reported at compile time, each with a
specific hint. `on:name` binds an event by its exact name, such as a custom
element's `value-change`. SSR omits `prop:*` bindings on custom elements. Source
maps now cover code outside JSX, and the Node adapter compiles JSX nested tens of
thousands of levels deep.
