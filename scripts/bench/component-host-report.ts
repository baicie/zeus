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

export interface BenchmarkTrend {
  schemaVersion: 1
  commits: BenchmarkReport[]
}

export async function writeJsonReport(report: BenchmarkReport) {
  await fs.writeFile(
    path.join(componentHostBenchConfig.reportDir, 'report.json'),
    `${JSON.stringify(report, null, 2)}\n`,
  )
}

export async function writeTrendReports(report: BenchmarkReport) {
  const existing = await readTrendHistory()
  const history = upsertTrendReport(existing, report)

  await fs.writeFile(
    componentHostBenchConfig.trendJson,
    `${JSON.stringify(history, null, 2)}\n`,
  )
  await fs.writeFile(componentHostBenchConfig.trendCsv, renderTrendCsv(history))
}

export function upsertTrendReport(
  history: BenchmarkTrend,
  report: BenchmarkReport,
): BenchmarkTrend {
  if (!report.git) return history

  const existingIndex = history.commits.findIndex(
    entry => entry.git?.sha === report.git?.sha,
  )
  const previous =
    existingIndex === -1 ? undefined : history.commits[existingIndex]
  const merged: BenchmarkReport = {
    ...previous,
    ...report,
    size: report.size ?? previous?.size,
    compile: report.compile ?? previous?.compile,
    runtime: report.runtime ?? previous?.runtime,
  }
  const commits = [...history.commits]

  if (existingIndex === -1) {
    commits.push(merged)
  } else {
    commits[existingIndex] = merged
  }

  commits.sort((a, b) => {
    const byTime = a.createdAt.localeCompare(b.createdAt)
    return byTime || (a.git?.sha ?? '').localeCompare(b.git?.sha ?? '')
  })

  return { schemaVersion: 1, commits }
}

export function renderTrendCsv(history: BenchmarkTrend): string {
  const rows = [
    [
      'sha',
      'branch',
      'createdAt',
      'section',
      'name',
      'raw',
      'gzip',
      'brotli',
      'ms',
    ],
  ]

  for (const report of history.commits) {
    if (!report.git) continue

    for (const entry of report.size ?? []) {
      rows.push([
        report.git.sha,
        report.git.branch,
        report.createdAt,
        'size',
        entry.file,
        String(entry.raw),
        String(entry.gzip),
        String(entry.brotli),
        '',
      ])
    }

    for (const entry of report.compile ?? []) {
      rows.push([
        report.git.sha,
        report.git.branch,
        report.createdAt,
        'compile',
        entry.name,
        '',
        '',
        '',
        String(entry.ms),
      ])
    }

    for (const entry of report.runtime ?? []) {
      rows.push([
        report.git.sha,
        report.git.branch,
        report.createdAt,
        'runtime',
        entry.name,
        '',
        '',
        '',
        String(entry.ms),
      ])
    }
  }

  return `${rows
    .map(row =>
      row
        .map((value, index) => escapeCsv(value, index === 1 || index === 4))
        .join(','),
    )
    .join('\n')}\n`
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

  lines.push('Trend: trend.json / trend.csv (indexed by full commit SHA)')
  lines.push('')

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

async function readTrendHistory(): Promise<BenchmarkTrend> {
  try {
    const source = await fs.readFile(
      componentHostBenchConfig.trendJson,
      'utf-8',
    )
    const history = JSON.parse(source) as BenchmarkTrend
    if (history.schemaVersion !== 1 || !Array.isArray(history.commits)) {
      throw new Error('unsupported trend history format')
    }
    return history
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { schemaVersion: 1, commits: [] }
    }
    throw error
  }
}

function escapeCsv(value: string, protectFormula = false): string {
  const safeValue =
    protectFormula && /^[\t\r\n ]*[=+\-@]/.test(value) ? `'${value}` : value
  return /[",\r\n]/.test(safeValue)
    ? `"${safeValue.replace(/"/g, '""')}"`
    : safeValue
}
