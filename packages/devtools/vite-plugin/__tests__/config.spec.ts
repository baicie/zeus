import { describe, expect, it } from 'vitest'

import { createZeus } from '../src'

import type { ConfigEnv, HookHandler, Plugin, UserConfig } from 'vite'

type ConfigHook = NonNullable<HookHandler<Plugin['config']>>

const configEnv: ConfigEnv = { command: 'serve', mode: 'test' }

function getConfigHook(plugin: Plugin): ConfigHook {
  const hook = plugin.config
  if (!hook) throw new Error('Expected config hook')
  return typeof hook === 'function' ? hook : hook.handler
}

async function runConfig(
  userConfig: UserConfig = { root: 'examples/project-board' },
) {
  const hook = getConfigHook(createZeus())

  return hook.call({} as ThisParameterType<ConfigHook>, userConfig, configEnv)
}

describe('vite-plugin-zeus config', () => {
  it('preserves JSX for Vite 8 and deduplicates runtime packages', async () => {
    const result = await runConfig()

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
  })
})
