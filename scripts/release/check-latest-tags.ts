/**
 * RC dist-tag policy. A release candidate must not inherit a `latest` tag that
 * points at a prerelease. Stable releases keep `latest` on the newest stable
 * version; RC prechecks fail until the polluted tags are explicitly repaired.
 *
 * Registry reads have explicit states:
 *
 * - `LATEST_ABSENT` only for an explicit 404 / empty tag response;
 * - `LATEST_STABLE` / `LATEST_PRERELEASE` for a value;
 * - `REGISTRY_QUERY_FAILED` for timeouts, 5xx, DNS, auth and unparsable data.
 *
 * A query failure is never treated as "no latest tag"; it blocks the release.
 */
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { zeusFixedPackages } from '../release.config'
import {
  DEFAULT_ATTEMPTS,
  queryNpmJson,
  type NpmRunner,
  type QueryOptions,
} from './npm-registry'
import {
  normalizeVersion,
  resolveReleaseVersion,
  type ResolvedReleaseVersion,
} from './release-version'
import { findWorkspacePackages } from '../shared/utils'

export type LatestTagState =
  | { readonly status: 'LATEST_ABSENT' }
  | { readonly status: 'LATEST_STABLE'; readonly version: string }
  | { readonly status: 'LATEST_PRERELEASE'; readonly version: string }
  | { readonly status: 'REGISTRY_QUERY_FAILED'; readonly error: string }

export interface LatestTagRecord {
  readonly name: string
  readonly state: LatestTagState
}

/**
 * The post-publish verdict for one release.
 *
 * These are four different facts and a caller must not read one as another:
 *
 * - `PASS` — every package's `latest` is compliant.
 * - `ACCEPTED_DEVIATION` — the only non-compliant packages are ones the
 *   immutable pairing record listed as first publications, and their `latest`
 *   points at exactly this release. npm binds `latest` to a first publish
 *   regardless of `--tag`, so this is the expected end state of a first
 *   publication, not a failure. It is **not** compliance: the tag is wrong and
 *   `repair:latest-tags` is the follow-up.
 * - `REFUSED` — something is wrong that no record authorises.
 * - `UNKNOWN` — the registry could not be read, so nothing was established.
 *
 * Kept separate from `LatestTagEvaluation` because the release workflow needs
 * to distinguish "published correctly, `latest` needs repair" from "this
 * release is broken", and an exit code cannot say that.
 */
export type LatestVerdict =
  | 'PASS'
  | 'ACCEPTED_DEVIATION'
  | 'REFUSED'
  | 'UNKNOWN'

/** One package's verdict, with the basis for it recorded. */
export interface LatestDecision {
  readonly name: string
  readonly state: LatestTagState
  /** `compliant`, `accepted`, or the reason it was refused. */
  readonly outcome: 'compliant' | 'accepted' | 'refused'
  /** Whether the pairing record named this package as a first publication. */
  readonly firstPublish: boolean
  /** Why this package got this outcome, in a form an audit can read. */
  readonly basis: string
}

export interface LatestPolicyResult {
  readonly verdict: LatestVerdict
  readonly decisions: readonly LatestDecision[]
  /** Packages whose `latest` is wrong but approved. */
  readonly acceptedDeviation: readonly string[]
  /** Packages that make the release fail. */
  readonly refused: readonly string[]
  /** Packages the registry could not answer for. */
  readonly unknown: readonly string[]
}

export interface LatestPolicyInput {
  readonly records: readonly LatestTagRecord[]
  /** The version this release published. */
  readonly version: string
  /** Package names the pairing record approved for a first publication. */
  readonly approvedFirstPublish: readonly string[]
}

/**
 * Decides whether the post-publish `latest` state blocks the release.
 *
 * The rule that matters: an approved first publication is accepted **only
 * when its `latest` points at exactly this release's version**. A package on
 * the approval list whose `latest` points somewhere else is a refusal, because
 * "approved for first publication" says nothing about a tag that moved later.
 */
