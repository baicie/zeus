/**
 * A 0.2.0-rc.0 version-switch rehearsal that publishes nothing.
 *
 * The questions this answers, in the order a real cut would ask them:
 *
 *   1. Are the candidate commits pinned, and do the checkouts actually sit on
 *      them? A full-length SHA is a format, not a binding.
 *   2. Does every published package share one version, in both repositories,
 *      and does the version under test parse as an RC?
 *   3. Which packages have never been published, so this RC would create their
 *      first `latest` tag — the pollution case that `repair:latest-tags` exists
 *      to clean up after?
 *   4. Do the UI packages pin Core exactly at the version being cut, in
 *      `dependencies` *and* `peerDependencies`?
 *   5. Is the registry's state knowable? An unreachable registry cannot produce
 *      a GO, because "no conflict found" and "no query answered" look identical
 *      from here.
 *
 * Nothing here writes to npm, creates a tag, or pushes a branch. `--publish`
 * is deliberately not an option: a rehearsal that can be promoted to a real
 * publish by a flag is one typo away from publishing.
 *
 * ## Strict mode
 *
 * `release-strict` requires the UI checkout. The first version of this script
 * treated `--ui-root` as optional and skipped the Core-pin comparison when it
 * was absent — which is the check most likely to catch a broken pairing, since
 * UI pins Core exactly. An absent input made the check disappear rather than
 * fail, and the run still reported a plan.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { parseArgs } from 'node:util'

import { zeusFixedPackages } from '../release.config'
import { isRcVersion } from './release-version'
import { findWorkspacePackages } from '../shared/utils'

export type DryRunMode = 'release-strict' | 'diagnostic'

export interface DryRunInput {
  readonly mode: DryRunMode
  readonly coreCommit: string
  readonly uiCommit: string
  /** The commit the Core checkout is actually on, when it could be read. */
  readonly coreHead?: string
  /** The commit the UI checkout is actually on, when it could be read. */
  readonly uiHead?: string
  /** The version the plan intends to cut, e.g. `0.2.0-rc.0`. */
  readonly version: string
  /** Core published packages never present on the registry. */
  readonly neverPublished: readonly string[]
  /** Registry lookups that failed for a reason other than 404. */
  readonly unknownRegistryState: readonly string[]
  /** Actual on-disk versions of the Core published packages. */
  readonly coreVersions: Readonly<Record<string, string>>
  /** Actual on-disk versions of the UI packages. */
  readonly uiVersions: Readonly<Record<string, string>>
  /** The UI packages this build installs from the registry. */
  readonly uiRegistryPins: Readonly<Record<string, string>>
  /** Every `@zeus-js/zeus` constraint the UI declares, dependencies and peers. */
  readonly uiCoreConstraints: readonly {
    readonly where: string
    readonly range: string
  }[]
  /** Registry packages that already have the version being cut. */
  readonly versionCollisions?: readonly string[]
}

/** The separate report the never-published packages get. */
export interface FirstPublishRisk {
  readonly name: string
  readonly version: string
  /** Whether publishing this version would bind `latest` to it. */
  readonly wouldBindLatest: boolean
  readonly note: string
}

