import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import pico from 'picocolors'
import semver from 'semver'

import { zeusFixedPackages } from '../release.config'
import { verifyCurrentMainHead } from './verify-main-head'

const defaultRegistry = 'https://registry.npmjs.org'
const defaultConsistencyRetryDelays = [0, 1_000, 2_000, 5_000, 10_000]

export interface DistTagConsistencyOptions {
  retryDelays?: readonly number[]
  wait?: (ms: number) => Promise<void>
}

export interface PromoteCanaryDependencies {
  packages: readonly string[]
  version: string
  sourceTag: string
  targetTag: string
  readTags: (pkg: string) => Promise<Record<string, string>>
  addTag: (pkg: string, tag: string, version: string) => Promise<void>
  removeTag: (pkg: string, tag: string) => Promise<void>
  verifyHead: () => Promise<void>
  consistency?: DistTagConsistencyOptions
}

const retryDelays = [0, 2_000, 5_000, 10_000, 20_000, 30_000]

export async function promoteCanaryTags(
  dependencies: PromoteCanaryDependencies,
): Promise<void> {
  const snapshots = new Map<string, string | undefined>()

  for (const pkg of dependencies.packages) {
    const tags = await dependencies.readTags(pkg)
    if (tags[dependencies.sourceTag] !== dependencies.version) {
      throw new Error(
        `${pkg}: ${dependencies.sourceTag} points to ${tags[dependencies.sourceTag] ?? '<missing>'}, expected ${dependencies.version}`,
      )
    }
    snapshots.set(pkg, tags[dependencies.targetTag])
  }

  const changed: string[] = []
  try {
    for (const pkg of dependencies.packages) {
      if (snapshots.get(pkg) === dependencies.version) continue
      await dependencies.verifyHead()
      await assertTagUnchanged(
        dependencies,
        pkg,
        dependencies.targetTag,
        snapshots.get(pkg),
      )
      changed.push(pkg)
      await dependencies.addTag(
        pkg,
        dependencies.targetTag,
        dependencies.version,
      )
      await assertTagEventually(
        dependencies,
        pkg,
        dependencies.targetTag,
        dependencies.version,
      )
      await dependencies.verifyHead()
    }
    await dependencies.verifyHead()
  } catch (error) {
    const rollbackErrors: string[] = []
    const rollbackSkips: string[] = []
    for (const pkg of changed.reverse()) {
      try {
        const current = (await dependencies.readTags(pkg))[
          dependencies.targetTag
        ]
        if (current !== dependencies.version) {
          rollbackSkips.push(
            `${pkg}: ${dependencies.targetTag} now points to ${current ?? '<missing>'}`,
          )
          continue
        }
        const previous = snapshots.get(pkg)
        if (previous) {
          await dependencies.addTag(pkg, dependencies.targetTag, previous)
          await assertTagEventually(
            dependencies,
            pkg,
            dependencies.targetTag,
            previous,
          )
        } else {
          await dependencies.removeTag(pkg, dependencies.targetTag)
          await assertTagEventually(
            dependencies,
            pkg,
            dependencies.targetTag,
            undefined,
          )
        }
      } catch (rollbackError) {
        rollbackErrors.push(formatPackageError(pkg, rollbackError))
      }
    }
    const message = error instanceof Error ? error.message : String(error)
    throw new Error(
      `Canary tag promotion failed: ${message}${rollbackSkips.length ? `; rollback skipped: ${rollbackSkips.join('; ')}` : ''}${rollbackErrors.length ? `; rollback failures: ${rollbackErrors.join('; ')}` : ''}`,
    )
  }
}

async function assertTagUnchanged(
  dependencies: Pick<PromoteCanaryDependencies, 'readTags'>,
  pkg: string,
  tag: string,
  expected: string | undefined,
): Promise<void> {
  const current = (await dependencies.readTags(pkg))[tag]
  if (current !== expected) {
    throw new Error(
      `${pkg}: ${tag} changed from ${expected ?? '<missing>'} to ${current ?? '<missing>'} before promotion; refusing to overwrite`,
    )
  }
}

async function assertTagEventually(
  dependencies: Pick<PromoteCanaryDependencies, 'readTags' | 'consistency'>,
  pkg: string,
  tag: string,
  expected: string | undefined,
): Promise<void> {
  const delays =
    dependencies.consistency?.retryDelays ?? defaultConsistencyRetryDelays
  const retryWait = dependencies.consistency?.wait ?? wait
  let current: string | undefined

  for (const delay of delays.length ? delays : [0]) {
    if (delay > 0) await retryWait(delay)
    current = (await dependencies.readTags(pkg))[tag]
    if (current === expected) return
  }

  throw new Error(
    `${pkg}: ${tag} did not converge to ${expected ?? '<missing>'}; last observed ${current ?? '<missing>'}`,
  )
}

