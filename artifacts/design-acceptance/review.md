# Zeus UI Visual Product Acceptance

Admin ref: `satnaing/shadcn-admin@e16c87f213a5ba5e45964e9b67c792105ec74d26` (v2.2.1)
ChatGPT ref: captured 2026-11-11, Google Chrome headed, en-US, signed-out, light + dark
Core target: `baicie/zeus` branch `feat/shared-shadcn-admin-ui`
UI target: `baicie/zeus-ui` branch `feat/chatgpt-workbench-ui`

Evidence lives in `artifacts/design-acceptance/`:

```
reference/admin/A01..A08.png        frozen shadcn-admin captures
reference/chatgpt/C01..C08.png      frozen chatgpt.com captures
implementation/admin/A01..A08.png   Zeus Admin at the same viewport/theme/state
implementation/workbench/C01..C08.png  Zeus AI Workbench at the same state
overlay/<id>.png                    50% blend (structure drift shows as ghosting)
diff/<id>.png                       per-pixel diff, threshold 40/255
reference-manifest.json             SHAs, capture metadata, limitation list
```

## Scenario status

| ID                    | Reference        | Implementation | Notes                                                                 |
| --------------------- | ---------------- | -------------- | --------------------------------------------------------------------- |
| A01 Dashboard, light  | yes              | yes            | title row, tabs, 4-card KPI grid, 4/3 chart+list split                |
| A02 Sidebar collapsed | yes              | yes            | 48px icon rail + inset padding                                        |
| A03 Users             | yes              | yes            | toolbar (search + dashed status filter), bordered table, page numbers |
| A04 Edit dialog       | yes              | yes            | overlay + centred 512px panel                                         |
| A05 Settings          | yes              | yes            | title, separator, 1/5 side nav, content column                        |
| A06 Sign in           | yes              | yes            | 384px card, brand row above                                           |
| A07 Dashboard, dark   | yes              | yes            | same structure, dark tokens                                           |
| A08 Mobile drawer     | yes              | yes            | 288px drawer over a scrim                                             |
| C01 Empty chat        | yes              | yes            | sidebar 260px, centred "Where should we begin?", composer 768×52      |
| C02 Sidebar collapsed | yes              | yes            | rail hidden, chat full width                                          |
| C03 Conversation      | yes              | yes            | user bubble right, assistant plain text, bottom composer              |
| C04 Generating        | yes (anonymous)  | yes            | mid-generation frame; see limitation                                  |
| C05 Model menu        | **not captured** | n/a            | signed-out page has no model menu; nothing fabricated                 |
| C06 Settings          | yes              | yes            | in-shell page with back control, sidebar kept                         |
| C07 Empty, dark       | yes              | yes            | #000 page, #212121 composer, #272727 border                           |
| C08 Empty, mobile     | yes              | yes            | hamburger topbar, bottom composer                                     |

## Measured anchors (implementation, 1440×900)

| Element             | Reference           | Zeus                      |
| ------------------- | ------------------- | ------------------------- |
| Sidebar expanded    | 256px               | 256px                     |
| Sidebar icon rail   | 48px                | 48px (+8px inset padding) |
| Mobile drawer       | 288px               | 288px                     |
| Header height       | 64px                | 64px                      |
| Main padding        | 16px / 24px         | 16px / 24px               |
| Card radius         | 14px                | 14px (`--radius-xl`)      |
| Table header row    | 40px                | 40px                      |
| Composer            | 768×52, radius 28px | 768×52, radius 28px       |
| Chat reading column | 768px               | 768px                     |
| ChatGPT sidebar     | 259px               | 260px                     |
| ChatGPT topbar      | 61px                | 60px                      |

## Pixel diff (reference vs implementation, same viewport)

| Scenario | Diff pixels > 40/255 | % of frame |
| -------- | -------------------- | ---------- |
| A01      | 146,003              | 11.3%      |
| A02      | 140,024              | 10.8%      |
| A03      | 61,550               | 4.8%       |
| A04      | 116,119              | 9.0%       |
| A05      | 47,806               | 3.7%       |
| A06      | 37,796               | 2.9%       |
| A07      | 151,855              | 11.7%      |
| A08      | 21,124               | 6.4%       |
| C01      | 24,084               | 1.9%       |
| C02      | 15,227               | 1.2%       |
| C03      | 36,412               | 2.8%       |
| C04      | 32,496               | 2.5%       |
| C06      | 38,064               | 2.9%       |
| C07      | 75,555               | 5.8%       |
| C08      | 324,285              | 98.5%      |

A01/A07 carry the largest structural residual because the reference's own product
data differs (revenue series, sales list, top-nav route names, "Secured by
Clerk" entry). Zeus renders its real metrics in the same slots; the frame,
grids and density line up in the overlay. A04/A05 residuals are dialog/section
copy differences. **C08 is not comparable as a whole-frame diff**: the frozen
reference was captured in the dark scheme while the implementation shot is
light (theme mismatch, not layout); the layout comparison is qualitative.

## Deviations that remain (P0/P1)

P0 — visual

- Dashboard cards show real workspace metrics (members, teams, active, audit)
  and a team-distribution chart instead of the reference's revenue/sales
  sample data. Placement and density match; content is Zeus's own.

P1 — visual

- Admin: no equivalent of the reference's Clerk/manual auth entry, "Upgrade to
  Pro" menu item, or report-tab placeholders. Those have no Zeus behaviour, so
  they are omitted rather than rendered as dead controls.
- Admin: `Cmd/Ctrl+K` palette is a real route search, not the reference's
  command list with pinned tasks.
- Workbench: the "Images / Plugins / See plans" rows are absent (no such
  features); "New chat", "Search chats", "Recent", "Settings" remain.
- Workbench: "Search chats" filters the local conversation list only; there is
  no server full-text search.
- Workbench C06 provider settings are Zeus's own composition inside the
  ChatGPT settings frame; they were not in the frozen ChatGPT capture.

P1 — functional

- C05 (model menu) has no reference; the workbench model picker currently shows
  the provider/model title and opens settings rather than a model list.
- BYOK "session-only" key storage is not implemented; the vault is the only
  key store. The spec allows marking this, and the UI does not offer a
  session-only option it cannot honour.
- Trusted proxy for CORS-incompatible gateways: **TRUSTED_PROXY_NOT_IMPLEMENTED**.
  Direct browser mode works and explains CORS/CSP failures; there is no relay.

## Gates

| Gate                                                                                                                 | Result                                                                          |
| -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| Admin functional (login, search, filter, pagination, selection, edit, RBAC, 403/404, settings persistence, devtools) | PASS — chromium, firefox, webkit                                                |
| Host regression (chat, SSE, approval, diff, test report, conversation isolation)                                     | PASS — chromium, firefox, webkit                                                |
| BYOK protocol (vault, no plaintext key, streaming, stop, 401/429/500, lock/unlock, reload)                           | PASS — chromium, mock gateway                                                   |
| Security                                                                                                             | PASS — existing gates; `password_hash` leak in `/api/users/:id` responses fixed |
| Accessibility (axe)                                                                                                  | PASS in the workbench gate; admin gate covers zoom/200% and keyboard            |
| Live provider smoke                                                                                                  | NOT_RUN — needs a real gateway key; run manually and redact                     |

## Decision

`CANDIDATE`

Reference is frozen and stored; layout outliers are small; both functional gates
pass. `ACCEPTED` requires a human side-by-side review of A01/C01 in particular —
the two screens the design pack makes decisive — and that review has not
happened in this session.
