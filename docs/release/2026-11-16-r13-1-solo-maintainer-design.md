# Solo Maintainer Release Architecture — design

Date: 2026-11-16
Policy: `zeus.release-policy/v2`
Supersedes: v1 (dual-approval), never deployed

## What was wrong with v1

v1 answered "is a second human involved" and used that as the release gate.
For a single-maintainer project that question has no good answer:

- with required reviewers configured, every release blocks forever;
- without them, the policy reports FAIL and a release is refused;
- the only way through is an admin bypass, which is the thing the policy
  exists to prevent.

So v1 either deadlocks the project or teaches its one maintainer to bypass it.

It also conflated three different questions:

1. **Is this artifact the one CI validated?** — answerable automatically.
2. **Did someone with authority decide to release it?** — v1 answered with a
   human signature.
3. **Can the release be undone?** — v1 did not ask.

## What replaces the human signature

A git tag is already an authorisation: creating one takes write access, and on
a protected repository it is an auditable, attributable act. The release
trigger becomes that act, and the gate becomes everything that can be proven
about it automatically.

`zeus.release-policy/v2` defines one invariant:

> **The published artifact is the one that passed CI, produced from a commit
> reachable from the default branch, under a tag that cannot move.**

Every check below exists to make one clause of that sentence true, and none of
them asks who is awake.

| Clause                            | Check                                              |
| --------------------------------- | -------------------------------------------------- |
| the published artifact            | tarball integrity, unpacked-file assertions        |
| is the one that passed CI         | required CI runs for the same SHA, all `success`   |
| produced from a commit            | checkout SHA == `GITHUB_SHA` == tag target         |
| reachable from the default branch | `isMainAncestor`                                   |
| under a tag that cannot move      | ruleset-managed tag protection (maintainer)        |
| (and it is a real release)        | tag matches `v<semver>`, version matches manifests |

## The immutable input problem

A tag is not immutable by default: it can be deleted and re-created pointing
at another commit, and the re-run of the same workflow would then publish a
different tree under the same version. npm refuses to overwrite a published
version, so this fails closed — but it fails _after_ half the packages are
published.

Two things make it safe:

1. **Rulesets** (repository configuration, maintainer action): a tag ruleset
   with `deletion` and `non_fast_forward` blocked for `v*`. This is the only
   part that needs a human, and it is set once.
2. **A recorded decision** (code): the release workflow writes the tag target
   into the authorisation record, and the record is verified against the run
   that produced it. A re-run whose tag now points elsewhere produces a
   different record, and `verify-published` notices the mismatch.

## Environment topology: five → two

The five R13 environments were shaped by dual approval. With that gone, three
of them have no job left:

| R13                   | verdict                                                                                                                                                                                                                               |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `RC Approval`         | **deleted.** It existed to hold a human signature.                                                                                                                                                                                    |
| `Release Governance`  | **deleted.** It existed to read environment protection so a policy could grade it. Nothing grades protection any more.                                                                                                                |
| `Release Maintenance` | **deleted.** It existed because maintenance ran from `main` and `Release` was tag-only. `Release` now admits both, and maintenance holds the same token either way — a second environment added a boundary without narrowing a grant. |
| `Devtools Release`    | **deleted.** Same reason: its trigger is a tag, and the tag rule it needed is `create-zeus@*`/`vite-plugin@*`, which is one more pattern in `Release`.                                                                                |
| `Release`             | **kept**, widened to admit the four ref patterns the five jobs actually use.                                                                                                                                                          |

The result is one environment for everything that can publish, with the
narrowing done by the **workflow-level** checks rather than by environment
membership:

| workflow                   | ref                                  | publishes         |
| -------------------------- | ------------------------------------ | ----------------- |
| `release.yml`              | tag `v*`                             | core packages     |
| `devtools-release.yml`     | tag `create-zeus@*`, `vite-plugin@*` | devtools packages |
| `repair-dist-tags.yml`     | branch `main`                        | dist-tags only    |
| `repair-native-latest.yml` | branch `main`                        | one dist-tag only |

Is one environment less safe than five? It is **not more** safe, and the
trade is deliberate: five environments that a single maintainer has to keep
in sync is a configuration surface that drifts, and the R13 review already
found a gap where an environment's protection was verified for one job and
assumed for another. The boundary that matters — _which workflow may publish
what_ — is enforced in code and tested, not in a settings page.

