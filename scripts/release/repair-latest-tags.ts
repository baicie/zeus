/**
 * Safe repair for historical `latest` dist-tags that point at prereleases.
 *
 * Policy: `latest` may only point at a stable version. If a package has no
 * stable version yet, `latest` must be absent rather than pointing at a
 * canary/rc. Dry-run is the default; writes require `--apply` and an
 * authenticated npm user. No publish or version rewrite happens here.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { parseArgs } from 'node:util'

import semver from 'semver'

import { zeusFixedPackages } from '../release.config'

export const REPAIR_PACKAGES = [
  ...zeusFixedPackages,
  '@zeus-js/vite-plugin',
] as const

export interface LatestTagState {
  readonly name: string
  readonly latest?: string
  readonly versions: readonly string[]
  readonly published?: boolean
}

export type LatestTagAction =
  | { readonly kind: 'none'; readonly name: string; readonly reason: string }
  | {
      readonly kind: 'set'
      readonly name: string
      readonly from: string
      readonly version: string
      readonly reason: string
    }
  | {
      readonly kind: 'remove'
      readonly name: string
      readonly from: string
      readonly reason: string
    }

export interface RegistryClient {
  whoami(): string
  setTag(name: string, version: string, tag: string): void
  removeTag(name: string, tag: string): void
}

export function stableVersions(versions: readonly string[]): string[] {
  return versions
    .filter(version => semver.valid(version) && !semver.prerelease(version))
    .sort(semver.rcompare)
}

export function planLatestTagRepair(
  packages: readonly LatestTagState[],
): LatestTagAction[] {
  return packages.map(pkg => {
    if (!pkg.latest) {
      return {
        kind: 'none',
        name: pkg.name,
        reason:
          pkg.published === false
            ? 'package is not published'
            : 'latest is absent',
      }
    }
    if (!semver.valid(pkg.latest) || !semver.prerelease(pkg.latest)) {
      return {
        kind: 'none',
        name: pkg.name,
        reason: 'latest is stable or not semver',
      }
    }
    const stable = stableVersions(pkg.versions)
    if (stable.length > 0) {
      return {
        kind: 'set',
        name: pkg.name,
        from: pkg.latest,
        version: stable[0]!,
        reason: 'move latest from prerelease to highest stable',
      }
    }
    return {
      kind: 'remove',
      name: pkg.name,
      from: pkg.latest,
      reason: 'no stable version exists; remove prerelease latest',
    }
  })
}

export function applyLatestTagRepair(
  actions: readonly LatestTagAction[],
  client: RegistryClient,
  options: { apply: boolean },
): Array<{ name: string; action: string; ok: boolean; error?: string }> {
  if (!options.apply) {
    throw new Error('applyLatestTagRepair requires { apply: true }')
  }
  const user = client.whoami()
  if (!user) throw new Error('npm authentication is required for --apply')

  const results: Array<{
    name: string
    action: string
    ok: boolean
    error?: string
  }> = []
  for (const action of actions) {
    if (action.kind === 'none') continue
    try {
      if (action.kind === 'set') {
        client.setTag(action.name, action.version, 'latest')
      } else {
        client.removeTag(action.name, 'latest')
      }
      results.push({ name: action.name, action: action.kind, ok: true })
    } catch (error) {
      results.push({
        name: action.name,
        action: action.kind,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      })
    }
  }
  return results
}

function readState(name: string, registry: string): LatestTagState {
  try {
    const tags = readNpmJson<Record<string, string>>(name, [
      'view',
      name,
      'dist-tags',
      '--json',
      '--registry',
      registry,
    ])
    const versions = readNpmJson<string[]>(name, [
      'view',
      name,
      'versions',
      '--json',
      '--registry',
      registry,
    ])
    return {
      name,
      latest: tags.latest,
      versions: Array.isArray(versions) ? versions : [versions],
      published: true,
    }
  } catch (error) {
    if (isNotFound(error)) {
      return { name, versions: [], published: false }
    }
    throw error
  }
}

function isNotFound(error: unknown): boolean {
  const value = error as { stderr?: string; stdout?: string; message?: string }
  const text = `${value.stderr ?? ''}${value.stdout ?? ''}${value.message ?? ''}`
  return text.includes('E404') || text.includes('404 Not Found')
}

function readNpmJson<T>(name: string, args: string[]): T {
  const output = execFileSync('npm', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
  if (!output) throw new Error(`${name}: npm view returned no data`)
  return JSON.parse(output) as T
}

function createNpmClient(registry: string): RegistryClient {
  return {
    whoami: () =>
      execFileSync('npm', ['whoami', '--registry', registry], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      }).trim(),
    setTag: (name, version) => {
      execFileSync(
        'npm',
        [
          'dist-tag',
          'add',
          `${name}@${version}`,
          'latest',
          '--registry',
          registry,
        ],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      )
    },
    removeTag: (name, tag) => {
      execFileSync(
        'npm',
        ['dist-tag', 'rm', name, tag, '--registry', registry],
        { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
      )
    },
  }
}

function main(): void {
  const { values } = parseArgs({
    options: {
      apply: { type: 'boolean', default: false },
      check: { type: 'boolean', default: false },
      packages: { type: 'string' },
      registry: { type: 'string' },
    },
  })
  const registry = values.registry ?? 'https://registry.npmjs.org'
  const requested = values.packages
    ? values.packages.split(',').map(name => name.trim())
    : [...REPAIR_PACKAGES]
  const unknown = requested.filter(
    name => !REPAIR_PACKAGES.includes(name as (typeof REPAIR_PACKAGES)[number]),
  )
  if (unknown.length > 0) {
    throw new Error(`unknown package(s): ${unknown.join(', ')}`)
  }

  const states = requested.map(name => readState(name, registry))
  const actions = planLatestTagRepair(states)
  const planned = actions.filter(action => action.kind !== 'none')

  const output = path.resolve('temp/release/latest-tag-repair.json')
  fs.mkdirSync(path.dirname(output), { recursive: true })
  const report: {
    schema: string
    registry: string
    apply: boolean
    packages: LatestTagState[]
    actions: LatestTagAction[]
    planned: number
    passed: boolean
    results?: Array<{
      name: string
      action: string
      ok: boolean
      error?: string
    }>
    failure?: Array<{
      name: string
      action: string
      ok: boolean
      error?: string
    }>
  } = {
    schema: 'zeus.latest-tag-repair/v1',
    registry,
    apply: values.apply === true,
    packages: states,
    actions,
    planned: planned.length,
    passed: planned.length === 0,
  }

  if (values.apply === true) {
    const results = applyLatestTagRepair(actions, createNpmClient(registry), {
      apply: true,
    })
    const failed = results.filter(result => !result.ok)
    report.results = results
    report.passed = failed.length === 0
    if (failed.length > 0) {
      report.failure = failed
    }
  }

  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  for (const action of actions) {
    if (action.kind === 'none') continue
    console.log(
      `${action.kind.toUpperCase()} ${action.name}: ${action.from} -> ${
        action.kind === 'set' ? action.version : '<absent>'
      } (${action.reason})`,
    )
  }
  console.log(
    `latest-tag repair ${values.apply ? 'applied' : 'dry-run'}: ${planned.length} planned, report ${output}`,
  )
  if (values.check === true && planned.length > 0) process.exitCode = 1
}

if (process.argv[1]?.endsWith('repair-latest-tags.ts')) main()
