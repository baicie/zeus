# Definition of done

The design pack's §5.6 checklist, item by item, with what was actually
verified. Two items are **not** complete and are marked as such.

| #   | Requirement                                                                                           | Status       | Evidence                                                                                                                                         |
| --- | ----------------------------------------------------------------------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Public docs and API types; peer/export and release script compatibility                               | **Done**     | `docs/api/i18n.md`, `docs/api/snapshots/i18n.main.api.md`, `acceptance/api-compat.md`, `acceptance/release-compat.md`                            |
| 2   | Language coverage across Admin, Playground, AI Workbench, including component default copy            | **Done**     | 397 messages across two catalogs plus the Workbench catalog; `acceptance/icu-validation.json`, `acceptance/key-parity.json`                      |
| 3   | Live switch on the same page, persistence across reload, no FOUC or large fallback areas              | **Done**     | `check:playground-theme-i18n` asserts switch + persistence + prepaint `lang`; Admin writes per-account preference; screenshots in both languages |
| 4   | All i18n key / ICU / params static gates pass                                                         | **Done**     | `check:i18n` → 2 catalogs clean; `icu-validation.json` → 397 messages, 0 failures, 0 argument drift                                              |
| 5   | Existing Chromium/Firefox/WebKit gates plus the new i18n gates pass                                   | **Done**     | CI `packed-consumers` green on `d8d7e07c` (all three engines); local `check:admin` chromium green                                                |
| 6   | No security or permission regression; AI Host permissions and BYOK handling unchanged                 | **Done**     | `acceptance/security-checklist.md` — code-path review, with the limits of that review stated                                                     |
| 7   | Core carries no mandatory i18n dependency; UI/WebC stay framework-agnostic                            | **Done**     | `@zeus-js/i18n` is a separate entry point; packed consumers build without it                                                                     |
| 8   | Before/after screenshots, performance data, both repositories' SHAs, Draft PR, known limits, rollback | **Done**     | `acceptance/` — screenshots ×12, `performance.json`, `baseline.md` names the commits, `release-compat.md` has the rollback                       |
| 9   | Two actual speakers review the main copy (at least one English, one Chinese)                          | **NOT DONE** | See below                                                                                                                                        |

## Item 9 — not done, and why it cannot be claimed

The design pack requires that two people who actually speak the languages read
the main copy, and says explicitly that this must not be claimed if it was not
done. It was not done. The catalogs were written by one author (me) and checked
by machines: key parity, ICU parse, placeholder parity, and the rendered
screenshots. Machines catch a dropped `{count}`; they do not catch a Chinese
sentence that is grammatical but reads like a translation, or an English label
that is technically correct and wrong for a button.

Until that review happens, the correct statement is: **the catalogs are
machine-verified and not human-reviewed.** The 397 messages in
`icu-validation.json` are the review queue.

## Known limits

1. **ICU plural coverage is thin.** Two of the 397 messages use `plural`, and no
   catalog uses `select` or `selectordinal` in production copy. The runtime
   supports them and the unit tests exercise them, but the applications do not
   yet have a message that would expose a mistake in a real plural rule.
2. **`zh-CN` only.** `zh-TW` is deliberately not aliased: a Traditional Chinese
   browser negotiates to English rather than being shown Simplified. That is
   honest but not ideal.
3. **The Workbench does not use `@zeus-js/i18n`.** It keeps a small local
   catalog because it must not depend on a package from the other repository.
   Two implementations of "pick a language, re-render text" now exist. That is a
   deliberate trade, but it is a trade.
4. **Catalog size grows with languages, not messages.** Both languages ship in
   the bundle so switching needs no network. A third language would need either
   a bigger bundle or a lazy-load path that does not exist yet.
5. **Firefox and WebKit were not run locally** during this evidence pass; those
   results are from CI at `d8d7e07c`.
