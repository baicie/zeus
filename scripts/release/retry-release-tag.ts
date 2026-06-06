import { execSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import enquirer from 'enquirer'
import pico from 'picocolors'
import semver from 'semver'

import { findWorkspacePackages } from '../shared/utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '../..')

const changesetConfig = JSON.parse(
  fs.readFileSync(path.resolve(rootDir, '.changeset/config.json'), 'utf-8'),
) as {
  ignore?: string[]
}

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    dry: { type: 'boolean' },
    registry: { type: 'string' },
    yes: { type: 'boolean', short: 'y' },
  },
  args: process.argv.slice(2),
})

const version = positionals[0]
const isDryRun = args.dry ?? false
const skipPrompt = args.yes ?? false

if (!version || !semver.valid(version)) {
  throw new Error('Usage: pnpm release:retry-tag <version> [--yes] [--dry]')
}

const tagName = `v${version}`
const ignoredPackages = new Set(changesetConfig.ignore ?? [])
const publishablePackages = findWorkspacePackages().filter(
  pkg =>
    !pkg.packageJson.private &&
    !ignoredPackages.has(pkg.name) &&
    !ignoredPackages.has(pkg.shortName),
)

function run(command: string): string {
  return execSync(command, {
    cwd: rootDir,
    encoding: 'utf-8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim()
}

function runOrEmpty(command: string): string {
  try {
    return run(command)
  } catch {
    return ''
  }
}

function runMutating(command: string): void {
  if (isDryRun) {
    console.log(pico.blue(`[dryrun] ${command}`))
    return
  }

  execSync(command, {
    cwd: rootDir,
    stdio: 'inherit',
  })
}

function assertCleanWorkingTree(): void {
  const status = run('git status --porcelain')

  if (status) {
    throw new Error(
      'Working tree must be clean before retrying a release tag. Commit or stash changes first.',
    )
  }
}

function assertWorkspaceVersions(): void {
  const mismatches = publishablePackages.filter(
    pkg => pkg.packageJson.version !== version,
  )

  if (!mismatches.length) return

  const lines = mismatches
    .map(pkg => `  - ${pkg.name}: ${pkg.packageJson.version}`)
    .join('\n')

  throw new Error(
    `Publishable packages must already be at ${version} before retagging:\n${lines}`,
  )
}

function npmViewVersion(packageName: string): string {
  const registry = args.registry
    ? ` --registry ${shellQuote(args.registry)}`
    : ''

  return runOrEmpty(
    `npm view ${shellQuote(`${packageName}@${version}`)} version${registry}`,
  )
}

function assertVersionNotPublished(): void {
  const published = publishablePackages.filter(
    pkg => npmViewVersion(pkg.name) === version,
  )

  if (!published.length) return

  const lines = published.map(pkg => `  - ${pkg.name}@${version}`).join('\n')

  throw new Error(
    `Cannot retry ${tagName}: these packages are already published on npm:\n${lines}\nBump to a new version instead.`,
  )
}

function localTagExists(): boolean {
  return Boolean(runOrEmpty(`git rev-parse --verify refs/tags/${tagName}`))
}

function remoteTagExists(): boolean {
  return Boolean(runOrEmpty(`git ls-remote --tags origin refs/tags/${tagName}`))
}

function shellQuote(value: string): string {
  return `'${value.replace(/'/g, `'\\''`)}'`
}

async function confirm(): Promise<void> {
  if (skipPrompt || isDryRun) return

  const { yes } = await enquirer.prompt<{ yes: boolean }>({
    type: 'confirm',
    name: 'yes',
    message: `Delete and recreate ${tagName} at current HEAD?`,
  })

  if (!yes) {
    console.log('Cancelled.')
    process.exit(0)
  }
}

async function main(): Promise<void> {
  console.log(pico.cyan(`Retrying release tag ${tagName}...`))

  assertCleanWorkingTree()
  assertWorkspaceVersions()
  assertVersionNotPublished()
  await confirm()

  if (localTagExists()) {
    runMutating(`git tag -d ${tagName}`)
  }

  if (remoteTagExists()) {
    runMutating(`git push origin :refs/tags/${tagName}`)
  }

  runMutating(`git tag ${tagName}`)
  runMutating(`git push origin refs/tags/${tagName}`)

  console.log(
    pico.green(
      `${tagName} now points to current HEAD. The release workflow should run again.`,
    ),
  )
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
