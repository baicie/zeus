import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import css from '@zeus-js/output-css'

import type { ZeusBuildContext, ZeusOutputFile } from '@zeus-js/bundler-plugin'
import type { OutputBundle } from 'rollup'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const root = path.resolve(__dirname, 'fixtures-output-css')

const fixtureFile = (name: string, content: string) => {
  const filePath = path.resolve(root, name)
  fs.mkdirSync(path.dirname(filePath), { recursive: true })
  fs.writeFileSync(filePath, content, 'utf-8')
  return filePath
}

const createCtx = (): ZeusBuildContext => ({
  root,
  manifest: {} as ZeusBuildContext['manifest'],
  diagnostics: [] as ZeusBuildContext['diagnostics'],
  dts: { enabled: false, mode: false, reason: [] },
  outputs: {
    register: vi.fn(),
    has: vi.fn(() => false),
    get: vi.fn(),
    getDir: vi.fn(() => 'dist'),
    getFileName: vi.fn((tag: string) => `${tag}.js`),
    join: vi.fn((_: string, fileName: string) => fileName),
  },
  emitFile: vi.fn(),
  warn: vi.fn(),
  error: vi.fn((): never => {
    throw new Error('error')
  }),
  addWatchFile: vi.fn(),
  meta: { watchMode: false },
})

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  fs.rmSync(root, { recursive: true, force: true })
})

describe('@zeus-js/output-css', () => {
  describe('auto-detect input', () => {
    it('detects src/styles.css automatically', async () => {
      fixtureFile('src/styles.css', '.foo { color: red; }')

      const plugin = css()
      const ctx = createCtx()

      await plugin.buildStart!(ctx)

      expect(ctx.addWatchFile).toHaveBeenCalledWith(
        path.resolve(root, 'src/styles.css'),
      )
    })

    it('detects src/style.css when styles.css does not exist', async () => {
      fixtureFile('src/style.css', '.bar { color: blue; }')

      const plugin = css()
      const ctx = createCtx()

      await plugin.buildStart!(ctx)

      expect(ctx.addWatchFile).toHaveBeenCalledWith(
        path.resolve(root, 'src/style.css'),
      )
    })

    it('detects src/index.css when neither styles.css nor style.css exists', async () => {
      fixtureFile('src/index.css', '.baz { color: green; }')

      const plugin = css()
      const ctx = createCtx()

      await plugin.buildStart!(ctx)

      expect(ctx.addWatchFile).toHaveBeenCalledWith(
        path.resolve(root, 'src/index.css'),
      )
    })

    it('throws when no CSS file found', async () => {
      const plugin = css()
      const ctx = createCtx()

      await expect(plugin.buildStart!(ctx)).rejects.toThrow(
        /CSS input is required/,
      )
    })
  })

  describe('explicit input', () => {
    it('uses provided input path', async () => {
      fixtureFile('src/custom.css', '.custom { font-size: 14px; }')

      const plugin = css('src/custom.css')
      const ctx = createCtx()

      await plugin.buildStart!(ctx)

      expect(ctx.addWatchFile).toHaveBeenCalledWith(
        path.resolve(root, 'src/custom.css'),
      )
    })

    it('outputs with custom fileName', async () => {
      fixtureFile('src/styles.css', '.foo { color: red; }')

      const plugin = css({ input: 'src/styles.css', fileName: 'app.css' })
      const ctx = createCtx()

      await plugin.buildStart!(ctx)
      const files = (await plugin.generateBundle!(
        ctx,
        {} as OutputBundle,
      )) as ZeusOutputFile[]

      expect(files).toHaveLength(1)
      expect(files[0]).toMatchObject({
        type: 'asset',
        fileName: 'app.css',
        source: '.foo { color: red; }',
      })
    })
  })

  describe('processor: copy', () => {
    it('copies CSS file without processing', async () => {
      fixtureFile('src/styles.css', '.btn { padding: 8px; }')

      const plugin = css({ input: 'src/styles.css', processor: 'copy' })
      const ctx = createCtx()

      await plugin.buildStart!(ctx)
      const files = (await plugin.generateBundle!(
        ctx,
        {} as OutputBundle,
      )) as ZeusOutputFile[]

      expect(files).toHaveLength(1)
      expect(files[0]).toMatchObject({
        type: 'asset',
        fileName: 'styles.css',
        source: '.btn { padding: 8px; }',
      })
    })
  })

  describe('watch', () => {
    it('adds watch file when watch is true', async () => {
      fixtureFile('src/styles.css', '.foo { color: red; }')

      const plugin = css({ input: 'src/styles.css', watch: true })
      const ctx = createCtx()

      await plugin.buildStart!(ctx)

      expect(ctx.addWatchFile).toHaveBeenCalledTimes(1)
    })

    it('does not add watch file when watch is false', async () => {
      fixtureFile('src/styles.css', '.foo { color: red; }')

      const plugin = css({ input: 'src/styles.css', watch: false })
      const ctx = createCtx()

      await plugin.buildStart!(ctx)

      expect(ctx.addWatchFile).not.toHaveBeenCalled()
    })
  })

  describe('minify', () => {
    it('minifies CSS when minify is true (without lightningcss, falls back)', async () => {
      fixtureFile('src/styles.css', '.foo { color: red; }')

      const plugin = css({ input: 'src/styles.css', minify: true })
      const ctx = createCtx()

      await plugin.buildStart!(ctx)

      // Should not throw even without lightningcss
      const files = (await plugin.generateBundle!(
        ctx,
        {} as OutputBundle,
      )) as ZeusOutputFile[]

      expect(files).toHaveLength(1)
      // Without lightningcss, minify returns original source
      expect(files[0]).toMatchObject({
        type: 'asset',
        fileName: 'styles.css',
      })
    })
  })

  describe('generateBundle output', () => {
    it('outputs styles.css by default', async () => {
      fixtureFile('src/styles.css', '.btn { border: 1px solid; }')

      const plugin = css()
      const ctx = createCtx()

      await plugin.buildStart!(ctx)
      const files = (await plugin.generateBundle!(
        ctx,
        {} as OutputBundle,
      )) as ZeusOutputFile[]

      expect(files).toHaveLength(1)
      expect(files[0]).toMatchObject({
        type: 'asset',
        fileName: 'styles.css',
        source: '.btn { border: 1px solid; }',
      })
    })
  })
})
