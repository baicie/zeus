---
'@zeus-js/web-c-runtime': minor
'@zeus-js/output-react-wrapper': minor
'@zeus-js/output-vue-wrapper': patch
---

Fix review findings in the RFC-011 framework renderer boundary.

- `createRendererHost` disposes every removed or moved entry before it mounts,
  so two keys can swap containers in one `render`. Two keys that share a
  container in one `render` throw the new `ZEUS_RENDERER_DUPLICATE_CONTAINER`.
- `createReactRenderer` and `createVueRenderer` throw errors from effect
  cleanups and unmount hooks from `dispose` as `ZEUS_RENDERER_ADAPTER_FAILURE`;
  the handle stays disposed. Errors after a call returned are no longer
  swallowed: React passes them to the new `onError(error, session)` option or
  `globalThis.reportError`, and Vue lets them reach `config.errorHandler`.
- `createReactRenderer` throws `ZEUS_RENDERER_ADAPTER_FAILURE` when it is called
  inside a React render or commit and cannot commit synchronously.
- Vue `update` re-renders even when `data` is the same mutated object.
