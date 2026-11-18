/**
 * Decides, from the release tag and the repository, whether a release may
 * publish — with no human in the loop.
 *
 * Run by `release.yml` after checkout and before any publish step. It exits
 * non-zero on any refusal, and writes the authorisation record either way so a
 * refused release still leaves an audit trail.
 *
 * ## Inputs it takes
 *
 * Only facts the environment already has: the tag ref, `GITHUB_SHA`, the
 * repository, and paths to evidence other steps produced (SBOM, tarball
 * report). Everything else — which CI runs a commit needs, whether the tag is
 * an ancestor of main — it finds itself.
 *
 * ## Inputs it refuses to take
 *
 * No run ids, no approver lists, no "assume this passed" flags. Every one of
 * those existed in v1 and every one of them was a place a release could claim
 * something had been checked when it had not.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { zeusFixedPackages } from '../release.config'
import {
  evaluateBootstrapEligibility,
  type RecoveryEvidence,
} from './bootstrap-eligibility'
import {
  findSupportingRuns,
  isAncestorOfMain,
  readCurrentTagSha,
} from './find-release-evidence'
import { queryNpmJson } from './npm-registry'
import { attestationFile } from './pair-attestation'
import {
  AUTHORIZATION_RULES,
  RELEASE_AUTHORIZATION_SCHEMA,
  evaluateReleaseAuthorization,
  type AuthorizationFinding,
  type SupportingRun,
} from './release-authorization'

/**
 * Workflows whose success a release depends on.
 *
 * `compiler-native.yml` is a reusable workflow invoked by `release.yml`, so its
 * `needs:` edge already blocks on failure — it is listed so the record names
 * the run, not because this check is the only thing holding it.
 */
export const REQUIRED_WORKFLOWS = [
  '.github/workflows/ci.yml',
  '.github/workflows/compiler-native.yml',
] as const

export interface CollectAuthorizationInput {
  readonly root: string
  readonly repository: string
  readonly version: string
  readonly tagRefName: string | undefined
  readonly workflowSha: string | undefined
  readonly checkoutSha: string
  readonly uiCommit: string
  readonly uiVersions: Readonly<Record<string, string>>
  /** The pairing record declared `bootstrap: true`. */
  readonly bootstrap?: boolean
  /** Whether the bootstrap eligibility policy approved this release. */
  readonly bootstrapEligible?: boolean
  /** The eligibility findings, recorded with the rest. */
  readonly bootstrapFindings?: readonly AuthorizationFinding[]
  readonly distTag: string | undefined
  readonly sbomOk: boolean | undefined
  readonly tarballOk: boolean | undefined
  readonly registryCollisions: readonly string[]
  readonly registryReachable: boolean
  readonly firstPublishPackages: readonly string[]
  /** First-publish packages the pairing record accepts. */
  readonly acknowledgedFirstPublish?: readonly string[]
  /** Injectable for tests: returns runs for a workflow at a commit. */
  readonly findRuns?: typeof findSupportingRuns
  /** Injectable for tests. */
  readonly ancestorOfMain?: (sha: string) => boolean | undefined
  /** Injectable for tests: where the tag points now. */
  readonly currentTagSha?: string | undefined
}

function readCoreVersions(root: string): Record<string, string> {
  const versions: Record<string, string> = {}
  const packageRoots = fs.existsSync(path.join(root, 'packages'))
    ? [path.join(root, 'packages')]
    : []
  const walk = (directory: string): void => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      if (entry.name === 'node_modules' || entry.name === 'dist') continue
      const absolute = path.join(directory, entry.name)
      if (entry.isDirectory()) {
        walk(absolute)
        continue
      }
      if (entry.name !== 'package.json') continue
      let manifest: { name?: string; version?: string }
      try {
        manifest = JSON.parse(fs.readFileSync(absolute, 'utf8'))
      } catch {
        continue
      }
      if (!manifest.name || !manifest.version) continue
      if (!zeusFixedPackages.includes(manifest.name)) continue
      versions[manifest.name] = manifest.version
    }
  }
  for (const packageRoot of packageRoots) walk(packageRoot)
  return versions
}

