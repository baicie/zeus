import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import pico from 'picocolors'
import semver from 'semver'

import { zeusNativePackages } from '../release.config'

const defaultRegistry = 'https://registry.npmjs.org'
const defaultConsistencyRetryDelays = [0, 1_000, 2_000, 5_000, 10_000]

export interface NativeLatestConsistencyOptions {
  retryDelays?: readonly number[]
  wait?: (ms: number) => Promise<void>
}

export interface NativeLatestCleanupPolicyInput {
  packages: readonly string[]
  expectedVersion: string
  tagsByPackage: ReadonlyMap<string, Readonly<Record<string, string>>>
}

export interface NativeLatestCleanupDependencies {
  packages: readonly string[]
  expectedVersion: string
  readTags: (pkg: string) => Promise<Record<string, string>>
  removeLatest: (pkg: string) => Promise<void>
  consistency?: NativeLatestConsistencyOptions
}

export function getNativeLatestCleanupErrors(
  input: NativeLatestCleanupPolicyInput,
): string[] {
  const errors: string[] = []
  if (
    !semver.valid(input.expectedVersion) ||
    !semver.prerelease(input.expectedVersion)
  ) {
    errors.push(
      `expected version must be a valid prerelease: ${input.expectedVersion}`,
    )
  }

  for (const pkg of input.packages) {
    const tags = input.tagsByPackage.get(pkg)
    if (!tags) {
      errors.push(`${pkg}: dist-tags were not returned`)
    } else if (tags.latest && tags.latest !== input.expectedVersion) {
      errors.push(`${pkg}: latest points to ${tags.latest}, refusing cleanup`)
    }
  }
  return errors
}

export async function cleanupNativeLatestTags(
  dependencies: NativeLatestCleanupDependencies,
): Promise<void> {
  const entries = await Promise.all(
    dependencies.packages.map(
      async pkg => [pkg, await dependencies.readTags(pkg)] as const,
    ),
  )
  const tagsByPackage = new Map(entries)
  const errors = getNativeLatestCleanupErrors({
    packages: dependencies.packages,
    expectedVersion: dependencies.expectedVersion,
    tagsByPackage,
  })
  if (errors.length) {
    throw new Error(
      `Native latest cleanup preflight failed:\n- ${errors.join('\n- ')}`,
    )
  }

  for (const pkg of dependencies.packages) {
    if (!tagsByPackage.get(pkg)?.latest) continue

    const beforeRemoval = await dependencies.readTags(pkg)
    if (beforeRemoval.latest !== dependencies.expectedVersion) {
      throw new Error(
        `${pkg}: latest changed to ${beforeRemoval.latest ?? '<missing>'} before cleanup; expected ${dependencies.expectedVersion}`,
      )
    }

    await dependencies.removeLatest(pkg)
    await assertLatestEventuallyMissing(dependencies, pkg)
    console.log(pico.green(`${pkg}: removed polluted latest tag`))
  }
}

async function assertLatestEventuallyMissing(
  dependencies: Pick<
    NativeLatestCleanupDependencies,
    'readTags' | 'consistency'
  >,
  pkg: string,
): Promise<void> {
  const delays =
    dependencies.consistency?.retryDelays ?? defaultConsistencyRetryDelays
  const retryWait = dependencies.consistency?.wait ?? wait
  let current: string | undefined

  for (const delay of delays.length ? delays : [0]) {
    if (delay > 0) await retryWait(delay)
    current = (await dependencies.readTags(pkg)).latest
    if (current === undefined) return
  }

  throw new Error(
    `${pkg}: latest did not converge to <missing>; last observed ${current ?? '<missing>'}`,
  )
}

async function main(): Promise<void> {
  const expectedVersion = readOption('--expected-version')
  const confirmation = readOption('--confirm')
  const registry = readOption('--registry') ?? defaultRegistry
  if (!expectedVersion || !confirmation) {
    throw new Error(
      'Usage: release:cleanup:native-latest --expected-version <version> --confirm <remove-native-latest:version>',
    )
  }
  if (confirmation !== `remove-native-latest:${expectedVersion}`) {
    throw new Error(
      'Native latest cleanup confirmation does not match the version',
    )
  }
  if (!process.env.NODE_AUTH_TOKEN && !process.env.NPM_TOKEN) {
    throw new Error('NODE_AUTH_TOKEN or NPM_TOKEN is required')
  }

  const readTags = async (pkg: string): Promise<Record<string, string>> =>
    JSON.parse(
      runNpm(
        ['view', pkg, 'dist-tags', '--json', '--registry', registry],
        `read ${pkg} dist-tags`,
        true,
      ),
    ) as Record<string, string>

  await cleanupNativeLatestTags({
    packages: zeusNativePackages,
    expectedVersion,
    readTags,
    removeLatest: async pkg => {
      runNpm(
        ['dist-tag', 'rm', pkg, 'latest', '--registry', registry],
        `remove ${pkg} latest`,
      )
    },
  })

  console.log(
    pico.green(
      `Native latest cleanup passed (${zeusNativePackages.length} packages checked).`,
    ),
  )
}

function runNpm(args: string[], label: string, capture = false): string {
  const result = spawnSync('npm', args, {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_AUTH_TOKEN: process.env.NODE_AUTH_TOKEN ?? process.env.NPM_TOKEN,
    },
    encoding: 'utf8',
    shell: process.platform === 'win32',
  })
  if (!capture && result.stdout) process.stdout.write(result.stdout)
  if (result.stderr) process.stderr.write(result.stderr)
  if (result.status !== 0) {
    throw new Error(
      `${label} failed (${result.status ?? 'unknown'}): ${result.stderr || result.error?.message || 'unknown npm error'}`,
    )
  }
  return result.stdout.trim()
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--'))
    throw new Error(`${name} requires a value`)
  return value
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
