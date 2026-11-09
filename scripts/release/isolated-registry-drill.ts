/**
 * Isolated npm registry drill for an RC release.
 *
 * This is the end-to-end rehearsal that a dry-run cannot give: real tarballs
 * are published to a throwaway Verdaccio, the dist-tags are read back, a repeat
 * publish is attempted, and an outage is simulated. It never touches
 * registry.npmjs.org.
 *
 * It exists because a dry-run cannot expose the behaviour that blocks RC-07:
 * npm assigns `latest` to the first version of a package even when `--tag rc`
 * is passed explicitly, so a first-ever RC release still leaves `latest`
 * pointing at a prerelease. Only a real registry shows that.
 *
 * Usage:
 *   tsx scripts/release/isolated-registry-drill.ts \
 *     --registry http://127.0.0.1:4873/ \
 *     --tarballs <dir with *.tgz at the RC version> \
 *     --version 0.2.0-rc.0 \
 *     --out temp/release/isolated-registry-drill.json
 *
 * Preconditions (the script verifies them and fails closed):
 *   - the registry answers `/-/ping`;
 *   - it is NOT registry.npmjs.org;
 *   - every requested tarball exists and carries the requested version.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseArgs } from 'node:util'

export const DRILL_SCHEMA = 'zeus.isolated-registry-drill/v1'
export const RELEASE_REGISTRY = 'https://registry.npmjs.org/'

export interface DrillPackage {
  readonly name: string
  readonly version: string
  readonly tarball: string
  readonly sha256: string
}

export interface DrillResult {
  readonly schema: typeof DRILL_SCHEMA
  readonly registry: string
  readonly version: string
  readonly tarballs: readonly DrillPackage[]
  readonly publishExitCodes: Readonly<Record<string, number>>
  readonly distTagsAfterPublish: Readonly<
    Record<string, Readonly<Record<string, string>>>
  >
  readonly duplicatePublish: Readonly<
    Record<string, { code?: string; detail: string }>
  >
  readonly outage: {
    readonly registry: string
    readonly timestampState: string
    readonly note: string
  }
  readonly findings: readonly string[]
  readonly passed: boolean
}

function run(
  bin: string,
  args: readonly string[],
  cwd: string,
  env: NodeJS.ProcessEnv = {},
): { code: number; stdout: string; stderr: string } {
  try {
    const stdout = execFileSync(bin, [...args], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...env },
    })
    return { code: 0, stdout, stderr: '' }
  } catch (error) {
    const failure = error as {
      status?: number | null
      stdout?: string | Buffer
      stderr?: string | Buffer
    }
    return {
      code: typeof failure.status === 'number' ? failure.status : 1,
      stdout: String(failure.stdout ?? ''),
      stderr: String(failure.stderr ?? ''),
    }
  }
}

function sha256File(file: string): string {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function packageNameFromTarball(tarball: string): string {
  // `@scope-name-x.y.z.tgz` was produced by `pnpm pack`, so read the manifest
  // instead of guessing from the file name.
  const result = run('tar', ['-xzOf', tarball, 'package/package.json'], '/tmp')
  if (result.code !== 0) {
    throw new Error(`cannot read ${tarball}: ${result.stderr.trim()}`)
  }
  const manifest = JSON.parse(result.stdout) as {
    name?: unknown
    version?: unknown
  }
  if (
    typeof manifest.name !== 'string' ||
    typeof manifest.version !== 'string'
  ) {
    throw new Error(`${tarball} has no name/version`)
  }
  return `${manifest.name}@${manifest.version}`
}

export interface DrillOptions {
  readonly registry: string
  readonly tarballs: string
  readonly version: string
  readonly packageFilter?: readonly string[]
  readonly out?: string
  /** Verdaccio accepts anonymous publishes when configured to; npm needs a token otherwise. */
  readonly npmUserConfigFile?: string
}

export function collectTarballs(options: DrillOptions): DrillPackage[] {
  const entries = fs
    .readdirSync(options.tarballs)
    .filter(file => file.endsWith('.tgz'))
    .sort()

  const selected = options.packageFilter
    ? entries.filter(file =>
        options.packageFilter!.some(name =>
          file.includes(name.replace('@', '').replace('/', '-')),
        ),
      )
    : entries

  const packages: DrillPackage[] = []
  for (const file of selected) {
    const tarball = path.join(options.tarballs, file)
    const id = packageNameFromTarball(tarball)
    const { name, version } = splitPackageId(id)
    if (version !== options.version) {
      throw new Error(
        `${file} carries ${name}@${version}, expected ${options.version}`,
      )
    }
    packages.push({ name, version, tarball, sha256: sha256File(tarball) })
  }

  if (packages.length === 0) {
    throw new Error(`no tarballs at ${options.version} in ${options.tarballs}`)
  }
  return packages
}

function readDistTags(
  registry: string,
  name: string,
  cwd: string,
): Record<string, string> {
  const result = run(
    'npm',
    ['view', name, 'dist-tags', '--json', '--registry', registry],
    cwd,
  )
  if (result.code !== 0) return {}
  try {
    const value = JSON.parse(result.stdout) as unknown
    if (!value || typeof value !== 'object') return {}
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        String(entry),
      ]),
    )
  } catch {
    return {}
  }
}

/**
 * Splits `@scope/name@1.2.3` without tripping over the scoped `@`.
 */
export function splitPackageId(id: string): { name: string; version: string } {
  const at = id.lastIndexOf('@')
  return { name: id.slice(0, at), version: id.slice(at + 1) }
}