/**
 * Assembles the authorisation input from the tree and the GitHub API.
 *
 * Exported so the end-to-end simulation can drive it with stubbed lookups
 * without touching a registry or publishing anything.
 */
export function collectReleaseAuthorization(input: CollectAuthorizationInput): {
  readonly result: ReturnType<typeof evaluateReleaseAuthorization>
  readonly runs: readonly SupportingRun[]
  readonly lookupProblems: readonly string[]
} {
  const findRuns = input.findRuns ?? findSupportingRuns
  const ancestorOfMain =
    input.ancestorOfMain ?? ((sha: string) => isAncestorOfMain(sha, input.root))

  const runs: SupportingRun[] = []
  const lookupProblems: string[] = []
  for (const workflowPath of REQUIRED_WORKFLOWS) {
    const found = findRuns({
      repository: input.repository,
      workflowPath,
      headSha: input.workflowSha ?? input.checkoutSha,
    })
    runs.push(...found.runs)
    lookupProblems.push(...found.problems)
  }

  const result = evaluateReleaseAuthorization({
    tagRefName: input.tagRefName,
    workflowSha: input.workflowSha,
    checkoutSha: input.checkoutSha,
    version: input.version,
    isMainAncestor: ancestorOfMain(input.checkoutSha),
    coreVersions: readCoreVersions(input.root),
    uiVersions: input.uiVersions,
    uiCommit: input.uiCommit,
    bootstrap: input.bootstrap,
    ...(input.bootstrapEligible === undefined
      ? {}
      : { bootstrapEligible: input.bootstrapEligible }),
    ...(input.bootstrapFindings === undefined
      ? {}
      : { bootstrapFindings: input.bootstrapFindings }),
    supportingRuns: runs,
    requiredWorkflows: [...REQUIRED_WORKFLOWS],
    sbomOk: input.sbomOk,
    tarballOk: input.tarballOk,
    registryCollisions: input.registryCollisions,
    registryReachable: input.registryReachable,
    firstPublishPackages: input.firstPublishPackages,
    acknowledgedFirstPublish: input.acknowledgedFirstPublish,
    distTag: input.distTag,
    currentTagSha: input.currentTagSha,
  })

  return { result, runs, lookupProblems }
}

/**
 * The record written for audit.
 *
 * It is written on refusal too. A refused release that leaves no trace is one
 * where the next attempt starts from nothing.
 */
export interface ReleaseAuthorizationRecord {
  readonly schema: typeof RELEASE_AUTHORIZATION_SCHEMA
  readonly policyVersion: string
  readonly repository: string
  readonly tag: string | undefined
  readonly version: string
  readonly tagTarget: string | undefined
  readonly checkoutSha: string
  readonly uiCommit: string
  readonly supportingRuns: readonly SupportingRun[]
  readonly distTag: string | undefined
  readonly verdict: string
  readonly findings: readonly {
    rule: string
    verdict: string
    detail: string
  }[]
  readonly generatedAt: string
}

/**
 * The published version list, whatever shape `npm view` returned.
 *
 * Three shapes occur in practice: an array, a single string for a package with
 * one version, and — from some proxies — the `{ versions: {...} }` document.
 * `undefined` means the shape was none of them, which the caller treats as
 * "registry state unknown" rather than "no versions".
 */
export function normalizeVersions(value: unknown): string[] | undefined {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string')
  }
  if (typeof value === 'string') return [value]
  if (
    typeof value === 'object' &&
    value !== null &&
    'versions' in value &&
    typeof (value as { versions?: unknown }).versions === 'object' &&
    (value as { versions?: unknown }).versions !== null
  ) {
    return Object.keys(
      (value as { versions: Record<string, unknown> }).versions,
    )
  }
  return undefined
}

/**
 * Every version of the published root package, or `undefined` if unreadable.
 *
 * The bootstrap policy needs the *whole* list rather than a single
 * `includes(version)` answer: "is this the first RC of its line" cannot be
 * decided from one version, and a policy that could only ask about the exact
 * version would have to guess about every other one.
 *
 * `@zeus-js/zeus` is the root of the fixed group, so its version list is the
 * line's version list.
 */