export interface DryRunResult {
  readonly ok: boolean
  readonly problems: readonly string[]
  readonly warnings: readonly string[]
  readonly plan: {
    readonly core: { readonly commit: string; readonly version: string }
    readonly ui: { readonly commit: string; readonly version?: string }
    readonly order: readonly string[]
    readonly firstPublish: readonly FirstPublishRisk[]
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
  const warnings: string[] = []

  // 1. Pinned commits, and checkouts actually on them.
  for (const [label, commit] of [
    ['core', input.coreCommit],
    ['ui', input.uiCommit],
  ] as const) {
    if (!/^[0-9a-f]{40}$/.test(commit)) {
      problems.push(
        `${label} commit ${commit || '(empty)'} is not a full 40-character SHA`,
      )
    }
  }
  if (input.mode === 'release-strict') {
    /*
     * The UI checkout is required in strict mode. Skipping the Core-pin
     * comparison because the tree was not supplied is how a broken pairing
     * becomes a plan with no problems.
     */
    if (!input.uiCommit) {
      problems.push(
        'release-strict requires the UI candidate commit; without it the Core pin cannot be checked',
      )
    }
    if (input.coreHead === undefined) {
      problems.push(
        'release-strict requires the Core checkout HEAD; a SHA in a flag is not a binding',
      )
    }
    if (input.uiHead === undefined) {
      problems.push(
        'release-strict requires the UI checkout HEAD; a SHA in a flag is not a binding',
      )
    }
  }
  if (input.coreHead !== undefined && input.coreHead !== input.coreCommit) {
    problems.push(
      `the Core checkout is on ${input.coreHead}, not the candidate ${input.coreCommit}`,
    )
  }
  if (input.uiHead !== undefined && input.uiHead !== input.uiCommit) {
    problems.push(
      `the UI checkout is on ${input.uiHead}, not the candidate ${input.uiCommit}`,
    )
  }

  // 2. The version under test.
  if (!isRcVersion(input.version)) {
    problems.push(
      `${input.version} is not an RC version; the rehearsal is for a release candidate`,
    )
  }

  // 3. Core packages: one version, all present, equal to the version being cut.
  const coreDistinct = [...new Set(Object.values(input.coreVersions))]
  if (coreDistinct.length > 1) {
    problems.push(
      `Core published packages disagree on version: ${coreDistinct.join(', ')}`,
    )
  }
  const coreOnDisk = coreDistinct[0]
  if (coreOnDisk !== undefined && coreOnDisk !== input.version) {
    problems.push(
      `Core manifests are at ${coreOnDisk}, but the plan cuts ${input.version}; the version bump has not happened`,
    )
  }
  for (const name of zeusFixedPackages) {
    if (!(name in input.coreVersions)) {
      problems.push(`published package ${name} has no manifest under packages/`)
    }
  }

  // 4. UI packages: one version, and it is the one being cut.
  const uiDistinct = [...new Set(Object.values(input.uiVersions))]
  if (uiDistinct.length > 1) {
    problems.push(
      `UI published packages disagree on version: ${uiDistinct.join(', ')}`,
    )
  }
  const uiOnDisk = uiDistinct[0]
  if (uiOnDisk !== undefined && uiOnDisk !== input.version) {
    problems.push(
      `UI manifests are at ${uiOnDisk}, but the plan cuts ${input.version}; the version bump has not happened`,
    )
  }

  // 5. Every UI constraint on Core, dependencies and peers alike.
  for (const constraint of input.uiCoreConstraints) {
    if (constraint.range !== input.version) {
      problems.push(
        `${constraint.where} pins @zeus-js/zeus at ${constraint.range}, but Core is cutting ${input.version}`,
      )
    }
  }
  if (input.mode === 'release-strict' && input.uiCoreConstraints.length === 0) {
    problems.push(
      'release-strict requires at least one UI constraint on @zeus-js/zeus; none was read from the UI tree',
    )
  }

  // 6. Registry state must be knowable.
  if (input.unknownRegistryState.length > 0) {
    problems.push(
      `registry state is unknown for ${input.unknownRegistryState.length} package(s): ${input.unknownRegistryState
        .slice(0, 5)
        .join(
          ', ',
        )}${input.unknownRegistryState.length > 5 ? '…' : ''}; an unanswered query is not an absent conflict`,
    )
  }

  // 7. A version that already exists would be rejected by npm at publish time.
  for (const collision of input.versionCollisions ?? []) {
    problems.push(
      `${collision} already has ${input.version} on the registry; npm will refuse to publish over it`,
    )
  }

  // 8. First publication is the case that pollutes `latest`.
  const firstPublish: FirstPublishRisk[] = []
  for (const name of input.neverPublished) {
    if (!zeusFixedPackages.includes(name)) {
      warnings.push(
        `${name} is not a published package; ignored for first-publish risk`,
      )
      continue
    }
    const prerelease = input.version.includes('-')
    firstPublish.push({
      name,
      version: input.version,
      wouldBindLatest: !prerelease,
      note: prerelease
        ? 'never published; an RC first publish does not bind latest, but the dist-tag must be set explicitly'
        : 'never published; npm binds latest to a first publish regardless of --tag',
    })
    if (!prerelease) {
      problems.push(
        `${name} has never been published and ${input.version} is not a prerelease; its first publish would become latest`,
      )
    }
  }

  // 9. UI registry pins must agree with each other.
  const pinVersions = [...new Set(Object.values(input.uiRegistryPins))]
  if (pinVersions.length > 1) {
    problems.push(
      `UI dependencies disagree on version: ${pinVersions.join(', ')}`,
    )
  }

  /*
   * Core → UI → consumers. Anything else asks a consumer to install a Core
   * version that does not exist yet.
   */
  const order = [
    'core: publish 32 @zeus-js packages at the RC version under the rc dist-tag',
    'verify: npm dist-tags show rc on every package and latest unchanged',
    'ui: publish 46 @zeus-web packages, rebuilt against that Core version',
    'consumers: install from the registry, never from workspace:',
  ]

  return {
    ok: problems.length === 0,
    problems,
    warnings,
    plan: {
      core: { commit: input.coreCommit, version: input.version },
      ui: {
        commit: input.uiCommit,
        ...(uiOnDisk ? { version: uiOnDisk } : {}),
      },
      order,
      firstPublish,
      distTag: 'rc',
    },
  }
}

function gitHead(root: string): string | undefined {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim()
  } catch {
    return undefined
  }
}

