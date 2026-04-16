import type { Plugin } from 'vite'
import { zeusCompiler } from './compiler'
import { handleHMR } from './hmr'

export interface ZeusPluginOptions {
  include?: string[]
  exclude?: string[]
  dev?: boolean
  sourceMap?: boolean
  runtimeModule?: string
}

const DEFAULT_OPTIONS: ZeusPluginOptions = {
  include: [/\.tsx?$/],
  exclude: [/node_modules/],
  dev: process.env.NODE_ENV !== 'production',
  sourceMap: true,
  runtimeModule: '@zeusjs/runtime-dom',
}

export function zeusPlugin(userOptions: ZeusPluginOptions = {}): Plugin {
  const options = { ...DEFAULT_OPTIONS, ...userOptions }

  return {
    name: 'vite-plugin-zeus',

    enforce: 'pre',

    transform(code, id) {
      if (!shouldTransform(id, options)) {
        return null
      }

      try {
        const result = zeusCompiler.transform(code, id, {
          dev: options.dev,
          sourceMap: options.sourceMap,
          runtimeModule: options.runtimeModule,
        })

        return result
      } catch (error) {
        this.error(error as Error)
        return null
      }
    },

    handleHotUpdate(ctx) {
      if (!shouldTransform(ctx.file, options)) {
        return
      }

      return handleHMR(ctx, zeusCompiler)
    },

    configureServer(server) {
      // Add custom handling for Zeus files
    },
  }
}

function shouldTransform(id: string, options: ZeusPluginOptions): boolean {
  const { include, exclude } = options

  // Check exclusions first
  if (exclude?.some(pattern => matchPattern(id, pattern))) {
    return false
  }

  // Check inclusions
  if (include?.some(pattern => matchPattern(id, pattern))) {
    return true
  }

  // Default: transform .tsx and .jsx files
  return /\.[jt]sx$/.test(id)
}

function matchPattern(id: string, pattern: RegExp | string): boolean {
  if (typeof pattern === 'string') {
    return id.includes(pattern)
  }
  return pattern.test(id)
}

export { zeusCompiler } from './compiler'
export { handleHMR } from './hmr'
export { getEnv } from './env'
