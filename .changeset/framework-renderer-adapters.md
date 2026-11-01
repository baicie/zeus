---
'@zeus-js/web-c-runtime': minor
'@zeus-js/output-react-wrapper': minor
'@zeus-js/output-vue-wrapper': minor
'@zeus-js/shared': patch
---

Add the RFC-011 framework renderer boundary. `@zeus-js/web-c-runtime` exports
`createRendererHost`, which reconciles keyed containers and gives every mount a
`RendererSession` with a generation and an `AbortSignal`. The new
`@zeus-js/output-react-wrapper/renderer` and `@zeus-js/output-vue-wrapper/renderer`
entries provide `createReactRenderer` and `createVueRenderer`, which render
framework content into host-owned containers and clean up roots, Portals and
Teleports on dispose. The unexported PoC in `@zeus-js/shared` is removed.
