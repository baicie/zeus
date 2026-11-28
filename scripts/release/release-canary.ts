import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import pico from 'picocolors'
import semver from 'semver'

import config, { zeusFixedPackages } from '../release.config'
import { StageRecorder } from './canary-stages'
import {
  assertCleanReleaseSource,
  restoreReleaseRewrite,
  snapshotReleaseRewrite,
} from './release-rewrite-guard'
import {
  checkStagedContract,
  pinnedInternalDependencies,
  readStagedManifests,
} from './staged-contract'
import { verifyCurrentMainHead } from './verify-main-head'
import { findWorkspacePackages } from '../shared/utils'

const defaultRegistry = 'https://registry.npmjs.org'

export interface CanaryPublishDependencies {
  packages: readonly string[]
  version: string
  tag: string
  dryRun: boolean
  maxAttempts: number
  versionExists: (pkg: string, version: string) => Promise<boolean>
  verifyHead: () => Promise<void>
  publishPackage: (
    pkg: string,
    version: string,
    tag: string,
    dryRun: boolean,
  ) => Promise<void>
  wait: (ms: number) => Promise<void>
}

export interface CanaryPublishPhasesDependencies extends Omit<
  CanaryPublishDependencies,
  'dryRun' | 'maxAttempts'
> {
  dryRunOnly: boolean
  maxAttempts: number
}

export interface CanaryOptions {
  dryRunOnly: boolean
}

export function parseCanaryOptions(args: readonly string[]): CanaryOptions {
  return { dryRunOnly: args.includes('--dry-run-only') }
}

export async function publishCanaryPackages(
  dependencies: CanaryPublishDependencies,
  options: { skipExistingVersions?: boolean } = {},
): Promise<void> {
  for (const pkg of dependencies.packages) {
    if (
      options.skipExistingVersions !== false &&
      (await dependencies.versionExists(pkg, dependencies.version))
    ) {
      console.log(pico.yellow(`skip existing ${pkg}@${dependencies.version}`))
      continue
    }

    for (let attempt = 1; attempt <= dependencies.maxAttempts; attempt += 1) {
      try {
        if (!dependencies.dryRun) await dependencies.verifyHead()
        await dependencies.publishPackage(
          pkg,
          dependencies.version,
          dependencies.tag,
          dependencies.dryRun,
        )
        if (!dependencies.dryRun) await dependencies.verifyHead()
        console.log(
          pico.green(
            `${dependencies.dryRun ? 'dry-run publish passed' : 'published'} ${pkg}@${dependencies.version}`,
          ),
        )
        break
      } catch (error) {
        if (dependencies.dryRun || !isRetryablePublishError(error)) throw error

        let versionIsVisible = false
        try {
          versionIsVisible = await dependencies.versionExists(
            pkg,
            dependencies.version,
          )
        } catch {
          // The publish error remains authoritative when npm visibility is unknown.
        }
        if (versionIsVisible) {
          await dependencies.verifyHead()
          console.log(
            pico.yellow(
              `${pkg}@${dependencies.version} is visible on npm; treating publish as complete.`,
            ),
          )
          break
        }
        if (attempt === dependencies.maxAttempts) throw error
        const delay = retryDelay(attempt)
        console.log(
          pico.yellow(
            `retryable npm error for ${pkg}; retrying in ${Math.round(delay / 1_000)}s`,
          ),
        )
        await dependencies.wait(delay)
      }
    }
  }
}

export async function publishCanaryPhases(
  dependencies: CanaryPublishPhasesDependencies,
): Promise<'dry-run-only' | 'published'> {
  const { dryRunOnly, maxAttempts, ...publishDependencies } = dependencies

  await publishCanaryPackages(
    {
      ...publishDependencies,
      dryRun: true,
      maxAttempts: 1,
    },
    { skipExistingVersions: !dryRunOnly },
  )

  if (dryRunOnly) return 'dry-run-only'

  await publishCanaryPackages({
    ...publishDependencies,
    dryRun: false,
    maxAttempts,
  })
  return 'published'
}

