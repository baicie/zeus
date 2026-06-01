import { createRequire } from 'node:module'
import path from 'node:path'

import { createZeusPlugin } from './rollup'

import type { ZeusBundlerPluginOptions } from './types'
import type { Plugin, UserConfig, ResolvedConfig } from 'vite'

export function createZeusVitePlugin(
  options: ZeusBundlerPluginOptions = {},
): Plugin {
  let resolvedConfig: ResolvedConfig | undefined

  const rollupPlugin = createZeusPlugin({
    ...options,
    root: () => resolvedConfig?.root ?? process.cwd(),
  }) as Plugin

  return {
    ...rollupPlugin,
    name: 'vite-plugin-zeus',
    enforce: 'pre',

    async config(userConfig) {
      const runtimeDomEntry = resolveRuntimeDOMEntry(userConfig.root)

      return {
        ...((await isRolldownVite())
          ? {
              oxc: {
                jsx: 'preserve',
              },
            }
          : {
              esbuild: {
                jsx: 'preserve',
              },
            }),
        resolve: {
          alias: runtimeDomEntry
            ? {
                '@zeus-js/runtime-dom': runtimeDomEntry,
              }
            : undefined,
          dedupe: ['@zeus-js/signal', '@zeus-js/runtime-dom', '@zeus-js/zeus'],
        },
      } satisfies UserConfig
    },

    configResolved(config) {
      resolvedConfig = config

      if (typeof rollupPlugin.configResolved === 'function') {
        return rollupPlugin.configResolved.call(this, config)
      }
    },
  }
}

export default createZeusVitePlugin

export { createZeusVitePlugin as zeus }

async function isRolldownVite(): Promise<boolean> {
  try {
    const vite = (await import('vite')) as Record<string, unknown>

    return (
      typeof vite.rolldownVersion === 'string' ||
      typeof vite.transformWithOxc === 'function'
    )
  } catch {
    return false
  }
}

function resolveRuntimeDOMEntry(root: string | undefined): string | undefined {
  const projectRoot = path.resolve(process.cwd(), root ?? '.')
  const requireFromProject = createRequire(
    path.join(projectRoot, 'package.json'),
  )

  try {
    return requireFromProject.resolve(
      '@zeus-js/runtime-dom/dist/runtime-dom.esm-bundler.js',
    )
  } catch {}

  try {
    const zeusEntry = requireFromProject.resolve('@zeus-js/zeus')
    const requireFromZeus = createRequire(zeusEntry)

    return requireFromZeus.resolve(
      '@zeus-js/runtime-dom/dist/runtime-dom.esm-bundler.js',
    )
  } catch {
    return undefined
  }
}
