/**
 * RC dist-tag policy. A release candidate must not inherit a `latest` tag that
 * points at a prerelease. Stable releases keep `latest` on the newest stable
 * version; RC prechecks fail until the polluted tags are explicitly repaired.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import { parseArgs } from 'node:util'

import { zeusFixedPackages } from '../release.config'

export interface LatestTagRecord {
  readonly name: string
  readonly latest?: string
}

export function evaluateLatestTags(
  packages: readonly LatestTagRecord[],
): string[] {
  const errors: string[] = []
  for (const pkg of packages) {
    if (pkg.latest && pkg.latest.includes('-')) {
      errors.push(`${pkg.name}: latest points at prerelease ${pkg.latest}`)
    }
  }
  return errors
}

function readLatest(name: string): string | undefined {
  try {
    const output = execFileSync(
      'npm',
      ['view', name, 'dist-tags.latest', '--json'],
      { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    ).trim()
    if (!output || output === 'undefined') return undefined
    return JSON.parse(output) as string
  } catch {
    return undefined
  }
}

function main(): void {
  const { values } = parseArgs({
    options: { force: { type: 'boolean', default: false } },
  })
  const version = (
    JSON.parse(fs.readFileSync('package.json', 'utf8')) as { version: string }
  ).version
  if (!version.includes('-rc.') && values.force !== true) {
    console.log(`latest-tag policy skipped for non-RC version ${version}`)
    return
  }
  const packages = zeusFixedPackages.map(name => ({
    name,
    latest: readLatest(name),
  }))
  const errors = evaluateLatestTags(packages)
  for (const pkg of packages) {
    if (pkg.latest === undefined) console.log(`${pkg.name}: latest absent`)
  }
  for (const error of errors) console.error(`BLOCKER ${error}`)
  console.log(
    `latest-tag policy ${errors.length === 0 ? 'PASS' : 'FAIL'}: ${packages.length} packages`,
  )
  if (errors.length > 0) process.exitCode = 1
}

if (process.argv[1]?.endsWith('check-latest-tags.ts')) main()
