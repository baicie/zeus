import { describe, expect, it, vi } from 'vitest'

import {
  FIRST_INTERACTION_METRIC,
  requireRuntimeBenchResults,
  summarizeRuntimeBenchSamples,
} from './component-host-runtime'
import { checkThresholds } from './component-host-threshold'

import type { ComponentHostBenchThresholds } from './component-host-config'

describe('component-host runtime benchmark results', () => {
  it('requires the cold first interaction metric', () => {
    expect(() =>
      requireRuntimeBenchResults([{ name: 'wc.mount.1000', ms: 1 }]),
    ).toThrow(`required metric ${FIRST_INTERACTION_METRIC} is missing`)
  })

  it('rejects empty, malformed, and negative measurements', () => {
    expect(() => requireRuntimeBenchResults([])).toThrow(
      'benchmark returned no results',
    )
    expect(() =>
      requireRuntimeBenchResults([
        { name: FIRST_INTERACTION_METRIC, ms: Number.NaN },
      ]),
    ).toThrow('benchmark returned an invalid result entry')
    expect(() =>
      requireRuntimeBenchResults([{ name: FIRST_INTERACTION_METRIC, ms: -1 }]),
    ).toThrow('benchmark returned an invalid result entry')
  })

  it('accepts a finite first interaction measurement', () => {
    expect(
      requireRuntimeBenchResults([
        { name: FIRST_INTERACTION_METRIC, ms: 3.14 },
      ]),
    ).toEqual([{ name: FIRST_INTERACTION_METRIC, ms: 3.14 }])
  })
})

describe('component-host runtime sampling', () => {
  const sample = (ms: number) => [
    { name: FIRST_INTERACTION_METRIC, ms },
    { name: 'wc.mount.1000', ms: ms / 2 },
  ]

  it('uses a fixed three-sample median and retains outliers in acquisition order', () => {
    expect(
      summarizeRuntimeBenchSamples([sample(60), sample(630), sample(70)]),
    ).toEqual([
      { name: FIRST_INTERACTION_METRIC, ms: 70, samples: [60, 630, 70] },
      { name: 'wc.mount.1000', ms: 35, samples: [30, 315, 35] },
    ])
  })

  it('does not hide a sustained regression behind a fast sample', () => {
    const entries = summarizeRuntimeBenchSamples([
      sample(650),
      sample(60),
      sample(620),
    ])
    expect(entries[0]?.ms).toBe(620)
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    const exit = vi.spyOn(process, 'exit').mockImplementation(code => {
      throw new Error(`process.exit(${code})`)
    })
    try {
      expect(() =>
        checkThresholds(
          {
            name: 'component-host',
            createdAt: '',
            git: null,
            runtime: entries,
          },
          {
            size: {},
            compile: {},
            runtime: { [FIRST_INTERACTION_METRIC]: 500 },
          } as unknown as ComponentHostBenchThresholds,
        ),
      ).toThrow('process.exit(1)')
      expect(log).toHaveBeenCalledWith(
        `  - ${FIRST_INTERACTION_METRIC} = 620ms, limit = 500ms`,
      )
    } finally {
      log.mockRestore()
      exit.mockRestore()
    }
  })

  it('rejects missing, duplicate, and incomplete samples', () => {
    expect(() => summarizeRuntimeBenchSamples([sample(1), sample(2)])).toThrow(
      'expected 3 runtime samples',
    )
    expect(() =>
      summarizeRuntimeBenchSamples([
        sample(1),
        sample(2),
        [{ name: FIRST_INTERACTION_METRIC, ms: 3 }],
      ]),
    ).toThrow('runtime sample metric names differ')
    expect(() =>
      summarizeRuntimeBenchSamples([
        sample(1),
        sample(2),
        [
          { name: FIRST_INTERACTION_METRIC, ms: 3 },
          { name: FIRST_INTERACTION_METRIC, ms: 4 },
        ],
      ]),
    ).toThrow('runtime sample contains duplicate metrics')
  })

  it('rejects invalid values instead of dropping failed samples', () => {
    expect(() =>
      summarizeRuntimeBenchSamples([sample(1), sample(Number.NaN), sample(3)]),
    ).toThrow('benchmark returned an invalid result entry')
  })
})
