// scripts/bench/component-host.ts

import { execFileSync } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { parseArgs } from 'node:util'

import { runComponentHostCompileBench } from './component-host-compile'
import { componentHostBenchConfig } from './component-host-config'
import {
  renderMarkdownReport,
  writeTrendReports,
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

  await fs.mkdir(componentHostBenchConfig.reportDir, {
    recursive: true,
  })
  await Promise.all(
    ['report.json', 'report.md'].map(file =>
      fs.rm(path.join(componentHostBenchConfig.reportDir, file), {
        force: true,
      }),
    ),
  )

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
  await writeTrendReports(report)
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
    const branch = process.env.ZEUS_BENCH_GIT_BRANCH
    const sha = process.env.ZEUS_BENCH_GIT_SHA

    return {
      branch:
        branch ||
        execFileSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'])
          .toString()
          .trim(),
      sha: sha || execFileSync('git', ['rev-parse', 'HEAD']).toString().trim(),
    }
  } catch {
    return null
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
