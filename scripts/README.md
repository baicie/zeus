# Scripts

Repository maintenance scripts are grouped by responsibility:

- `bundler/`: package build and declaration bundle configuration.
- `check/`: validation scripts used by CI and release prechecks.
- `release/`: release orchestration and release precheck entrypoints.
- `shared/`: helpers shared by multiple scripts.
- `size/`: bundle size reporting utilities.
- `testing/`: test runner setup files.

Branch naming is validated by `pnpm check:branch`. The accepted model is
main-only trunk development with short-lived
`feat|fix|refactor|chore|docs|test/<scope>-<topic>` branches, temporary
`release/<version>` branches, and urgent `hotfix/<version>-<topic>` branches.
