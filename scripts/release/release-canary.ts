import { spawnSync } from 'node:child_process'
import { appendFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'

import pico from 'picocolors'
import semver from 'semver'

import config, { zeusFixedPackages } from '../release.config'
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

export async function publishCanaryPackages(
  dependencies: CanaryPublishDependencies,
): Promise<void> {
  for (const pkg of dependencies.packages) {
    if (await dependencies.versionExists(pkg, dependencies.version)) {
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
  assertCanaryEnvironment(process.env)
  const version = getCanaryVersion(process.env)
  const stagingTag = getCanaryStagingTag(process.env)
  const registry = config.publish?.registry ?? defaultRegistry

  verifyCurrentMainHead()
  exposeCanaryEnvironment(version, stagingTag)

  run('pnpm', ['release:version-packages', version])
  run('pnpm', ['install', '--lockfile-only'])
  run('pnpm', ['release:precheck', '--strict'])

  const packageDirs = new Map(
    findWorkspacePackages().map(pkg => [pkg.name, pkg.dir]),
  )
  for (const pkg of zeusFixedPackages) {
    if (!packageDirs.has(pkg))
      throw new Error(`Missing release package: ${pkg}`)
  }

  await publishCanaryPackages({
    packages: zeusFixedPackages,
    version,
    tag: stagingTag,
    dryRun: true,
    maxAttempts: 1,
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

  await publishCanaryPackages({
    packages: zeusFixedPackages,
    version,
    tag: stagingTag,
    dryRun: false,
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

  verifyCurrentMainHead()
  console.log(
    pico.green(
      `Canary staging publication complete (${stagingTag} -> ${version}).`,
    ),
  )
}

function assertCanaryEnvironment(environment: NodeJS.ProcessEnv): void {
  if (!config.canary?.enabled) throw new Error('Canary publication is disabled')
  if (!environment.CI || environment.GITHUB_ACTIONS !== 'true') {
    throw new Error('Canary publication is only allowed in GitHub Actions')
  }
  if (!environment.NODE_AUTH_TOKEN && !environment.NPM_TOKEN) {
    throw new Error('NODE_AUTH_TOKEN or NPM_TOKEN is required')
  }
  if (!environment.ACTIONS_ID_TOKEN_REQUEST_TOKEN) {
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
      env: {
        ...process.env,
        NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN ?? process.env.NPM_TOKEN,
      },
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
