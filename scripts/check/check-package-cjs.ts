import { execFileSync } from 'node:child_process'
import path from 'node:path'

import pico from 'picocolors'

import { findWorkspacePackages } from '../shared/utils'

const requireSmoke = String.raw`
const path = require('node:path')
const specifier = process.argv[1]
const expectedResolved = path.resolve(process.argv[2])
const expectedLoaded = process.argv[3]
  ? path.resolve(process.argv[3])
  : undefined
const forbiddenLoaded = process.argv[4]
  ? path.resolve(process.argv[4])
  : undefined
const resolved = path.resolve(require.resolve(specifier))

if (resolved !== expectedResolved) {
  throw new Error(
    [
      'CommonJS entry resolved to an unexpected file',
      'specifier: ' + specifier,
      'expected: ' + expectedResolved,
      'received: ' + resolved,
    ].join('\n'),
  )
}

const value = require(specifier)
const valueType = typeof value
const loadedFiles = new Set(
  Object.keys(require.cache).map(file => path.resolve(file)),
)
const keys =
  value !== null && (valueType === 'object' || valueType === 'function')
    ? Object.keys(value)
    : []

if (valueType !== 'function' && keys.length === 0) {
  throw new Error('CommonJS entry returned no public exports')
}

if (
  expectedLoaded &&
  !loadedFiles.has(expectedLoaded)
) {
  throw new Error(
    [
      'CommonJS wrapper loaded an unexpected runtime file',
      'specifier: ' + specifier,
      'expected: ' + expectedLoaded,
    ].join('\n'),
  )
}

if (forbiddenLoaded && loadedFiles.has(forbiddenLoaded)) {
  throw new Error(
    [
      'CommonJS entry loaded the opposite environment runtime',
      'specifier: ' + specifier,
      'forbidden: ' + forbiddenLoaded,
    ].join('\n'),
  )
}
`

// Keep this oracle independent from package manifests so a deleted or
// retargeted public require export cannot make the check validate itself.
const expectedDevelopmentTargets: Record<string, string> = {
  '@zeus-js/compiler': './dist/compiler.cjs',
  '@zeus-js/compiler-shared': './dist/compiler-shared.cjs',
  '@zeus-js/runtime-dom': './dist/runtime-dom.cjs',
  '@zeus-js/shared': './dist/shared.cjs',
  '@zeus-js/signal': './dist/signal.cjs',
  '@zeus-js/signal/internal': './dist/internal.cjs',
  '@zeus-js/zeus': './dist/zeus.cjs',
  '@zeus-js/zeus/capabilities': './dist/capabilities.cjs',
  '@zeus-js/vite-plugin': './dist/vite-plugin.cjs',
  '@zeus-js/bundler-plugin': './dist/bundler-plugin.cjs',
  '@zeus-js/component-analyzer': './dist/component-analyzer.cjs',
  '@zeus-js/component-dts': './dist/component-dts.cjs',
  '@zeus-js/output-css': './dist/output-css.cjs',
  '@zeus-js/output-icons': './dist/output-icons.cjs',
  '@zeus-js/output-react-wrapper': './dist/output-react-wrapper.cjs',
  '@zeus-js/output-react-wrapper/runtime': './dist/runtime/index.cjs',
  '@zeus-js/output-vue-wrapper': './dist/output-vue-wrapper.cjs',
  '@zeus-js/output-vue-wrapper/runtime': './dist/runtime/index.cjs',
  '@zeus-js/output-wc': './dist/output-wc.cjs',
  '@zeus-js/output-wc/capabilities': './dist/capabilities.cjs',
  '@zeus-js/web-c': './dist/web-c.cjs',
}

let hasError = false
let checkedConditionalLoads = 0
let checkedFallbackLoads = 0
const checkedPackages = new Set<string>()
const checkedSpecifiers = new Set<string>()
const packageFilters = new Set(process.argv.slice(2))
const expectedPackageNames = new Set(
  Object.keys(expectedDevelopmentTargets).map(readPackageName),
)
const selectedSpecifiers = new Set(
  Object.keys(expectedDevelopmentTargets).filter(specifier => {
    return (
      packageFilters.size === 0 ||
      packageFilters.has(readPackageName(specifier))
    )
  }),
)
const childEnv = { ...process.env }
delete childEnv.NODE_OPTIONS

for (const packageFilter of packageFilters) {
  if (expectedPackageNames.has(packageFilter)) continue

  hasError = true
  console.error(
    pico.red(`${packageFilter} is not part of the public CommonJS contract.`),
  )
}

