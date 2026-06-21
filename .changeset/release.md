---
'@zeus-js/shared': patch
'@zeus-js/signal': patch
'@zeus-js/runtime-dom': patch
'@zeus-js/compiler': patch
'@zeus-js/zeus': patch
'@zeus-js/bundler-plugin': patch
'@zeus-js/component-analyzer': patch
'@zeus-js/component-dts': patch
'@zeus-js/web-c-runtime': patch
'@zeus-js/web-c': patch
'@zeus-js/output-wc': patch
'@zeus-js/output-react-wrapper': patch
'@zeus-js/output-vue-wrapper': patch
'@zeus-js/output-css': patch
'@zeus-js/output-icons': patch
---

Phase A: stabilize Zeus Web-C output contract.

- Fix WC declaration generation to preserve standard addEventListener/removeEventListener string overloads while keeping typed custom event overloads.
- Keep runtime React/Vue wrapper as the default output strategy and add regression tests.
- Add @zeus-js/web-c-runtime and @zeus-js/web-c to the fixed release group.
- Add package version alignment checks for public @zeus-js packages under packages/core and packages/web-c.
- Align @zeus-js/web-c-runtime back to the Zeus 0.1.0-beta.6 release line.