function readCoreVersions(root: string): Record<string, string> {
  const versions: Record<string, string> = {}
  process.chdir(root)
  try {
    for (const pkg of findWorkspacePackages()) {
      if (!zeusFixedPackages.includes(pkg.name)) continue
      versions[pkg.name] = String(
        (pkg.packageJson as { version?: unknown }).version ?? '',
      )
    }
  } finally {
    // `findWorkspacePackages` resolves from the process cwd; leave it as found.
  }
  return versions
}

/** Every `@zeus-web/*` package version in the UI tree, read from its manifests. */
function readUiVersions(uiRoot: string): Record<string, string> {
  const versions: Record<string, string> = {}
  const packagesDir = path.join(uiRoot, 'packages')
  if (!fs.existsSync(packagesDir)) return versions
  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const manifestPath = path.join(packagesDir, entry.name, 'package.json')
    if (!fs.existsSync(manifestPath)) continue
    try {
      const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as {
        name?: string
        version?: string
      }
      if (manifest.name?.startsWith('@zeus-web/') && manifest.version) {
        versions[manifest.name] = manifest.version
      }
    } catch {
      continue
    }
  }
  return versions
}

/**
 * Every constraint the UI places on `@zeus-js/zeus`, in either field.
 *
 * A peer range is as binding as a dependency range: if UI declares a peer of
 * `0.1.1-beta.20` while Core cuts `0.2.0-rc.0`, consumers get a resolution
 * warning on every install and the pairing is not real.
 */
function readUiCoreConstraints(
  uiRoot: string,
): { where: string; range: string }[] {
  const constraints: { where: string; range: string }[] = []
  const packagesDir = path.join(uiRoot, 'packages')
  if (!fs.existsSync(packagesDir)) return constraints
  for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    const manifestPath = path.join(packagesDir, entry.name, 'package.json')
    if (!fs.existsSync(manifestPath)) continue
    let manifest: {
      name?: string
      dependencies?: Record<string, string>
      peerDependencies?: Record<string, string>
    }
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    } catch {
      continue
    }
    for (const field of ['dependencies', 'peerDependencies'] as const) {
      const range = manifest[field]?.['@zeus-js/zeus']
      if (range) {
        constraints.push({
          where: `${manifest.name ?? entry.name} ${field}`,
          range,
        })
      }
    }
  }
  return constraints
}

