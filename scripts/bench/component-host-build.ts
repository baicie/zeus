// scripts/bench/component-host-build.ts

import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { componentHostBenchConfig } from './component-host-config'

export type ComponentHostBuildMode =
  | 'wc'
  | 'wc-shadow'
  | 'wc-nested'
  | 'wc-react'
  | 'wc-vue'
  | 'all'

export function buildComponentHostFixture(mode: ComponentHostBuildMode): void {
  const pnpm = resolvePnpmCommand()
  const result = spawnSync(
    pnpm.command,
    [...pnpm.args, '-C', componentHostBenchConfig.root, 'build'],
    {
      stdio: 'inherit',
      env: {
        ...process.env,
        ZEUS_BENCH_OUTPUTS: normalizeMode(mode),
      },
    },
  )

  if (result.status !== 0) {
    const reason = result.error ? ` (${result.error.message})` : ''
    throw new Error(`component-host fixture build failed: ${mode}${reason}`)
  }
}

function resolvePnpmCommand(): { command: string; args: string[] } {
  const localPnpm = path.join(
    path.dirname(process.execPath),
    'node_modules',
    'pnpm',
    'bin',
    'pnpm.cjs',
  )

  if (fs.existsSync(localPnpm)) {
    return {
      command: process.execPath,
      args: [localPnpm],
    }
  }

  return {
    command: 'pnpm',
    args: [],
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
