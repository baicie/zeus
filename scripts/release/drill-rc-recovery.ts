#!/usr/bin/env tsx
/**
 * Drills the rc.1 recovery path against an isolated registry.
 *
 * ## What this proves
 *
 * That publishing `rc.1` after a failed `rc.0` leaves the registry in the state
 * the release expects: every fixed package present at the new version, exactly
 * the approved first publications with `latest` pointing at the RC, and every
 * other package's `latest` untouched.
 *
 * ## What this does not prove
 *
 * Anything about npmjs. The output says `source: 'local-simulation'` and
 * `productionPublished: false`. A pass here is evidence that the logic works
 * against a registry that behaves like the real one for these operations — it
 * is not evidence that a production release succeeded.
 *
 * ## Why it seeds a baseline first
 *
 * An empty registry makes *every* package a first publication, because npm
 * binds `latest` to the first publish of a package regardless of `--tag`.
 * Publishing 32 RCs there produces 32 polluted `latest` tags, which looks far
 * worse than reality and is the wrong thing to reason about. The real registry
 * has 29 packages already published, so this publishes a stable baseline first.
 *
 * ## Usage
 *
 *   tsx scripts/release/drill-rc-recovery.ts \
 *     --registry http://127.0.0.1:4874 \
 *     --version 0.2.0-rc.1 \
 *     --pairing-record release-pairing/v0.2.0-rc.1.json \
 *     [--skip-publish] \
 *     --out temp/release/rc-recovery-drill.json
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import {
  evaluateLatestPolicy,
  readApprovedFirstPublish,
  readLatestTag,
} from './check-latest-tags'
import { buildPublishManifest, distTagForVersion } from './publish-manifest'

export const DRILL_SCHEMA = 'zeus.rc-recovery-drill/v1'

export interface DrillStep {
  readonly step: string
  readonly ok: boolean
  readonly detail: string
}

export interface DrillReport {
  readonly schema: typeof DRILL_SCHEMA
  readonly registry: string
  readonly version: string
  readonly recoveredVersion: string | null
  readonly steps: readonly DrillStep[]
  readonly source: 'local-simulation'
  readonly productionPublished: false
  readonly registryState: {
    readonly present: number
    readonly total: number
    readonly latestAtRecovery: readonly string[]
    readonly latestAtStable: readonly string[]
  }
}

/** The failed version a recovery record names, or null for an ordinary first RC. */
export function recoverOf(recordFile: string | undefined): string | null {
  if (recordFile === undefined || !fs.existsSync(recordFile)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(recordFile, 'utf8')) as {
      recovery?: { failedVersion?: unknown }
    }
    return typeof parsed.recovery?.failedVersion === 'string'
      ? parsed.recovery.failedVersion
      : null
  } catch {
    return null
  }
}