export function getCanaryVersion(
  environment: NodeJS.ProcessEnv,
  now = new Date(),
): string {
  const workspace = findWorkspacePackages()
  const rootPackageName = config.rootVersionPackage
  const baseVersion = workspace.find(pkg => pkg.name === rootPackageName)
    ?.packageJson.version
  const base = semver.parse(String(baseVersion ?? ''))
  if (!base)
    throw new Error(`Invalid Canary base version: ${String(baseVersion)}`)

  const date = now.toISOString().slice(0, 10).replace(/-/g, '')
  const runNumber = requireEnvironment(environment, 'GITHUB_RUN_NUMBER')
  const runAttempt = requireEnvironment(environment, 'GITHUB_RUN_ATTEMPT')
  const sha = normalizeSha(requireEnvironment(environment, 'GITHUB_SHA'))
  const prefix = config.canary?.prefix ?? 'canary'

  return `${base.major}.${base.minor}.${base.patch}-${prefix}.${date}.${runNumber}.${runAttempt}.${sha.slice(0, 8)}`
}

export function getCanaryStagingTag(environment: NodeJS.ProcessEnv): string {
  const runId = requireEnvironment(environment, 'GITHUB_RUN_ID')
  const runAttempt = requireEnvironment(environment, 'GITHUB_RUN_ATTEMPT')
  if (!/^\d+$/.test(runId) || !/^\d+$/.test(runAttempt)) {
    throw new Error('GitHub run id and attempt must be numeric')
  }
  return `zeus-canary-${runId}-${runAttempt}`
}

