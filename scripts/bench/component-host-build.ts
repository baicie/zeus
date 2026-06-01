// scripts/bench/component-host-build.ts

import { spawnSync } from 'node:child_process'

import { componentHostBenchConfig } from './component-host-config'

export type ComponentHostBuildMode =
  | 'wc'
  | 'wc-shadow'
  | 'wc-nested'
  | 'wc-react'
  | 'wc-vue'
  | 'all'

export function buildComponentHostFixture(mode: ComponentHostBuildMode): void {
  const result = spawnSync(
    'pnpm',
    ['-C', componentHostBenchConfig.root, 'build'],
    {
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: {
        ...process.env,
        ZEUS_BENCH_OUTPUTS: normalizeMode(mode),
      },
    },
  )

  if (result.status !== 0) {
    throw new Error(`component-host fixture build failed: ${mode}`)
  }
}

function normalizeMode(mode: ComponentHostBuildMode): string {
  switch (mode) {
    case 'wc':
    case 'wc-shadow':
    case 'wc-nested':
      return 'wc'
    case 'wc-react':
      return 'wc-react'
    case 'wc-vue':
      return 'wc-vue'
    case 'all':
      return 'all'
  }
}
