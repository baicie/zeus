/* eslint-disable @typescript-eslint/no-explicit-any */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import cssPlugin from '../src/index'

import type { ZeusOutputAsset } from '@zeus-js/bundler-plugin'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function createMockCtx(root: string): any {
  return {
    root,
    manifest: {
      version: 1 as const,
      components: [],
    },
    diagnostics: [],
    dts: { enabled: false, mode: false as any, reason: [] },
    emitFile: (() => '') as any,
    warn: (() => {}) as any,
    error: (() => {}) as any,
    addWatchFile: vi.fn(),
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
        return 'test.css'
      },
      join(_kind: any, fileName: string) {
        return fileName
      },
    },
  }
}

const fixturesDir = path.join(__dirname, 'fixtures')

function createTempCss(name: string, content: string): string {
  const filePath = path.join(fixturesDir, name)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content)
  return filePath
}

describe('output-css', () => {
  beforeEach(() => {
    if (!fs.existsSync(fixturesDir)) {
      fs.mkdirSync(fixturesDir, { recursive: true })
    }
  })

  afterEach(() => {
    if (fs.existsSync(fixturesDir)) {
      fs.rmSync(fixturesDir, { recursive: true, force: true })
    }
  })

  describe('plugin shape', () => {
    it('creates output plugin with string input', () => {
      const plugin = cssPlugin('src/styles.css')
      expect(plugin.name).toBe('zeus-output-css')
      expect(typeof plugin.buildStart).toBe('function')
      expect(typeof plugin.generateBundle).toBe('function')
    })

    it('creates output plugin with options object', () => {
      const plugin = cssPlugin({ input: 'src/main.css' })
      expect(plugin.name).toBe('zeus-output-css')
    })

    it('creates output plugin with multiple files', () => {
      const plugin = cssPlugin({
        files: [{ input: 'src/a.css' }, { input: 'src/b.css' }],
      })
      expect(plugin.name).toBe('zeus-output-css')
    })
  })

  describe('auto-discovery', () => {
    it('detects src/styles.css automatically', async () => {
      createTempCss('src/styles.css', 'body { color: red; }')
      const root = fixturesDir

      const plugin = cssPlugin()

      await plugin.buildStart?.(createMockCtx(root))
      const files = await plugin.generateBundle?.(createMockCtx(root), {})

      expect(files).toHaveLength(1)
      expect((files![0] as ZeusOutputAsset).source).toBe('body { color: red; }')
    })

    it('throws when no CSS file found and no input specified', async () => {
      const root = fixturesDir

      const plugin = cssPlugin()

      await expect(plugin.buildStart?.(createMockCtx(root))).rejects.toThrow(
        /CSS input is required\. Tried:.*styles\.css.*style\.css.*index\.css/,
      )
    })
  })

  describe('processor: copy', () => {
    it('copies plain CSS without processing', async () => {
      createTempCss('src/plain.css', 'body { color: red; }')
      const root = fixturesDir

      const plugin = cssPlugin({
        input: 'src/plain.css',
        processor: 'copy',
      })

      await plugin.buildStart?.(createMockCtx(root))
      const files = await plugin.generateBundle?.(createMockCtx(root), {})

      expect(files).toHaveLength(1)
      expect(files![0].fileName).toBe('styles.css')
      expect((files![0] as ZeusOutputAsset).source).toBe('body { color: red; }')
    })
  })

  describe('processor: auto (plain css)', () => {
    it('passes through plain CSS when no preprocessor detected', async () => {
      createTempCss('src/vanilla.css', 'h1 { font-size: 24px; }')
      const root = fixturesDir

      const plugin = cssPlugin({
        input: 'src/vanilla.css',
        processor: 'auto',
      })

      await plugin.buildStart?.(createMockCtx(root))
      const files = await plugin.generateBundle?.(createMockCtx(root), {})

      expect(files).toHaveLength(1)
      expect((files![0] as ZeusOutputAsset).source).toBe(
        'h1 { font-size: 24px; }',
      )
    })
  })

  describe('processor: auto (scss detection)', () => {
    it('detects .scss extension and processes with sass', async () => {
      createTempCss('src/main.scss', '$color: blue; .foo { color: $color; }')
      const root = fixturesDir

      const plugin = cssPlugin({
        input: 'src/main.scss',
        processor: 'auto',
      })

      await plugin.buildStart?.(createMockCtx(root))
      const files = await plugin.generateBundle?.(createMockCtx(root), {})

      expect((files![0] as ZeusOutputAsset).source).toContain('.foo {')
      expect((files![0] as ZeusOutputAsset).source).toContain('color: blue;')
    })
  })

  describe('processor: auto (less detection)', () => {
    it('detects .less extension and processes with less', async () => {
      createTempCss('src/theme.less', '@color: green; .bar { color: @color; }')
      const root = fixturesDir

      const plugin = cssPlugin({
        input: 'src/theme.less',
        processor: 'auto',
      })

      await plugin.buildStart?.(createMockCtx(root))
      const files = await plugin.generateBundle?.(createMockCtx(root), {})

      expect((files![0] as ZeusOutputAsset).source).toContain('.bar {')
      expect((files![0] as ZeusOutputAsset).source).toContain('color: green;')
    })
  })

  describe('custom fileName', () => {
    it('uses custom fileName when provided', async () => {
      createTempCss('src/custom.css', 'body {}')
      const root = fixturesDir

      const plugin = cssPlugin({
        input: 'src/custom.css',
        fileName: 'custom-bundle.css',
      })

      await plugin.buildStart?.(createMockCtx(root))
      const files = await plugin.generateBundle?.(createMockCtx(root), {})

      expect(files![0].fileName).toBe('custom-bundle.css')
    })
  })

  describe('minify', () => {
    it('minifies CSS when minify option is true', async () => {
      createTempCss(
        'src/minify-test.css',
        '.a { color: red; } .b { background: blue; }',
      )
      const root = fixturesDir

      const plugin = cssPlugin({
        input: 'src/minify-test.css',
        minify: true,
      })

      await plugin.buildStart?.(createMockCtx(root))
      const files = await plugin.generateBundle?.(createMockCtx(root), {})

      expect((files![0] as ZeusOutputAsset).source).not.toContain('\n')
      expect((files![0] as ZeusOutputAsset).source).not.toContain('  ')
    })

    it('keeps CSS unminified when minify is false', async () => {
      createTempCss('src/no-minify.css', '.a { color: red; }')
      const root = fixturesDir

      const plugin = cssPlugin({
        input: 'src/no-minify.css',
        minify: false,
      })

      await plugin.buildStart?.(createMockCtx(root))
      const files = await plugin.generateBundle?.(createMockCtx(root), {})

      expect((files![0] as ZeusOutputAsset).source).toBe('.a { color: red; }')
    })

    it('applies minification when minify is true', async () => {
      createTempCss('src/no-lcss.css', '.a { color: red; }')
      const root = fixturesDir

      const plugin = cssPlugin({
        input: 'src/no-lcss.css',
        minify: true,
      })

      await plugin.buildStart?.(createMockCtx(root))
      const files = await plugin.generateBundle?.(createMockCtx(root), {})

      expect(files).toHaveLength(1)
      expect((files![0] as ZeusOutputAsset).source).not.toBe(
        '.a { color: red; }',
      )
    })
  })

  describe('watch', () => {
    it('registers watch file when watch is true', async () => {
      createTempCss('src/watch.css', 'body {}')
      const root = fixturesDir
      const ctx = createMockCtx(root)

      const plugin = cssPlugin({
        input: 'src/watch.css',
        watch: true,
      })

      await plugin.buildStart?.(ctx)

      expect(ctx.addWatchFile).toHaveBeenCalledWith(
        expect.stringContaining('watch.css'),
      )
    })

    it('does not register watch file when watch is false', async () => {
      createTempCss('src/no-watch.css', 'body {}')
      const root = fixturesDir
      const ctx = createMockCtx(root)

      const plugin = cssPlugin({
        input: 'src/no-watch.css',
        watch: false,
      })

      await plugin.buildStart?.(ctx)

      expect(ctx.addWatchFile).not.toHaveBeenCalled()
    })
  })

  describe('multiple files', () => {
    it('processes multiple CSS entries', async () => {
      createTempCss('src/base.css', 'body { margin: 0; }')
      createTempCss('src/theme.css', '.theme { color: blue; }')
      const root = fixturesDir

      const plugin = cssPlugin({
        files: [
          { input: 'src/base.css' },
          { input: 'src/theme.css', fileName: 'theme.css' },
        ],
      })

      await plugin.buildStart?.(createMockCtx(root))
      const files = await plugin.generateBundle?.(createMockCtx(root), {})

      expect(files).toHaveLength(2)
      expect((files![0] as ZeusOutputAsset).source).toContain('margin: 0')
      expect(files![1].fileName).toBe('theme.css')
      expect((files![1] as ZeusOutputAsset).source).toContain('color: blue')
    })
  })
})
