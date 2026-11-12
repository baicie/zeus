# Release compatibility

How `@zeus-js/i18n` reaches users, and what would break if the packaging were
wrong.

## Package shape

| Field            | Value                                                   |
| ---------------- | ------------------------------------------------------- |
| name             | `@zeus-js/i18n`                                         |
| dependencies     | `@zeus-js/signal`, `intl-messageformat ^10.7.18`        |
| peerDependencies | none                                                    |
| exports          | ESM (`dist/i18n.esm-bundler.js`), CJS (`dist/i18n.cjs`) |
| types            | `dist/i18n.d.ts`, produced by the shared DTS pipeline   |
| sideEffects      | false                                                   |

`intl-messageformat` is a **dependency**, not a peer: it is an implementation
detail of this package, and a consumer should not have to know it exists. The
bundler treats it as external (`buildOptions.external`), so an application's
bundler resolves one copy through the normal dependency graph.

## What was changed in shared build infrastructure

Three places had to learn about the new package, all of them declarative:

1. `tsconfig.build.json` — its `include` list is hand-written; `packages/core/i18n/src`
   was added. Without it the declarations are silently absent and
   `check:exports` fails with "Missing declaration file".
2. `scripts/check/check-package-cjs.ts` — the CommonJS contract table gained
   `'@zeus-js/i18n': './dist/i18n.cjs'`, plus the `index.cjs` forwarder.
3. `.prettierignore` — the packed-consumer fixtures are templates, not source;
   formatting them would change the bytes the checker installs.

No CI workflow, apt source or shared runner configuration was modified.

## API Extractor snapshot

`docs/api/snapshots/i18n.main.api.md` is generated from the built declarations
and committed. `check:api` compares it. The snapshot is sensitive to the
`patchTypes` pass that rewrites `export` onto the declarations in the bundled
`.d.ts` — a locally built declaration file that skips that pass does not match,
even though the source is identical.

## Rollback

The i18n work is additive: two new files' worth of package (`packages/core/i18n`)
plus edits to three applications. Reverting the merge commits
`137c3c2e` (runtime), `f00cebb8` (Playground + Admin) and `dbce962` (Workbench)
restores the prior behaviour exactly, because no other package imports the new
runtime. The applications would go back to their hard-coded strings — Chinese in
Admin, English in the Workbench, the hand-rolled dictionary in the Playground.

Nothing in the release pipeline publishes automatically. `@zeus-js/i18n` ships
only when a human runs the release command.
