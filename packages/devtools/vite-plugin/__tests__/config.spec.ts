import { execFileSync } from 'node:child_process'
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { createZeus } from '../src'

import type { ConfigEnv, HookHandler, Plugin, UserConfig } from 'vite'

type ConfigHook = NonNullable<HookHandler<Plugin['config']>>

const configEnv: ConfigEnv = { command: 'serve', mode: 'test' }
const temporaryRoots: string[] = []

afterEach(() => {
  for (const root of temporaryRoots.splice(0)) {
    rmSync(root, { recursive: true, force: true })
  }
})

function getConfigHook(plugin: Plugin): ConfigHook {
  const hook = plugin.config
  if (!hook) throw new Error('Expected config hook')
  return typeof hook === 'function' ? hook : hook.handler
}

async function runConfig(userConfig: UserConfig = {}) {
  const hook = getConfigHook(createZeus())

  return hook.call({} as ThisParameterType<ConfigHook>, userConfig, configEnv)
}

function writeFixtureFile(root: string, relativePath: string, value = '') {
  const filename = path.join(root, relativePath)
  mkdirSync(path.dirname(filename), { recursive: true })
  writeFileSync(filename, value)
}

function writeNestedRuntimePackages(zeusRoot: string, runtimeRoot: string) {
  writeFixtureFile(
    zeusRoot,
    'package.json',
    JSON.stringify({
      name: '@zeus-js/zeus',
      exports: {
        '.': {
          require: {
            development: './dist/zeus.cjs',
            production: './dist/zeus.prod.cjs',
            default: './index.cjs',
          },
        },
      },
    }),
  )
  writeFixtureFile(zeusRoot, 'index.cjs')
  writeFixtureFile(zeusRoot, 'dist/zeus.cjs')
  writeFixtureFile(zeusRoot, 'dist/zeus.prod.cjs')

  writeFixtureFile(
    runtimeRoot,
    'package.json',
    JSON.stringify({
      name: '@zeus-js/runtime-dom',
      exports: {
        '.': {
          require: {
            development: './dist/runtime-dom.cjs',
            production: './dist/runtime-dom.prod.cjs',
            default: './index.cjs',
          },
        },
      },
    }),
  )
  writeFixtureFile(runtimeRoot, 'index.cjs')
  writeFixtureFile(runtimeRoot, 'dist/runtime-dom.cjs')
  writeFixtureFile(runtimeRoot, 'dist/runtime-dom.prod.cjs')
  writeFixtureFile(runtimeRoot, 'dist/runtime-dom.esm-bundler.js')
}

function createNestedRuntimeProject() {
  const root = mkdtempSync(path.join(tmpdir(), 'zeus-vite-plugin-'))
  const zeusRoot = path.join(root, 'node_modules/@zeus-js/zeus')
  const runtimeRoot = path.join(zeusRoot, 'node_modules/@zeus-js/runtime-dom')
  temporaryRoots.push(root)

  writeNestedRuntimePackages(zeusRoot, runtimeRoot)

  return {
    root,
    runtimeEntry: path.join(runtimeRoot, 'dist/runtime-dom.esm-bundler.js'),
  }
}

function createDirectRuntimeProject() {
  const root = mkdtempSync(path.join(tmpdir(), 'zeus-vite-plugin-'))
  const zeusRoot = path.join(root, 'node_modules/@zeus-js/zeus')
  const runtimeRoot = path.join(root, 'node_modules/@zeus-js/runtime-dom')
  temporaryRoots.push(root)

  writeNestedRuntimePackages(zeusRoot, runtimeRoot)

  return {
    root,
    runtimeEntry: path.join(runtimeRoot, 'dist/runtime-dom.esm-bundler.js'),
  }
}