export async function readPublishedVersionsOfPackage(
  version: string,
  query: typeof queryNpmJson = queryNpmJson,
): Promise<string[] | undefined> {
  const result = await query<unknown>([
    'view',
    '@zeus-js/zeus',
    'versions',
    '--json',
  ])
  if (result.status === 'not-found') {
    /*
     * The package itself does not exist, which for this repository would mean
     * the fixed group was never published at all. That is a state bootstrap
     * cannot reason about, and treating it as "no versions" would silently
     * mark every line as new.
     */
    return undefined
  }
  if (result.status !== 'ok') return undefined
  const normalized = normalizeVersions(result.value)
  if (normalized === undefined) return undefined
  return normalized
}

/** Whether an attestation for this version is already in the tree. */
export function attestationExists(
  version: string,
  root = process.cwd(),
): boolean {
  return fs.existsSync(path.join(root, attestationFile(version)))
}

/**
 * Reads the `recovery` block from a pairing record, if present.
 *
 * Only the identifying fields. Everything the verdict depends on — that the tag
 * exists at that commit, that the run started from it, that the run stopped
 * before publishing — is established from GitHub below, never from the file.
 * A record can claim a recovery; it cannot prove one.
 */
export function readRecoveryClaim(
  pairingRecord: string | undefined,
):
  | { failedVersion: string; failedRunId: string; failedTagCommit: string }
  | undefined {
  if (pairingRecord === undefined || !fs.existsSync(pairingRecord)) {
    return undefined
  }
  try {
    const parsed = JSON.parse(fs.readFileSync(pairingRecord, 'utf8')) as {
      recovery?: {
        failedVersion?: unknown
        failedRunId?: unknown
        failedTagCommit?: unknown
      }
    }
    const recovery = parsed.recovery
    if (
      recovery === undefined ||
      typeof recovery.failedVersion !== 'string' ||
      typeof recovery.failedRunId !== 'string' ||
      typeof recovery.failedTagCommit !== 'string'
    ) {
      return undefined
    }
    return {
      failedVersion: recovery.failedVersion,
      failedRunId: recovery.failedRunId,
      failedTagCommit: recovery.failedTagCommit,
    }
  } catch {
    return undefined
  }
}

/**
 * What the failed run actually did, read from GitHub.
 *
 * The two questions that matter:
 *
 * - did it start from the commit the failed tag points at?
 * - did it reach any step before the first publish?
 *
 * Both are answered from the jobs API rather than from the record, because the
 * claim "this failed before publishing" is exactly what an attacker would
 * assert to get an unpaired release.
 */
export interface FailedRunEvidence {
  /** The SHA the run started from. */
  readonly tagCommit: string
  /** Whether any publish step ran to completion or started at all. */
  readonly reachedPublish: boolean
}

export function readFailedRun(
  repository: string,
  runId: string,
  gh: (args: readonly string[]) => string,
): FailedRunEvidence | undefined {
  try {
    const run = JSON.parse(
      gh(['api', `repos/${repository}/actions/runs/${runId}`]),
    ) as { head_sha?: string; conclusion?: string }
    if (typeof run.head_sha !== 'string') return undefined

    const jobs = JSON.parse(
      gh([
        'api',
        `repos/${repository}/actions/runs/${runId}/jobs?per_page=100`,
      ]),
    ) as {
      jobs?: Array<{
        steps?: Array<{
          name?: string
          status?: string
          conclusion?: string
        }>
      }>
    }

    /*
     * Any step whose name mentions publishing counts, and so does any step
     * that started. A step that was skipped did not publish; a step that ran
     * at all might have, and "might have" is a refusal.
     *
     * `status` is not how a skipped step is reported. GitHub marks a step
     * whose `if:` was false as `status: "completed"` with
     * `conclusion: "skipped"` — so testing `status === 'skipped'` matched
     * nothing. Every not-yet-run publish step in v0.2.0-rc.1's run
     * (44263303787) was therefore counted as having run, and the recovery of
     * rc.1 was refused as "a partially published version" when `Build and
     * publish` never executed and nothing was published.
     *
     * Both fields are checked: a step is skipped if either says so, and the
     * conclusion is the one that carries the answer. Erring toward "it ran"
     * is the safe direction, so anything unrecognised still counts as reached.
     */
    let reachedPublish = false
    for (const job of jobs.jobs ?? []) {
      for (const step of job.steps ?? []) {
        if (
          step.status === 'skipped' ||
          step.conclusion === 'skipped' ||
          step.status === undefined
        ) {
          continue
        }
        const name = step.name ?? ''
        if (/publish/i.test(name)) {
          reachedPublish = true
          break
        }
      }
      if (reachedPublish) break
    }

    return { tagCommit: run.head_sha, reachedPublish }
  } catch {
    return undefined
  }
}

