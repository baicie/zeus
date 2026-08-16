import { execFile } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import pico from 'picocolors'
import semver from 'semver'

import { zeusNativePackages } from '../release.config'

const execFileAsync = promisify(execFile)

export function getNativeLatestErrors(
  tagsByPackage: ReadonlyMap<string, Readonly<Record<string, string>>>,
): string[] {
  const errors: string[] = []
  for (const [pkg, tags] of tagsByPackage) {
    if (tags.latest && semver.prerelease(tags.latest)) {
      errors.push(`${pkg}: latest must not point to prerelease ${tags.latest}`)
    }
  }
  return errors
}

async function main(): Promise<void> {
  const registry = readOption('--registry') ?? 'https://registry.npmjs.org'
  const entries = await Promise.all(
    zeusNativePackages.map(async pkg => {
      const { stdout } = await execFileAsync(
        'npm',
        ['view', pkg, 'dist-tags', '--json', '--registry', registry],
        { cwd: process.cwd(), maxBuffer: 1024 * 1024 },
      )
      return [pkg, JSON.parse(stdout.trim()) as Record<string, string>] as const
    }),
  )
  const errors = getNativeLatestErrors(new Map(entries))
  if (errors.length) {
    throw new Error(`Native latest policy failed:\n- ${errors.join('\n- ')}`)
  }
  console.log(
    pico.green(
      `Native latest policy passed (${zeusNativePackages.length} packages).`,
    ),
  )
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--'))
    throw new Error(`${name} requires a value`)
  return value
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) await main()
