/**
 * The structure gate is only worth having if it fails on the layouts it exists
 * to prevent. Each case below builds a synthetic workspace that is correct
 * except for one property, and asserts the gate names that property. A gate
 * that passed a misplaced router would have let the original drift happen.
 *
 * The gate is exercised through its real entry point in a child process
 * (`scripts/check/check-structure.ts`), because importing it would run the
 * checks against this repository and its `process.exit` would end the test
 * process. Fixtures are built under a temporary directory that mirrors the
 * repository root the gate resolves from, and the gate is pointed at them with
 * `ZEUS_STRUCTURE_ROOT`.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

const root = path.resolve(import.meta.dirname, '../../..')
const gate = path.join(root, 'scripts/check/check-structure.ts')
const tsx = path.join(root, 'node_modules/.bin/tsx')

const DOMAIN_LAYOUT: Record<string, string[]> = {
  core: ['shared', 'signal', 'runtime-dom', 'runtime-ssr', 'zeus'],
  compiler: [
    'compiler',
    'compiler-shared',
    'compiler-native',
    'compiler-wasm',
    'compiler-native-darwin-arm64',
    'compiler-native-darwin-x64',
    'compiler-native-linux-arm64-gnu',
    'compiler-native-linux-x64-gnu',
    'compiler-native-linux-x64-musl',
    'compiler-native-win32-arm64-msvc',
    'compiler-native-win32-x64-msvc',
  ],
  features: ['router', 'resource', 'query', 'i18n'],
  'web-c': [
    'component-analyzer',
    'component-dts',
    'bundler-plugin',
    'web-c-runtime',
    'web-c',
    'output-wc',
    'output-css',
    'output-icons',
    'output-react-wrapper',
    'output-vue-wrapper',
  ],
  tooling: [
    'vite-plugin',
    'eslint-plugin',
    'testing',
    'playground-engine',
    'consumer',
  ],
  create: ['create-zeus', 'zeus-ui', 'registry'],
}

/** npm names that are not simply `@zeus-js/<shortName>`. */
const NPM_NAMES: Record<string, string> = {
  'create/create-zeus': 'create-zeus',
  'create/zeus-ui': 'zeus-ui',
  'create/registry': '@zeus-ui/registry',
  'tooling/consumer': '@zeus-js/devtools-consumer',
}

const PRIVATE_PACKAGES = new Set([
  'zeus-ui',
  '@zeus-js/compiler-wasm',
  '@zeus-js/devtools-consumer',
])

interface PackageOverride {
  readonly domain?: string
  readonly shortName?: string
  readonly packageJson?: Record<string, unknown>
  readonly omitRepositoryDirectory?: boolean
}

const temporaryRoots: string[] = []

function makeWorkspace(overrides: PackageOverride[] = []): string {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'zeus-structure-'))
  temporaryRoots.push(temp)

  let index = 0
  for (const [domain, packages] of Object.entries(DOMAIN_LAYOUT)) {
    for (const shortName of packages) {
      const override = overrides.find(
        candidate =>
          candidate.shortName === shortName &&
          (candidate.domain ?? domain) === domain,
      )
      const targetDomain = override?.domain ?? domain
      const targetName = override?.shortName ?? shortName
      const dir = path.join(temp, 'packages', targetDomain, targetName)
      fs.mkdirSync(dir, { recursive: true })

      const npmName =
        NPM_NAMES[`${targetDomain}/${targetName}`] ?? `@zeus-js/${targetName}`
      const manifest: Record<string, unknown> = {
        name: npmName,
        version: '0.0.0',
        ...(PRIVATE_PACKAGES.has(npmName) ? { private: true } : {}),
        ...(override?.omitRepositoryDirectory
          ? {}
          : {
              repository: {
                directory: `packages/${targetDomain}/${targetName}`,
              },
            }),
        ...override?.packageJson,
      }
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify(manifest, null, 2),
      )
      index += 1
    }
  }
  return temp
}

