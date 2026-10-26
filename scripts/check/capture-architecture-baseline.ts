import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs/promises'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'
import { parseArgs } from 'node:util'
import { gzipSync } from 'node:zlib'

import type { TransformModuleResult } from '../../packages/core/compiler-native'

interface PackageConfiguration {
  name: string
  version?: string
  private?: boolean
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
  peerDependencies?: Record<string, string>
  optionalDependencies?: Record<string, string>
  exports?: unknown
  scripts?: Record<string, string>
  engines?: Record<string, string>
  packageManager?: string
}

const { values } = parseArgs({
  options: {
    output: { type: 'string', default: 'temp/baseline/architecture.json' },
    ref: { type: 'string', default: 'HEAD' },
    'ui-root': { type: 'string', default: '../zeus-ui' },
    'ui-ref': { type: 'string', default: 'HEAD' },
    'bench-report': {
      type: 'string',
      default: 'temp/bench/component-host/report.json',
    },
    'build-duration-ms': { type: 'string' },
    'build-log': { type: 'string' },
    'verify-boundaries': { type: 'boolean', default: false },
  },
})

function git(root: string, args: string[]): string {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8' }).trim()
}

function readTrackedJson(root: string, ref: string, filename: string) {
  return JSON.parse(
    git(root, ['show', `${ref}:${filename}`]),
  ) as PackageConfiguration
}

async function captureDist(root: string, packageFile: string) {
  const dist = path.join(root, path.dirname(packageFile), 'dist')
  const files: Array<{
    path: string
    bytes: number
    gzipBytes: number
    sha256: string
  }> = []
  async function walk(directory: string): Promise<void> {
    for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
      const filename = path.join(directory, entry.name)
      if (entry.isDirectory()) await walk(filename)
      else if (entry.isFile()) {
        const content = await fs.readFile(filename)
        files.push({
          path: path.relative(dist, filename).split(path.sep).join('/'),
          bytes: content.length,
          gzipBytes: gzipSync(content).length,
          sha256: createHash('sha256').update(content).digest('hex'),
        })
      }
    }
  }
  try {
    await walk(dist)
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT')
      return { status: 'missing' as const }
    throw error
  }
  files.sort((a, b) => a.path.localeCompare(b.path))
  return {
    status: 'observed' as const,
    provenance:
      'current working-tree dist; not reconstructed from the baseline commit',
    bytes: files.reduce((total, file) => total + file.bytes, 0),
    gzipBytes: files.reduce((total, file) => total + file.gzipBytes, 0),
    files,
  }
}

async function captureRepository(root: string, ref: string) {
  const commit = git(root, ['rev-parse', ref])
  const rootPackage = readTrackedJson(root, commit, 'package.json')
  const packageFiles = git(root, [
    'ls-tree',
    '-r',
    '--name-only',
    commit,
    'packages',
  ])
    .split('\n')
    .filter(filename => filename.endsWith('/package.json'))
  const packages = []
  for (const packageFile of packageFiles) {
    const configuration = readTrackedJson(root, commit, packageFile)
    packages.push({
      path: packageFile,
      ...configuration,
      dist: await captureDist(root, packageFile),
    })
  }
  return {
    root,
    baselineCommit: commit,
    currentHead: git(root, ['rev-parse', 'HEAD']),
    workingTreeDirty: Boolean(
      git(root, ['status', '--porcelain', '--untracked-files=no']),
    ),
    rootPackage,
    packages,
  }
}

async function captureRegistry(names: string[]) {
  const results: Record<string, unknown> = {}
  let cursor = 0
  await Promise.all(
    Array.from({ length: Math.min(6, names.length) }, async () => {
      while (cursor < names.length) {
        const name = names[cursor++]!
        const url = `https://registry.npmjs.org/-/package/${encodeURIComponent(name)}/dist-tags`
        try {
          const response = await fetch(url, {
            signal: AbortSignal.timeout(10_000),
          })
          if (!response.ok) {
            results[name] = {
              status: response.status === 404 ? 'not_found' : 'error',
              httpStatus: response.status,
              url,
            }
            continue
          }
          results[name] = {
            status: 'observed',
            distTags: await response.json(),
            url,
          }
        } catch (error) {
          results[name] = { status: 'unavailable', error: String(error), url }
        }
      }
    }),
  )
  return Object.fromEntries(
    Object.entries(results).sort(([left], [right]) =>
      left.localeCompare(right),
    ),
  )
}