/**
 * The commit a tag resolves to on the remote, dereferencing an annotated tag.
 *
 * Duplicated from `check-release-pairing.ts` rather than imported: that module
 * is a CLI entry point, and importing it would run its argument parsing.
 */
export function readRemoteTagCommit(
  repository: string,
  tag: string,
  gh: (args: readonly string[]) => string,
): string | undefined {
  try {
    const ref = JSON.parse(
      gh(['api', `repos/${repository}/git/ref/tags/${tag}`]),
    ) as { object?: { type?: string; sha?: string } }
    const object = ref.object
    if (!object || typeof object.sha !== 'string') return undefined
    if (object.type === 'commit') return object.sha
    const tagObject = JSON.parse(
      gh(['api', `repos/${repository}/git/tags/${object.sha}`]),
    ) as { object?: { type?: string; sha?: string } }
    return tagObject.object?.type === 'commit'
      ? tagObject.object.sha
      : undefined
  } catch {
    return undefined
  }
}

/**
 * Whether the in-tree record for this version already names a UI commit.
 *
 * Read from the file the release passes as `--pairing-record`. A record with a
 * full SHA there means the pair was established before the tag, and a release
 * that then declared bootstrap would be discarding it.
 */
export function inTreePairNamesUiCommit(
  pairingRecord: string | undefined,
): boolean {
  if (pairingRecord === undefined || !fs.existsSync(pairingRecord)) return false
  try {
    const parsed = JSON.parse(fs.readFileSync(pairingRecord, 'utf8')) as {
      uiCommit?: unknown
    }
    return (
      typeof parsed.uiCommit === 'string' &&
      /^[0-9a-f]{40}$/i.test(parsed.uiCommit)
    )
  } catch {
    return false
  }
}

/**
 * Queries the registry for the version, per package.
 *
 * Returns `undefined` when the registry could not be asked — which the policy
 * refuses, because "no collision found" and "no query answered" look identical
 * from here and only one of them is safe.
 */
export async function readRegistryState(
  version: string,
  query: typeof queryNpmJson = queryNpmJson,
): Promise<{
  reachable: boolean
  collisions: string[]
  firstPublish: string[]
}> {
  const collisions: string[] = []
  const firstPublish: string[] = []
  const names = [...zeusFixedPackages, '@zeus-js/vite-plugin']
  for (const name of names) {
    /*
     * `npm view <pkg> versions --json` returns an **array** of version
     * strings — or a bare string when the package has exactly one version.
     * Reading it as `{ versions: {...} }` and testing membership with `in`
     * meant every version tested as absent: `in` on an array checks index
     * keys, and a string has no such property. Measured against the live
     * registry, `'0.1.1-beta.20' in v === false` while `v.includes(...)` is
     * true, with 180 versions returned.
     */
    const result = await query<unknown>(['view', name, 'versions', '--json'])
    if (result.status === 'not-found') {
      /* Never published: its first publication would bind `latest`. */
      firstPublish.push(name)
      continue
    }
    if (result.status === 'failed') {
      /*
       * One unanswered query makes the whole answer unknown. Counting it as
       * "no collision" would publish over an existing version; counting it as
       * a collision would block a release for a network blip. Neither is a
       * fact, so the caller is told the state is unreadable.
       */
      return { reachable: false, collisions, firstPublish }
    }
    const published = normalizeVersions(result.value)
    if (published === undefined) {
      /*
       * A shape this code does not understand is not evidence of absence.
       * Treating it as "no collision" is how a release publishes over a
       * version npm already has.
       */
      return { reachable: false, collisions, firstPublish }
    }
    if (published.includes(version)) collisions.push(name)
  }
  return { reachable: true, collisions, firstPublish }
}

