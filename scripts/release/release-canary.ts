import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import pico from 'picocolors'
import semver from 'semver'

import { exec, findWorkspacePackages } from '../shared/utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

type WorkspacePackage = ReturnType<typeof findWorkspacePackages>[number]
type ExecOutput = { stdout: string }

function getBaseVersion() {
  const zeusPkgPath = path.join(repoRoot, 'packages/core/zeus/package.json')
  const pkg = JSON.parse(fs.readFileSync(zeusPkgPath, 'utf-8'))
  return pkg.version as string
}

function getCanaryVersion(baseVersion: string) {
  const core = semver.parse(baseVersion)
  if (!core) {
    throw new Error(`Invalid base version: ${baseVersion}`)
  }

  const shortSha = process.env.GITHUB_SHA?.slice(0, 8) ?? 'local'
  const runNumber = process.env.GITHUB_RUN_NUMBER ?? Date.now().toString()
  const runAttempt = process.env.GITHUB_RUN_ATTEMPT ?? '1'
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')

  // 0.1.0-beta.1 -> 0.1.0-canary.20260603.xxxxxxxx.a1b2c3d4
  return `${core.major}.${core.minor}.${core.patch}-canary.${date}.${runNumber}.${runAttempt}.${shortSha}`
}

function updateVersions(version: string) {
  const packages = findWorkspacePackages()

  for (const pkg of packages) {
    if (!isCanaryPackage(pkg)) continue

    const pkgPath = path.join(pkg.dir, 'package.json')
    const json = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

    json.version = version

    fs.writeFileSync(pkgPath, `${JSON.stringify(json, null, 2)}\n`)
  }

  const rootPath = path.join(repoRoot, 'package.json')
  const root = JSON.parse(fs.readFileSync(rootPath, 'utf-8'))
  root.version = version
  fs.writeFileSync(rootPath, `${JSON.stringify(root, null, 2)}\n`)
}

function getPublishArgs(options: { dryRun?: boolean }): string[] {
  const useProvenance =
    process.env.GITHUB_ACTIONS === 'true' &&
    Boolean(process.env.ACTIONS_ID_TOKEN_REQUEST_TOKEN) &&
    Boolean(process.env.ACTIONS_ID_TOKEN_REQUEST_URL)

  return [
    'publish',
    '--tag',
    'canary',
    '--access',
    'public',
    '--no-git-checks',
    ...(options.dryRun ? ['--dry-run'] : []),
    ...(useProvenance && !options.dryRun ? ['--provenance'] : []),
  ]
}

function isCanaryPackage(pkg: WorkspacePackage): boolean {
  if (pkg.packageJson.private) return false
  if (!pkg.name.startsWith('@zeus-js/')) return false
  return true
}

async function dryRunCheck(packages: ReturnType<typeof findWorkspacePackages>) {
  for (const pkg of packages) {
    try {
      await exec('pnpm', getPublishArgs({ dryRun: true }), {
        cwd: pkg.dir,
        stdio: 'inherit',
      })
    } catch (err) {
      throw Object.assign(
        new Error(
          `Dry-run failed for ${pkg.name}. Check package configuration (files, exports, version).`,
        ),
        { cause: err },
      )
    }
  }
}

async function publishCanary() {
  assertPublishToken()

  const packages = findWorkspacePackages().filter(isCanaryPackage)

  const published: string[] = []
  for (const pkg of packages) {
    try {
      await publishPackageWithRetry(pkg)
      published.push(pkg.name)
    } catch (err) {
      const publishedList =
        published.length > 0
          ? `\nAlready published: ${published.join(', ')}`
          : ''
      throw Object.assign(
        new Error(
          [
            `Failed to publish ${pkg.name}.`,
            publishedList,
            '',
            'Some packages may already have been published.',
            'NPM package versions are immutable.',
            'Re-run the workflow to generate a new canary version via GITHUB_RUN_ATTEMPT,',
            'or publish missing packages manually with a new canary version.',
          ].join('\n'),
        ),
        { cause: err },
      )
    }
  }
}

function assertPublishToken(): void {
  if (process.env.NODE_AUTH_TOKEN || process.env.NPM_TOKEN) return

  throw new Error(
    'Missing npm publish token. Set NODE_AUTH_TOKEN or NPM_TOKEN before publishing canary packages.',
  )
}

async function publishPackageWithRetry(pkg: WorkspacePackage): Promise<void> {
  const version = String(pkg.packageJson.version)
  const maxAttempts = 5

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    console.log(
      pico.cyan(
        `Publishing ${pkg.name}@${version} canary (${attempt}/${maxAttempts})...`,
      ),
    )

    try {
      await exec('pnpm', getPublishArgs({ dryRun: false }), {
        cwd: pkg.dir,
        stdio: 'inherit',
      })
      return
    } catch (err) {
      if (await isPackagePublished(pkg.name, version)) {
        console.log(
          pico.yellow(
            `${pkg.name}@${version} is already visible on npm; treating publish as complete.`,
          ),
        )
        return
      }

      if (!isRetryablePublishError(err) || attempt === maxAttempts) {
        throw err
      }

      const delayMs = getPublishRetryDelay(attempt)
      console.log(
        pico.yellow(
          `npm registry returned a retryable publish error for ${pkg.name}. Retrying in ${Math.round(
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
    const result = (await exec(
      'npm',
      ['view', `${packageName}@${version}`, 'version'],
      {
        stdio: 'pipe',
      },
    )) as ExecOutput
    return result.stdout.trim() === version
  } catch {
    return false
  }
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

async function main() {
  if (!process.env.CI && !process.argv.includes('--force-local')) {
    console.error(
      pico.red(
        'release:canary mutates package versions. It is intended to run in CI.',
      ),
    )
    console.error(pico.red('Use --force-local to run locally.'))
    process.exit(1)
  }

  const baseVersion = getBaseVersion()
  const canaryVersion = getCanaryVersion(baseVersion)

  console.log(pico.cyan(`Preparing Zeus canary: ${canaryVersion}`))

  // Output canary version to GITHUB_ENV so downstream workflows can access it
  if (process.env.GITHUB_ENV) {
    fs.appendFileSync(
      process.env.GITHUB_ENV,
      `ZEUS_CANARY_VERSION=${canaryVersion}\n`,
    )
  }

  updateVersions(canaryVersion)

  // Keep lockfile metadata in sync with temporary canary package versions.
  // We keep `workspace:*` ranges unchanged; pnpm will rewrite workspace deps
  // during publish/pack.
  await exec('pnpm', ['install', '--lockfile-only'], {
    cwd: repoRoot,
    stdio: 'inherit',
  })

  await exec('pnpm', ['build'], {
    cwd: repoRoot,
    stdio: 'inherit',
  })

  await exec('pnpm', ['build-dts'], {
    cwd: repoRoot,
    stdio: 'inherit',
  })

  await exec('pnpm', ['api:check'], {
    cwd: repoRoot,
    stdio: 'inherit',
  })

  await exec('pnpm', ['check:exports'], {
    cwd: repoRoot,
    stdio: 'inherit',
  })

  await exec('pnpm', ['check:repository'], {
    cwd: repoRoot,
    stdio: 'inherit',
  })

  const releasePackages = findWorkspacePackages().filter(isCanaryPackage)

  await dryRunCheck(releasePackages)

  await publishCanary()

  console.log(pico.green(`Published Zeus canary: ${canaryVersion}`))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