If the project later gains a second maintainer, the split can come back; the
contracts module keeps the mapping explicit.

## Should `Release` require reviewers? No.

The policy no longer grades reviewer configuration. Setting reviewers would
deadlock; not setting them is correct. What replaces it:

- tag ruleset (immutable tag),
- the tag is the trigger (no dispatch input to forge),
- `verify-tag-source` (tag == SHA == ancestor of main),
- `environment` still gates the **secret**, so `NPM_TOKEN` is not readable
  from an arbitrary job.

## What about `ZEUS_DEPLOYMENT_EVIDENCE_RUN_ID`?

It required a maintainer to run `host-deployment-stage2.yml` and paste a run
id before a release. That evidence describes a **deployed site**, not the
packages being published. Using it as a precondition for an npm publish
means the release of a library is gated on production infrastructure — a
different artifact with a different failure budget.

It is removed from the release path. Site deployment keeps its own workflow
and its own evidence; publishing packages no longer depends on it.

## The authorisation record

New artifact: `zeus.release-authorization/v1`, written by `release.yml` itself
and bound to the run that produced it.

It records repository, tag, tag target, checkout SHA, workflow identity, run
id/attempt, the CI and native-matrix runs it relied on, SBOM digest, pairing
digest, provenance digest, policy version, verdict and timestamp.

It is **evidence, not a gate**: the release has already passed the checks by
the time it is written. Its job is audit — after the fact, anyone can see
which runs a given published version was authorised by, and confirm none of
them were replayed.

This is deliberately different from v1's approval document, which was a gate
and therefore had to be unforgeable. An audit record only has to be
_checkable_, and every field in it is re-derivable from GitHub.

## Failing closed

The authorisation function returns a verdict plus findings, and a single
non-PASS finding blocks publishing. There is no "warn" level and no override
flag: an override that exists is an override that gets used at 3am.

## What still needs a human, once

Exactly one thing:

**A tag ruleset** blocking deletion and update on `v*`, `create-zeus@*`,
`vite-plugin@*`. This is the only mechanism that makes a tag immutable, and it
is the only piece this code cannot read. `tag-unmoved` notices a move after the
fact; the ruleset prevents it.

Configured on 2026-11-17 as `release tag immutability` (ruleset `27438539`):

| Field        | Value                                                                |
| ------------ | -------------------------------------------------------------------- |
| target       | `tag`                                                                |
| ref patterns | `refs/tags/v*`, `refs/tags/create-zeus@*`, `refs/tags/vite-plugin@*` |
| rules        | `deletion`, `update`                                                 |
| bypass       | none — `bypass_actors: []`, `current_user_can_bypass: "never"`       |

Verified by attempting all three operations against a throwaway
`v0.0.0-ruleset-enforcement-test` ref: create succeeded, update was refused
with `Cannot update this protected ref.`, delete was refused with `Cannot
delete this tag`. The test ref needed the ruleset briefly disabled to remove,
which is itself a demonstration that no bypass path exists.

`update` rather than `non_fast_forward`: a fast-forward check would permit a
tag to move from commit A to a descendant of A, which is exactly the move this
rule exists to stop — a release tag re-pointed at a later commit publishes a
different tree under a version number that was already released. `update`
blocks every re-point, so there is no gap to reason about.

The policy that gates publishing (`tag-immutability`) still reports
`POLICY_LIMITATION`, because no workflow token can read a ruleset. That report
is not a gap in this configuration; it records that the configuration is
verified out of band, by the table above, rather than at release time.

Everything else already exists and needs no action:

- `NPM_TOKEN` is a repository secret, present since 2026-10-09;
- the `Release` and `Canary` environments exist with no protection rules;
- `v0.1.1-beta.18`, `.19` and `.20` published successfully with no approval —
  the `rc-approval` gate was added _after_ the last successful release and
  never ran successfully.

That history is worth stating plainly: this project's releases were always
zero-approval. The approval gate was an insertion that never worked, and
removing it restores a path that was already in use.

(Optional, later) switch npm to Trusted Publishing and delete `NPM_TOKEN`.
