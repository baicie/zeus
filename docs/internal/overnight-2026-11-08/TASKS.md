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

## Next (highest priority)

1. Watch CI for #204 / #206 / #208 / #209 / UI #126 / UI #127; fix real
   failures with code, not reruns.
2. Add malicious/expired RC evidence negative tests to #202 (wrong repo/run/SHA/
   expired artifact; local/online distinction).
3. Implement candidate-tarball packed create-zeus install (RC-04 remainder).
4. Phase D remainder: Z-07 nested-Show codegen complexity, DOM/WebC P2 findings.
5. Produce `FINAL.md` at ~11:45 with the verdict.
6. Update this checkpoint every 30–60 minutes or at each key commit.