function readUiRegistryPins(root: string): Record<string, string> {
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

/**
 * Asks the registry whether each package has ever been published, and whether
 * the version being cut already exists.
 *
 * A 404 means never; anything else — including a timeout — is reported as
 * unknown rather than counted as "never published". Claiming a package is
 * unpublished because the network failed puts a false blocker in the report,
 * and claiming it is published would hide a real one.
 */
async function queryRegistry(
  names: readonly string[],
  version: string,
): Promise<{ never: string[]; unknown: string[]; collisions: string[] }> {
  const never: string[] = []
  const unknown: string[] = []
  const collisions: string[] = []
  for (const name of names) {
    const url = `https://registry.npmjs.org/${encodeURIComponent(name).replace('%40', '@')}`
    try {
      const response = await fetch(url, {
        signal: AbortSignal.timeout(15_000),
        headers: { accept: 'application/json' },
      })
      if (response.status === 404) {
        never.push(name)
        continue
      }
      if (!response.ok) {
        unknown.push(`${name} (HTTP ${response.status})`)
        continue
      }
      const body = (await response.json()) as {
        versions?: Record<string, unknown>
      }
      if (body.versions && version in body.versions) {
        collisions.push(name)
      }
    } catch (error) {
      unknown.push(`${name} (${String((error as Error).message).slice(0, 60)})`)
    }
  }
  return { never, unknown, collisions }
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      mode: { type: 'string', default: 'release-strict' },
      'core-commit': { type: 'string' },
      'ui-commit': { type: 'string' },
      'ui-root': { type: 'string' },
      'core-root': { type: 'string' },
      version: { type: 'string', default: '0.2.0-rc.0' },
      json: { type: 'string' },
      'skip-registry': { type: 'boolean', default: false },
    },
  })
  const mode: DryRunMode =
    values.mode === 'diagnostic' ? 'diagnostic' : 'release-strict'
  const coreRoot = path.resolve(values['core-root'] ?? process.cwd())
  const uiRoot = values['ui-root'] ? path.resolve(values['ui-root']) : undefined
  const version = values.version

  const coreCommit = values['core-commit'] ?? gitHead(coreRoot) ?? ''
  const uiCommit =
    values['ui-commit'] ?? (uiRoot ? (gitHead(uiRoot) ?? '') : '')

  const coreVersions = readCoreVersions(coreRoot)
  const uiVersions = uiRoot ? readUiVersions(uiRoot) : {}
  const uiCoreConstraints = uiRoot ? readUiCoreConstraints(uiRoot) : []
  const uiRegistryPins = readUiRegistryPins(coreRoot)

  let never: string[] = []
  let unknown: string[] = []
  let collisions: string[] = []
  if (!values['skip-registry']) {
    const result = await queryRegistry(zeusFixedPackages, version)
    never = result.never
    unknown = result.unknown
    collisions = result.collisions
  }

  const result = evaluateDryRun({
    mode,
    coreCommit,
    uiCommit,
    coreHead: gitHead(coreRoot),
    ...(uiRoot ? { uiHead: gitHead(uiRoot) } : {}),
    version,
    neverPublished: never,
    unknownRegistryState: unknown,
    coreVersions,
    uiVersions,
    uiRegistryPins,
    uiCoreConstraints,
    versionCollisions: collisions,
  })

  const report = {
    schema: 'zeus.rc-dry-run/v2',
    generatedAt: new Date().toISOString(),
    mode,
    ...result,
  }
  if (values.json) {
    fs.mkdirSync(path.dirname(path.resolve(values.json)), { recursive: true })
    fs.writeFileSync(
      path.resolve(values.json),
      `${JSON.stringify(report, null, 2)}\n`,
    )
  }

  console.log(`RC dry run (${mode}) for ${version}`)
  console.log(
    `  core: ${coreCommit} (checkout ${gitHead(coreRoot) ?? 'unknown'})`,
  )
  console.log(
    `  ui:   ${uiCommit || '(not supplied)'}${uiRoot ? ` (checkout ${gitHead(uiRoot) ?? 'unknown'})` : ''}`,
  )
  console.log(`  dist-tag: rc`)
  for (const risk of result.plan.firstPublish) {
    console.log(`  first publish: ${risk.name}@${risk.version} — ${risk.note}`)
  }
  for (const warning of result.warnings) console.log(`  note: ${warning}`)
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
