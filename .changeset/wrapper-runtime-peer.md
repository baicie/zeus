---
'@zeus-js/output-react-wrapper': patch
'@zeus-js/output-vue-wrapper': patch
---

The React and Vue wrappers declare `@zeus-js/web-c-runtime` as an optional peer
dependency instead of a dependency. The `./renderer` entries only import its
types, so wrapper users who do not use `createRendererHost` no longer install
the runtime.
