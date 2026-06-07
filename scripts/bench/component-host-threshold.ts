// scripts/bench/component-host-threshold.ts

import type { ComponentHostBenchThresholds } from './component-host-config'
import type {
  BenchmarkReport,
  SizeEntry,
  CompileEntry,
  RuntimeEntry,
} from './component-host-report'

export function checkThresholds(
  report: BenchmarkReport,
  thresholds: ComponentHostBenchThresholds,
): void {
  const errors: string[] = []

  checkSize(report.size, thresholds.size, errors)
  checkMetricList(report.compile, thresholds.compile, errors)
  checkMetricList(report.runtime, thresholds.runtime, errors)

  if (errors.length) {
    console.error('\nComponent host benchmark threshold failed:\n')

    for (const error of errors) {
      console.error(`  - ${error}`)
    }

    console.error('')

    process.exit(1)
  }
}

function checkSize(
  value: SizeEntry[] | undefined,
  thresholds: Record<string, number>,
  errors: string[],
): void {
  if (!value || value.length === 0) {
    return
  }

  for (const [key, limit] of Object.entries(thresholds)) {
    const [file, metric] = key.split(':') as [string, 'raw' | 'gzip' | 'brotli']

    const entry = value.find(item => item.file === file)
    if (!entry) {
      errors.push(`${key} did not match any size report entry`)
      continue
    }

    const actual = entry[metric]

    if (typeof actual === 'number' && actual > limit) {
      errors.push(`${key} = ${actual} bytes, limit = ${limit} bytes`)
    }
  }
}

function checkMetricList(
  value: CompileEntry[] | RuntimeEntry[] | undefined,
  thresholds: Record<string, number>,
  errors: string[],
): void {
  if (!value || value.length === 0) {
    return
  }

  for (const [name, limit] of Object.entries(thresholds)) {
    const entry = value.find(item => item.name === name)
    if (!entry) {
      errors.push(`${name} did not match any benchmark report entry`)
      continue
    }

    if (typeof entry.ms === 'number' && entry.ms > limit) {
      errors.push(`${name} = ${entry.ms}ms, limit = ${limit}ms`)
    }
  }
}
