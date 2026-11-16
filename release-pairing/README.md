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
