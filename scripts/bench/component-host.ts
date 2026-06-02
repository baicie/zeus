// scripts/bench/component-host.ts

import fs from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { runComponentHostCompileBench } from './component-host-compile'
import { componentHostBenchConfig } from './component-host-config'
import {
  renderMarkdownReport,
  writeJsonReport,
  type BenchmarkReport,
} from './component-host-report'
import { runComponentHostRuntimeBench } from './component-host-runtime'
import { runComponentHostSizeBench } from './component-host-size'
import { checkThresholds } from './component-host-threshold'

async function main() {
  const { values } = parseArgs({
    options: {
      ci: {
        type: 'boolean',
        default: false,
      },
      'size-only': {
        type: 'boolean',
        default: false,
      },
      'compile-only': {
        type: 'boolean',
        default: false,
      },
      'runtime-only': {
        type: 'boolean',
        default: false,
      },
    },
  })

  await fs.rm(componentHostBenchConfig.reportDir, {
    recursive: true,
    force: true,
  })

  await fs.mkdir(componentHostBenchConfig.reportDir, {
    recursive: true,
  })

  const report: BenchmarkReport = {
    name: 'component-host',
    createdAt: new Date().toISOString(),
    git: readGitInfo(),
  }

  const onlySize = values['size-only']
  const onlyCompile = values['compile-only']
  const onlyRuntime = values['runtime-only']

  if (!onlyCompile && !onlyRuntime) {
    report.size = await runComponentHostSizeBench()
  }

  if (!onlySize && !onlyRuntime) {
    report.compile = await runComponentHostCompileBench()
  }

  if (!onlySize && !onlyCompile) {
    report.runtime = await runComponentHostRuntimeBench()
  }

  await writeJsonReport(report)
  await renderMarkdownReport(report)

  if (values.ci) {
    checkThresholds(report, componentHostBenchConfig.thresholds)
  }

  console.log(
    `\nBenchmark report written to ${path.relative(
      process.cwd(),
      componentHostBenchConfig.reportDir,
    )}\n`,
  )
}

function readGitInfo() {
  try {
    const { execFileSync } =
      require('node:child_process') as typeof import('node:child_process')

    return {
      branch: execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
        .toString()
        .trim(),
      sha: execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(),
    }
  } catch {
    return null
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