const compilerCases = [
  {
    id: 'native-spread',
    source: 'export const App = props => <div {...props} />',
    previousDiagnostic: 'ZEUS_UNSUPPORTED_SPREAD_ATTRIBUTE',
    expected: null,
  },
  {
    id: 'component-spread',
    source: 'export const App = props => <Child {...props} />',
    previousDiagnostic: 'ZEUS_UNSUPPORTED_COMPONENT_PROP',
    expected: null,
  },
  {
    id: 'nested-jsx',
    source: 'export const App = ok => <div>{ok ? <span /> : null}</div>',
    previousDiagnostic: 'ZEUS_UNSUPPORTED_NESTED_JSX_EXPRESSION',
    expected: null,
  },
]

function captureCompiler(root: string) {
  try {
    const require = createRequire(import.meta.url)
    const compiler = require(
      path.join(root, 'packages/core/compiler-native/index.js'),
    ) as {
      transformModule(options: Record<string, unknown>): TransformModuleResult
    }
    return {
      status: 'observed',
      provenance:
        'currently installed native compiler binary; not rebuilt by this script',
      cases: compilerCases.map(test => {
        const result = compiler.transformModule({
          source: test.source,
          filename: `${test.id}.tsx`,
          target: 'dom',
          runtimeModule: '@zeus-js/runtime-dom',
          delegateEvents: true,
          sourceMap: false,
        })
        return {
          ...test,
          diagnostics: result.diagnostics,
          expectedObserved:
            test.expected === null
              ? Boolean(result.code) &&
                !result.diagnostics.some(
                  diagnostic => diagnostic.severity === 'error',
                )
              : result.diagnostics.some(
                  diagnostic => diagnostic.code === test.expected,
                ),
          emittedCode: Boolean(result.code),
        }
      }),
    }
  } catch (error) {
    return { status: 'unavailable', error: String(error), cases: [] }
  }
}

async function readObservation(filename: string) {
  try {
    const content = await fs.readFile(filename, 'utf8')
    return {
      status: 'observed',
      path: path.resolve(filename),
      sha256: createHash('sha256').update(content).digest('hex'),
      report: JSON.parse(content) as unknown,
    }
  } catch (error) {
    return {
      status: 'unavailable',
      path: path.resolve(filename),
      error: String(error),
    }
  }
}

async function main() {
  const root = git(process.cwd(), ['rev-parse', '--show-toplevel'])
  const uiRoot = path.resolve(root, values['ui-root']!)
  const startedAt = new Date().toISOString()
  const repositories = await Promise.all([
    captureRepository(root, values.ref!),
    captureRepository(uiRoot, values['ui-ref']!),
  ])
  const names = [
    ...new Set(
      repositories.flatMap(repository =>
        repository.packages.filter(pkg => !pkg.private).map(pkg => pkg.name),
      ),
    ),
  ].sort()
  const registry = await captureRegistry(names)
  const compiler = captureCompiler(root)
  const buildDuration =
    values['build-duration-ms'] === undefined
      ? null
      : Number(values['build-duration-ms'])
  if (
    buildDuration !== null &&
    (!Number.isFinite(buildDuration) || buildDuration <= 0)
  )
    throw new Error('--build-duration-ms must be a positive measured number')
  const report = {
    schemaVersion: 1,
    startedAt,
    completedAt: new Date().toISOString(),
    machine: {
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      cpu: os.cpus()[0]?.model,
      cpus: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
    },
    notes: [
      'Tracked package configuration is read from the specified Git refs, not concurrent working-tree edits.',
      'Dist files, registry tags and installed compiler are observations at capture time, not source-commit build proofs.',
      'gzipBytes is the sum of independently compressed files, not a tarball or one consumer bundle.',
      'Missing or unavailable observations are not zero, success, or published-package verification.',
      'No performance regression threshold is inferred from concurrent benchmark observations.',
    ],
    repositories,
    registry,
    compiler,
    componentHostBenchmark: await readObservation(
      path.resolve(root, values['bench-report']!),
    ),
    rootBuild: {
      status: buildDuration === null ? 'not_measured' : 'externally_measured',
      durationMs: buildDuration,
      logPath: values['build-log'] ? path.resolve(values['build-log']) : null,
    },
  }
  const output = path.resolve(root, values.output!)
  await fs.mkdir(path.dirname(output), { recursive: true })
  await fs.writeFile(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`Architecture baseline written to ${output}`)
  console.log(
    `Repositories: ${repositories.length}; packages: ${repositories.reduce((total, repo) => total + repo.packages.length, 0)}; registry observations: ${Object.keys(registry).length}`,
  )
  if (
    values['verify-boundaries'] &&
    (compiler.status !== 'observed' ||
      compiler.cases.some(test => !test.expectedObserved))
  )
    process.exitCode = 1
}

main().catch(error => {
  console.error(error)
  process.exitCode = 1
})