export function evaluateLatestPolicy(
  input: LatestPolicyInput,
): LatestPolicyResult {
  const decisions: LatestDecision[] = []
  const acceptedDeviation: string[] = []
  const refused: string[] = []
  const unknown: string[] = []
  const approved = new Set(input.approvedFirstPublish)

  for (const record of input.records) {
    const isApproved = approved.has(record.name)
    const decision = (outcome: LatestDecision['outcome'], basis: string) => {
      decisions.push({
        name: record.name,
        state: record.state,
        outcome,
        firstPublish: isApproved,
        basis,
      })
    }

    switch (record.state.status) {
      case 'LATEST_STABLE':
        decision('compliant', `latest is ${record.state.version}`)
        break

      case 'LATEST_ABSENT':
        decision(
          'compliant',
          'no latest tag, which is correct for a first publication',
        )
        break

      case 'REGISTRY_QUERY_FAILED':
        /*
         * Never a pass and never an absence. The state of this package's
         * `latest` was not established, and the release must say so.
         */
        unknown.push(record.name)
        decision('refused', `registry query failed: ${record.state.error}`)
        break

      case 'LATEST_PRERELEASE': {
        /*
         * The only acceptable prerelease `latest` is one this release created
         * by publishing a package for the first time — and only for a package
         * the pairing record approved in advance.
         *
         * Both halves are required. Approving a package does not approve an
         * arbitrary version, and a matching version does not approve a package
         * nobody listed.
         */
        const pointsAtThisRelease = record.state.version === input.version
        if (isApproved && pointsAtThisRelease) {
          acceptedDeviation.push(record.name)
          decision(
            'accepted',
            `first publication approved by the pairing record; npm bound latest to ${record.state.version} and repair:latest-tags must follow`,
          )
        } else if (isApproved) {
          refused.push(record.name)
          decision(
            'refused',
            `approved as a first publication, but latest points at ${record.state.version}, not at this release ${input.version}`,
          )
        } else {
          refused.push(record.name)
          decision(
            'refused',
            `latest points at prerelease ${record.state.version} and the pairing record did not approve this package`,
          )
        }
        break
      }
    }
  }

  const verdict: LatestVerdict =
    unknown.length > 0
      ? 'UNKNOWN'
      : refused.length > 0
        ? 'REFUSED'
        : acceptedDeviation.length > 0
          ? 'ACCEPTED_DEVIATION'
          : 'PASS'

  return { verdict, decisions, acceptedDeviation, refused, unknown }
}

/** Whether a verdict lets the release continue to smoke and GitHub Release. */
export function verdictBlocksRelease(verdict: LatestVerdict): boolean {
  /*
   * `ACCEPTED_DEVIATION` continues deliberately: the packages were published
   * correctly and the tag deviation is recorded and repairable. The other
   * three stop the release — `PASS` because it does not block, `REFUSED`
   * because something unauthorised is wrong, `UNKNOWN` because nothing was
   * established. Making this an explicit function keeps the workflow from
   * encoding the list of non-blocking verdicts in shell.
   */
  return verdict === 'REFUSED' || verdict === 'UNKNOWN'
}

export interface LatestTagEvaluation {
  readonly errors: readonly string[]
  readonly failures: readonly string[]
  readonly absent: readonly string[]
  readonly stable: readonly string[]
  readonly prerelease: readonly string[]
}

export function classifyLatestTag(
  version: string | undefined | null,
): LatestTagState {
  if (version === undefined || version === null || version === '') {
    return { status: 'LATEST_ABSENT' }
  }
  if (typeof version !== 'string') {
    return {
      status: 'REGISTRY_QUERY_FAILED',
      error: 'dist-tag value is not a string',
    }
  }
  return version.includes('-')
    ? { status: 'LATEST_PRERELEASE', version }
    : { status: 'LATEST_STABLE', version }
}

export function evaluateLatestTags(
  records: readonly LatestTagRecord[],
): LatestTagEvaluation {
  const errors: string[] = []
  const failures: string[] = []
  const absent: string[] = []
  const stable: string[] = []
  const prerelease: string[] = []
  for (const record of records) {
    switch (record.state.status) {
      case 'LATEST_PRERELEASE':
        prerelease.push(record.name)
        errors.push(
          `${record.name}: latest points at prerelease ${record.state.version}; run pnpm repair:latest-tags`,
        )
        break
      case 'REGISTRY_QUERY_FAILED':
        failures.push(record.name)
        errors.push(
          `${record.name}: registry query failed: ${record.state.error}`,
        )
        break
      case 'LATEST_ABSENT':
        absent.push(record.name)
        break
      case 'LATEST_STABLE':
        stable.push(record.name)
        break
    }
  }
  return { errors, failures, absent, stable, prerelease }
}