async function main(): Promise<void> {
  const { dryRunOnly } = parseCanaryOptions(process.argv.slice(2))
  assertCanaryEnvironment(process.env, { dryRunOnly })
  const source = snapshotReleaseRewrite(process.cwd())
  assertCleanReleaseSource(source, [])
  const version = getCanaryVersion(process.env)
  const stagingTag = getCanaryStagingTag(process.env)
  const registry = config.publish?.registry ?? defaultRegistry

  process.env.ZEUS_SOURCE_COMMIT = source.sourceCommit
  process.env[config.canary?.envName ?? 'ZEUS_CANARY_VERSION'] = version
  process.env.ZEUS_CANARY_STAGING_TAG = stagingTag

  if (!dryRunOnly) {
    verifyCurrentMainHead()
    exposeCanaryEnvironment(version, stagingTag)
  }

  // Written as the run proceeds, so a failure at any stage still leaves a file
  // naming the stage, the command and the exit code. Without it the workflow's
  // `if: always()` uploads found no files and the failure was diagnosed from
  // log text.
  const recorder = new StageRecorder(
    path.join(process.cwd(), 'temp/release/canary-stages.json'),
  )
  recorder.setVersions(version, stagingTag)

  let failure: unknown
  try {
    recorder.run(
      'version-packages',
      `pnpm release:version-packages ${version}`,
      () => {
        run('pnpm', ['release:version-packages', version])
      },
    )
    /*
     * Templates are not workspace packages, so `release:version-packages`
     * leaves them naming the previous version.
     *
     * This is the defect that kept the canary red for eight consecutive main
     * pushes. The rewrite set the group to the canary version, the precheck
     * ran `check:create-zeus`, and `webc-consumer-ts` still pinned
     * `@zeus-web/button@<the unreleased Core version>` — so the gate failed
     * asking the registry for a version that could not exist yet. Nothing in
     * the log said the pins had not been rewritten; it read as a missing
     * publish.
     *
     * `syncCreateZeusVersions` already exists and already knows the rule:
     * `@zeus-js/*` follows Core, `@zeus-web/*` follows the paired UI, and
     * `@zeus-js/vite-plugin` keeps its own line. It was wired into precheck as
     * `--check`, which is why the stale pin was detected, but nothing rewrote
     * it on the canary path. Checking a derived file without regenerating it
     * after a rewrite is a gate arguing with its own caller.
     */
    /*
     * The `@zeus-web/*` half of the template pins cannot follow the canary
     * version, because there is no canary UI.
     *
     * UI ships from a separate repository on its own train. The version that
     * exists is whatever that repository last published, and the honest thing
     * for a canary to test against is the published one: the canary asks "does
     * the tree I am about to publish still work with the UI users have?", not
     * "does it work with a UI that does not exist yet".
     *
     * `webc-consumer-ts` pins `@zeus-web/button`, and installing it is the only
     * step in `check:create-zeus` that touches the registry. Left pointing at
     * the unreleased Core version it asked the registry for a version that
     * cannot exist, so the gate failed on every main push — eight in a row —
     * with a message that reads like a missing publish.
     *
     * Resolved rather than hardcoded: `rc` first, then `latest`, so promoting a
     * new UI does not require editing this file. A registry that cannot answer
     * is a failure, not a skip.
     */
    const uiVersion = resolvePublishedUiVersion()
    recorder.run(
      'template-pins',
      `align template pins to ${version} (UI ${uiVersion})`,
      () => {
        run('pnpm', [
          'exec',
          'tsx',
          'scripts/release/create-zeus-versions.ts',
          '--ui-version',
          uiVersion,
        ])
      },
    )

    recorder.run('install-lockfile', 'pnpm install --lockfile-only', () => {
      run('pnpm', ['install', '--lockfile-only'])
    })

    /*
     * Regenerate the package table after the version rewrite.
     *
     * `release:version-packages` rewrites manifests and nothing else, so the
     * table `docs/api/packages.md` carries still names the previous versions.
     * `package-table.spec.ts` did not notice — it reads the committed source via
     * `git archive HEAD`, which the staging rewrite does not touch — but
     * `write-package-table.spec.ts` reads the working tree, and it failed on
     * every canary run until this step existed.
     *
     * Generating rather than checking: the rewrite is the thing that made them
     * disagree, so the sequence is rewrite-then-regenerate. A `--check` here
     * would fail on a tree this script had just produced, which is a check
     * arguing with its own caller.
     */
    recorder.run('package-table', 'regenerate the package table', () => {
      run('pnpm', ['exec', 'tsx', 'scripts/check/write-package-table.ts'])
    })

    // Verify the staged tree before the precheck spends minutes on it.
    //
    // Two contracts are in play: the committed source (checked by
    // `package-table.spec.ts` against `HEAD`) and the staged working tree
    // (checked here). Running the precheck first meant a half-finished rewrite
    // surfaced as a unit-test failure far from its cause.
    recorder.run(
      'staged-contract',
      `verify the staged tree matches ${version}`,
      () => {
        assertStagedCanaryContract(version)
      },
    )

    recorder.run('precheck', 'pnpm release:precheck --channel canary', () => {
      run('pnpm', ['release:precheck', '--channel', 'canary'])
    })

    const packageDirs = new Map(
      findWorkspacePackages().map(pkg => [pkg.name, pkg.dir]),
    )
    for (const pkg of zeusFixedPackages) {
      if (!packageDirs.has(pkg))
        throw new Error(`Missing release package: ${pkg}`)
    }

    const result = await publishCanaryPhases({
      packages: zeusFixedPackages,
      version,
      tag: stagingTag,
      dryRunOnly,
      maxAttempts: config.publish?.retry ?? 5,
      versionExists: async (pkg, expectedVersion) =>
        npmVersionExists(pkg, expectedVersion, registry),
      verifyHead: async () => {
        verifyCurrentMainHead()
      },
      publishPackage: async (pkg, expectedVersion, tag, dryRun) => {
        publishPackage(pkg, expectedVersion, tag, registry, dryRun)
      },
      wait,
    })

    recorder.record({ name: 'publish-dry-run', status: 'pass' })

    if (result === 'dry-run-only') {
      recorder.finish()
      console.log(
        pico.green(
          `Canary dry-run-only passed (${zeusFixedPackages.length} packages, ${stagingTag} -> ${version}); no packages were published.`,
        ),
      )
      return
    }

    verifyCurrentMainHead()
    recorder.record({ name: 'publish-staging', status: 'pass' })
    recorder.finish()
    console.log(
      pico.green(
        `Canary staging publication complete (${stagingTag} -> ${version}).`,
      ),
    )
  } catch (error) {
    failure = error
    recorder.finish()
    throw error
  } finally {
    try {
      const restored = restoreReleaseRewrite(process.cwd(), source)
      if (restored.length > 0) {
        console.log(
          pico.yellow(
            `[release] restored ${restored.length} temporary version-rewrite file(s).`,
          ),
        )
      }
    } catch (error) {
      console.error(
        pico.red(
          `[release] failed to restore temporary version-rewrite files: ${
            error instanceof Error ? error.message : String(error)
          }`,
        ),
      )
      if (failure === undefined) throw error
    }
  }
}

