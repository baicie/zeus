// scripts/bench/repeat-baseline.ts
//
// Runs the existing offline benchmarks several times in fresh processes and
// summarizes the sample distribution. It adds no new measurement; every number
// comes from reactivity-audit.mjs, compiler-native.ts or component-host.ts.

import { execFileSync, spawnSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'

const root = path.resolve(import.meta.dirname, '../..')

export interface SampleSummary {
  n: number
  min: number
  median: number
  p95: number
  max: number
  mean: number
  variance: number
  cvPercent: number
}

/**
 * Nearest-rank P95, unbiased sample variance (n - 1) and coefficient of
 * variation. Fewer than two samples cannot describe a distribution.
 */
export function summarizeSamples(samples: readonly number[]): SampleSummary {
  if (samples.length < 2) {
    throw new Error('At least two samples are required for a summary')
  }
  if (samples.some(sample => !Number.isFinite(sample))) {
    throw new Error('Samples must be finite numbers')
  }
  const sorted = [...samples].sort((left, right) => left - right)
  const n = sorted.length
  const middle = Math.floor(n / 2)
  const median =
    n % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
  const p95 = sorted[Math.ceil(0.95 * n) - 1]!
  const mean = sorted.reduce((total, sample) => total + sample, 0) / n
  const variance =
    sorted.reduce((total, sample) => total + (sample - mean) ** 2, 0) / (n - 1)
  return {
    n,
    min: sorted[0]!,
    median: round(median),
    p95: round(p95),
    max: sorted[n - 1]!,
    mean: round(mean),
    variance: round(variance),
    cvPercent: mean === 0 ? 0 : round((Math.sqrt(variance) / mean) * 100),
  }
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function runNode(args: string[], env: NodeJS.ProcessEnv = {}): string {
  const result = spawnSync(process.execPath, args, {
    cwd: root,
    encoding: 'utf8',
    env: { ...process.env, ...env },
    maxBuffer: 64 * 1024 * 1024,
  })
  if (result.error) throw result.error
  if (result.status !== 0) {
    throw new Error(
      `node ${args.join(' ')} exited with ${result.status}\n${result.stderr}`,
    )
  }
  return result.stdout
}

function readJson<T>(relativePath: string): T {
  return JSON.parse(fs.readFileSync(path.join(root, relativePath), 'utf8')) as T
}

function tryExec(command: string, args: string[]): string | null {
  try {
    return execFileSync(command, args, { cwd: root, encoding: 'utf8' }).trim()
  } catch {
    return null
  }
}

interface ReactivityAuditReport {
  measurements: {
    zeus: Record<
      'writeOneEffect' | 'diamond',
      { medianMs: number; samplesMs: number[] }
    >
  }
}

function main(): void {
  const { values } = parseArgs({
    options: {
      rounds: { type: 'string', default: '3' },
      output: { type: 'string', default: 'temp/bench/repeat-baseline.json' },
      'skip-component-host': { type: 'boolean', default: false },
    },
  })
  const rounds = Number(values.rounds)
  if (!Number.isInteger(rounds) || rounds < 2) {
    throw new Error('--rounds must be an integer of at least 2')
  }

  const samples: Record<string, number[]> = {}
  const add = (name: string, measured: readonly number[]) => {
    ;(samples[name] ??= []).push(...measured)
  }
  const startedAt = new Date().toISOString()

  for (let round = 1; round <= rounds; round++) {
    console.log(`[repeat-baseline] round ${round}/${rounds}`)
    for (const mode of ['production', 'development'] as const) {
      const report = JSON.parse(
        runNode(['packages/core/signal/scripts/reactivity-audit.mjs'], {
          NODE_ENV: mode,
        }),
      ) as ReactivityAuditReport
      for (const metric of ['writeOneEffect', 'diamond'] as const) {
        const measurement = report.measurements.zeus[metric]
        add(`signal.${mode}.${metric}.samplesMs`, measurement.samplesMs)
        add(`signal.${mode}.${metric}.processMedianMs`, [measurement.medianMs])
      }
    }

    runNode(['--import', 'tsx', 'scripts/bench/compiler-native.ts'])
    const native = readJson<{ coldCompileMs: number; warmCompileMs: number }>(
      'temp/bench/compiler-native.json',
    )
    add('compilerNative.coldCompileMs', [native.coldCompileMs])
    add('compilerNative.warmCompileMsPerCall', [native.warmCompileMs])

    if (!values['skip-component-host']) {
      runNode([
        '--import',
        'tsx',
        'scripts/bench/component-host.ts',
        '--compile-only',
      ])
      const hostReport = readJson<{ compile: { name: string; ms: number }[] }>(
        'temp/bench/component-host/report.json',
      )
      for (const entry of hostReport.compile) {
        add(`componentHost.${entry.name}`, [entry.ms])
      }
    }
  }

  const report = {
    schemaVersion: 1,
    startedAt,
    completedAt: new Date().toISOString(),
    git: {
      sha: tryExec('git', ['rev-parse', 'HEAD']),
      trackedChanges: Boolean(
        tryExec('git', ['status', '--porcelain', '--untracked-files=no']),
      ),
    },
    machine: {
      platform: process.platform,
      osRelease: os.release(),
      arch: process.arch,
      cpu: os.cpus()[0]?.model ?? null,
      cpus: os.cpus().length,
      totalMemoryBytes: os.totalmem(),
      node: process.version,
      rustc: tryExec('rustc', ['--version']),
    },
    method: {
      rounds,
      statistics:
        'nearest-rank P95; unbiased sample variance (n - 1); cvPercent = stddev / mean',
      sources: [
        'packages/core/signal/scripts/reactivity-audit.mjs (5 in-process rounds per run, NODE_ENV production and development)',
        'scripts/bench/compiler-native.ts (1 cold call + mean of 100 warm calls per run)',
        'scripts/bench/component-host.ts --compile-only (1 sample per build mode per run)',
      ],
      notes: [
        'Each round starts fresh Node processes; component-host builds run sequentially.',
        'The compiler cold sample includes first-call native binding work and file-system cache state.',
        'No threshold is inferred from these observations.',
      ],
    },
    summaries: Object.fromEntries(
      Object.entries(samples).map(([name, measured]) => [
        name,
        summarizeSamples(measured),
      ]),
    ),
    samples,
  }

  const output = path.resolve(root, values.output!)
  fs.mkdirSync(path.dirname(output), { recursive: true })
  fs.writeFileSync(output, `${JSON.stringify(report, null, 2)}\n`)
  console.log(`[repeat-baseline] report written to ${output}`)
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main()
}
