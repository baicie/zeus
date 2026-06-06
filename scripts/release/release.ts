import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

import enquirer from 'enquirer'
import pico from 'picocolors'
import semver from 'semver'

import { exec, findWorkspacePackages } from '../shared/utils'

interface ExecResult {
  ok: boolean
  code: number | null
  stderr: string
  stdout: string
}

interface ParsedChangeset {
  id: string
  summary: string
  releases: Array<{ name: string; type: string }>
}

const readChangesets = (): ParsedChangeset[] => {
  const changesetDir = path.resolve(__dirname, '../../.changeset')
  const files = fs.readdirSync(changesetDir)
  const results: ParsedChangeset[] = []

  for (const file of files) {
    if (!file.endsWith('.md') || file === 'README.md') continue
    const content = fs.readFileSync(path.join(changesetDir, file), 'utf-8')
    const id = file.replace('.md', '')
    const lines = content.split('\n')

    const releases: ParsedChangeset['releases'] = []
    let inFrontmatter = false
    let passedFirstDivider = false
    const summaryLines: string[] = []

    for (const line of lines) {
      if (line === '---') {
        if (!inFrontmatter) {
          inFrontmatter = true
        } else if (passedFirstDivider) {
          inFrontmatter = false
        } else {
          passedFirstDivider = true
        }
        continue
      }
      if (inFrontmatter && !passedFirstDivider) {
        const colonIdx = line.indexOf(':')
        if (colonIdx > 0) {
          const key = line.slice(0, colonIdx).trim().replace(/"/g, '')
          const val = line
            .slice(colonIdx + 1)
            .trim()
            .replace(/"/g, '')
          if (key) releases.push({ name: key, type: val })
        }
        continue
      }
      if (!inFrontmatter && line.trim()) {
        summaryLines.push(line.trim())
      }
    }

    results.push({ id, summary: summaryLines.join(' '), releases })
  }

  return results
}

const generateUnifiedChangelog = (
  version: string,
  changesets: ParsedChangeset[],
) => {
  if (changesets.length === 0) return

  const changelogPath = path.resolve(__dirname, '../../CHANGELOG.md')
  const date = new Date().toISOString().split('T')[0]

  const grouped: Record<string, ParsedChangeset[]> = {
    major: [],
    minor: [],
    patch: [],
  }

  for (const cs of changesets) {
    grouped[getHighestReleaseType(cs)].push(cs)
  }

  const parts: string[] = []
  for (const [type, items] of Object.entries(grouped)) {
    if (items.length === 0) continue
    const emoji =
      type === 'major' ? 'Breaking' : type === 'minor' ? 'Features' : 'Fixes'
    parts.push(`### ${emoji}\n`)
    for (const cs of items) {
      parts.push(`- ${cs.summary} (\`${cs.id.slice(0, 7)}\`)\n`)
    }
    parts.push('\n')
  }

  const newEntry = `## ${version} (${date})\n\n${parts.join('')}`

  let existing = ''
  if (fs.existsSync(changelogPath)) {
    existing = fs.readFileSync(changelogPath, 'utf-8')
  }

  const header = '# Changelog\n\n'
  const withoutHeader = existing.startsWith('# Changelog')
    ? existing.slice(header.length)
    : existing

  fs.writeFileSync(changelogPath, header + newEntry + '\n' + withoutHeader)
  console.log(pico.green(`  Unified changelog written to CHANGELOG.md`))
}

const getHighestReleaseType = (
  changeset: ParsedChangeset,
): 'major' | 'minor' | 'patch' => {
  if (changeset.releases.some(release => release.type === 'major')) {
    return 'major'
  }

  if (changeset.releases.some(release => release.type === 'minor')) {
    return 'minor'
  }

  return 'patch'
}

const cleanupPackageChangelogs = () => {
  const wsPkgs = findWorkspacePackages()
  let cleaned = 0
  for (const pkg of wsPkgs) {
    const clPath = path.join(pkg.dir, 'CHANGELOG.md')
    if (fs.existsSync(clPath)) {
      fs.unlinkSync(clPath)
      cleaned++
    }
  }
  if (cleaned > 0) {
    console.log(
      pico.green(`  Removed ${cleaned} individual package CHANGELOG.md files`),
    )
  }
}

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const changesetConfig = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../.changeset/config.json'),
    'utf-8',
  ),
)

