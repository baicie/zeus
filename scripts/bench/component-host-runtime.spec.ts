import { describe, expect, it } from 'vitest'

import {
  FIRST_INTERACTION_METRIC,
  requireRuntimeBenchResults,
} from './component-host-runtime'

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
