#!/usr/bin/env tsx
/**
 * The full first-release chain, against an isolated registry.
 *
 * ## What this proves and what it does not
 *
 * It publishes the real tarballs of the real publish set to a local Verdaccio,
 * then runs the same policy code the release workflow runs. Nothing here
 * touches npmjs, and a pass here is **not** evidence that the production
 * release will succeed — it is evidence that the logic does, given a registry
 * that behaves like the real one for the operations exercised.
 *
 * ## The failure it exists for
 *
 * npm binds `latest` to a package's first publication regardless of `--tag`.
 * Three approved first publications therefore leave `latest` pointing at the
 * RC, and the workflow's post-publish check used to fail on that — stopping the
 * Node smoke and the GitHub Release for a release that had already published
 * correctly, with a tag that cannot be removed.
 *
 * ## Usage
 *
 *   tsx scripts/release/simulate-first-release.ts \
 *     --registry http://127.0.0.1:4874 \
 *     --version 0.2.0-rc.0 \
 *     --pairing-record release-pairing/v0.2.0-rc.0.json \
 *     --out temp/release/simulation.json
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

export interface StepResult {
  readonly step: string
  readonly ok: boolean
  readonly detail: string
}

export interface SimulationReport {
  readonly schema: 'zeus.first-release-simulation/v1'
  readonly registry: string
  readonly version: string
  readonly steps: readonly StepResult[]
  readonly source: 'local-simulation'
  /** Never true: this script does not publish to npmjs. */
  readonly productionPublished: false
}

function run(
  command: string,
  args: readonly string[],
  cwd: string,
  env: Record<string, string> = {},
): { ok: boolean; output: string } {
  try {
    const output = execFileSync(command, [...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    })
    return { ok: true, output }
  } catch (error) {
    const failure = error as {
      stdout?: string
      stderr?: string
      message?: string
    }
    return {
      ok: false,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}${failure.message ?? ''}`,
    }
  }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      root: { type: 'string', default: process.cwd() },
      registry: { type: 'string', default: 'http://127.0.0.1:4874' },
      version: { type: 'string', required: true },
      'pairing-record': { type: 'string' },
      out: { type: 'string', default: 'temp/release/simulation.json' },
      /*
       * `action: 'append'` collects repeats, and `parseArgs` requires the
       * default to be absent rather than an empty array — an array default is
       * rejected at parse time, not at use.
       */
      tarball: { type: 'string', action: 'append' },
      'skip-publish': { type: 'boolean', default: false },
    },
  })

  const root = path.resolve(values.root!)
  const registry = values.registry!
  const version = values.version!
  const steps: StepResult[] = []
  const record = (step: string, ok: boolean, detail: string): void => {
    steps.push({ step, ok, detail })
  }

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

  /*
   * Publish the real tarballs. `npm publish <file>` is the same code path the
   * release uses for the artifact it built, minus the workspace rewriting —
   * which is why the tarball list is supplied by the caller rather than
   * produced here: `pnpm pack` is not deterministic for workspace packages,
   * and a simulation that repacked would be simulating a different artifact.
   */
  const tarballs = ([] as string[]).concat(values.tarball ?? [])
  if (tarballs.length === 0 && values['skip-publish'] === true) {
    /*
     * Reading a registry that was populated by an earlier step is a legitimate
     * mode: it is how the `latest` verdict gets evaluated against a state that
     * already exists, without republishing versions npm refuses to overwrite.
     * Recorded as a skip rather than a pass, because it proves nothing about
     * the publish step.
     */
    record(
      'publish',
      true,
      'skipped (--skip-publish): evaluating the registry state as already published',
    )
  } else if (tarballs.length === 0) {
    record(
      'publish',
      false,
      'no tarballs supplied; run check:release-artifacts --out first and pass --tarball for each, or use --skip-publish to read an existing registry',
    )
  } else {
    let published = 0
    const failures: string[] = []
    for (const tarball of tarballs) {
      const result = run(
        'npm',
        [
          'publish',
          path.resolve(tarball),
          '--registry',
          registry,
          '--tag',
          distTagForVersion(version),
          '--provenance=false',
        ],
        root,
      )
      if (result.ok) published += 1
      else
        failures.push(
          `${path.basename(tarball)}: ${result.output.slice(0, 200)}`,
        )
    }
    record(
      'publish',
      failures.length === 0,
      failures.length === 0
        ? `published ${published} tarball(s) to ${registry}`
        : `${failures.length} failed: ${failures.slice(0, 3).join(' | ')}`,
    )
  }

  /*
   * Read the published state back and run the same verdict the workflow runs.
   * This is the half the defect lived in.
   */
  const records = []
  for (const entry of manifest.packages) {
    if (!entry.publishable) continue
    records.push({
      name: entry.name,
      state: await readLatestTag(entry.name, { registry }),
    })
  }
  const policy = evaluateLatestPolicy({
    records,
    version,
    approvedFirstPublish: readApprovedFirstPublish(values['pairing-record']),
  })
  record(
    'latest-policy',
    policy.verdict === 'PASS' || policy.verdict === 'ACCEPTED_DEVIATION',
    `${policy.verdict} (${policy.acceptedDeviation.length} accepted, ${policy.refused.length} refused, ${policy.unknown.length} unknown)`,
  )

  /*
   * The three first publications must be exactly the accepted set. If an
   * approved package did not actually land as a deviation, the approval was
   * describing something that did not happen.
   */
  const accepted = new Set(policy.acceptedDeviation)
  const approved = readApprovedFirstPublish(values['pairing-record'])
  const missing = approved.filter(name => !accepted.has(name))
  record(
    'first-publish-deviation',
    missing.length === 0,
    missing.length === 0
      ? `all ${approved.length} approved first publication(s) are ACCEPTED_DEVIATION`
      : `approved but not observed as a deviation: ${missing.join(', ')}`,
  )

  const report: SimulationReport = {
    schema: 'zeus.first-release-simulation/v1',
    registry,
    version,
    steps,
    source: 'local-simulation',
    productionPublished: false,
  }
  const out = path.resolve(values.out!)
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`)

  console.log('')
  for (const step of steps) {
    console.log(`${step.ok ? 'PASS' : 'FAIL'} ${step.step}: ${step.detail}`)
  }
  const failed = steps.filter(step => !step.ok)
  console.log('')
  console.log(
    `simulation ${failed.length === 0 ? 'PASS' : 'FAIL'} — local registry only, nothing published to npmjs`,
  )
  if (failed.length > 0) process.exitCode = 1
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
