import { describe, expect, it } from 'vitest'

import { decideGate } from '../build-size-report-cli'

/**
 * The gate's failure policy.
 *
 * The defect this covers: `noBudget` was reported and then ignored, so a
 * brand-new artifact with no rule at all shipped green — the exact fail-open the
 * report exists to prevent. These cases pin all three failure classes and the
 * local/CI distinction.
 */
describe('decideGate', () => {
  const clean = {
    summary: { regressions: 0, noBudget: 0 },
    missing: { unexpectedMissing: 0, expectedMissing: 0 },
  }

  it('passes in CI when nothing is wrong', () => {
    expect(decideGate(clean.summary, clean.missing, { ci: true }).pass).toBe(
      true,
    )
  })

  it('fails CI when an artifact has no budget rule', () => {
    const decision = decideGate(
      { regressions: 0, noBudget: 1 },
      clean.missing,
      { ci: true },
    )
    expect(decision.pass).toBe(false)
    expect(decision.unbudgeted).toBe(1)
  })

  it('fails CI on a regression', () => {
    const decision = decideGate(
      { regressions: 2, noBudget: 0 },
      clean.missing,
      { ci: true },
    )
    expect(decision.pass).toBe(false)
    expect(decision.regressions).toBe(2)
  })

  it('fails CI when a published package is unexpectedly missing', () => {
    const decision = decideGate(
      clean.summary,
      { unexpectedMissing: 1, expectedMissing: 0 },
      { ci: true },
    )
    expect(decision.pass).toBe(false)
    expect(decision.unexpectedMissing).toBe(1)
  })

  it('passes in CI when a package is missing but declared expected', () => {
    const decision = decideGate(
      clean.summary,
      { unexpectedMissing: 0, expectedMissing: 2 },
      { ci: true },
    )
    expect(decision.pass).toBe(true)
    expect(decision.expectedMissing).toBe(2)
  })

  it('reports all three failure classes at once', () => {
    const decision = decideGate(
      { regressions: 1, noBudget: 3 },
      { unexpectedMissing: 2, expectedMissing: 1 },
      { ci: true },
    )
    expect(decision).toEqual({
      pass: false,
      regressions: 1,
      unbudgeted: 3,
      unexpectedMissing: 2,
      expectedMissing: 1,
    })
  })

  it('does not fail a local report run, so an author can read it mid-work', () => {
    const decision = decideGate(
      { regressions: 5, noBudget: 5 },
      { unexpectedMissing: 5, expectedMissing: 0 },
      { ci: false },
    )
    expect(decision.pass).toBe(true)
    // The counts are still reported: passing locally does not hide the finding.
    expect(decision.regressions).toBe(5)
    expect(decision.unbudgeted).toBe(5)
    expect(decision.unexpectedMissing).toBe(5)
  })

  it('treats exactly-at-limit as no regression', () => {
    expect(
      decideGate({ regressions: 0, noBudget: 0 }, clean.missing, { ci: true })
        .pass,
    ).toBe(true)
  })
})
