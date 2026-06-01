import fs from 'node:fs/promises'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import { detectCssProcessor } from './detect'

import type { NormalizedCssEntry, NormalizedOutputCssOptions } from './types'

export interface ProcessCssResult {
  css: string
}

export async function processCssEntry(
  entry: NormalizedCssEntry,
  options: NormalizedOutputCssOptions,
  root: string,
): Promise<ProcessCssResult> {
  const input = path.resolve(root, entry.input)
  const raw = await fs.readFile(input, 'utf-8')

  const processor =
    entry.processor === 'auto'
      ? await detectCssProcessor(input, root)
      : entry.processor

  let css = raw

  if (processor === 'sass') {
    css = await processSass(input)
  } else if (processor === 'less') {
    css = await processLess(input, raw)
  } else if (processor === 'postcss') {
    css = await processPostcss(input, raw, root)
  }

  if (options.minify) {
    css = await minifyCss(input, css)
  }

  return { css }
}

async function processSass(input: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let sass: any
  try {
    sass = require('sass')
  } catch {
    throw new Error(
      '[zeus-output-css] Install "sass" to process .scss/.sass files.',
    )
  }

  const result = await sass.compileStringAsync(
    await fs.readFile(input, 'utf-8'),
    {
      url: pathToFileURL(input),
      loadPaths: [path.dirname(input)],
    },
  )

  return result.css
}

async function processLess(input: string, source: string): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let less: any
  try {
    less = require('less')
  } catch {
    throw new Error('[zeus-output-css] Install "less" to process .less files.')
  }

  const result = await less.render(source, {
    filename: input,
  })

  return result.css
}

async function processPostcss(
  input: string,
  source: string,
  root: string,
): Promise<string> {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let postcss: any
  try {
    postcss = require('postcss')
  } catch {
    throw new Error(
      '[zeus-output-css] Install "postcss" to process CSS with PostCSS.',
    )
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let loadConfig: any
  try {
    loadConfig = require('postcss-load-config')
  } catch {
    throw new Error(
      '[zeus-output-css] Install "postcss-load-config" to load PostCSS config.',
    )
  }

  const config = await loadConfig({}, root)

  const result = await postcss.default(config.plugins).process(source, {
    from: input,
    map: false,
  })

  return result.css
}

async function minifyCss(_input: string, source: string): Promise<string> {
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let lightningcss: any

    lightningcss = require('lightningcss')

    const result = lightningcss.transform({
      filename: _input,
      code: Buffer.from(source),
      minify: true,
    })

    return result.code.toString()
  } catch {
    return source
  }
}
