# Next / Recovery — 2026-11-08

## If the executor restarts

1. Read `STATUS.md`, `CI-MATRIX.md`, `FINDINGS.md`, `FINAL.md` in this directory.
2. Fetch both repos and confirm main SHAs remain
   `39f90c7f1e73721e805914d19e53c456d0913a55` (Core) and
   `7a38f18abe79b9c969bbe04d23b9e80c0ab1d937` (UI). No mission PR was merged.
3. Re-run `gh pr checks <PR> -R baicie/zeus` for Core #202/#203/#204/#205/#206/
   #207/#208/#209 and `-R baicie/zeus-ui` for #126/#127/#128. All were green at
   the final checkpoint; a red rerun must be triaged against the diff.
4. Do not merge, convert to Ready, publish, tag or deploy without explicit human
   authorization.

## Worktrees

Core (`zeus/temp/worktrees/`):

- `r5-rc-gates` — `fix/r5-rc-gates` (`abbfd35`)
- `r5-ai-workspace-backup` — `fix/r5-ai-workspace-backup` (`64f6675`)
- `r5-signal-error-isolation` — `fix/r5-signal-error-isolation` (`8fa5774`)
- `r5-admin-input` — `fix/r5-admin-input-stability` (`872be70`)
- `r5-compiler-preflight` — `fix/r5-compiler-preflight` (`ce594f7`)
- `r5-empty-fragment` — `fix/r5-empty-fragment-codegen` (`08a872e`)
- `r5-ssr-streaming` — `fix/r5-ssr-streaming-safety` (`739cfad`)
- `r5-hydration-form` — `fix/r5-hydration-form-state` (`658181a`)
- `r5-overnight-checkpoint` — `docs/overnight-2026-11-08` (this branch)

UI (`zeus-ui/temp/worktrees/`):

- `r5-public-replay-storage` — `fix/r5-public-replay-storage-safety` (`ffe7801`)
- `r5-input-regression` — `test/r5-input-controlled-writeback` (`3c858cf`)
- `r5-datagrid-focus` — `fix/r5-datagrid-focus-restore` (`c13d0d3`)

## Highest-priority next work

1. RC-04: extend the isolated candidate tarball gate to all create-zeus
   templates; pack the paired UI `@zeus-web` packages for `webc-consumer-ts`;
   verify Linux/Windows install and build.
2. RC-07: only with explicit npm authorization, repair the 13 prerelease
   `latest` dist-tags; no auth exists in this environment.
3. With human authorization: merge the green PRs in dependency order, then run
   the real online four-product acceptance and manual A11y/zoom/mobile matrix.
4. Optional read-only DOM/WebC P2 audit: keyed reorder, disconnect/reconnect,
   async renderer dispose, custom-element string render HTML semantics.

## Do not do

- Do not merge or enable auto-merge; do not convert Drafts to Ready.
- Do not create Tag/Release, npm publish or dist-tag changes.
- Do not deploy/restart production, modify Caddy/Cloudflare/DNS/Secrets.
- Do not run destructive tests against production data or real workspaces.
- Do not suppress CI failures by deleting assertions or adding arbitrary sleeps.
