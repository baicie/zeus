import { execFile } from 'node:child_process'
import { promisify } from 'node:util'

import pico from 'picocolors'

import { zeusFixedPackages } from '../release.config'

const execFileAsync = promisify(execFile)
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
// npm can take several minutes to expose a freshly published platform package
// through every registry edge, especially for large native tarballs.
const attempts = [
  0, 2_000, 5_000, 10_000, 20_000, 30_000, 60_000, 120_000, 180_000,
]

await Promise.all(packages.map(pkg => verifyPackage(pkg, version)))
console.log(
  pico.green(
    `Published package verification passed (${packages.length} package${packages.length === 1 ? '' : 's'} at ${version}).`,
  ),
)

async function verifyPackage(
  pkg: string,
  expectedVersion: string,
): Promise<void> {
  let lastError: unknown
  for (const delay of attempts) {
    if (delay > 0) await wait(delay)
    try {
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
      if (received === expectedVersion) {
        console.log(`[release] ${pkg}@${expectedVersion} is visible on npm`)
        return
      }
      lastError = new Error(`npm returned version ${String(received)}`)
    } catch (error) {
      lastError = error
    }
  }
  throw new Error(
    `${pkg}@${expectedVersion} was not visible on ${registry}: ${lastError instanceof Error ? lastError.message : String(lastError)}`,
  )
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

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}
