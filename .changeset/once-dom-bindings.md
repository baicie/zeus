---
'@zeus-js/compiler-native': minor
'@zeus-js/compiler-shared': minor
'@zeus-js/runtime-dom': minor
---

Add explicit `@once` DOM bindings. Once-marked values use normal binding
normalization but initialize untracked without creating a reactive effect.
