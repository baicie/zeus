---
'@zeus-js/bundler-plugin': minor
'@zeus-js/output-wc': patch
'@zeus-js/output-react-wrapper': patch
'@zeus-js/output-vue-wrapper': patch
'@zeus-js/output-icons': patch
'@zeus-js/output-css': patch
---

Freeze the output plugin contract for third-party Output Targets. Plugins
declare `apiVersion: 1` (`ZEUS_PLUGIN_API_VERSION`) and a mismatch fails the
build. Third-party outputs register a namespaced kind such as `acme:svelte`
with an explicit `outDir`. Registering one kind twice, or two plugins emitting
the same file, fails with `ZEUS_OUTPUT_CONFLICT` instead of one output silently
replacing the other.