for (const pkg of findWorkspacePackages()) {
  const packageJson = pkg.packageJson as {
    name: string
    private?: boolean
    exports?: Record<string, unknown>
  }

  if (
    packageJson.private ||
    (packageFilters.size > 0 && !packageFilters.has(packageJson.name)) ||
    !packageJson.exports
  ) {
    continue
  }

  for (const [subpath, exportValue] of Object.entries(packageJson.exports)) {
    if (!hasRequireTarget(exportValue)) continue

    const specifier =
      subpath === '.'
        ? packageJson.name
        : `${packageJson.name}/${subpath.replace(/^\.\//, '')}`
    const requireConditions = readRequireConditions(exportValue)
    const expectedConditions = createExpectedConditions(specifier, subpath)

    if (!expectedConditions) {
      hasError = true
      console.error(
        pico.red(
          `${specifier} is not declared in the public CommonJS contract.`,
        ),
      )
      continue
    }

    checkedSpecifiers.add(specifier)
    checkedPackages.add(packageJson.name)

    if (
      !requireConditions ||
      requireConditions.production !== expectedConditions.production ||
      requireConditions.development !== expectedConditions.development ||
      requireConditions.default !== expectedConditions.default
    ) {
      hasError = true
      console.error(
        pico.red(`${specifier} require conditions do not match the contract.`),
      )
      console.error(`expected: ${JSON.stringify(expectedConditions)}`)
      console.error(`received: ${JSON.stringify(requireConditions)}`)
      continue
    }

    for (const condition of ['development', 'production'] as const) {
      const opposite =
        condition === 'development' ? 'production' : 'development'
      const expectedTarget = path.resolve(
        pkg.dir,
        expectedConditions[condition],
      )
      const forbiddenTarget = path.resolve(
        pkg.dir,
        expectedConditions[opposite],
      )

      try {
        execFileSync(
          process.execPath,
          [
            `--conditions=${condition}`,
            '-e',
            requireSmoke,
            specifier,
            expectedTarget,
            expectedTarget,
            forbiddenTarget,
          ],
          {
            cwd: pkg.dir,
            encoding: 'utf8',
            env: { ...childEnv, NODE_ENV: condition },
            stdio: 'pipe',
          },
        )
        checkedConditionalLoads += 1
      } catch (error) {
        hasError = true
        console.error(
          pico.red(`${specifier} failed CommonJS ${condition} condition test`),
        )
        console.error(readChildProcessError(error))
      }
    }

    if (subpath !== '.') continue

    for (const nodeEnv of ['development', 'production'] as const) {
      const opposite = nodeEnv === 'development' ? 'production' : 'development'
      const expectedEntry = path.resolve(pkg.dir, expectedConditions.default)
      const expectedRuntime = path.resolve(pkg.dir, expectedConditions[nodeEnv])
      const forbiddenRuntime = path.resolve(
        pkg.dir,
        expectedConditions[opposite],
      )

      try {
        execFileSync(
          process.execPath,
          [
            '-e',
            requireSmoke,
            specifier,
            expectedEntry,
            expectedRuntime,
            forbiddenRuntime,
          ],
          {
            cwd: pkg.dir,
            encoding: 'utf8',
            env: { ...childEnv, NODE_ENV: nodeEnv },
            stdio: 'pipe',
          },
        )
        checkedFallbackLoads += 1
      } catch (error) {
        hasError = true
        console.error(
          pico.red(`${specifier} failed CommonJS ${nodeEnv} wrapper test`),
        )
        console.error(readChildProcessError(error))
      }
    }
  }
}

for (const specifier of selectedSpecifiers) {
  if (checkedSpecifiers.has(specifier)) continue

  hasError = true
  console.error(pico.red(`${specifier} is missing its public CommonJS export.`))
}

if (hasError) process.exit(1)

if (checkedSpecifiers.size === 0) {
  console.error(pico.red('No public CommonJS package entries were checked.'))
  process.exit(1)
}

console.log(
  pico.green(
    `Package CommonJS entry smoke tests passed (${checkedPackages.size} packages, ${checkedSpecifiers.size} exports, ${checkedConditionalLoads} conditional loads, ${checkedFallbackLoads} wrapper fallbacks).`,
  ),
)

interface RequireConditions {
  production: string
  development: string
  default: string
}

function hasRequireTarget(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false

  const record = value as Record<string, unknown>
  if (typeof record.require === 'string') return true

  if (record.require && typeof record.require === 'object') return true

  return Object.values(record).some(hasRequireTarget)
}

function readRequireConditions(value: unknown): RequireConditions | null {
  if (!value || typeof value !== 'object') return null

  const requireValue = (value as Record<string, unknown>).require
  if (!requireValue || typeof requireValue !== 'object') return null

  const conditions = requireValue as Record<string, unknown>
  const keys = Object.keys(conditions)

  if (
    keys.length !== 3 ||
    keys[0] !== 'production' ||
    keys[1] !== 'development' ||
    keys[2] !== 'default' ||
    typeof conditions.production !== 'string' ||
    typeof conditions.development !== 'string' ||
    typeof conditions.default !== 'string'
  ) {
    return null
  }

  return conditions as unknown as RequireConditions
}

function createExpectedConditions(
  specifier: string,
  subpath: string,
): RequireConditions | null {
  const development = expectedDevelopmentTargets[specifier]
  if (!development) return null

  return {
    production: development.replace(/\.cjs$/, '.prod.cjs'),
    development,
    default: subpath === '.' ? './index.cjs' : development,
  }
}

function readPackageName(specifier: string): string {
  return specifier.split('/').slice(0, 2).join('/')
}

function readChildProcessError(error: unknown): string {
  if (!error || typeof error !== 'object') return String(error)

  const result = error as {
    stderr?: Buffer | string
    stdout?: Buffer | string
    message?: string
  }
  const stderr = result.stderr?.toString().trim()
  const stdout = result.stdout?.toString().trim()

  return stderr || stdout || result.message || String(error)
}
