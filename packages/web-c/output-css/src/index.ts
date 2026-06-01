import fs from 'node:fs/promises'
import path from 'node:path'

import { processCssEntry } from './processCss'

import type {
  CssEntry,
  OutputCssOptions,
  NormalizedCssEntry,
  NormalizedOutputCssOptions,
} from './types'
import type {
  ZeusComponentPlugin,
  ZeusOutputFile,
} from '@zeus-js/bundler-plugin'

export type { OutputCssOptions, CssEntry, CssProcessor } from './types'

export default function css(
  options: OutputCssOptions | string = {},
): ZeusComponentPlugin {
  const raw = typeof options === 'string' ? { input: options } : options

  let normalized: NormalizedOutputCssOptions | undefined

  return {
    name: 'zeus-output-css',

    async buildStart(ctx) {
      normalized = await normalizeOptions(raw, ctx.root)

      if (normalized.watch) {
        for (const file of normalized.files) {
          ctx.addWatchFile(path.resolve(ctx.root, file.input))
        }
      }
    },

    async generateBundle(ctx): Promise<ZeusOutputFile[]> {
      const current = normalized ?? (await normalizeOptions(raw, ctx.root))
      const files: ZeusOutputFile[] = []

      for (const entry of current.files) {
        const result = await processCssEntry(entry, current, ctx.root)

        files.push({
          type: 'asset',
          fileName: entry.fileName,
          source: result.css,
        })
      }

      return files
    },
  }
}

async function normalizeOptions(
  options: OutputCssOptions,
  root: string,
): Promise<NormalizedOutputCssOptions> {
  return {
    files: await normalizeEntries(options, root),
    minify: options.minify ?? false,
    watch: options.watch ?? true,
  }
}

async function normalizeEntries(
  options: OutputCssOptions,
  root: string,
): Promise<NormalizedCssEntry[]> {
  if (options.files?.length) {
    return options.files.map(file => normalizeEntry(file, options))
  }

  const input = options.input ?? (await detectDefaultCssInput(root))

  return [
    normalizeEntry(
      {
        input,
        fileName: options.fileName,
        processor: options.processor,
      },
      options,
    ),
  ]
}

function normalizeEntry(
  entry: CssEntry,
  options: OutputCssOptions,
): NormalizedCssEntry {
  return {
    input: entry.input,
    fileName: entry.fileName ?? options.fileName ?? 'styles.css',
    processor: entry.processor ?? options.processor ?? 'auto',
  }
}

async function detectDefaultCssInput(root: string): Promise<string> {
  const candidates = [
    'src/styles.css',
    'src/style.css',
    'src/index.css',
    'src/styles.scss',
    'src/style.scss',
  ]

  for (const candidate of candidates) {
    try {
      await fs.access(path.resolve(root, candidate))
      return candidate
    } catch {}
  }

  throw new Error(
    `[zeus-output-css] CSS input is required. Tried: ${candidates.join(', ')}`,
  )
}
