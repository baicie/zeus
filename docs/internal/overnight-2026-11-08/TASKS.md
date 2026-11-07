# Tasks — 2026-11-08 Overnight

## Done

- [x] Reproduce Core main CI failure context; rerun same commit to success; 20/20 local WebKit Admin stress.
- [x] Create RC gate Draft PR #202: evidence assembler v3, release workflow fail-closed, release snapshot, 31-package group, template sync/gate, Core/UI pairing, latest-tag check.
- [x] Create AI storage safety Draft PR UI #126: generation directories, no destructive root delete, broad-root/symlink rejection, tests.
- [x] Create AI workspace backup Draft PR Core #203: tar backup/SHA256/atomic restore, rollback report fields.
- [x] Establish this checkpoint directory.
- [x] Root-cause the Admin WebKit search failure (data-grid rAF focus restore) and
      ship UI #128 + Core #205.
- [x] Deep audit PRs: Signal #204 (error isolation/computed recovery), Compiler
      #206 (native + wasm preflight), #207 (empty Fragment), SSR #208 (streaming
      safety), Hydration #209 (native form state), UI #127 (controlled input).
- [x] Move the nesting scanner into `zeus_compiler`, add a wasm-specific weight
      table, and prove no trap in Chromium/Firefox/WebKit.
- [x] Keep the workspace/RC/checkpoint docs current.

- [x] Verify all mission PRs green: Core #202/#203/#204/#205/#206/#207/#208/#209,
      UI #126/#127/#128; none merged or converted to Ready.
- [x] Publish `FINAL.md` with verdict `BLOCKED_BY_CODE` (RC-04 remainder).

- [x] All mission PRs green (#202–#209, UI #126–#128); final report `FINAL.md`.

## Next (highest priority)

1. RC-04: extend candidate tarball coverage to non-basic templates and UI
   `@zeus-web` packages; verify Linux/Windows.
2. RC-07: actual dist-tag repair requires npm authorization.
3. Merge green PRs only with human authorization; then collect online
   acceptance and manual A11y/zoom/mobile evidence.
4. Optional DOM/WebC P2 audit (keyed reorder, reconnect, async dispose,
   custom-element string render semantics).
