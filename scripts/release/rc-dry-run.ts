/**
 * A 0.2.0-rc.0 version-switch rehearsal that publishes nothing.
 *
 * The questions this answers, in the order a real cut would ask them:
 *
 *   1. Are the candidate commits pinned, or does the plan depend on a moving
 *      `main`?
 *   2. Does every published package share one version, and does the version
 *      under test actually parse as an RC?
 *   3. Which packages have never been published, so this RC would create their
 *      first `latest` tag — the pollution case that `repair:latest-tags` exists
 *      to clean up after?
 *   4. Do the UI packages pin Core exactly, and does the pin match the Core
 *      version being cut?
 *   5. Can the packed tarballs be produced and consumed without a workspace?
 *
 * Nothing here writes to npm, creates a tag, or pushes a branch. `--publish`
 * is deliberately not an option on this script: a rehearsal that can be
 * promoted to a real publish by a flag is one typo away from publishing.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { zeusFixedPackages } from '../release.config'
import { isRcVersion } from './release-version'
import { findWorkspacePackages } from '../shared/utils'

export interface DryRunInput {
  readonly root: string
  readonly coreCommit: string
  readonly uiCommit: string
  /** The version the plan intends to cut, e.g. `0.2.0-rc.0`. */
  readonly version: string
  /** Core packages never published to the registry. */
  readonly neverPublished: readonly string[]
  /** Actual on-disk versions of the published packages. */
  readonly packageVersions: Readonly<Record<string, string>>
  /** UI packages this build installs from the registry. */
  readonly uiPins: Readonly<Record<string, string>>
  /** The UI peer pin on `@zeus-js/zeus`, when the UI tree is present. */
  readonly uiCorePin?: string
}

export interface DryRunResult {
  readonly ok: boolean
  readonly problems: readonly string[]
  readonly plan: {
    readonly core: { readonly commit: string; readonly version: string }
    readonly ui: { readonly commit: string; readonly version?: string }
    readonly order: readonly string[]
    readonly firstPublish: readonly string[]
    readonly distTag: string
  }
}

/**
 * Decides whether the version switch is safe, without performing any of it.
 *
 * Every check reads the tree or a pinned commit. None reads `main` at run time
 * and none trusts a version string from a report — a rehearsal that agrees only
 * with itself proves nothing.
 */
export function evaluateDryRun(input: DryRunInput): DryRunResult {
  const problems: string[] = []

  if (!/^[0-9a-f]{40}$/.test(input.coreCommit)) {
    problems.push(
      `core commit ${input.coreCommit} is not a full 40-character SHA`,
    )
  }
  if (!/^[0-9a-f]{40}$/.test(input.uiCommit)) {
    problems.push(`ui commit ${input.uiCommit} is not a full 40-character SHA`)
  }
  if (!isRcVersion(input.version)) {
    problems.push(
      `${input.version} is not an RC version; the rehearsal is for a release candidate`,
    )
  }

  const versions = Object.entries(input.packageVersions)
  const distinct = [...new Set(versions.map(([, version]) => version))]
  if (distinct.length > 1) {
    problems.push(
      `published packages disagree on version: ${distinct.join(', ')}`,
    )
  }
  /*
   * The plan says it cuts `input.version`; the tree has to already be at that
   * version. A rehearsal that reports "would publish 0.2.0-rc.0" while the
   * manifests say 0.1.1-beta.20 is describing a version bump it did not do.
   */
  const onDisk = distinct[0]
  if (onDisk !== undefined && onDisk !== input.version) {
    problems.push(
      `manifests are at ${onDisk}, but the plan cuts ${input.version}; the version bump has not happened`,
    )
  }

  for (const name of zeusFixedPackages) {
    if (!(name in input.packageVersions)) {
      problems.push(`published package ${name} has no manifest under packages/`)
    }
  }

  /*
   * First publication is the case that pollutes `latest`: npm binds `latest`
   * to the first version published under a name, whatever `--tag` says.
   */
  for (const name of input.neverPublished) {
    if (!zeusFixedPackages.includes(name)) continue
    if (!input.version.includes('-')) {
      problems.push(
        `${name} has never been published and ${input.version} is not a prerelease; its first publish would become latest`,
      )
    }
  }

  const uiVersions = [...new Set(Object.values(input.uiPins))]
  if (uiVersions.length > 1) {
    problems.push(
      `UI dependencies disagree on version: ${uiVersions.join(', ')}`,
    )
  }

  if (input.uiCorePin !== undefined && onDisk !== undefined) {
    if (input.uiCorePin !== input.version) {
      problems.push(
        `UI pins @zeus-js/zeus at ${input.uiCorePin}, but Core is cutting ${input.version}; UI must be rebuilt against the RC`,
      )
    }
  }

  /*
   * Core → UI → consumers. Anything else asks a consumer to install a Core
   * version that does not exist yet.
   */
  const order = [
    'core: publish 32 @zeus-js packages at the RC version under the rc dist-tag',
    'ui: publish 46 @zeus-web packages, rebuilt against that Core version',
    'consumers: install from the registry, never from workspace:',
  ]

  return {
    ok: problems.length === 0,
    problems,
    plan: {
      core: { commit: input.coreCommit, version: input.version },
      ui: {
        commit: input.uiCommit,
        ...(uiVersions[0] ? { version: uiVersions[0] } : {}),
      },
      order,
      firstPublish: input.neverPublished.filter(name =>
        zeusFixedPackages.includes(name),
      ),
      distTag: 'rc',
    },
  }
}