function publishTarball(
  directory: string,
  registry: string,
  tag: string,
): { ok: boolean; detail: string } {
  try {
    execFileSync(
      'pnpm',
      [
        'publish',
        '--no-git-checks',
        '--access',
        'public',
        '--tag',
        tag,
        '--registry',
        registry,
        '--provenance=false',
      ],
      { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'], timeout: 300_000 },
    )
    return { ok: true, detail: 'published' }
  } catch (error) {
    const failure = error as { stdout?: string; stderr?: string }
    return {
      ok: false,
      detail: `${failure.stdout ?? ''}${failure.stderr ?? ''}`.slice(-300),
    }
  }
}

async function latestOf(
  name: string,
  registry: string,
): Promise<string | undefined> {
  const state = await readLatestTag(name, { registry })
  if (
    state.status === 'LATEST_STABLE' ||
    state.status === 'LATEST_PRERELEASE'
  ) {
    return state.version
  }
  return undefined
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      root: { type: 'string', default: process.cwd() },
      registry: { type: 'string', default: 'http://127.0.0.1:4874' },
      version: { type: 'string', required: true },
      'pairing-record': { type: 'string' },
      'skip-publish': { type: 'boolean', default: false },
      out: { type: 'string', default: 'temp/release/rc-recovery-drill.json' },
    },
  })

  const root = path.resolve(values.root!)
  const registry = values.registry!
  const version = values.version!
  const steps: DrillStep[] = []
  const record = (step: string, ok: boolean, detail: string): void => {
    steps.push({ step, ok, detail })
  }

  const recovered = recoverOf(values['pairing-record'])
  record(
    'recovery-claim',
    true,
    recovered === null
      ? 'no recovery block; this is an ordinary first RC'
      : `recovers ${recovered}`,
  )

  const manifest = buildPublishManifest({
    root,
    version,
    distTag: distTagForVersion(version),
    ...(values['pairing-record'] !== undefined
      ? { firstPublish: readApprovedFirstPublish(values['pairing-record']) }
      : {}),
  })
  record(
    'manifest',
    manifest.problems.length === 0,
    manifest.problems.length === 0
      ? `${manifest.counts.publishable} publishable, ${manifest.counts.firstPublish} first publication(s)`
      : manifest.problems.join('; '),
  )

  if (!values['skip-publish']) {
    let published = 0
    const failures: string[] = []
    for (const entry of manifest.packages) {
      if (!entry.publishable) continue
      const result = publishTarball(
        path.join(root, entry.path),
        registry,
        distTagForVersion(version),
      )
      if (result.ok) published += 1
      else failures.push(`${entry.name}: ${result.detail}`)
    }
    record(
      'publish',
      failures.length === 0,
      failures.length === 0
        ? `published ${published} package(s)`
        : `${failures.length} failed: ${failures[0]}`,
    )
  } else {
    record('publish', true, 'skipped (--skip-publish)')
  }

  /*
   * Read the registry back and compare against what the policy expects.
   */
  const approved = readApprovedFirstPublish(values['pairing-record'])
  const records = []
  let present = 0
  const latestAtRecovery: string[] = []
  const latestAtStable: string[] = []
  for (const entry of manifest.packages) {
    if (!entry.publishable) continue
    const state = await readLatestTag(entry.name, { registry })
    records.push({ name: entry.name, state })
    const latest = await latestOf(entry.name, registry)
    if (latest === undefined) continue
    present += 1
    if (latest === version) latestAtRecovery.push(entry.name)
    else latestAtStable.push(entry.name)
  }

  record(
    'registry-present',
    present === manifest.counts.publishable,
    `${present} of ${manifest.counts.publishable} present`,
  )

  const policy = evaluateLatestPolicy({
    records,
    version,
    approvedFirstPublish: approved,
  })
  record(
    'latest-policy',
    policy.verdict === 'PASS' || policy.verdict === 'ACCEPTED_DEVIATION',
    `${policy.verdict} (${policy.acceptedDeviation.length} accepted, ${policy.refused.length} refused, ${policy.unknown.length} unknown)`,
  )

  /*
   * The deviation must be exactly the approved set. An approved package that
   * did not land as a deviation means the approval described something that
   * did not happen, and an unapproved one means the registry moved under us.
   */
  const accepted = new Set(policy.acceptedDeviation)
  const missing = approved.filter(name => !accepted.has(name))
  const extra = [...accepted].filter(name => !approved.includes(name))
  record(
    'first-publish-deviation',
    missing.length === 0 && extra.length === 0,
    missing.length === 0 && extra.length === 0
      ? `exactly the ${approved.length} approved package(s) deviate`
      : `missing: ${missing.join(', ') || '(none)'}; unexpected: ${extra.join(', ') || '(none)'}`,
  )

  const report: DrillReport = {
    schema: DRILL_SCHEMA,
    registry,
    version,
    recoveredVersion: recovered,
    steps,
    source: 'local-simulation',
    productionPublished: false,
    registryState: {
      present,
      total: manifest.counts.publishable,
      latestAtRecovery,
      latestAtStable,
    },
  }

  const out = path.resolve(values.out!)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)

  console.log('')
  for (const step of steps)
    console.log(`${step.ok ? 'PASS' : 'FAIL'} ${step.step}: ${step.detail}`)
  console.log('')
  console.log(
    `latest at ${version}: ${latestAtRecovery.length} | at a stable version: ${latestAtStable.length}`,
  )
  const failed = steps.filter(step => !step.ok)
  console.log('')
  console.log(
    `drill ${failed.length === 0 ? 'PASS' : 'FAIL'} — local registry only, nothing published to npmjs`,
  )
  if (failed.length > 0) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