/**
 * Fails the run when the working tree does not match the version it claims.
 *
 * Cheap checks first: a rewrite that missed a package or left a pinned
 * internal dependency on the previous version is a bug in the rewrite, and
 * finding it here names the package instead of failing a unit test downstream.
 */
function assertStagedCanaryContract(version: string): void {
  const { manifests, missing } = readStagedManifests(
    process.cwd(),
    zeusFixedPackages,
  )
  const problems = [
    ...checkStagedContract(manifests, missing, zeusFixedPackages, version),
    ...pinnedInternalDependencies(manifests, zeusFixedPackages, version),
  ]
  if (problems.length === 0) return

  const detail = problems
    .map(problem => `  - ${problem.package}: ${problem.problem}`)
    .join('\n')
  throw new Error(
    `The staged tree does not match ${version}; \`release:version-packages\` left it half-written:\n${detail}`,
  )
}

/**
 * The UI version a canary builds against.
 *
 * Read from the registry rather than passed in: the canary runs on a Core push
 * and nothing in this repository knows which UI the maintainers last published.
 * `rc` before `latest` — `rc` is the line a paired Core is expected to work
 * with, and `latest` on this scope still points at a beta.
 */
export function resolvePublishedUiVersion(
  query: (args: readonly string[]) => string = args => {
    const result = spawnSync('npm', args, { encoding: 'utf8' })
    if (result.status !== 0) {
      throw new Error(
        `npm ${args.join(' ')} failed: ${(result.stderr ?? '').trim() || `exit ${String(result.status)}`}`,
      )
    }
    return result.stdout
  },
  packageName = '@zeus-web/button',
): string {
  const tags = JSON.parse(
    query(['view', packageName, 'dist-tags', '--json']),
  ) as Record<string, string>
  const version = tags.rc ?? tags.latest
  if (!version || !semver.valid(version)) {
    throw new Error(
      `${packageName} has no rc or latest dist-tag on the registry; a canary needs a published UI to verify against`,
    )
  }
  return version
}

export function assertCanaryEnvironment(
  environment: NodeJS.ProcessEnv,
  options: { dryRunOnly?: boolean } = {},
): void {
  if (!config.canary?.enabled) throw new Error('Canary publication is disabled')
  if (
    !options.dryRunOnly &&
    (!environment.CI || environment.GITHUB_ACTIONS !== 'true')
  ) {
    throw new Error('Canary publication is only allowed in GitHub Actions')
  }
  if (
    !options.dryRunOnly &&
    !environment.NODE_AUTH_TOKEN &&
    !environment.NPM_TOKEN
  ) {
    throw new Error('NODE_AUTH_TOKEN or NPM_TOKEN is required')
  }
  if (!options.dryRunOnly && !environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
    throw new Error('GitHub OIDC token permission is required for provenance')
  }
}

