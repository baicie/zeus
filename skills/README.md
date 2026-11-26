# Agent skills

Reusable procedure documents for coding agents. One directory per skill, each
with a `SKILL.md` carrying `name` and `description` frontmatter.

These live at the repository root rather than under a tool-specific directory
(`.claude/skills/`, `.cursor/rules/`) because they are meant to be read by any
agent working in this repository. A skill placed in a vendor directory is
invisible to every other tool.

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
