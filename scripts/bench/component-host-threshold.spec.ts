import { afterEach, describe, expect, it, vi } from 'vitest'

import { checkThresholds } from './component-host-threshold'

import type { ComponentHostBenchThresholds } from './component-host-config'
import type { BenchmarkReport } from './component-host-report'

describe('component-host thresholds', () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('fails when a size threshold points to a missing report entry', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation(code => {
      throw new Error(`process.exit(${code})`)
    })

    const report: BenchmarkReport = {
      name: 'component-host',
      createdAt: '2026-06-07T00:00:00.000Z',
      git: null,
      size: [{ file: 'wc/z-button.entry.js', raw: 10, gzip: 10, brotli: 10 }],
    }

    expect(() =>
      checkThresholds(report, {
        size: { 'wc/missing.entry.js:gzip': 100 },
        compile: {},
        runtime: {},
      } as unknown as ComponentHostBenchThresholds),
    ).toThrow('process.exit(1)')

    expect(console.error).toHaveBeenCalledWith(
      '  - wc/missing.entry.js:gzip did not match any size report entry',
    )
  })

  it('fails when a metric threshold points to a missing report entry', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(process, 'exit').mockImplementation(code => {
      throw new Error(`process.exit(${code})`)
    })

    const report: BenchmarkReport = {
      name: 'component-host',
      createdAt: '2026-06-07T00:00:00.000Z',
      git: null,
      runtime: [{ name: 'wc.mount.1000', ms: 10 }],
    }

    expect(() =>
      checkThresholds(report, {
        size: {},
        compile: {},
        runtime: { 'wc.missing.1000': 100 },
      } as unknown as ComponentHostBenchThresholds),
    ).toThrow('process.exit(1)')

    expect(console.error).toHaveBeenCalledWith(
      '  - wc.missing.1000 did not match any benchmark report entry',
    )
  })
})