function exposeCanaryEnvironment(version: string, stagingTag: string): void {
  const file = process.env.GITHUB_ENV
  if (!file) throw new Error('GITHUB_ENV is required')
  const versionName = config.canary?.envName ?? 'ZEUS_CANARY_VERSION'
  appendFileSync(
    file,
    `${versionName}=${version}\nZEUS_CANARY_STAGING_TAG=${stagingTag}\n`,
  )
  process.env[versionName] = version
  process.env.ZEUS_CANARY_STAGING_TAG = stagingTag
}

function publishPackage(
  pkg: string,
  version: string,
  tag: string,
  registry: string,
  dryRun: boolean,
): void {
  const result = spawnSync(
    'pnpm',
    [
      '--filter',
      pkg,
      'publish',
      '--access',
      config.publish?.access ?? 'public',
      '--tag',
      tag,
      '--no-git-checks',
      '--registry',
      registry,
      ...(!dryRun && config.publish?.provenance !== false
        ? ['--provenance']
        : []),
      ...(dryRun ? ['--dry-run'] : []),
    ],
    {
      cwd: process.cwd(),
      env: getPublishEnvironment(dryRun),
      encoding: 'utf8',
      shell: process.platform === 'win32',
    },
  )
  if (result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0) {
    throw new Error(
      `Publishing ${pkg}@${version} failed (${result.status ?? 'unknown'}): ${result.stderr || result.error?.message || 'unknown npm error'}`,
    )
  }
}

export function getPublishEnvironment(
  dryRun: boolean,
  source: NodeJS.ProcessEnv = process.env,
): NodeJS.ProcessEnv {
  const environment = { ...source }
  if (dryRun) {
    delete environment.NODE_AUTH_TOKEN
    delete environment.NPM_TOKEN
  } else {
    environment.NODE_AUTH_TOKEN = source.NODE_AUTH_TOKEN ?? source.NPM_TOKEN
  }
  return environment
}

function npmVersionExists(
  pkg: string,
  version: string,
  registry: string,
): boolean {
  const result = spawnSync(
    'npm',
    ['view', `${pkg}@${version}`, 'version', '--json', '--registry', registry],
    {
      cwd: process.cwd(),
      encoding: 'utf8',
      shell: process.platform === 'win32',
    },
  )
  if (result.status === 0) {
    return JSON.parse(result.stdout.trim()) === version
  }
  const output = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
  if (/\bE404\b|404 Not Found|No match found/.test(output)) return false
  throw new Error(`Unable to query ${pkg}@${version}: ${output.trim()}`)
}

function run(command: string, args: string[]): void {
  const result = spawnSync(command, args, {
    cwd: process.cwd(),
    env: process.env,
    stdio: 'inherit',
    shell: process.platform === 'win32',
  })
  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed with ${result.status}`)
  }
}

function isRetryablePublishError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /\bE?(?:409|429|5\d\d)\b|409 Conflict/.test(message) ||
    /ETIMEDOUT|ECONNRESET|ECONNABORTED|EAI_AGAIN|ENOTFOUND/.test(message) ||
    message.includes('Failed to save packument') ||
    message.includes('previous package has been fully processed')
  )
}

function retryDelay(attempt: number): number {
  return Math.min(10_000 * 2 ** (attempt - 1), 60_000)
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function requireEnvironment(
  environment: NodeJS.ProcessEnv,
  name: string,
): string {
  const value = environment[name]
  if (!value) throw new Error(`${name} is required`)
  return value
}

function normalizeSha(value: string): string {
  const sha = value.trim().toLowerCase()
  if (!/^[0-9a-f]{40}$/.test(sha)) throw new Error(`Invalid git SHA: ${value}`)
  return sha
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
