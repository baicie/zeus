import { createRequire } from 'node:module'

import { transformSync } from '@babel/core'
import { describe, expect, it } from 'vitest'

import type { PluginObj } from '@babel/core'

/**
 * Smoke tests for @zeus-js/compiler CJS entry point.
 *
 * This guards against CJS/ESM interop regressions, specifically:
 * - The `index.js` CJS shim must export the plugin correctly
 * - Babel must be able to load and use the plugin from CJS require()
 * - No `.default` interop failure on plugin load
 */
const require = createRequire(import.meta.url)

describe('@zeus-js/compiler CJS entry', () => {
  it('loads plugin from CJS entry without .default interop failure', () => {
    // Load from the CJS entry point (index.js), NOT from src/
    const compiler = require('../index.js')
    const plugin = (compiler.default ?? compiler) as unknown as (
      ...args: unknown[]
    ) => unknown

    expect(plugin).toBeTruthy()
    expect(typeof plugin).toBe('function')
  })

  it('works with Babel transformSync in CJS mode', () => {
    const compiler = require('../index.js')
    const plugin = (compiler.default ?? compiler) as unknown as (
      ...args: unknown[]
    ) => unknown

    const result = transformSync('<div>hello</div>', {
      filename: 'input.tsx',
      plugins: [[plugin, {}]],
      parserOpts: { plugins: ['typescript', 'jsx'] },
      configFile: false,
      babelrc: false,
    })

    expect(result).toBeTruthy()
    expect(result?.code).toBeTruthy()
  })

  it('plugin factory produces a valid Babel plugin when called', () => {
    const compiler = require('../index.js')
    const plugin = (compiler.default ?? compiler) as unknown as (
      api: object,
      options: object,
    ) => PluginObj

    const fakeApi = {
      assertVersion: () => {},
      cache: () => ({ using: () => ({ id: 'test' }) }),
      env: () => 'test' as const,
      key: 'test' as const,
    }
    const instance = plugin(fakeApi, {})

    expect(instance).toBeTruthy()
    expect(typeof instance).toBe('object')
    expect(instance).toHaveProperty('visitor')
    expect(typeof instance.visitor).toBe('object')
  })
})
