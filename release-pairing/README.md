# Release pairing

One file per Core release version: `v<version>.json`.

A Core tag names a Core commit. The UI half of the pair is a separate
repository with its own commit, so the release needs to be told which one it
was verified against. This directory is that record.

```json
{
  "schema": "zeus.release-pairing/v1",
  "coreVersion": "0.2.0-rc.0",
  "uiCommit": "<40-character SHA>",
  "uiVersion": "0.2.0-rc.0",
  "verifiedAt": "2026-11-16T00:00:00.000Z"
}
```

Why a committed file rather than a repository variable:

- it is reviewable in the pull request that adds it, before the tag exists;
- it is at the tagged commit, so it cannot be changed without changing what
  the tag points at;
- it can be read by anyone auditing a published version, without access to
  repository settings.

The release workflow refuses to run when the file for its version is missing,
rather than falling back to a branch name.

## The ordering constraint this implies

A UI version bump that crosses a Core version line cannot produce a valid
`pnpm-lock.yaml` before Core is published: the pins resolve through the
registry, and `@zeus-js/*@<new version>` is not there yet.

`pnpm install --frozen-lockfile` therefore fails on such a PR, and it is
correct to fail — the lockfile genuinely does not match the manifests.

The order that works:

1. Core publishes the RC (`v<version>` tag).
2. UI bumps its pins to that version and regenerates the lockfile against the
   registry — now possible.
3. Core records the UI candidate in `release-pairing/v<version>.json` and tags
   the commit that contains it.

Steps 2 and 3 are in tension with a single Core tag: the tag that publishes the
Core packages must exist _before_ the UI candidate that pairs with it. That is
why `release-pairing/v<version>.json` is read from the tagged commit rather
than written into it: the record can be added in a later commit, and the UI
verifies itself against whatever the tag resolved to when the release ran.

A same-version-line bump (beta.34 → beta.35) does not have this problem,
because the pins do not change. This constraint is specific to crossing a
version line, which 0.1.1-beta.20 → 0.2.0-rc.0 does.
