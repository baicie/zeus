---
'@zeus-js/i18n': patch
---

Add `@zeus-js/i18n`: a typed, reactive, ICU-based runtime for applications that
need more than one language.

The package is an opt-in entry point rather than part of `@zeus-js/zeus`, so an
application that never localizes downloads none of it. `createI18n` takes a
reference catalog and any number of translations, exposes a reactive `t` and
`message`/`resolve` pair so a stored toast re-renders in the new language after
a switch, and validates catalogs in CI through `checkCatalog` and
`checkMessageSyntax`.
