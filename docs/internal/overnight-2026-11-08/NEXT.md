# Next / Recovery — 2026-11-08

## If the executor restarts

1. Read `STATUS.md`, `CI-MATRIX.md`, `NEXT.md` in this directory.
2. Fetch both repos and confirm main SHAs (`Core 39f90c7`, `UI 7a38f18` at checkpoint).
3. Run `gh pr checks 202 -R baicie/zeus`, `gh pr checks 203 -R baicie/zeus`,
   `gh pr checks 126 -R baicie/zeus-ui`. Do not merge.
4. Resume at the first incomplete task in `TASKS.md`.
5. Worktrees (checkpoint):
   - Core RC gates: `temp/worktrees/r5-rc-gates` (`fix/r5-rc-gates`, `2f4a994`)
   - Core AI workspace backup: `temp/worktrees/r5-ai-workspace-backup`
     (`fix/r5-ai-workspace-backup`, `64f6675`)
   - UI AI storage: `zeus-ui/temp/worktrees/r5-public-replay-storage`
     (`fix/r5-public-replay-storage-safety`, `3fcac41`)
   - Admin WebKit: `temp/worktrees/r5-admin-input` (`fix/r5-admin-input-stability`, no commit)
   - Checkpoint: `temp/worktrees/r5-overnight-checkpoint` (`docs/overnight-2026-11-08`)

## Do not do

- Do not merge any PR (no human authorization in this mission).
- Do not create Tag/Release, npm publish or dist-tag changes.
- Do not deploy/restart production, modify Caddy/Cloudflare/DNS/Secrets.
- Do not run destructive tests against production data or real workspaces.
- Do not suppress CI failures by deleting assertions or adding arbitrary sleeps.

## Immediate next actions

1. Inspect PR #202 / #203 / UI #126 CI; fix real failures.
2. Add RC evidence negative tests (malicious/expired/wrong run/repo/SHA).
3. Implement candidate-tarball packed create-zeus install.
4. Run Stage 2 local integration with #203; assert workspace backup/restore.
5. Start Phase D core audits if CI is pending.
6. Update checkpoint at each milestone.
