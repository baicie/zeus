/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, expect, it } from 'vitest'

import icons from '../src/index'

import type { ZeusBuildContext } from '@zeus-js/bundler-plugin'

function createMockCtx(): ZeusBuildContext {
  return {
    root: process.cwd(),
    manifest: {
      version: 1 as const,
      components: [],
    },
    diagnostics: [],
    dts: { enabled: true, mode: 'auto', reason: [] },
    emitFile: (() => '') as any,
    warn: (() => {}) as any,
    error: (() => {}) as any,
    addWatchFile: (() => {}) as any,
    meta: {
      watchMode: false,
    },
    outputs: {
      register() {},
      has() {
        return false
      },
      get() {
        throw new Error('not registered')
      },
      getDir() {
        return ''
      },
      getFileName() {
        return 'test.js'
      },
      join(_kind: any, fileName: string) {
        return fileName
      },
    },
  }
}

describe('output-icons', () => {
  it('creates output plugin', () => {
    const plugin = icons({
      icons: [
        {
          name: 'check',
          svg: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
        },
      ],
    })

    expect(plugin.name).toBe('zeus-output-icons')
    expect(typeof plugin.virtualModules).toBe('function')
    expect(typeof plugin.generateBundle).toBe('function')
  })

  it('emits virtual modules for react', async () => {
    const plugin = icons({
      icons: [
        {
          name: 'check',
          svg: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
        },
      ],
      react: true,
      vue: false,
      wc: false,
    })

    const modules = await plugin.virtualModules?.(createMockCtx())

    expect(modules?.map(item => item.fileName)).toEqual(
      expect.arrayContaining(['icons/react/check.js', 'icons/react/index.js']),
    )
  })

  it('emits virtual modules for vue', async () => {
    const plugin = icons({
      icons: [
        {
          name: 'check',
          svg: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
        },
      ],
      react: false,
      vue: true,
      wc: false,
    })

    const modules = await plugin.virtualModules?.(createMockCtx())

    expect(modules?.map(item => item.fileName)).toEqual(
      expect.arrayContaining(['icons/vue/check.js', 'icons/vue/index.js']),
    )
  })

  it('emits virtual modules for wc', async () => {
    const plugin = icons({
      icons: [
        {
          name: 'check',
          svg: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
        },
      ],
      react: false,
      vue: false,
      wc: { tagPrefix: 'z-icon-' },
    })

    const modules = await plugin.virtualModules?.(createMockCtx())

    expect(modules?.map(item => item.fileName)).toEqual(
      expect.arrayContaining(['icons/wc/check.js', 'icons/wc/index.js']),
    )
  })

  it('emits svg assets', async () => {
    const plugin = icons({
      icons: [
        {
          name: 'check',
          svg: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
        },
      ],
      svg: true,
    })

    const files = await plugin.generateBundle?.(createMockCtx(), {})

    expect(files?.map(item => item.fileName)).toContain('icons/svg/check.svg')
  })

  it('emits dts assets', async () => {
    const plugin = icons({
      icons: [
        {
          name: 'check',
          svg: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
        },
      ],
      react: true,
      vue: false,
      wc: false,
      dts: true,
    })

    const files = await plugin.generateBundle?.(createMockCtx(), {})

    expect(files?.map(item => item.fileName)).toContain(
      'icons/react/index.d.ts',
    )
  })

  it('throws when icons array is empty', () => {
    expect(() => {
      icons({ icons: [] })
    }).toThrow('[zeus-output-icons] options.icons is required.')
  })

  it('normalizes kebab-case icon names to PascalCase component names', async () => {
    const plugin = icons({
      icons: [
        {
          name: 'chevron-down',
          svg: '<svg viewBox="0 0 24 24"><path d="M6 9l6 6 6-6"/></svg>',
        },
      ],
      react: true,
      vue: false,
      wc: false,
    })

    const modules = await plugin.virtualModules?.(createMockCtx())

    const code = modules?.find(
      m => m.id === 'zeus:icons:react:chevron-down',
    )?.code
    expect(code).toContain('export const ChevronDownIcon')
  })

  it('respects custom outDir', async () => {
    const plugin = icons({
      icons: [
        {
          name: 'check',
          svg: '<svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg>',
        },
      ],
      outDir: 'my-icons',
      react: true,
      vue: false,
      wc: false,
    })

    const modules = await plugin.virtualModules?.(createMockCtx())

    expect(modules?.map(item => item.fileName)).toContain(
      'my-icons/react/check.js',
    )
  })
})
