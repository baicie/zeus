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

## Why the ordering cannot be "publish Core, then record the UI"

The pairing record is read by `.github/workflows/release.yml` at step
"Read the paired UI commit", which runs **before** anything is published. The
workflow is triggered by pushing a `v*` tag, so the record has to be inside the
commit that tag points at.

That makes the intuitive order impossible:

1. ~~Core publishes the RC.~~
2. ~~UI bumps its pins and regenerates the lockfile.~~
3. ~~Core records the UI candidate and tags it.~~

Step 1 tags a commit with no record in it, and the workflow stops at step 3
before it ever reaches a publish. There is no later commit that can fix a tag
which has already been pushed — and the tag ruleset added in R13.1 makes the
tag undeletable and unmovable, so it cannot be retried either.

## The two things that genuinely block, and what unblocks each

They block different steps, which is why they cannot be solved by reordering:

| Blocker                                                                              | Blocks                                  | Unblocked by                 |
| ------------------------------------------------------------------------------------ | --------------------------------------- | ---------------------------- |
| `@zeus-js/*@<new version>` is not on the registry, so the UI lockfile cannot resolve | the UI commit that the record must name | publishing the Core packages |
| The record must be in the tagged commit                                              | the Core tag                            | a UI commit that exists      |

Each needs the other's output. That is the deadlock: it is not a mistake in the
ordering, it is a cycle.

## Bootstrap → Pair, two phases

The cycle is broken by accepting that the first Core tag can only be verified
against itself, and making that state explicit rather than pretending it is a
pair.

### Phase 1 — Bootstrap (unpaired)

The Core tag publishes the packages and is recorded as unpaired. The workflow
does not require a UI commit; it asserts instead that the version line is a new
one (`0.2.0-rc.0` is the first RC, so no earlier RC exists to contradict it)
and records `uiCommit: null` with `bootstrap: true`.

What this gives up: the guarantee that the published Core was built against a
specific UI tree. What it keeps: the tag is immutable, the published versions
cannot be overwritten, and the evidence is bound to the real tag SHA.

### Phase 2 — Pair (verified)

The UI candidate is committed against the now-published Core versions, its
lockfile resolves, and a **second** record names it. That record is verified by
the UI release before the UI tags, using the online half of
`check-release-pairing`.

The pair is therefore between `@zeus-js/*@0.2.0-rc.0` (published, immutable)
and a UI commit. It is not a Retrofit of the Core tag: the Core tag stays where
it is, pointing at the bootstrap commit, and nothing re-points it.

### Why the Core tag is not moved

Re-pointing the Core tag for `0.2.0-rc.0` at a commit containing the pair
record is the obvious shortcut, and it is exactly what the tag ruleset forbids —
correctly, because the tree behind the tag would no longer be the tree that was
published. A package published under a version must correspond to one immutable
tree; changing the tag afterwards makes `v0.2.0-rc.0` name two different trees
over its lifetime.

So the Core tag stays on the bootstrap commit, and the pair record for it lives
in the UI repository's release path rather than in the Core tag. The UI release
verifies:

- Core's `v<version>` tag resolves to a commit (the bootstrap commit),
- the packages at `<version>` are published and their integrity matches what
  the UI lockfile pins,
- its own commit is the one the pair record names.

A same-version-line bump (beta.34 → beta.35) has none of this problem: the pins
do not change, so the lockfile is already valid and the record can be written
before the tag. This is specific to crossing a version line, which
0.1.1-beta.20 → 0.2.0-rc.0 does.