/**
 * Whether an SBOM for this tree exists and validates.
 *
 * The release precheck writes and checks it before this step runs, so the
 * answer is read from the report rather than recomputed here.
 */
function readSbomOk(root: string): boolean | undefined {
  for (const candidate of [
    'temp/sbom/zeus.cdx.json',
    'temp/release/sbom.json',
  ]) {
    const absolute = path.join(root, candidate)
    if (!fs.existsSync(absolute)) continue
    try {
      const parsed = JSON.parse(fs.readFileSync(absolute, 'utf8')) as {
        bomFormat?: unknown
        components?: unknown
      }
      const components: unknown[] = Array.isArray(parsed.components)
        ? parsed.components
        : []
      return typeof parsed.bomFormat === 'string' && components.length > 0
    } catch {
      return false
    }
  }
  return undefined
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      root: { type: 'string', default: process.cwd() },
      repository: { type: 'string' },
      version: { type: 'string' },
      'tag-ref': { type: 'string' },
      'workflow-sha': { type: 'string' },
      'ui-commit': { type: 'string' },
      /*
       * Declares that the pairing record is a bootstrap record: a new version
       * line's first release, published with no UI pair. Passed by the
       * workflow only when the record says so; never inferred from a missing
       * `--ui-commit`, because "the flag was forgotten" and "this is a
       * bootstrap" must not look the same.
       */
      bootstrap: { type: 'boolean', default: false },
      'ui-version': { type: 'string' },
      'dist-tag': { type: 'string' },
      'bundle-report': { type: 'string' },
      /*
       * Opt-in because the SBOM is produced by the release precheck, which
       * runs before this step. Requiring it unconditionally would make the
       * CLI unusable for a dry run, and defaulting it to `true` would claim a
       * document had been checked when none was read.
       */
      'require-sbom': { type: 'boolean', default: false },
      /** The pairing record, whose `firstPublish` list is read here. */
      'pairing-record': { type: 'string' },
      out: {
        type: 'string',
        default: 'temp/release/release-authorization.json',
      },
    },
  })
  if (!values.version || !values.repository) {
    console.error(
      'usage: tsx scripts/release/authorize-release.ts --version <v> --repository <owner/name> [--tag-ref refs/tags/v…] [--ui-commit sha] [--ui-version v]',
    )
    process.exitCode = 2
    return
  }

  const root = path.resolve(values.root!)
  const checkoutSha = execFileSync('git', ['rev-parse', 'HEAD'], {
    cwd: root,
    encoding: 'utf8',
  }).trim()

  /*
   * Tarball and SBOM verdicts come from the artifacts other steps produced.
   * A missing report is `undefined`, which the policy refuses — never a
   * default of "fine".
   */
  let tarballOk: boolean | undefined
  if (values['bundle-report'] && fs.existsSync(values['bundle-report'])) {
    try {
      const report = JSON.parse(
        fs.readFileSync(values['bundle-report'], 'utf8'),
      ) as { ok?: unknown }
      tarballOk = report.ok === true
    } catch {
      tarballOk = undefined
    }
  }

  const uiVersions: Record<string, string> =
    values['ui-version'] !== undefined
      ? { '@zeus-web/(root)': values['ui-version'] }
      : {}

  const registry = await readRegistryState(values.version)

  /*
   * The pairing record carries the accepted first publications. Read from the
   * tagged commit's own file, so accepting the risk was reviewed in the PR
   * that added it.
   *
   * A missing or malformed record is `[]`, which refuses — never "accept
   * everything". The record is the only place this list may come from, so a
   * broken one must not silently widen the grant.
   */
  let acknowledgedFirstPublish: string[] = []
  let pairingProblem: string | undefined
  if (values['pairing-record'] === undefined) {
    /*
     * Not passing the flag at all is a wiring bug rather than a maintainer
     * decision, and it is indistinguishable from "nothing accepted". It is
     * reported so the failure names the cause instead of telling the
     * maintainer to add names to a file nobody read.
     */
    pairingProblem = 'no --pairing-record was passed'
  } else if (!fs.existsSync(values['pairing-record'])) {
    pairingProblem = `${values['pairing-record']} does not exist`
  } else {
    try {
      const record = JSON.parse(
        fs.readFileSync(values['pairing-record'], 'utf8'),
      ) as { firstPublish?: unknown }
      if (record.firstPublish !== undefined) {
        if (
          !Array.isArray(record.firstPublish) ||
          record.firstPublish.some(entry => typeof entry !== 'string')
        ) {
          pairingProblem = 'firstPublish is not an array of package names'
        } else {
          /*
           * Only packages this repository actually publishes.
           *
           * Without this, the acknowledgement list is a place to name
           * anything — including a package that does not exist, which would
           * make an exhausted list look satisfied while the real first
           * publication went unacknowledged. A name outside the published set
           * is a typo or an attempt, and both should fail.
           */
          const published = new Set([
            ...zeusFixedPackages,
            '@zeus-js/vite-plugin',
          ])
          const unknown = record.firstPublish.filter(
            entry => !published.has(entry),
          )
          if (unknown.length > 0) {
            pairingProblem = `firstPublish names packages this repository does not publish: ${unknown.join(', ')}`
          } else {
            acknowledgedFirstPublish = record.firstPublish
          }
        }
      }
    } catch (error) {
      pairingProblem = error instanceof Error ? error.message : String(error)
    }
  }
  if (pairingProblem !== undefined) {
    console.error(`  note: pairing record: ${pairingProblem}`)
  }

  /*
   * Bootstrap eligibility, computed before the authorisation so the pairing
   * rule can consult it.
   *
   * The record's `bootstrap: true` is a claim that this release *wants* the
   * exception; this decides whether it *gets* it. The inputs are the registry
   * state (already queried above) and whether a pair for this version already
   * exists — never the record itself.
   *
   * `publishedVersions` is `undefined` when the registry is unreachable, and
   * the policy refuses on that rather than assuming first publication.
   */
  const bootstrapRequested = values.bootstrap === true
  let bootstrapFindings: readonly AuthorizationFinding[] | undefined
  let bootstrapEligible: boolean | undefined

  /*
   * Every version of the root package, needed by both the bootstrap check and
   * the recovery evidence. Queried once: two queries could answer differently
   * and the recovery would be judged against a different snapshot than the
   * bootstrap.
   */
  const publishedVersions =
    bootstrapRequested && registry.reachable
      ? await readPublishedVersionsOfPackage(values.version)
      : undefined

  /*
   * Recovery evidence, assembled from GitHub rather than from the record.
   *
   * The record says *which* failed version and run to check; the facts below
   * are read from the API. A record that claims a recovery the API contradicts
   * produces `undefined`, and the eligibility policy then refuses because it
   * cannot establish the premise.
   */
  let recoveryEvidence: RecoveryEvidence | undefined
  const releaseVersion = values.version
  if (bootstrapRequested && releaseVersion !== undefined) {
    const claim = readRecoveryClaim(values['pairing-record'])
    if (claim !== undefined) {
      const gh = (args: readonly string[]): string =>
        execFileSync('gh', args, {
          encoding: 'utf8',
          stdio: ['ignore', 'pipe', 'pipe'],
          timeout: 30_000,
        }) as string
      const failedTagCommit = readRemoteTagCommit(
        values.repository,
        `v${claim.failedVersion}`,
        gh,
      )
      const run = readFailedRun(values.repository, claim.failedRunId, gh)
      if (failedTagCommit !== undefined && run !== undefined) {
        const failedPublished = await readPublishedVersionsOfPackage(
          claim.failedVersion,
        )
        recoveryEvidence = {
          failedVersion: claim.failedVersion,
          failedTagCommit,
          failedRunId: claim.failedRunId,
          failedRunTagCommit: run.tagCommit,
          failedRunReachedPublish: run.reachedPublish,
          /*
           * `undefined` from the query means the registry could not be asked.
           * Treating that as "not published" is the permissive direction, so
           * the policy refuses on an undefined `publishedVersions` instead.
           */
          failedVersionPublished:
            failedPublished === undefined
              ? true
              : failedPublished.includes(claim.failedVersion),
          recoveryVersionPublished:
            registry.collisions.includes(releaseVersion),
          otherPublishedRcs: (publishedVersions ?? []).filter(
            (candidate: string) =>
              candidate !== releaseVersion &&
              candidate.startsWith(
                `${releaseVersion.replace(/-rc\.\d+$/, '')}-`,
              ),
          ),
          failedVersionPaired: attestationExists(claim.failedVersion),
        }
      }
    }
  }

  if (bootstrapRequested) {
    const eligibility = evaluateBootstrapEligibility({
      version: values.version,
      declared: true,
      ...(publishedVersions === undefined ? {} : { publishedVersions }),
      existingAttestation: attestationExists(values.version),
      existingPairInTree: inTreePairNamesUiCommit(values['pairing-record']),
      ...(recoveryEvidence === undefined ? {} : { recovery: recoveryEvidence }),
    })
    bootstrapEligible = eligibility.eligible
    bootstrapFindings = eligibility.findings
  }

  const { result, runs, lookupProblems } = collectReleaseAuthorization({
    root,
    repository: values.repository,
    version: values.version,
    tagRefName: values['tag-ref'],
    workflowSha: values['workflow-sha'],
    checkoutSha,
    uiCommit: values['ui-commit'] ?? '',
    uiVersions,
    bootstrap: values.bootstrap === true,
    ...(bootstrapEligible === undefined ? {} : { bootstrapEligible }),
    ...(bootstrapFindings === undefined ? {} : { bootstrapFindings }),
    distTag: values['dist-tag'],
    sbomOk: values['require-sbom'] ? readSbomOk(root) : undefined,
    tarballOk,
    registryCollisions: registry.collisions,
    registryReachable: registry.reachable,
    firstPublishPackages: registry.firstPublish,
    acknowledgedFirstPublish,
    /*
     * Read live: `GITHUB_SHA` is frozen at run start, so a tag moved during
     * the run leaves every other clause satisfied while the artifact no
     * longer corresponds to the tag.
     */
    currentTagSha:
      values['tag-ref'] !== undefined
        ? readCurrentTagSha(
            values.repository,
            values['tag-ref'].replace(/^refs\/tags\//, ''),
          )
        : undefined,
  })

  const record: ReleaseAuthorizationRecord = {
    schema: RELEASE_AUTHORIZATION_SCHEMA,
    policyVersion: result.policyVersion,
    repository: values.repository,
    tag: values['tag-ref'],
    version: values.version,
    tagTarget: values['workflow-sha'],
    checkoutSha,
    uiCommit: values['ui-commit'] ?? '',
    supportingRuns: runs,
    distTag: values['dist-tag'],
    verdict: result.verdict,
    findings: result.findings,
    generatedAt: new Date().toISOString(),
  }
  const outFile = path.resolve(root, values.out!)
  fs.mkdirSync(path.dirname(outFile), { recursive: true })
  fs.writeFileSync(outFile, `${JSON.stringify(record, null, 2)}\n`)

  console.log(
    `release authorization (${result.policyVersion}): ${result.verdict}`,
  )
  for (const entry of result.findings) {
    const mark =
      entry.verdict === 'REFUSED'
        ? 'REFUSED'
        : entry.verdict === 'POLICY_LIMITATION'
          ? 'LIMIT  '
          : 'ok     '
    console.log(`  ${mark} ${entry.rule}: ${entry.detail}`)
  }
  for (const problem of lookupProblems) {
    console.error(`  note: ${problem}`)
  }

  /*
   * `POLICY_LIMITATION` alone does not block: the one rule that produces it is
   * tag immutability, which is repository configuration no workflow token can
   * read. Every other rule is either AUTHORIZED or REFUSED, and a refusal
   * blocks.
   */
  /*
   * `tag-unmoved` is a limitation when the tag could not be re-read, and that
   * is not the same as "the tag is fine". A tag moved during the run leaves
   * every other clause satisfied while the artifact stops matching the tag —
   * so an unverified answer to this rule must block, even though the rule
   * itself cannot return REFUSED on a failed read.
   *
   * `tag-immutability` is different: it can never be verified from here, and
   * blocking on it would stop every release forever. The distinction is
   * "could not read this time" versus "this code can never read it".
   */
  const blockingLimitation = result.findings.some(
    entry =>
      entry.verdict === 'POLICY_LIMITATION' &&
      entry.rule === AUTHORIZATION_RULES.tagUnmoved,
  )
  if (result.verdict === 'REFUSED' || blockingLimitation) {
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
