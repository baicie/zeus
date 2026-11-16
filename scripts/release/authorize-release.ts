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
import { findSupportingRuns, isAncestorOfMain } from './find-release-evidence'
import {
  RELEASE_AUTHORIZATION_SCHEMA,
  evaluateReleaseAuthorization,
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
  readonly distTag: string | undefined
  readonly sbomOk: boolean | undefined
  readonly tarballOk: boolean | undefined
  readonly registryCollisions: readonly string[]
  readonly registryReachable: boolean
  readonly firstPublishPackages: readonly string[]
  /** Injectable for tests: returns runs for a workflow at a commit. */
  readonly findRuns?: typeof findSupportingRuns
  /** Injectable for tests. */
  readonly ancestorOfMain?: (sha: string) => boolean | undefined
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
    supportingRuns: runs,
    requiredWorkflows: [...REQUIRED_WORKFLOWS],
    sbomOk: input.sbomOk,
    tarballOk: input.tarballOk,
    registryCollisions: input.registryCollisions,
    registryReachable: input.registryReachable,
    firstPublishPackages: input.firstPublishPackages,
    distTag: input.distTag,
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

function main(): void {
  const { values } = parseArgs({
    options: {
      root: { type: 'string', default: process.cwd() },
      repository: { type: 'string' },
      version: { type: 'string' },
      'tag-ref': { type: 'string' },
      'workflow-sha': { type: 'string' },
      'ui-commit': { type: 'string' },
      'ui-version': { type: 'string' },
      'dist-tag': { type: 'string' },
      'bundle-report': { type: 'string' },
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

  const { result, runs, lookupProblems } = collectReleaseAuthorization({
    root,
    repository: values.repository,
    version: values.version,
    tagRefName: values['tag-ref'],
    workflowSha: values['workflow-sha'],
    checkoutSha,
    uiCommit: values['ui-commit'] ?? '',
    uiVersions,
    distTag: values['dist-tag'],
    sbomOk: undefined,
    tarballOk,
    registryCollisions: [],
    registryReachable: false,
    firstPublishPackages: [],
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
  if (result.verdict === 'REFUSED') {
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main()
}