// Collect packages in the fixed groups
const fixedGroupPackages: string[] = []
for (const group of changesetConfig.fixed || []) {
  for (const pkg of group) {
    if (!fixedGroupPackages.includes(pkg)) {
      fixedGroupPackages.push(pkg)
    }
  }
}

const rootPkgPath = path.resolve(__dirname, '../../package.json')
const currentVersion = JSON.parse(
  fs.readFileSync(
    path.resolve(__dirname, '../../packages/core/zeus/package.json'),
    'utf-8',
  ),
).version

const changesetIgnore = new Set<string>(changesetConfig.ignore || [])

const { values: args, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    preid: { type: 'string' },
    dry: { type: 'boolean' },
    tag: { type: 'string' },
    skipBuild: { type: 'boolean' },
    skipGit: { type: 'boolean' },
    skipPrompts: { type: 'boolean' },
    publish: { type: 'boolean' },
    publishOnly: { type: 'boolean' },
    registry: { type: 'string' },
  },
  args: process.argv.slice(2),
})

const preId = (args.preid || semver.prerelease(currentVersion)?.[0]) as
  | string
  | undefined
const isDryRun = args.dry ?? false
const skipBuild = args.skipBuild ?? false
const skipPrompts = args.skipPrompts ?? false
const skipGit = args.skipGit ?? false

const versionIncrements: Array<string> = [
  'patch',
  'minor',
  'major',
  ...(preId
    ? (['prepatch', 'preminor', 'premajor', 'prerelease'] as const)
    : []),
]

const inc = (i: semver.ReleaseType) =>
  semver.inc(currentVersion, i, undefined, preId) as string

const getBumpType = (target: string): string => {
  const diff = semver.diff(currentVersion, target)

  if (diff === 'major' || diff === 'premajor') return 'major'
  if (diff === 'minor' || diff === 'preminor') return 'minor'

  return 'patch'
}

const run = async (
  bin: string,
  binArgs: ReadonlyArray<string>,
  opts: object = {},
) => exec(bin, Array.from(binArgs), { stdio: 'inherit', ...opts })

const dryRun = async (bin: string, binArgs: string[], opts: object = {}) =>
  console.log(pico.blue(`[dryrun] ${bin} ${binArgs.join(' ')}`), opts)

const runIfNotDry = isDryRun ? dryRun : run

const getPkgRoot = (pkgName: string) => {
  const shortName = pkgName.replace('@zeus-js/', '')
  // Find the package in workspace
  const wsPkgs = findWorkspacePackages()
  const pkg = wsPkgs.find(p => p.name === pkgName || p.shortName === shortName)
  if (pkg) {
    return pkg.dir
  }

  throw new Error(`Workspace package not found: ${pkgName}`)
}

const forceFixedGroupVersion = (version: string) => {
  for (const pkgName of fixedGroupPackages) {
    const pkgRoot = getPkgRoot(pkgName)
    const pkgPath = path.join(pkgRoot, 'package.json')

    if (!fs.existsSync(pkgPath)) {
      throw new Error(`Package not found: ${pkgName} at ${pkgPath}`)
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))
    pkg.version = version

    fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)
  }
}

const step = (msg: string) => console.log(pico.cyan(msg))

