import { summarizeSamples } from './repeat-baseline'

describe('repeat baseline summary', () => {
  it('computes median, nearest-rank P95 and sample variance', () => {
    expect(summarizeSamples([4, 1, 3, 2])).toEqual({
      n: 4,
      min: 1,
      median: 2.5,
      p95: 4,
      max: 4,
      mean: 2.5,
      variance: 1.667,
      cvPercent: 51.64,
    })
  })

  it('uses the middle sample for an odd count', () => {
    const summary = summarizeSamples([10, 30, 20])
    expect(summary.median).toBe(20)
    expect(summary.p95).toBe(30)
    expect(summary.variance).toBe(100)
  })

  it('rejects distributions that cannot be summarized', () => {
    expect(() => summarizeSamples([1])).toThrow('At least two samples')
    expect(() => summarizeSamples([1, Number.NaN])).toThrow('finite numbers')
  })
})
