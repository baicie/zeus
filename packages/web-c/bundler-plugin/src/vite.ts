import { createRequire } from 'node:module'
import path from 'node:path'

import { mergeConfig } from 'vite'

import { createZeusBundlerPlugin } from './core'
import { collectPluginExternals, mergeExternal } from './external'

import type { RollupExternalOption, ZeusBundlerPluginOptions } from './types'
import type { Plugin, ResolvedConfig, UserConfig } from 'vite'

const runtimePackages = [
  '@zeus-js/signal',
  '@zeus-js/runtime-dom',
  '@zeus-js/runtime-ssr',
  '@zeus-js/zeus',
] as const

export function createZeusVitePlugin(
  options: ZeusBundlerPluginOptions = {},
): Plugin {
  let resolvedConfig: ResolvedConfig | undefined

  const zeusPlugin = createZeusBundlerPlugin(
    {
      ...options,
      root: options.root ?? (() => resolvedConfig?.root ?? process.cwd()),
      transpile: options.transpile ?? false,
    },
    {
      target: 'vite',
    },
  ) as unknown as Plugin

  return {
    ...zeusPlugin,
    name: 'vite-plugin-zeus',
    enforce: 'pre',

    async config(userConfig) {
      const runtimeDomEntry = resolveRuntimeDOMEntry(userConfig.root)
      const pluginExternals = collectPluginExternals(options)

      const pluginConfig: UserConfig = {
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

          dedupe: [...runtimePackages, '@zeus-js/component-dts'],
        },
        optimizeDeps: {
          // Published component-library consumers may install @zeus-js/zeus
          // alongside the runtime packages. Pre-bundling one entry while
          // leaving another direct creates two signal engines and breaks the
          // owner contract at runtime. Keep the shared runtime graph intact;
          // resolve.dedupe alone does not control dependency optimization.
          exclude: [...runtimePackages],
        },
      }

      if (!pluginExternals.length) {
        return pluginConfig
      }

      return mergeConfig(pluginConfig, {
        build: {
          rollupOptions: {
            external: mergeExternal(
              userConfig.build?.rollupOptions?.external as
                | RollupExternalOption
                | undefined,
              pluginExternals,
            ),
          },
        },
      })
    },

    configResolved(config) {
      resolvedConfig = config
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
