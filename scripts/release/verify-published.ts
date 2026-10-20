import { execFile } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { promisify } from 'node:util'

import pico from 'picocolors'

import { zeusFixedPackages } from '../release.config'
import { waitForPublishedPackageVisibility } from './published-package-visibility'

const execFileAsync = promisify(execFile)

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await main()
}

async function main(): Promise<void> {
  const registry = readOption('--registry') ?? 'https://registry.npmjs.org'
  const version = readOption('--version') ?? positionalVersion()
  const selectedPackage = readOption('--package')

  if (!version) {
    throw new Error(
      'Usage: release:verify:published --version <version> [--package <name>]',
    )
  }

  const packages = selectedPackage
    ? [normalizePackageName(selectedPackage)]
    : zeusFixedPackages

  await Promise.all(packages.map(pkg => verifyPackage(pkg, version, registry)))
  console.log(
    pico.green(
      `Published package verification passed (${packages.length} package${packages.length === 1 ? '' : 's'} at ${version}).`,
    ),
  )
}

async function verifyPackage(
  pkg: string,
  expectedVersion: string,
  registry: string,
): Promise<void> {
  await waitForPublishedPackageVisibility({
    packageName: pkg,
    expectedVersion,
    async queryVersion() {
      const { stdout } = await execFileAsync(
        'npm',
        [
          'view',
          `${pkg}@${expectedVersion}`,
          'version',
          '--json',
          '--registry',
          registry,
        ],
        { cwd: process.cwd(), maxBuffer: 1024 * 1024 },
      )
      const received = JSON.parse(stdout.trim())
      return String(received)
    },
  })
  console.log(`[release] ${pkg}@${expectedVersion} is visible on ${registry}`)
}

function normalizePackageName(value: string): string {
  if (value === 'vite-plugin') return '@zeus-js/vite-plugin'
  return value
}

function positionalVersion(): string | undefined {
  const positional = process.argv.slice(2).find(arg => !arg.startsWith('--'))
  return positional
}

function readOption(name: string): string | undefined {
  const index = process.argv.indexOf(name)
  if (index === -1) return undefined
  const value = process.argv[index + 1]
  if (!value || value.startsWith('--'))
    throw new Error(`${name} requires a value`)
  return value
}