export interface ReadLatestOptions {
  readonly runner?: NpmRunner
  readonly registry?: string
  readonly attempts?: number
  readonly retryDelayMs?: number
  readonly sleep?: QueryOptions['sleep']
}

export async function readLatestTag(
  name: string,
  options: ReadLatestOptions = {},
): Promise<LatestTagState> {
  const args = ['view', name, 'dist-tags.latest', '--json']
  if (options.registry) args.push('--registry', options.registry)
  const result = await queryNpmJson<unknown>(args, {
    ...(options.runner ? { runner: options.runner } : {}),
    attempts: options.attempts ?? DEFAULT_ATTEMPTS,
    ...(options.retryDelayMs !== undefined
      ? { retryDelayMs: options.retryDelayMs }
      : {}),
    ...(options.sleep ? { sleep: options.sleep } : {}),
  })
  if (result.status === 'not-found') {
    return { status: 'LATEST_ABSENT' }
  }
  if (result.status === 'failed') {
    return { status: 'REGISTRY_QUERY_FAILED', error: result.message }
  }
  const value = result.value
  if (value === null || value === undefined || value === '') {
    return { status: 'LATEST_ABSENT' }
  }
  return classifyLatestTag(String(value))
}

export interface LatestTagReport {
  readonly schema: 'zeus.latest-tags/v2'
  readonly version: string
  readonly rc: boolean
  readonly packages: readonly LatestTagRecord[]
  readonly evaluation: LatestTagEvaluation
  readonly passed: boolean
  readonly warnings: readonly string[]
  readonly versionSources: Readonly<Record<string, string | undefined>>
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      force: { type: 'boolean', default: false },
      version: { type: 'string' },
      ref: { type: 'string' },
      registry: { type: 'string' },
      attempts: { type: 'string' },
      out: { type: 'string', default: 'temp/release/latest-tags.json' },
      /*
       * The immutable pairing record for this version. Its `firstPublish` is
       * the only source of approval for a prerelease `latest`; there is
       * deliberately no flag that names packages directly, because a flag can
       * be typed at 3am and a committed record was reviewed.
       */
      'pairing-record': { type: 'string' },
      'policy-out': {
        type: 'string',
        default: 'temp/release/latest-policy.json',
      },
    },
  })

  const resolved = resolveVersion(values.version, values.ref)
  for (const warning of resolved.warnings) console.warn(`WARNING ${warning}`)
  if (resolved.errors.length > 0) {
    for (const error of resolved.errors) console.error(`BLOCKER ${error}`)
    process.exitCode = 1
    return
  }
  const version = resolved.version!
  if (process.env.ZEUS_RELEASE_CHANNEL === 'rc' && !resolved.rc) {
    console.error(
      `BLOCKER RC release channel requires an RC version, got ${version}`,
    )
    process.exitCode = 1
    return
  }
  if (!resolved.rc && values.force !== true) {
    console.log(`latest-tag policy skipped for non-RC version ${version}`)
    return
  }

  const records: LatestTagRecord[] = []
  for (const name of zeusFixedPackages) {
    records.push({
      name,
      state: await readLatestTag(name, {
        ...(values.registry ? { registry: values.registry } : {}),
        ...(values.attempts ? { attempts: Number(values.attempts) } : {}),
      }),
    })
  }
  const evaluation = evaluateLatestTags(records)
  /*
   * What the immutable pairing record approved in advance.
   *
   * Read from the same file the release authorised against, so the set of
   * packages whose first publication is tolerated cannot be widened by a flag
   * at check time. A missing or unreadable record yields `[]`, which refuses
   * every prerelease `latest` — the permissive direction would be to treat an
   * unreadable record as "nothing to worry about".
   */
  const approvedFirstPublish = readApprovedFirstPublish(
    values['pairing-record'],
  )
  const policy = evaluateLatestPolicy({
    records,
    version,
    approvedFirstPublish,
  })
  const report: LatestTagReport = {
    schema: 'zeus.latest-tags/v2',
    version,
    rc: resolved.rc,
    packages: records,
    evaluation,
    passed: evaluation.errors.length === 0,
    warnings: resolved.warnings,
    versionSources: resolved.sources,
  }
  const output = path.resolve(values.out!)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)

  const policyOutput = path.resolve(values['policy-out']!)
  fs.mkdirSync(path.dirname(policyOutput), { recursive: true })
  fs.writeFileSync(
    policyOutput,
    `${JSON.stringify(
      {
        schema: 'zeus.latest-policy/v1',
        version,
        verdict: policy.verdict,
        approvedFirstPublish,
        acceptedDeviation: policy.acceptedDeviation,
        refused: policy.refused,
        unknown: policy.unknown,
        blocksRelease: verdictBlocksRelease(policy.verdict),
        decisions: policy.decisions,
      },
      null,
      2,
    )}\n`,
  )

  for (const record of records) {
    const suffix =
      record.state.status === 'LATEST_STABLE' ||
      record.state.status === 'LATEST_PRERELEASE'
        ? ` ${record.state.version}`
        : record.state.status === 'REGISTRY_QUERY_FAILED'
          ? ` ${record.state.error}`
          : ''
    console.log(`${record.name}: ${record.state.status}${suffix}`)
  }
  for (const error of evaluation.errors) console.error(`BLOCKER ${error}`)
  console.log(
    `latest-tag policy ${evaluation.errors.length === 0 ? 'PASS' : 'FAIL'}: ${records.length} packages (${evaluation.stable.length} stable, ${evaluation.prerelease.length} prerelease, ${evaluation.absent.length} absent, ${evaluation.failures.length} failed)`,
  )

  /*
   * The verdict is what decides the exit code, not the raw error count.
   *
   * An accepted deviation has errors — that is the whole point — but the
   * packages were published correctly and the deviation is recorded, so
   * stopping the release there would block the smoke and the GitHub Release
   * for a state the maintainer approved in advance.
   */
  console.log(
    `latest policy: ${policy.verdict} (${policy.acceptedDeviation.length} accepted, ${policy.refused.length} refused, ${policy.unknown.length} unknown)`,
  )
  for (const decision of policy.decisions) {
    if (decision.outcome === 'compliant') continue
    console.log(
      `  ${decision.outcome.toUpperCase} ${decision.name}: ${decision.basis}`,
    )
  }
  if (verdictBlocksRelease(policy.verdict)) process.exitCode = 1
}

