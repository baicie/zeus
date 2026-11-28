# Agent skills

Reusable procedure documents for coding agents. One directory per skill, each
with a `SKILL.md` carrying `name` and `description` frontmatter.

These live in `.agents/skills/`, the location the `npx skills` CLI treats as
canonical and symlinks out from. Cursor, Codex, Gemini CLI and GitHub Copilot
read it directly. Claude Code does not: it reads `.claude/skills/`, so each
skill here has a symlink at `.claude/skills/<name>` pointing back into this
directory. `pnpm check:skills` verifies that pair.

A previous revision put these at the repository root in `skills/`, on the
argument that a vendor directory hides a skill from other tools. That was
backwards: no agent reads a root `skills/` (OpenClaw is the only one that does),
so every skill here stopped loading in Claude Code for two days. The root
`skills/` layout is a *publishing* shape — what `npx skills` scans when
discovering skills in someone else's repository — not a local install.

## What is here

| Skill                           | What it is for                                                      |
| ------------------------------- | ------------------------------------------------------------------- |
| `code-review-and-quality`       | Multi-axis review before a change merges                            |
| `diagnose`                      | Disciplined reproduce → isolate → explain loop for hard bugs        |
| `tdd`                           | Red-green-refactor, with references on mocking and interface design |
| `improve-codebase-architecture` | Find deepening opportunities in an existing codebase                |
| `prototype`                     | Throwaway prototype to settle a design before committing to it      |
| `grill-me` / `grill-with-docs`  | Interview the author against a plan or a domain model               |
| `handoff`                       | Compact a conversation into a handoff document                      |
| `git-commit`                    | Conventional commit messages derived from the actual diff           |
| `typescript-advanced-types`     | Type-level patterns                                                 |
| `vite`                          | Vite configuration, plugin API, SSR                                 |
| `playwright-generate-test`      | Generate a Playwright test from a scenario                          |
| `write-a-skill`                 | Author a new skill                                                  |
| `find-skills`                   | Discover skills                                                     |
| `caveman`                       | Terse writing                                                       |

## Removed on 2026-11-26

Five skills were deleted because they did not fit this repository:

- `cursor-best-practices` — Cursor is no longer used here, and it was the only
  skill that named a specific editor.
- `monorepo-setup` — it configures Turborepo with `turbo.json`; this repository
  uses pnpm workspaces and has no `turbo.json`, so following it would add a
  build system that is not part of the architecture.
- `to-issues`, `to-prd`, `triage` — they assume an external issue tracker and a
  `/setup-matt-pocock-skills` command that this repository does not have.

The three files that used to sit in `.agents/cursor/rules/` were skill documents
in skill format stored in a directory no tool reads. `code-review-and-quality`
already existed here as a skill; the other two duplicated `tdd` and the
incremental-commit discipline in `git-commit`. `.agents/` is gone.