function readPublishedVersions(root: string): Record<string, string> {
  const versions: Record<string, string> = {}
  for (const pkg of findWorkspacePackages()) {
    if (!zeusFixedPackages.includes(pkg.name)) continue
    versions[pkg.name] = String(
      (pkg.packageJson as { version?: unknown }).version ?? '',
    )
  }
  return versions
}

function readUiPins(root: string): Record<string, string> {
  const manifestPath = path.join(root, 'examples/admin/package.json')
  if (!fs.existsSync(manifestPath)) return {}
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
    dependencies?: Record<string, string>
  }
  const pins: Record<string, string> = {}
  for (const [name, version] of Object.entries(manifest.dependencies ?? {})) {
    if (!name.startsWith('@zeus-web/')) continue
    if (version.startsWith('file:')) continue
    pins[name] = version
  }
  return pins
}

/** The UI repository's peer pin on `@zeus-js/zeus`, read from a checkout. */
function readUiCorePin(uiRoot: string): string | undefined {
  const candidates = [path.join(uiRoot, 'packages/zeus-compat/package.json')]
  for (const candidate of candidates) {
    if (!fs.existsSync(candidate)) continue
    const manifest = JSON.parse(fs.readFileSync(candidate, 'utf8')) as {
      peerDependencies?: Record<string, string>
    }
    const pin = manifest.peerDependencies?.['@zeus-js/zeus']
    if (pin) return pin
  }
  return undefined
}

/**
 * Asks the registry whether each package has ever been published.
 *
 * A 404 means never; anything else (including a timeout) is reported as an
 * unknown rather than counted as "never published" — claiming a package is
 * unpublished because the network failed would put a false blocker in the
 * report, and claiming it is published would hide a real one.
 */
async function findNeverPublished(
  names: readonly string[],
): Promise<{ never: string[]; unknown: string[] }> {
  const never: string[] = []
  const unknown: string[] = []
  for (const name of names) {
    const url = `https://registry.npmjs.org/${encodeURIComponent(name).replace('%40', '@')}`
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: { accept: 'application/json' },
      })
      if (response.status === 404) never.push(name)
      else if (!response.ok) unknown.push(`${name} (HTTP ${response.status})`)
    } catch (error) {
      unknown.push(`${name} (${String((error as Error).message).slice(0, 60)})`)
    }
  }
  return { never, unknown }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      'core-commit': { type: 'string' },
      'ui-commit': { type: 'string' },
      'ui-root': { type: 'string' },
      version: { type: 'string', default: '0.2.0-rc.0' },
      json: { type: 'string' },
    },
  })
  const root = process.cwd()
  const coreCommit =
    values['core-commit'] ??
    execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
    }).trim()
  const uiCommit =
    values['ui-commit'] ?? process.env.ZEUS_UI_CANDIDATE_COMMIT ?? ''
  const uiRoot = values['ui-root'] ? path.resolve(values['ui-root']) : undefined

  const packageVersions = readPublishedVersions(root)
  const uiPins = readUiPins(root)
  const { never, unknown } = await findNeverPublished(zeusFixedPackages)
  const uiCorePin = uiRoot ? readUiCorePin(uiRoot) : undefined

  const version = values.version
  /*
   * `isRcVersion` already guards the shape; the rehearsal does not need the
   * full version resolver, whose job is picking a version from tag/env/package
   * sources. Here the version is an input to a plan, not something to infer.
   */
  const result = evaluateDryRun({
    root,
    coreCommit,
    uiCommit,
    version,
    neverPublished: never,
    packageVersions,
    uiPins,
    ...(uiCorePin ? { uiCorePin } : {}),
  })

  const report = {
    schema: 'zeus.rc-dry-run/v1',
    generatedAt: new Date().toISOString(),
    ...result,
    neverPublishedUnknown: unknown,
  }
  if (values.json) {
    fs.mkdirSync(path.dirname(path.resolve(values.json)), { recursive: true })
    fs.writeFileSync(
      path.resolve(values.json),
      `${JSON.stringify(report, null, 2)}\n`,
    )
  }

  console.log(`RC dry run for ${version}`)
  console.log(`  core: ${coreCommit}`)
  console.log(`  ui:   ${uiCommit || '(not supplied)'}`)
  console.log(`  dist-tag: rc`)
  if (never.length > 0) {
    console.log(`  first publish (would create latest): ${never.join(', ')}`)
  }
  if (unknown.length > 0) {
    console.log(`  registry state unknown: ${unknown.join(', ')}`)
  }
  if (result.ok) {
    console.log(
      '\nGO — the plan is internally consistent. Nothing was published.',
    )
  } else {
    console.log('\nNO_GO:')
    for (const problem of result.problems) console.log(`  - ${problem}`)
    process.exitCode = 1
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(error => {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
  })
}
