# PR-36 Core RC Hardening Evidence

Date: 2026-11-04

## Added

- `pnpm check:secrets`: scans every git-tracked text file for
  high-confidence AWS/GitHub/npm/Slack tokens and private-key blocks. Findings
  report only path, line and rule, never the matched value. Explicit
  example/dummy/test placeholders are ignored.
- `pnpm check:sbom:write` / `pnpm check:sbom`: deterministic CycloneDX 1.5
  workspace SBOM (59 packages at the time of writing), written under
  `temp/sbom/` so generated evidence is not committed.
- Both gates are wired into CI and the release precheck. The release-config
  unit test asserts their exact order.
- `pnpm check:rc-readiness` evaluates the current full commit, clean-worktree state,
  SBOM, secret scan, packed consumers, create-zeus, cross-platform evidence, release
  approval and the four online product URLs. It writes
  `temp/release/rc-readiness.json` and exits non-zero unless the decision is
  `READY_FOR_RELEASE_REVIEW`.

## Evidence contract

The readiness command reads `temp/release/rc-evidence.json`, or the path supplied by
`ZEUS_RC_EVIDENCE_FILE`. The document uses `zeus.rc-evidence/v1` and contains:

- four unique product entries for `webc-studio`, `native-lab`, `admin` and `ai-workbench`,
  each with an HTTPS URL and the current full commit;
- `crossPlatform.platforms` containing `linux` and `win32`, a report reference and the
  current full commit;
- `releaseApproval.approver` and the current full commit;
- a top-level `commit` matching the current full HEAD.

Missing evidence is reported as `not_run`. Invalid JSON, invalid fields, HTTP URLs,
duplicate or missing products, and commit mismatches are reported as `fail`. The packed
consumer and create-zeus reports carry the same `sourceCommit` binding, and the SBOM check
compares the complete sorted `bom-ref` set rather than only the component count.

Current decision: `NOT_READY`. The local code and product gates pass; the remaining
blockers are the intentionally dirty integration worktree, missing Windows/Linux evidence,
missing release approval and missing online URLs for WebC Studio, Native Lab, Admin and AI
Workbench.

## Validation

| Command                                                                                                         | Result                                                                               |
| --------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `pnpm check:secrets`                                                                                            | PASS, 1400 tracked files                                                             |
| `pnpm check:sbom:write` + `pnpm check:sbom`                                                                     | PASS, 59 components                                                                  |
| `pnpm exec vitest run scripts/check/__tests__/check-secrets.spec.ts scripts/check/__tests__/check-sbom.spec.ts` | PASS, 4 tests                                                                        |
| `pnpm exec vitest run scripts/release/__tests__/release-config.spec.ts`                                         | PASS, 7 tests                                                                        |
| `pnpm check:release-artifacts`                                                                                  | PASS, 29 package tarballs                                                            |
| `pnpm check:packed-consumers`                                                                                   | PASS, React 18/19 + Vue 3 install/SSR/types/build/bundle and Chromium/Firefox/WebKit |
| `pnpm check:native-packages`                                                                                    | PASS, native package metadata                                                        |
| `pnpm check:rc-readiness`                                                                                       | `NOT_READY` (expected); reports the remaining release blockers                       |

## Not done

- Windows/Linux native binary and browser matrix: `NOT_RUN` (requires those
  host platforms; local macOS only verified metadata and tarball shape).
- RC version bump, tag, npm publish and approval: `NOT_RUN` (not authorized).
- Windows/Linux browser/compiler matrix: `NOT_RUN`.
- Four-product online URLs with commit/SHA association: `NOT_RUN` (no
  deployment authorization).
