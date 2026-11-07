# Tasks — 2026-11-08 Overnight

## Done

- [x] Reproduce Core main CI failure context; rerun same commit to success; 20/20 local WebKit Admin stress.
- [x] Create RC gate Draft PR #202: evidence assembler v3, release workflow fail-closed, release snapshot, 31-package group, template sync/gate, Core/UI pairing, latest-tag check.
- [x] Create AI storage safety Draft PR UI #126: generation directories, no destructive root delete, broad-root/symlink rejection, tests.
- [x] Create AI workspace backup Draft PR Core #203: tar backup/SHA256/atomic restore, rollback report fields.
- [x] Establish this checkpoint directory.

## Next (highest priority)

1. Watch CI for #202 / #203 / UI #126; fix real failures with code, not reruns.
2. Add malicious/expired RC evidence negative tests to #202 (wrong repo/run/SHA/expired artifact; local/online distinction).
3. Implement candidate-tarball packed create-zeus install (RC-04 remainder) in #202 or a follow-up.
4. Run a real Stage 2 local integration on an integration branch containing #203, assert `backups.aiWorkspace` and `rollback.restoredWorkspaces`.
5. Phase D core audit:
   - Rust compiler differential/fuzz cases with deterministic seeds.
   - Signal runtime re-entrancy/batch/scope tests.
   - DOM hydration/WebC lifecycle and SSR escaping tests.
6. If F-01 reproduces under instrumentation, fix the controlled input contract with a deterministic regression test.
7. Update this checkpoint every 30–60 minutes or at each key commit.
