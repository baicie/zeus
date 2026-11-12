# API compatibility

`@zeus-js/i18n` is opt-in. The claim under test is that adding it changed
nothing for applications that do not use it, and that the package itself is
usable from a real installed tarball.

## The core package does not depend on i18n

`@zeus-js/zeus` has no import of `@zeus-js/i18n`, and no i18n code is bundled
into `zeus.esm-bundler.js`. The runtime is a sibling entry point: an
application that never localizes downloads none of it.

The check that keeps this true is the packed-consumers run, which builds each
consumer against the real tarballs. If the core entry started pulling in
`intl-messageformat`, every consumer's bundle would grow and the size checks
would move.

## Declared surface

The public entry exports:

| Export                                                                   | Kind     |
| ------------------------------------------------------------------------ | -------- |
| `createI18n`                                                             | function |
| `resolveLocale`, `normalizeLocale`, `negotiateLocale`                    | function |
| `checkCatalog`, `checkMessageSyntax`, `messageArgumentNames`             | function |
| `SUPPORTED_LOCALES`                                                      | const    |
| `Locale`, `MessageCatalog`, `MessageDescriptor`, `MessageParams`, `I18n` | type     |

`docs/api/snapshots/i18n.main.api.md` is the API Extractor snapshot. It is
generated from the built declarations and checked in CI.

## Packed-consumer proof

`scripts/testing/packed-consumers/i18n-consumer.mjs.fixture` installs the
published tarball into a project with no workspace links and checks:

1. every declared export resolves from `@zeus-js/i18n`, not a source path;
2. locale negotiation, including the legacy `zh` value the Playground stored;
3. interpolation, ICU plural and select through the real code path;
4. a **message descriptor created before the switch renders in the new
   language** — a package that returned strings at call time would pass every
   other assertion and fail this one;
5. fallback: a key only English has still renders, and the miss is reported
   through `onMissingKey` rather than showing the key;
6. the instance's own Intl formatters, including an invalid date returning `''`
   instead of `"Invalid Date"`.

`i18n-consumer.ts.fixture` compiles the same surface with `--strict` against the
declarations _inside the tarball_. A package whose `types` condition points at a
file the tarball omits fails there and nowhere else.

`check-packed-consumers.ts` additionally inspects the tarball contents:
`i18n.esm-bundler.js`, `i18n.cjs`, `i18n.d.ts` and the `exports` map must all be
present, and `intl-messageformat` must be a real dependency rather than a
devDependency that happens to be installed in the workspace.

## CJS

`@zeus-js/i18n` publishes a CommonJS entry (`index.cjs` → `dist/i18n.cjs`) and
is listed in the contract table in `scripts/check/check-package-cjs.ts`. Deleting
the entry without deleting the declaration fails that check, which is the point.
