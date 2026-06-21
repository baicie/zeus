import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { zeusFixedPackages } from '../release.config'

interface PackageJson {
  name?: string
  version?: string
  private?: boolean
}

export interface CheckZeusPackageVersionsOptions {
  root?: string
  packageRoots?: string[]
  fixedPackages?: string[]
  rootVersionPackage?: string
}

export interface PackageVersionProblem {
  type:
    | 'root-version-package-missing'
    | 'fixed-package-not-found'
    | 'version-mismatch'
  packageName: string
  version?: string
  expectedVersion?: string
  file?: string
}

export interface CheckZeusPackageVersionsResult {
  ok: boolean
  expectedVersion?: string
  problems: PackageVersionProblem[]
}

interface DiscoveredPackage {
  file: string
  packageJson: PackageJson
}

const DEFAULT_PACKAGE_ROOTS = [
  'packages/core',
  'packages/devtools',
  'packages/web-c',
  'packages/create',
]

const DEFAULT_ROOT_VERSION_PACKAGE = '@zeus-js/zeus'

export function checkZeusPackageVersions(
  options: CheckZeusPackageVersionsOptions = {},
): CheckZeusPackageVersionsResult {
  const root = options.root ?? process.cwd()
  const packageRoots = options.packageRoots ?? DEFAULT_PACKAGE_ROOTS
  const fixedPackages = options.fixedPackages ?? zeusFixedPackages
  const rootVersionPackage =
    options.rootVersionPackage ?? DEFAULT_ROOT_VERSION_PACKAGE

  const packages = discoverPackages(root, packageRoots)
  const publicZeusPackages = packages.filter(item => {
    const { name, private: isPrivate } = item.packageJson
    return Boolean(name?.startsWith('@zeus-js/') && !isPrivate)
  })

  const byName = new Map<string, DiscoveredPackage>()

  for (const item of publicZeusPackages) {
    if (item.packageJson.name) {
      byName.set(item.packageJson.name, item)
    }
  }

  const rootPackage = byName.get(rootVersionPackage)
  const problems: PackageVersionProblem[] = []

  if (!rootPackage?.packageJson.version) {
    problems.push({
      type: 'root-version-package-missing',
      packageName: rootVersionPackage,
    })

    return {
      ok: false,
      problems,
    }
  }

  const expectedVersion = rootPackage.packageJson.version

  for (const item of publicZeusPackages) {
    const packageName = item.packageJson.name

    if (!packageName) {
      continue
    }

    if (!fixedPackages.includes(packageName)) {
      continue
    }

    if (item.packageJson.version !== expectedVersion) {
      problems.push({
        type: 'version-mismatch',
        packageName,
        version: item.packageJson.version,
        expectedVersion,
        file: path.relative(root, item.file),
      })
    }
  }

  for (const packageName of fixedPackages) {
    if (!byName.has(packageName)) {
      problems.push({
        type: 'fixed-package-not-found',
        packageName,
        expectedVersion,
      })
    }
  }

  return {
    ok: problems.length === 0,
    expectedVersion,
    problems,
  }
}

function discoverPackages(
  root: string,
  packageRoots: string[],
): DiscoveredPackage[] {
  const result: DiscoveredPackage[] = []

  for (const packageRoot of packageRoots) {
    walk(path.join(root, packageRoot), result)
  }

  return result
}

function walk(dir: string, result: DiscoveredPackage[]): void {
  if (!fs.existsSync(dir)) {
    return
  }

  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const absolutePath = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      if (shouldSkipDirectory(entry.name)) {
        continue
      }

      walk(absolutePath, result)
      continue
    }

    if (entry.isFile() && entry.name === 'package.json') {
      result.push({
        file: absolutePath,
        packageJson: readJson<PackageJson>(absolutePath),
      })
    }
  }
}

function shouldSkipDirectory(name: string): boolean {
  return (
    name === 'node_modules' ||
    name === 'dist' ||
    name === '.turbo' ||
    name === '.git'
  )
}

function readJson<T>(file: string): T {
  return JSON.parse(fs.readFileSync(file, 'utf8')) as T
}

function printResult(result: CheckZeusPackageVersionsResult): void {
  if (result.ok) {
    console.log(
      `[zeus] package versions are aligned: ${result.expectedVersion}`,
    )
    return
  }

  console.error('[zeus] package version contract failed.')

  if (result.expectedVersion) {
    console.error(`[zeus] expected version: ${result.expectedVersion}`)
  }

  for (const problem of result.problems) {
    switch (problem.type) {
      case 'root-version-package-missing':
        console.error(
          `  - ${problem.packageName}: root version package is missing or has no version`,
        )
        break

      case 'fixed-package-not-found':
        console.error(
          `  - ${problem.packageName}: listed in zeusFixedPackages but package.json was not found`,
        )
        break

      case 'version-mismatch':
        console.error(
          `  - ${problem.packageName}: ${problem.version} !== ${problem.expectedVersion} (${problem.file})`,
        )
        break
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const result = checkZeusPackageVersions()
  printResult(result)

  if (!result.ok) {
    process.exit(1)
  }
}
