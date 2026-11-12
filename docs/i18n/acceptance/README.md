# i18n acceptance evidence

Every file here was produced by running something in this repository. Nothing
was hand-drawn or estimated.

| File                                       | Produced by                                                                                                  |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `baseline.md`                              | Written from the commits it names; the Admin byte count came from building `fae50a96` in a worktree          |
| `api-compat.md`                            | Read from the package sources and the packed-consumer fixtures                                               |
| `release-compat.md`                        | Read from `package.json`, the DTS pipeline and the CJS contract table                                        |
| `security-checklist.md`                    | Code-path review; says explicitly where no runtime test was done                                             |
| `key-parity.json`                          | `node --import tsx scripts/check/check-i18n.ts --json …`                                                     |
| `icu-validation.json`                      | `node --import tsx temp/icu-audit.mjs` — parses every message in every catalog and compares placeholder sets |
| `unit-report.json`                         | `pnpm vitest run packages/core/i18n --reporter=json`                                                         |
| `e2e-report.json`, `e2e-admin-report.json` | `pnpm check:admin` (local, chromium) plus the CI runs it names                                               |
| `performance.json`                         | `node temp/measure-i18n.mjs` plus bundle measurements from the real `dist` directories                       |
| `screenshots/`                             | `temp/capture-i18n.mjs`, `temp/capture-admin.mjs`, `temp/capture-wb.mjs`                                     |

## How the screenshots were taken

Each one is a real page: the Playground served from
`examples/playground-editor/dist`, the Admin console talking to a real
`startAdminServer` with real SQLite and a real login, the Workbench replaying
its recorded Host through the actual demo build. The scripts are in `temp/` and
can be re-run; they are not committed because they are one-off evidence
generators rather than gates.

Six requested screenshots per product would be twelve; twelve exist, at
1440×900 and 390×844 in both languages.

## What is not here

- No native-speaker review of the copy. See `docs/i18n/definition-of-done.md`.
- No baseline build of the Workbench in the other repository, so its bundle
  figure is an absolute size and not a delta.
- `firefox` and `webkit` were not run locally; those results come from CI and
  the file says so.
