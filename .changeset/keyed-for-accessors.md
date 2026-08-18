---
'@zeus-js/compiler-native': patch
'@zeus-js/compiler-shared': patch
'@zeus-js/runtime-dom': patch
---

Keep keyed `For` DOM and owner scopes stable while same-key replacements update
compiled item/index bindings and event handlers. Reject duplicate keys before
mutation, roll back failed record mounts, drain reentrant list updates, and
preserve custom-element mounts and deep focus while ranges move. Record precise
semantic `For` accessor dependencies in compiler IR so escaped, shadowed, and
non-reference identifier spellings compile correctly.
