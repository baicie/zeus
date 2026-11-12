# Baseline

What the repository looked like before the i18n work, so the "after" numbers
have something to be compared against.

|                                      |                                                                                                   |
| ------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Core commit before i18n              | `fae50a96` — `fix(admin): size the shell around the demo banner`                                  |
| Core commit after the runtime        | `137c3c2e` — `feat(i18n): typed, reactive ICU runtime as an opt-in package (#234)`                |
| Core commit after Playground + Admin | `f00cebb8` — `feat(i18n): localize Playground and Admin onto the shared runtime (#235)`           |
| zeus-ui commit after the Workbench   | `dbce962` — `feat(i18n): localize the AI Workbench and inject locale through the WC layer (#143)` |

`fae50a96` is the last `main` before any i18n code existed, which is why the
bundle comparison uses it rather than the commit immediately before the merge.

## What the applications looked like

- **Playground** had a hand-rolled `i18n.ts` holding two flat dictionaries and
  a `translate()` function. It worked, but the plural case was a hand-written
  `count === 1` branch valid only for English, and the locale id was `zh`.
- **Admin** was Chinese-only. Every nav label, table header, dialog title and
  error message was a Chinese string literal in the component.
- **AI Workbench** was English-only, and the AI custom elements rendered their
  own hard-coded English strings with no way to inject a language.

None of the three could switch language at runtime without a reload.

## Baseline measurements

Taken with `zlib.gzipSync` at the default level over every emitted `.js` chunk.

| Application  | Baseline gzip JS       | Where                                                                                                                                 |
| ------------ | ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Admin        | 98,626 B               | `fae50a96`, rebuilt locally                                                                                                           |
| Playground   | see `performance.json` | not re-measured against a baseline worktree; the Playground's change is a replacement of one hand-rolled module, not a new dependency |
| AI Workbench | see `performance.json` | the workbench lives in the other repository; its baseline commit is `af8ada0`                                                         |

The Playground and Workbench figures in `performance.json` are absolute sizes,
not deltas, because a cross-repository baseline worktree was not built. Saying
"the Workbench grew by N bytes" would require checking out `af8ada0`, building
it, and comparing — that was not done, so no such claim is made here.