/**
 * The package names a pairing record approved for a first publication.
 *
 * `[]` for a missing, unreadable or malformed record. That direction is
 * deliberate: returning the list from a file nobody could parse would authorise
 * exactly the packages an attacker would want authorised.
 */
export function readApprovedFirstPublish(file: string | undefined): string[] {
  if (file === undefined || !fs.existsSync(file)) return []
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      firstPublish?: unknown
    }
    if (!Array.isArray(parsed.firstPublish)) return []
    return parsed.firstPublish.filter(
      (entry): entry is string => typeof entry === 'string',
    )
  } catch {
    return []
  }
}

function resolveVersion(
  explicit: string | undefined,
  ref: string | undefined,
): ResolvedReleaseVersion {
  const zeus = findWorkspacePackages().find(pkg => pkg.name === '@zeus-js/zeus')
  const root = readPackageVersion('package.json')
  return resolveReleaseVersion({
    explicit,
    tag: ref ?? process.env.GITHUB_REF_NAME,
    env: process.env.ZEUS_RELEASE_VERSION,
    zeusPackage:
      typeof zeus?.packageJson.version === 'string'
        ? zeus.packageJson.version
        : undefined,
    rootPackage: root,
  })
}

function readPackageVersion(file: string): string | undefined {
  try {
    const value = JSON.parse(fs.readFileSync(file, 'utf8')) as {
      version?: unknown
    }
    return typeof value.version === 'string'
      ? normalizeVersion(value.version)
      : undefined
  } catch {
    return undefined
  }
}

if (process.argv[1]?.endsWith('check-latest-tags.ts')) {
  void main()
}
