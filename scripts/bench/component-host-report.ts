// scripts/bench/component-host-report.ts

import fs from 'node:fs/promises'
import path from 'node:path'

import { componentHostBenchConfig } from './component-host-config'

export interface GitInfo {
  branch: string
  sha: string
}

export interface SizeEntry {
  file: string
  raw: number
  gzip: number
  brotli: number
}

export interface CompileEntry {
  name: string
  ms: number
}

export interface RuntimeEntry {
  name: string
  ms: number
}

export interface BenchmarkReport {
  name: string
  createdAt: string
  git: GitInfo | null
  size?: SizeEntry[]
  compile?: CompileEntry[]
  runtime?: RuntimeEntry[]
}

export async function writeJsonReport(report: BenchmarkReport) {
  await fs.writeFile(
    path.join(componentHostBenchConfig.reportDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
}

export async function renderMarkdownReport(report: BenchmarkReport) {
  const lines: string[] = []

  lines.push('# Zeus Component Host Benchmark')
  lines.push('')
  lines.push(`Created at: ${report.createdAt}`)
  lines.push('')

  if (report.git) {
    lines.push(`Branch: ${report.git.branch}`)
    lines.push(`Commit: ${report.git.sha}`)
    lines.push('')
  }

  if (report.size) {
    lines.push('## Size')
    lines.push('')
    lines.push('| File | Raw | Gzip | Brotli |')
    lines.push('|---|---:|---:|---:|')

    for (const item of report.size) {
      lines.push(
        `| ${item.file} | ${formatBytes(item.raw)} | ${formatBytes(
          item.gzip,
        )} | ${formatBytes(item.brotli)} |`,
      )
    }

    lines.push('')
  }

  if (report.compile) {
    lines.push('## Compile')
    lines.push('')
    lines.push('| Metric | Time |')
    lines.push('|---|---:|')

    for (const item of report.compile) {
      lines.push(`| ${item.name} | ${item.ms}ms |`)
    }

    lines.push('')
  }

  if (report.runtime) {
    lines.push('## Runtime')
    lines.push('')
    lines.push('| Metric | Time |')
    lines.push('|---|---:|')

    for (const item of report.runtime) {
      lines.push(`| ${item.name} | ${item.ms}ms |`)
    }

    lines.push('')
  }

  await fs.writeFile(
    path.join(componentHostBenchConfig.reportDir, 'report.md'),
    `${lines.join('\n')}\n`,
  )
}

function formatBytes(value: number): string {
  if (value < 1024) return `${value} B`
  return `${Math.round((value / 1024) * 100) / 100} KB`
}
