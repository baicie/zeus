import { mkdir, mkdtemp, rm, symlink } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { createZeus } from '../src'

import type { ConfigEnv, HookHandler, Plugin, UserConfig } from 'vite'

type ConfigHook = NonNullable<HookHandler<Plugin['config']>>

const configEnv: ConfigEnv = { command: 'serve', mode: 'test' }
const workspaceRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../../..',
)

function getConfigHook(plugin: Plugin): ConfigHook {
  const hook = plugin.config
  if (!hook) throw new Error('Expected config hook')
  return typeof hook === 'function' ? hook : hook.handler
}

async function runConfig(userConfig: UserConfig = {}) {
  const hook = getConfigHook(createZeus())

  return hook.call({} as ThisParameterType<ConfigHook>, userConfig, configEnv)
}

async function createRuntimeFixture(): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'zeus-vite-plugin-'))
  const zeusPackage = path.join(root, 'node_modules/@zeus-js/zeus')
  const runtimePackage = path.join(
    zeusPackage,
    'node_modules/@zeus-js/runtime-dom',
  )

  await mkdir(path.dirname(runtimePackage), { recursive: true })
  await symlink(
    path.join(workspaceRoot, 'packages/core/zeus/package.json'),
    path.join(zeusPackage, 'package.json'),
  )
  await symlink(
    path.join(workspaceRoot, 'packages/core/zeus/index.cjs'),
    path.join(zeusPackage, 'index.cjs'),
  )
  await symlink(
    path.join(workspaceRoot, 'packages/core/runtime-dom'),
    runtimePackage,
    'dir',
  )

  return root
}

describe('vite-plugin-zeus config', () => {
  it('preserves JSX for Vite 8 and deduplicates runtime packages', async () => {
    const root = await createRuntimeFixture()

    try {
      const result = await runConfig({ root })

      expect(result).toMatchObject({
        oxc: { jsx: 'preserve' },
        resolve: {
          alias: {
            '@zeus-js/runtime-dom': expect.stringContaining(
              'runtime-dom.esm-bundler.js',
            ),
          },
          dedupe: ['@zeus-js/signal', '@zeus-js/runtime-dom', '@zeus-js/zeus'],
        },
      })
    } finally {
      await rm(root, { force: true, recursive: true })
    }
  })
})
