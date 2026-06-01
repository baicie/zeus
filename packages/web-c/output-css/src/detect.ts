import path from 'node:path'

import type { CssProcessor } from './types'

export async function detectCssProcessor(
  input: string,
  root: string,
): Promise<CssProcessor> {
  const ext = path.extname(input).toLowerCase()

  if (ext === '.scss' || ext === '.sass') {
    return 'sass'
  }

  if (ext === '.less') {
    return 'less'
  }

  if (ext === '.css') {
    const rootDir = path.resolve(root)

    if (
      (await hasFile(path.join(rootDir, 'postcss.config.js'))) ||
      (await hasFile(path.join(rootDir, 'postcss.config.cjs'))) ||
      (await hasFile(path.join(rootDir, 'postcss.config.mjs'))) ||
      (await hasFile(path.join(rootDir, 'postcss.config.ts'))) ||
      (await hasFile(path.join(rootDir, 'tailwind.config.js'))) ||
      (await hasFile(path.join(rootDir, 'tailwind.config.ts'))) ||
      (await hasFile(path.join(rootDir, 'tailwind.config.cjs'))) ||
      (await hasFile(path.join(rootDir, 'tailwind.config.mjs')))
    ) {
      return 'postcss'
    }

    return 'copy'
  }

  return 'copy'
}

async function hasFile(file: string): Promise<boolean> {
  try {
    const { stat } = await import('node:fs/promises')
    const result = await stat(file)
    return result.isFile()
  } catch {
    return false
  }
}
