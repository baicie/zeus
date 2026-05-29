import fs from 'node:fs'
import { existsSync } from 'node:fs'
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
    path.resolve(__dirname, '../../packages/zeus/package.json'),
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
const isDryRun = args.dry
const skipBuild = args.skipBuild
const skipPrompts = args.skipPrompts
const skipGit = args.skipGit

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
  if (diff === 'major') return 'major'
  if (diff === 'minor') return 'minor'
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
  // Fallback: try addons/<shortName>
  const addonPath = path.resolve(__dirname, '../../addons', shortName)
  if (existsSync(path.resolve(addonPath, 'package.json'))) {
    return addonPath
  }
  // Fallback: try packages/<shortName>
  return path.resolve(__dirname, '../../packages', shortName)
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
  const changesetPath = path.resolve(__dirname, '../../.changeset/release.md')
  const changesetBody = `---\n${fixedGroupPackages
    .map(p => `"${p}": ${getBumpType(targetVersion)}`)
    .join('\n')}\n---\n\nRelease v${targetVersion}\n`
  fs.writeFileSync(changesetPath, changesetBody)
  await run('pnpm', ['changeset', 'version'])

  const finalVersion = JSON.parse(
    fs.readFileSync(
      path.resolve(__dirname, '../../packages/zeus/package.json'),
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
    await runIfNotDry('git', ['tag', `v${finalVersion}`])
    await runIfNotDry('git', ['push', 'origin', `refs/tags/v${finalVersion}`])
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
  step(`Publishing ${pkgName}@${version}...`)
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
  } catch (e: unknown) {
    if ((e as Error).message?.match(/previously published/)) {
      console.log(pico.red(`Skipping already published: ${pkgName}`))
    } else {
      throw e
    }
  }
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