export async function runIsolatedRegistryDrill(
  options: DrillOptions,
): Promise<DrillResult> {
  const registry = options.registry.endsWith('/')
    ? options.registry
    : `${options.registry}/`

  if (registry.startsWith(RELEASE_REGISTRY)) {
    throw new Error(
      'refusing to run the drill against the production npm registry',
    )
  }

  const ping = await fetch(`${registry}-/ping`).catch(() => undefined)
  if (!ping?.ok) {
    throw new Error(`isolated registry ${registry} is not reachable`)
  }

  const packages = collectTarballs(options)
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-registry-drill-'))
  const findings: string[] = []
  const publishExitCodes: Record<string, number> = {}
  const distTagsAfterPublish: Record<string, Record<string, string>> = {}
  const duplicatePublish: Record<string, { code?: string; detail: string }> = {}

  try {
    for (const pkg of packages) {
      const dir = path.join(work, pkg.name)
      fs.mkdirSync(dir, { recursive: true })
      execFileSync('tar', ['-xzf', pkg.tarball, '-C', dir], { stdio: 'ignore' })
      // `publishConfig.provenance` requires an OIDC provider that an offline
      // registry does not have; the drill disables it explicitly rather than
      // publishing a weaker artifact by accident.
      const publish = run(
        'npm',
        [
          'publish',
          '--registry',
          registry,
          '--tag',
          'rc',
          '--provenance=false',
        ],
        path.join(dir, 'package'),
        options.npmUserConfigFile
          ? { NPM_CONFIG_USERCONFIG: options.npmUserConfigFile }
          : {},
      )
      publishExitCodes[pkg.name] = publish.code
      if (publish.code !== 0) {
        findings.push(
          `${pkg.name}: first publish failed (${publish.stderr.trim().split('\n')[0] ?? 'unknown'})`,
        )
      }
      distTagsAfterPublish[pkg.name] = readDistTags(registry, pkg.name, work)

      const repeat = run(
        'npm',
        [
          'publish',
          '--registry',
          registry,
          '--tag',
          'rc',
          '--provenance=false',
        ],
        path.join(dir, 'package'),
        options.npmUserConfigFile
          ? { NPM_CONFIG_USERCONFIG: options.npmUserConfigFile }
          : {},
      )
      const detail = `${repeat.stderr}\n${repeat.stdout}`.trim()
      duplicatePublish[pkg.name] = {
        ...(/(E409|EPUBLISHCONFLICT|Cannot publish over)/i.test(detail)
          ? { code: 'EPUBLISHCONFLICT' }
          : {}),
        detail: detail.split('\n').slice(0, 2).join(' '),
      }
    }

    // The RC-07 root cause: npm binds `latest` to the first published version
    // even when `--tag rc` is explicit, so a first-ever RC still moves the
    // default install target. The drill records that instead of assuming it.
    for (const [name, tags] of Object.entries(distTagsAfterPublish)) {
      if (tags.rc !== options.version) {
        findings.push(
          `${name}: dist-tag rc is ${tags.rc ?? 'missing'}, expected ${options.version}`,
        )
      }
      if (tags.latest === options.version) {
        findings.push(
          `${name}: first publish moved latest to ${options.version} (prerelease); repair:latest-tags is required before the cut`,
        )
      }
    }

    for (const [name, entry] of Object.entries(duplicatePublish)) {
      if (entry.code !== 'EPUBLISHCONFLICT') {
        findings.push(
          `${name}: a repeat publish was not rejected with a conflict (${entry.detail})`,
        )
      }
    }

    const outageUrl = 'http://127.0.0.1:4999/'
    const outagePing = await fetch(`${outageUrl}-/ping`).catch(() => undefined)

    return {
      schema: DRILL_SCHEMA,
      registry,
      version: options.version,
      tarballs: packages,
      publishExitCodes,
      distTagsAfterPublish,
      duplicatePublish,
      outage: {
        registry: outageUrl,
        timestampState: outagePing?.ok ? 'REACHABLE' : 'UNREACHABLE',
        note: 'an unreachable registry must be reported as a query failure, never as an absent version',
      },
      findings,
      passed: findings.every(finding => !finding.includes('failed')),
    }
  } finally {
    fs.rmSync(work, { recursive: true, force: true })
  }
}

function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      registry: { type: 'string' },
      tarballs: { type: 'string' },
      version: { type: 'string' },
      packages: { type: 'string' },
      'npm-user-config': { type: 'string' },
      out: {
        type: 'string',
        default: 'temp/release/isolated-registry-drill.json',
      },
    },
  })

  for (const key of ['registry', 'tarballs', 'version'] as const) {
    if (!values[key]) throw new Error(`--${key} is required`)
  }

  return runIsolatedRegistryDrill({
    registry: values.registry!,
    tarballs: path.resolve(values.tarballs!),
    version: values.version!,
    ...(values.packages
      ? { packageFilter: values.packages.split(',').map(entry => entry.trim()) }
      : {}),
    ...(values['npm-user-config']
      ? { npmUserConfigFile: values['npm-user-config'] }
      : {}),
  }).then(result => {
    const out = path.resolve(values.out!)
    fs.mkdirSync(path.dirname(out), { recursive: true })
    fs.writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`)
    console.log(
      `isolated registry drill ${result.passed ? 'PASS' : 'FAIL'}: ${result.tarballs.length} tarball(s) at ${result.version}`,
    )
    for (const finding of result.findings) console.log(`  ${finding}`)
    if (!result.passed) process.exitCode = 1
  })
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch(error => {
    console.error((error as Error).message)
    process.exit(1)
  })
}
