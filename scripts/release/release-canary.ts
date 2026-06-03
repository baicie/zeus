import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import pico from 'picocolors'
import semver from 'semver'

import { exec, findWorkspacePackages } from '../shared/utils'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const repoRoot = path.resolve(__dirname, '../..')

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

  // 0.1.0-beta.1 -> 0.1.0-canary.20260603-xxxx
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '')
  return `${core.major}.${core.minor}.${core.patch}-canary.${date}.${runNumber}.${shortSha}`
}

function updateVersions(version: string) {
  const packages = findWorkspacePackages()

  for (const pkg of packages) {
    if (pkg.packageJson.private) continue

    // 只发 @zeus-js/*，create/bench/docs 先不动
    if (!pkg.name.startsWith('@zeus-js/')) continue

    const pkgPath = path.join(pkg.dir, 'package.json')
    const json = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'))

    json.version = version

    for (const field of [
      'dependencies',
      'devDependencies',
      'peerDependencies',
    ] as const) {
      const deps = json[field] as Record<string, string> | undefined
      if (!deps) continue

      for (const name of Object.keys(deps)) {
        if (name.startsWith('@zeus-js/') && deps[name] === 'workspace:*') {
          deps[name] = version
        }
      }
    }

    fs.writeFileSync(pkgPath, `${JSON.stringify(json, null, 2)}\n`)
  }

  const rootPath = path.join(repoRoot, 'package.json')
  const root = JSON.parse(fs.readFileSync(rootPath, 'utf-8'))
  root.version = version
  fs.writeFileSync(rootPath, `${JSON.stringify(root, null, 2)}\n`)
}

async function dryRunCheck(packages: ReturnType<typeof findWorkspacePackages>) {
  for (const pkg of packages) {
    try {
      await exec('pnpm', ['publish', '--tag', 'canary', '--dry-run'], {
        cwd: pkg.dir,
        stdio: 'pipe',
      })
    } catch {
      throw new Error(
        `Dry-run failed for ${pkg.name}. Check package configuration (files, exports, version).`,
      )
    }
  }
}

async function publishCanary() {
  const packages = findWorkspacePackages().filter(pkg => {
    if (pkg.packageJson.private) return false
    return pkg.name.startsWith('@zeus-js/')
  })

  const published: string[] = []
  for (const pkg of packages) {
    try {
      console.log(
        pico.cyan(
          `Publishing ${pkg.name}@${pkg.packageJson.version} canary...`,
        ),
      )

      await exec(
        'pnpm',
        [
          'publish',
          '--tag',
          'canary',
          '--access',
          'public',
          '--no-git-checks',
          ...(process.env.CI ? ['--provenance'] : []),
        ],
        {
          cwd: pkg.dir,
          stdio: 'inherit',
        },
      )
      published.push(pkg.name)
    } catch (err) {
      const publishedList =
        published.length > 0
          ? `\nAlready published: ${published.join(', ')}`
          : ''
      throw new Error(
        `Failed to publish ${pkg.name}. Please manually remove the canary tag from already-published packages above.${publishedList}`,
      )
    }
  }
}

async function main() {
  const baseVersion = getBaseVersion()
  const canaryVersion = getCanaryVersion(baseVersion)

  console.log(pico.cyan(`Preparing Zeus canary: ${canaryVersion}`))

  updateVersions(canaryVersion)

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

  const releasePackages = findWorkspacePackages().filter(pkg => {
    if (pkg.packageJson.private) return false
    return pkg.name.startsWith('@zeus-js/')
  })

  await dryRunCheck(releasePackages)

  await publishCanary()

  console.log(pico.green(`Published Zeus canary: ${canaryVersion}`))
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