async function main() {
  let targetVersion = positionals[0]

  if (!targetVersion) {
    const { release } = await enquirer.prompt<{ release: string }>({
      type: 'select',
      name: 'release',
      message: 'Select release type',
      choices: [
        ...versionIncrements.map(i => `${i} (${inc(i as semver.ReleaseType)})`),
        'custom',
      ],
    })

    if (release === 'custom') {
      const { version } = await enquirer.prompt<{ version: string }>({
        type: 'input',
        name: 'version',
        message: 'Input custom version',
        initial: currentVersion,
      })
      targetVersion = version
    } else {
      targetVersion = release.match(/\((.*)\)/)?.[1] ?? ''
    }
  }

  if (versionIncrements.includes(targetVersion)) {
    targetVersion = inc(targetVersion as semver.ReleaseType) ?? ''
  }

  if (!semver.valid(targetVersion)) {
    throw new Error(`invalid target version: ${targetVersion}`)
  }

  if (!skipPrompts) {
    const { yes } = await enquirer.prompt<{ yes: boolean }>({
      type: 'confirm',
      name: 'yes',
      message: `Releasing v${targetVersion}. Confirm?`,
    })
    if (!yes) return
  } else {
    step(`Releasing v${targetVersion}...`)
  }

  step('\nGenerating changelog...')
  const changesets = readChangesets()
  const changesetPath = path.resolve(__dirname, '../../.changeset/release.md')
  const changesetBody = `---\n${fixedGroupPackages
    .map(p => `"${p}": ${getBumpType(targetVersion)}`)
    .join('\n')}\n---\n\nRelease v${targetVersion}\n`
  fs.writeFileSync(changesetPath, changesetBody)
  await run('pnpm', ['changeset', 'version'])

  forceFixedGroupVersion(targetVersion)

  generateUnifiedChangelog(targetVersion, changesets)
  cleanupPackageChangelogs()

  const finalVersion = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '../../packages/core/zeus/package.json'),
      'utf-8',
    ),
  ).version

  step('\nUpdating root version...')
  const root = JSON.parse(fs.readFileSync(rootPkgPath, 'utf-8'))
  root.version = finalVersion
  fs.writeFileSync(rootPkgPath, JSON.stringify(root, null, 2) + '\n')

  if (!skipPrompts) {
    const { yes } = await enquirer.prompt<{ yes: boolean }>({
      type: 'confirm',
      name: 'yes',
      message: `Changelog generated (final: v${finalVersion}). Does it look good?`,
    })
    if (!yes) {
      step('\nReverting changes...')
      await run('git', ['checkout', '.'])
      fs.rmSync(changesetPath, { force: true })
      return
    }
  }

  step('\nUpdating lockfile...')
  await run('pnpm', ['install', '--prefer-offline'])

  if (!skipGit) {
    const { stdout } = (await run('git', ['diff'], {
      stdio: 'pipe',
    })) as ExecResult
    if (stdout) {
      step('\nCommitting changes...')
      await runIfNotDry('git', ['add', '-A'])
      await runIfNotDry('git', ['commit', '-m', `release: v${finalVersion}`])
    } else {
      console.log('No changes to commit.')
    }

    step('\nPushing to GitHub...')
    const tagName = `v${finalVersion}`
    const { stdout: tagList } = (await run('git', ['tag', '-l', tagName], {
      stdio: 'pipe',
    })) as ExecResult
    if (tagList.trim() === tagName) {
      console.log(pico.yellow(`  Tag ${tagName} already exists, removing...`))
      await runIfNotDry('git', ['tag', '-d', tagName])
      await runIfNotDry('git', ['push', 'origin', `:refs/tags/${tagName}`])
    }
    await runIfNotDry('git', ['tag', tagName])
    await runIfNotDry('git', ['push', 'origin', `refs/tags/${tagName}`])
    await runIfNotDry('git', ['push'])
  }

  if (!args.publish) {
    console.log(
      pico.yellow(
        `\nRelease will be done via GitHub Actions.\n` +
          `Check status at https://github.com/baicie/zeus/actions/workflows/release.yml`,
      ),
    )
  }

  if (isDryRun) {
    console.log(`\nDry run finished - run git diff to see package changes.`)
  }
  console.log()
}