export async function cleanupCanaryStagingTags(
  dependencies: Omit<
    PromoteCanaryDependencies,
    'targetTag' | 'addTag' | 'verifyHead'
  >,
): Promise<void> {
  const failures: string[] = []
  for (const pkg of dependencies.packages) {
    try {
      const tags = await dependencies.readTags(pkg)
      const current = tags[dependencies.sourceTag]
      if (current === undefined) continue
      if (current !== dependencies.version) {
        throw new Error(
          `${dependencies.sourceTag} points to ${current}; refusing cleanup for expected ${dependencies.version}`,
        )
      }
      await dependencies.removeTag(pkg, dependencies.sourceTag)
      await assertTagEventually(
        dependencies,
        pkg,
        dependencies.sourceTag,
        undefined,
      )
    } catch (error) {
      failures.push(formatPackageError(pkg, error))
    }
  }
  if (failures.length) {
    throw new Error(
      `Unable to clean Canary staging tag: ${failures.join('; ')}`,
    )
  }
}

function formatPackageError(pkg: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  return message.startsWith(`${pkg}:`) ? message : `${pkg}: ${message}`
}

async function main(): Promise<void> {
  const version = readOption('--version')
  const sourceTag = readOption('--source-tag')
  const targetTag = readOption('--target-tag') ?? 'canary'
  const registry = readOption('--registry') ?? defaultRegistry

  if (!version || !sourceTag) {
    throw new Error(
      'Usage: release:promote:canary --version <version> --source-tag <tag> [--target-tag canary]',
    )
  }
  if (!semver.valid(version)) throw new Error(`Invalid version: ${version}`)
  if (!/^zeus-canary-\d+-\d+$/.test(sourceTag)) {
    throw new Error(`Invalid Canary staging tag: ${sourceTag}`)
  }
  if (sourceTag === targetTag) {
    throw new Error('Canary staging and target tags must be different')
  }
  if (!process.env.NODE_AUTH_TOKEN && !process.env.NPM_TOKEN) {
    throw new Error('NODE_AUTH_TOKEN or NPM_TOKEN is required')
  }

  const readTags = async (pkg: string): Promise<Record<string, string>> =>
    readDistTags(pkg, registry)
  const addTag = async (
    pkg: string,
    tag: string,
    nextVersion: string,
  ): Promise<void> => {
    await runNpmWithRetry(
      ['dist-tag', 'add', `${pkg}@${nextVersion}`, tag, '--registry', registry],
      `promote ${pkg} ${tag} -> ${nextVersion}`,
    )
  }
  const removeTag = async (pkg: string, tag: string): Promise<void> => {
    await runNpmWithRetry(
      ['dist-tag', 'rm', pkg, tag, '--registry', registry],
      `remove ${pkg} ${tag}`,
    )
  }
  const verifyHead = async (): Promise<void> => {
    verifyCurrentMainHead()
  }

  if (process.argv.includes('--cleanup')) {
    await cleanupCanaryStagingTags({
      packages: zeusFixedPackages,
      version,
      sourceTag,
      readTags,
      removeTag,
    })
    console.log(
      pico.green(
        `Canary staging cleanup passed (${sourceTag} removed for ${version}).`,
      ),
    )
    return
  }

  await promoteCanaryTags({
    packages: zeusFixedPackages,
    version,
    sourceTag,
    targetTag,
    readTags,
    addTag,
    removeTag,
    verifyHead,
  })

  console.log(
    pico.green(`Canary tag promotion passed (${targetTag} -> ${version}).`),
  )
}

async function readDistTags(
  pkg: string,
  registry: string,
): Promise<Record<string, string>> {
  const result = await runNpmWithRetry(
    ['view', pkg, 'dist-tags', '--json', '--registry', registry],
    `read ${pkg} dist-tags`,
    true,
  )
  return JSON.parse(result) as Record<string, string>
}

async function runNpmWithRetry(
  args: string[],
  label: string,
  capture = false,
): Promise<string> {
  let lastError: unknown
  for (const delay of retryDelays) {
    if (delay > 0) await wait(delay)
    try {
      return runNpm(args, label, capture)
    } catch (error) {
      if (!isRetryableNpmError(error)) throw error
      lastError = error
    }
  }
  throw lastError
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

function isRetryableNpmError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error)
  return (
    /\bE?(?:409|429|5\d\d)\b|409 Conflict/.test(message) ||
    /ETIMEDOUT|ECONNRESET|ECONNABORTED|EAI_AGAIN|ENOTFOUND/.test(message) ||
    message.includes('Failed to save packument')
  )
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
