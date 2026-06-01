// scripts/bench/component-host-compile.ts

import { performance } from 'node:perf_hooks'

import { analyzeComponents } from '@zeus-js/component-analyzer'

import {
  buildComponentHostFixture,
  type ComponentHostBuildMode,
} from './component-host-build'
import { componentHostBenchConfig } from './component-host-config'

export interface CompileBenchEntry {
  name: string
  ms: number
}

export async function runComponentHostCompileBench(): Promise<
  CompileBenchEntry[]
> {
  const result: CompileBenchEntry[] = []

  result.push({
    name: 'analyze.components.ms',
    ms: await measureAsync(async () => {
      await analyzeComponents({
        root: componentHostBenchConfig.root,
        include: ['src/components/**/*.{ts,tsx}'],
      })
    }),
  })

  for (const mode of [
    'wc',
    'wc-shadow',
    'wc-nested',
    'wc-react',
    'wc-vue',
    'all',
  ] as const) {
    result.push({
      name: `build.${mode}.ms`,
      ms: measureSyncBuild(mode),
    })
  }

  return result
}

async function measureAsync(fn: () => Promise<unknown>): Promise<number> {
  const start = performance.now()
  await fn()
  return round(performance.now() - start)
}

function measureSyncBuild(mode: ComponentHostBuildMode): number {
  const start = performance.now()
  buildComponentHostFixture(mode)
  return round(performance.now() - start)
}

function round(value: number): number {
  return Math.round(value * 100) / 100
}
