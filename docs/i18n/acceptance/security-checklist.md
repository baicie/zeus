# Security and permission checklist

Each item was checked against the code, not assumed. Where something was not
exercised, it says so.

| #   | Claim                                                                   | How it was checked                                                                                                                                                                                                                                 | Result                      |
| --- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------- |
| 1   | A malicious parameter renders as text, never as markup                  | `@zeus-js/i18n` formats through `IntlMessageFormat` and returns a string; callers bind it via Zeus text bindings, which assign `textContent`. No `innerHTML` path exists in the runtime.                                                           | No change in attack surface |
| 2   | Chinese status values never reach the API                               | Status is compiled into a catalog string for display only; the request body still carries `status=active` from `UserStatus`. Confirmed in `examples/admin/src/pages.tsx` (`patch.status` is the typed enum, the label comes from `status.*` keys). | Protocol unchanged          |
| 3   | A personal language switch never rewrites workspace settings            | `changePersonalLocale` writes `localStorage` and calls `i18n.setLocale`. It does not call `updateSettings`. The only `PATCH /api/settings` call site is the Settings page's explicit save.                                                         | No elevation                |
| 4   | AI Host permissions, approvals and BYOK handling are untouched          | The i18n change in zeus-ui adds `locale` / `messages` properties to the custom elements and a copy layer in the shell. `ai-core`, the approval controller and the BYOK vault were not modified — see the file list in that PR.                     | Unchanged                   |
| 5   | The CSP that protects the Playground still matches its inline bootstrap | `check:playground-theme-i18n` recomputes the SHA-256 of the built inline script and compares it to `nginx.conf`. This caught a real mismatch during this work.                                                                                     | Gate green                  |
| 6   | Switching language cannot cancel an in-flight request                   | Playground: `setLocale` only notifies text subscribers; controllers hold no locale dependency. Workbench: `applyLanguage` rewrites text and re-seeds titles; the SSE transport and controllers are not touched.                                    | No cancellation path        |
| 7   | An invalid ICU message degrades instead of throwing                     | `formatIcuMessage` catches both the parse and the format call, reports through `onInvalid`, and falls back to literal interpolation. CI rejects invalid messages before they ship via `checkMessageSyntax`.                                        | Fail-safe                   |
| 8   | Personal preference storage is per account                              | Key is `zeus-admin.locale.<userId>`; the pre-login read deliberately returns _any_ stored value and is replaced by the account's own once the session resolves. Two accounts in one browser do not share a preference.                             | Isolated                    |

## What this checklist does not claim

- No penetration test was run. These are code-path checks.
- The AI Host runtime was exercised through the replay demo, not against a live
  Host with real approvals in this session. The permission code is unmodified,
  which is the basis for item 4 — not an end-to-end re-test.