function createSymlinkedRuntimeProject() {
  const root = mkdtempSync(path.join(tmpdir(), 'zeus-vite-plugin-'))
  const zeusVirtualNodeModules = path.join(
    root,
    'node_modules/.pnpm/@zeus-js+zeus@0.1.0/node_modules',
  )
  const runtimeVirtualNodeModules = path.join(
    root,
    'node_modules/.pnpm/@zeus-js+runtime-dom@0.1.0/node_modules',
  )
  const zeusRoot = path.join(zeusVirtualNodeModules, '@zeus-js/zeus')
  const runtimeRoot = path.join(
    runtimeVirtualNodeModules,
    '@zeus-js/runtime-dom',
  )
  const runtimeLink = path.join(zeusVirtualNodeModules, '@zeus-js/runtime-dom')
  const zeusLink = path.join(root, 'node_modules/@zeus-js/zeus')
  temporaryRoots.push(root)

  writeNestedRuntimePackages(zeusRoot, runtimeRoot)
  mkdirSync(path.dirname(runtimeLink), { recursive: true })
  mkdirSync(path.dirname(zeusLink), { recursive: true })
  symlinkSync(
    runtimeRoot,
    runtimeLink,
    process.platform === 'win32' ? 'junction' : 'dir',
  )
  symlinkSync(
    zeusRoot,
    zeusLink,
    process.platform === 'win32' ? 'junction' : 'dir',
  )

  return {
    root,
    runtimeEntry: path.join(runtimeRoot, 'dist/runtime-dom.esm-bundler.js'),
  }
}

function resolveNestedRuntimeWithNodeCondition(
  root: string,
  condition: 'default' | 'development' | 'production',
  preserveSymlinks = false,
): string {
  const resolverEntry = new URL('../src/runtime-resolution.ts', import.meta.url)
    .href
  const runner = path.join(root, 'resolve-runtime.mjs')
  writeFileSync(
    runner,
    `
      import { resolveRuntimeDOMEntry } from ${JSON.stringify(resolverEntry)}

      const projectRoot = process.env.ZEUS_TEST_PROJECT_ROOT
      const runtimeEntry = resolveRuntimeDOMEntry(projectRoot)
      if (!runtimeEntry) throw new Error('Expected runtime entry')

      process.stdout.write(runtimeEntry)
    `,
  )

  return execFileSync(
    process.execPath,
    [
      ...(preserveSymlinks ? ['--preserve-symlinks'] : []),
      ...(condition === 'default' ? [] : [`--conditions=${condition}`]),
      runner,
    ],
    {
      encoding: 'utf8',
      env: {
        ...process.env,
        NODE_PATH: '',
        ZEUS_TEST_PROJECT_ROOT: root,
      },
    },
  )
}

describe('vite-plugin-zeus config', () => {
  it('preserves JSX for Vite 8 and deduplicates runtime packages', async () => {
    const result = await runConfig()

    expect(result).toMatchObject({
      oxc: { jsx: 'preserve' },
      resolve: {
        dedupe: ['@zeus-js/signal', '@zeus-js/runtime-dom', '@zeus-js/zeus'],
      },
    })
  })

  it.each(['default', 'development', 'production'] as const)(
    'resolves a nested runtime under the Node %s condition',
    condition => {
      const { root, runtimeEntry } = createNestedRuntimeProject()
      const resolvedRuntime = resolveNestedRuntimeWithNodeCondition(
        root,
        condition,
      )

      expect(resolvedRuntime).toBe(realpathSync(runtimeEntry))
      expect(existsSync(resolvedRuntime)).toBe(true)
    },
  )

  it('exposes the resolved runtime alias through the Vite config hook', async () => {
    const { root, runtimeEntry } = createDirectRuntimeProject()
    const result = await runConfig({ root })

    expect(result).toMatchObject({
      resolve: {
        alias: {
          '@zeus-js/runtime-dom': realpathSync(runtimeEntry),
        },
      },
    })
  })

  it('resolves a pnpm-linked runtime when Node preserves symlinks', () => {
    const { root, runtimeEntry } = createSymlinkedRuntimeProject()
    const resolvedRuntime = resolveNestedRuntimeWithNodeCondition(
      root,
      'default',
      true,
    )

    expect(existsSync(resolvedRuntime)).toBe(true)
    expect(realpathSync(resolvedRuntime)).toBe(realpathSync(runtimeEntry))
  })
})
