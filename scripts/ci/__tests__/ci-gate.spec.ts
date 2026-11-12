/**
 * Tests for the aggregate CI gate.
 *
 * The cases that matter are the negative ones. A gate is easy to write so that
 * it passes when everything succeeds; the question is whether it fails when it
 * should. Each test below is one of the ways a CI run can go wrong, and the
 * expectation is that the gate says so.
 */
import { describe, expect, it } from 'vitest'

import { evaluateGate, REQUIRED_DEPENDENCIES } from '../ci-gate'

/**
 * A dependency map where every required job succeeded.
 *
 * `result` is optional in the overrides so a test can express "this job
 * reported nothing", which is one of the states the gate must reject.
 */
function allGreen(
  overrides: Record<string, { result?: string }> = {},
): Record<string, { result?: string }> {
  const map: Record<string, { result?: string }> = {}
  for (const name of REQUIRED_DEPENDENCIES) map[name] = { result: 'success' }
  return { ...map, ...overrides }
}

describe('ci-gate', () => {
  it('passes when every dependency succeeded', () => {
    const evaluation = evaluateGate(allGreen())
    expect(evaluation.problems).toEqual([])
    expect(evaluation.ok).toBe(true)
  })

  it('fails when a dependency failed', () => {
    const evaluation = evaluateGate(allGreen({ build: { result: 'failure' } }))
    expect(evaluation.ok).toBe(false)
    expect(evaluation.problems).toContain('build: failure')
  })

  it('fails when a dependency was cancelled', () => {
    // A cancelled job is the case that most often gets waved through: the run
    // was superseded, so "it did not fail". But the work did not happen.
    const evaluation = evaluateGate(
      allGreen({ 'packed-consumers': { result: 'cancelled' } }),
    )
    expect(evaluation.ok).toBe(false)
    expect(evaluation.problems).toContain('packed-consumers: cancelled')
  })

  it('accepts an evidence skip, which is absent on pull requests by design', () => {
    const evaluation = evaluateGate(
      allGreen({ 'cross-platform-evidence': { result: 'skipped' } }),
    )
    expect(evaluation.ok).toBe(true)
  })

  it('accepts a skip the impact plan made', () => {
    const evaluation = evaluateGate(
      allGreen({
        'packed-consumers': { result: 'skipped' },
        'rust-compiler': { result: 'skipped' },
      }),
      { plannedSkips: ['packed-consumers', 'rust-compiler'] },
    )
    expect(evaluation.ok).toBe(true)
  })

  it('fails on a skip the impact plan did not make', () => {
    // The dangerous case: a job that stops itself for its own reasons. It must
    // not be able to hide behind a gate that only looks at "skipped".
    const evaluation = evaluateGate(
      allGreen({ 'packed-consumers': { result: 'skipped' } }),
      { plannedSkips: ['docs-build'] },
    )
    expect(evaluation.ok).toBe(false)
    expect(evaluation.problems).toContain(
      'packed-consumers: skipped, but the impact plan did not skip it',
    )
  })

  it('fails when impact analysis itself failed, even if every job succeeded', () => {
    // Without a plan there is no basis for calling anything checked.
    const evaluation = evaluateGate(allGreen({ impact: { result: 'failure' } }))
    expect(evaluation.ok).toBe(false)
    expect(evaluation.problems.join(' ')).toContain(
      'impact analysis did not run',
    )
  })

  it('reports impact failure once, not twice', () => {
    const evaluation = evaluateGate(allGreen({ impact: { result: 'failure' } }))
    expect(
      evaluation.problems.filter(p => p.startsWith('impact:')),
    ).toHaveLength(1)
  })

  it('fails when a required dependency is missing from the map', () => {
    // This is a workflow bug — the job was dropped from `needs` — and it must
    // not look like success.
    const map = allGreen()
    delete map['rust-compiler']
    const evaluation = evaluateGate(map)
    expect(evaluation.ok).toBe(false)
    expect(evaluation.problems).toContain('rust-compiler: not in needs')
  })

  it('fails on an unknown result string', () => {
    const evaluation = evaluateGate(allGreen({ test: { result: 'weird' } }))
    expect(evaluation.ok).toBe(false)
    expect(evaluation.problems).toContain('test: weird')
  })

  it('fails when a job reports no result at all', () => {
    const evaluation = evaluateGate(allGreen({ test: {} }))
    expect(evaluation.ok).toBe(false)
    expect(evaluation.problems).toContain('test: unknown')
  })

  it('honours an explicit allow list override', () => {
    const evaluation = evaluateGate(
      allGreen({ 'packed-consumers': { result: 'skipped' } }),
      { allowedSkips: ['packed-consumers'] },
    )
    expect(evaluation.ok).toBe(true)
  })

  it('reports every problem, not just the first', () => {
    const evaluation = evaluateGate(
      allGreen({
        build: { result: 'failure' },
        test: { result: 'cancelled' },
      }),
    )
    expect(evaluation.problems).toHaveLength(2)
  })
})
