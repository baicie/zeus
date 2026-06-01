// scripts/bench/component-host-size.ts

import fs from 'node:fs/promises'
import path from 'node:path'
import { brotliCompressSync, gzipSync } from 'node:zlib'

import { buildComponentHostFixture } from './component-host-build'
import { componentHostBenchConfig } from './component-host-config'

export interface SizeBenchEntry {
  file: string
  raw: number
  gzip: number
  brotli: number
}

export async function runComponentHostSizeBench(): Promise<SizeBenchEntry[]> {
  buildComponentHostFixture('all')

  const files = await collectFiles(
    componentHostBenchConfig.dist,
    file => file.endsWith('.js') || file.endsWith('.css'),
  )

  const result: SizeBenchEntry[] = []

  for (const file of files) {
    const source = await fs.readFile(file)
    const relative = path
      .relative(componentHostBenchConfig.dist, file)
      .replace(/\\/g, '/')

    result.push({
      file: relative,
      raw: source.byteLength,
      gzip: gzipSync(source).byteLength,
      brotli: brotliCompressSync(source).byteLength,
    })
  }

  result.sort((a, b) => a.file.localeCompare(b.file))

  await checkTreeShaking()

  return result
}

async function checkTreeShaking(): Promise<void> {
  const allFiles = await collectFiles(componentHostBenchConfig.dist, file =>
    file.endsWith('.js'),
  )

  const errors: string[] = []

  const configs: Array<{
    dir: string
    tag: string
    forbidden: string[]
  }> = [
    {
      dir: 'assets',
      tag: 'bench-button',
      forbidden: [
        'z-bench-counter',
        'z-bench-card',
        'z-bench-dialog',
        'z-bench-button-shadow',
        'z-bench-counter-shadow',
        'z-bench-card-shadow',
        'z-bench-dialog-shadow',
        'z-bench-nested',
        'z-bench-nested-leaf',
      ],
    },
    {
      dir: 'assets',
      tag: 'bench-button-shadow',
      forbidden: [
        'z-bench-counter',
        'z-bench-card',
        'z-bench-dialog',
        'z-bench-button',
        'z-bench-counter-shadow',
        'z-bench-card-shadow',
        'z-bench-dialog-shadow',
        'z-bench-nested',
        'z-bench-nested-leaf',
      ],
    },
    {
      dir: 'react',
      tag: 'z-bench-button',
      forbidden: ['z-bench-counter', 'z-bench-card', 'z-bench-dialog'],
    },
    {
      dir: 'vue',
      tag: 'z-bench-button',
      forbidden: ['z-bench-counter', 'z-bench-card', 'z-bench-dialog'],
    },
  ]

  for (const cfg of configs) {
    const file = allFiles.find(
      f =>
        f.includes(`/${cfg.dir}/`) &&
        f.includes(cfg.tag) &&
        !f.includes('index'),
    )

    if (!file) {
      errors.push(`[tree-shaking] missing ${cfg.dir}/${cfg.tag} chunk file`)
      continue
    }

    const code = await fs.readFile(file, 'utf-8')

    const definedTags = code.match(/[a-z]\("[^"]+"/g) ?? []
    for (const match of definedTags) {
      const definedName = match.slice(2)
      if (cfg.forbidden.includes(definedName)) {
        errors.push(
          `[tree-shaking] ${path.relative(componentHostBenchConfig.dist, file)} should not define ${definedName}`,
        )
      }
    }
  }

  if (errors.length) {
    throw new Error(errors.join('\n'))
  }
}

async function collectFiles(
  dir: string,
  filter: (file: string) => boolean,
): Promise<string[]> {
  const entries = await fs.readdir(dir, {
    withFileTypes: true,
  })

  const files: string[] = []

  for (const entry of entries) {
    const file = path.join(dir, entry.name)

    if (entry.isDirectory()) {
      files.push(...(await collectFiles(file, filter)))
    } else if (entry.isFile() && filter(file)) {
      files.push(file)
    }
  }

  return files
}