async function publishPackages(version: string) {
  step('\nPublishing packages...')

  const additionalFlags: string[] = []
  if (isDryRun) additionalFlags.push('--dry-run')
  if (isDryRun || skipGit || process.env.CI)
    additionalFlags.push('--no-git-checks')
  if (process.env.CI && !args.registry) additionalFlags.push('--provenance')

  const packages = findWorkspacePackages().filter(
    pkg =>
      !pkg.packageJson.private &&
      !changesetIgnore.has(pkg.name) &&
      !changesetIgnore.has(pkg.shortName),
  )

  for (const pkg of packages) {
    const pkgVersion = pkg.packageJson.version as string
    const pkgTag = resolveReleaseTag(pkgVersion)
    await publishPackage(pkg.name, pkgVersion, pkgTag, additionalFlags)
  }
}

async function publishPackage(
  pkgName: string,
  version: string,
  releaseTag: string | null,
  additionalFlags: string[],
) {
  const maxAttempts = isDryRun ? 1 : 5

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    step(`Publishing ${pkgName}@${version} (${attempt}/${maxAttempts})...`)

    try {
      const publishArgs = [
        'publish',
        ...(releaseTag ? ['--tag', releaseTag] : []),
        '--access',
        'public',
        ...(args.registry ? ['--registry', args.registry] : []),
        ...additionalFlags,
      ]
      await run('pnpm', publishArgs, {
        cwd: getPkgRoot(pkgName),
        stdio: 'pipe',
      })
      console.log(pico.green(`Successfully published ${pkgName}@${version}`))
      return
    } catch (e: unknown) {
      if (isAlreadyPublishedError(e)) {
        console.log(pico.red(`Skipping already published: ${pkgName}`))
        return
      }

      if (await isPackagePublished(pkgName, version)) {
        console.log(
          pico.yellow(
            `${pkgName}@${version} is already visible on npm; treating publish as complete.`,
          ),
        )
        return
      }

      if (!isRetryablePublishError(e) || attempt === maxAttempts) {
        throw e
      }

      const delayMs = getPublishRetryDelay(attempt)
      console.log(
        pico.yellow(
          `npm registry returned a retryable publish error for ${pkgName}. Retrying in ${Math.round(
            delayMs / 1000,
          )}s...`,
        ),
      )
      await sleep(delayMs)
    }
  }
}

async function isPackagePublished(
  packageName: string,
  version: string,
): Promise<boolean> {
  try {
    const viewArgs = [
      'view',
      `${packageName}@${version}`,
      'version',
      ...(args.registry ? ['--registry', args.registry] : []),
    ]
    const result = (await run('npm', viewArgs, {
      stdio: 'pipe',
    })) as ExecResult

    return result.stdout.trim() === version
  } catch {
    return false
  }
}

function isAlreadyPublishedError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return message.includes('previously published')
}

function isRetryablePublishError(err: unknown): boolean {
  const message = err instanceof Error ? err.message : String(err)
  return (
    message.includes('E409') ||
    message.includes('409 Conflict') ||
    message.includes('Failed to save packument') ||
    message.includes('previous package has been fully processed')
  )
}

function getPublishRetryDelay(attempt: number): number {
  return Math.min(10_000 * 2 ** (attempt - 1), 60_000)
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function buildPackages() {
  step('\nBuilding all packages...')
  if (!skipBuild) {
    await run('pnpm', ['run', 'build', '--withTypes'])
  } else {
    console.log('(skipped)')
  }
}

async function publishOnly() {
  const targetVersion = positionals[0]
  if (!targetVersion) {
    throw new Error('Version required when using --publishOnly')
  }
  await buildPackages()
  await publishPackages(targetVersion)
}

const fnToRun = args.publishOnly ? publishOnly : main

function resolveReleaseTag(pkgVersion: string): string | null {
  if (args.tag) return args.tag
  if (pkgVersion.includes('alpha')) return 'alpha'
  if (pkgVersion.includes('beta')) return 'beta'
  if (pkgVersion.includes('rc')) return 'rc'
  return null
}

fnToRun().catch(err => {
  console.error(err)
  process.exit(1)
})