function runGate(workspaceRoot: string): { code: number; output: string } {
  try {
    const stdout = execFileSync(tsx, [gate], {
      cwd: root,
      encoding: 'utf-8',
      env: { ...process.env, ZEUS_STRUCTURE_ROOT: workspaceRoot },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, output: stdout }
  } catch (error) {
    const failure = error as {
      status?: number
      stdout?: string
      stderr?: string
    }
    return {
      code: failure.status ?? 1,
      output: `${failure.stdout ?? ''}${failure.stderr ?? ''}`,
    }
  }
}

afterEach(() => {
  for (const temp of temporaryRoots.splice(0)) {
    fs.rmSync(temp, { recursive: true, force: true })
  }
})

// Each case starts a `tsx` child process, and a cold start costs ~8s on a
// local machine. The default 5s timeout would fail every case regardless of
// the layout, which is the one failure mode that makes this suite useless.
const GATE_TIMEOUT = 60_000

describe('check:structure', () => {
  it(
    'passes on the approved layout',
    () => {
      const { code, output } = runGate(makeWorkspace())
      expect(output).toContain('6 domains')
      expect(code).toBe(0)
    },
    GATE_TIMEOUT,
  )

  it(
    'fails when a package sits in the wrong domain',
    () => {
      // router in core is the exact regression this gate exists for: the package
      // count stays at 38, so only a placement check can catch it.
      const workspace = makeWorkspace()
      const from = path.join(workspace, 'packages/features/router')
      const to = path.join(workspace, 'packages/core/router')
      fs.renameSync(from, to)
      fs.writeFileSync(
        path.join(to, 'package.json'),
        JSON.stringify(
          {
            name: '@zeus-js/router',
            version: '0.0.0',
            repository: { directory: 'packages/core/router' },
          },
          null,
          2,
        ),
      )
      const { code, output } = runGate(workspace)
      expect(code).not.toBe(0)
      expect(output).toContain('packages/core/router')
      expect(output).toContain('"core" domain')
    },
    GATE_TIMEOUT,
  )

  it(
    'fails when a domain is missing a package',
    () => {
      const workspace = makeWorkspace()
      fs.rmSync(path.join(workspace, 'packages/features/query'), {
        recursive: true,
        force: true,
      })
      const { code, output } = runGate(workspace)
      expect(code).not.toBe(0)
      expect(output).toContain('features/query')
      expect(output).toContain('missing')
    },
    GATE_TIMEOUT,
  )

  it(
    'fails when a package is not registered in a domain',
    () => {
      const workspace = makeWorkspace()
      const dir = path.join(workspace, 'packages/features/telemetry')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(
        path.join(dir, 'package.json'),
        JSON.stringify({
          name: '@zeus-js/telemetry',
          version: '0.0.0',
          repository: { directory: 'packages/features/telemetry' },
        }),
      )
      const { code, output } = runGate(workspace)
      expect(code).not.toBe(0)
      expect(output).toContain('telemetry')
    },
    GATE_TIMEOUT,
  )

  it(
    'fails when two packages share an npm name',
    () => {
      const workspace = makeWorkspace([
        {
          domain: 'features',
          shortName: 'router',
          packageJson: { name: '@zeus-js/signal' },
        },
      ])
      const { code, output } = runGate(workspace)
      expect(code).not.toBe(0)
      expect(output).toContain('@zeus-js/signal')
      expect(output).toContain('used by')
    },
    GATE_TIMEOUT,
  )

  it(
    'fails when core depends on features',
    () => {
      const workspace = makeWorkspace([
        {
          domain: 'core',
          shortName: 'signal',
          packageJson: { dependencies: { '@zeus-js/router': 'workspace:*' } },
        },
      ])
      const { code, output } = runGate(workspace)
      expect(code).not.toBe(0)
      expect(output).toContain('@zeus-js/signal')
      expect(output).toContain('core')
      expect(output).toContain('features')
    },
    GATE_TIMEOUT,
  )

  it(
    'fails when a publishable package depends on a private one',
    () => {
      const workspace = makeWorkspace([
        {
          domain: 'features',
          shortName: 'query',
          packageJson: {
            dependencies: { '@zeus-js/devtools-consumer': 'workspace:*' },
          },
        },
      ])
      const { code, output } = runGate(workspace)
      expect(code).not.toBe(0)
      expect(output).toContain('private')
    },
    GATE_TIMEOUT,
  )

  it(
    'fails when repository.directory points at a retired path',
    () => {
      const workspace = makeWorkspace([
        {
          domain: 'features',
          shortName: 'router',
          packageJson: { repository: { directory: 'packages/core/router' } },
        },
      ])
      const { code, output } = runGate(workspace)
      expect(code).not.toBe(0)
      expect(output).toContain('packages/core/router')
    },
    GATE_TIMEOUT,
  )

  it(
    'fails when a retired path comes back',
    () => {
      const workspace = makeWorkspace()
      const retired = path.join(workspace, 'packages/devtools')
      fs.mkdirSync(retired, { recursive: true })
      const { code, output } = runGate(workspace)
      expect(code).not.toBe(0)
      expect(output).toContain('packages/devtools')
      expect(output).toContain('retired')
    },
    GATE_TIMEOUT,
  )

  it(
    'fails when a strays directory appears under packages/',
    () => {
      const workspace = makeWorkspace()
      fs.mkdirSync(path.join(workspace, 'packages/experiments'), {
        recursive: true,
      })
      const { code, output } = runGate(workspace)
      expect(code).not.toBe(0)
      expect(output).toContain('experiments')
      expect(output).toContain('six domains')
    },
    GATE_TIMEOUT,
  )
})
