/**
 * The delivery verdict must refuse on a check that was never run (R23 TASK 24).
 *
 * This is the rule the whole file exists for. A gate that passes when nobody
 * looked is worse than no gate: it produces a green report that cannot be told
 * apart from a real one. The project has already been through this — an
 * `UNVERIFIED` status that passed strict gates because nothing had claimed it.
 *
 * So the cases below are mostly about absence: a missing check, a check that
 * could not run, a check with no evidence. Every one of them must keep the
 * verdict out of READY, and the report must say which.
 */
import { describe, expect, it } from 'vitest'

import {
  deliveryCheck,
  evaluateDelivery,
  REQUIRED_DELIVERY_CHECKS,
  type DeliveryCheck,
} from '../delivery-readiness'

/** All eight required checks, passing, with evidence. */
function allPassing(): DeliveryCheck[] {
  return REQUIRED_DELIVERY_CHECKS.map(id =>
    deliveryCheck(id, 'PASS', `${id} observed something`, `${id} stakes`),
  )
}

const base = { version: '0.2.0-rc.3', commit: 'deadbeef' }

describe('delivery decision', () => {
  it('is READY only when all eight checks pass', () => {
    const report = evaluateDelivery({ ...base, checks: allPassing() })
    expect(report.decision).toBe('READY')
    expect(report.blockers).toEqual([])
    expect(report.unverified).toEqual([])
    expect(report.checks.length).toBe(REQUIRED_DELIVERY_CHECKS.length)
  })

  it('is NOT_READY when a check failed', () => {
    const checks = allPassing().map(check =>
      check.id === 'registry-complete'
        ? deliveryCheck(
            'registry-complete',
            'FAILED',
            '7 of 32 packages published',
            'a consumer cannot install the framework',
          )
        : check,
    )
    const report = evaluateDelivery({ ...base, checks })
    expect(report.decision).toBe('NOT_READY')
    expect(report.blockers.join('\n')).toContain('7 of 32')
  })

  it('refuses READY when a check was never supplied', () => {
    // The omission case: a collector that silently skips a dimension must not
    // produce a pass. The missing check is added as NOT_RUN, so the report says
    // what was not looked at instead of being one check shorter.
    const checks = allPassing().filter(check => check.id !== 'provenance')
    const report = evaluateDelivery({ ...base, checks })
    expect(report.decision).not.toBe('READY')
    expect(report.checks.length).toBe(REQUIRED_DELIVERY_CHECKS.length)
    const missing = report.checks.find(check => check.id === 'provenance')
    expect(missing?.status).toBe('NOT_RUN')
    expect(report.unverified.join('\n')).toContain('provenance')
  })

  it('refuses READY when a check was blocked', () => {
    const checks = allPassing().map(check =>
      check.id === 'provenance'
        ? deliveryCheck(
            'provenance',
            'BLOCKED',
            'no token with the audit scope in this environment',
            'supply-chain evidence',
          )
        : check,
    )
    const report = evaluateDelivery({ ...base, checks })
    expect(report.decision).toBe('INCOMPLETE')
    expect(report.decision).not.toBe('READY')
    expect(report.unverified.join('\n')).toContain('audit scope')
  })

  it('tells "not looked" apart from "found broken"', () => {
    // The two need different next actions — a credential versus a fix — so a
    // single "not ready" would lose the distinction the operator needs.
    const blockedOnly = allPassing().map(check =>
      check.id === 'native-install'
        ? deliveryCheck(
            'native-install',
            'BLOCKED',
            'no registry access',
            'stakes',
          )
        : check,
    )
    expect(evaluateDelivery({ ...base, checks: blockedOnly }).decision).toBe(
      'INCOMPLETE',
    )

    const withFailure = blockedOnly.map(check =>
      check.id === 'dist-tags'
        ? deliveryCheck(
            'dist-tags',
            'FAILED',
            'latest points at a prerelease',
            'stakes',
          )
        : check,
    )
    expect(evaluateDelivery({ ...base, checks: withFailure }).decision).toBe(
      'NOT_READY',
    )
  })

  it('never returns READY for an empty check list', () => {
    // The vacuous case. Eight NOT_RUN entries are synthesised, so an input that
    // collected nothing cannot pass by way of an empty `every()`.
    const report = evaluateDelivery({ ...base, checks: [] })
    expect(report.decision).toBe('INCOMPLETE')
    expect(report.checks.length).toBe(REQUIRED_DELIVERY_CHECKS.length)
    expect(report.checks.every(check => check.status === 'NOT_RUN')).toBe(true)
  })

  it('is not READY when every check is NOT_RUN', () => {
    const checks = REQUIRED_DELIVERY_CHECKS.map(id =>
      deliveryCheck(id, 'NOT_RUN', 'the collector was not run', 'stakes'),
    )
    const report = evaluateDelivery({ ...base, checks })
    expect(report.decision).toBe('INCOMPLETE')
    expect(report.blockers.length).toBe(REQUIRED_DELIVERY_CHECKS.length)
  })
})

describe('check construction', () => {
  it('refuses a check with no evidence', () => {
    // A PASS with nothing behind it is a claim. This gate exists to replace
    // claims with observations, so an empty one throws at construction.
    expect(() => deliveryCheck('provenance', 'PASS', '', 'stakes')).toThrow(
      /must report what it observed/,
    )
    expect(() => deliveryCheck('provenance', 'PASS', '   ', 'stakes')).toThrow(
      /must report what it observed/,
    )
  })

  it('refuses a supplied check with no evidence even when it passes', () => {
    const checks = allPassing().map(check =>
      check.id === 'runtime-install' ? { ...check, evidence: '' } : check,
    )
    expect(() => evaluateDelivery({ ...base, checks })).toThrow(
      /passed no evidence/,
    )
  })

  it('keeps the stakes on every check', () => {
    // So a report can be read by someone who does not know what each dimension
    // is for, which is most of the people who will read it.
    const report = evaluateDelivery({ ...base, checks: allPassing() })
    for (const check of report.checks) {
      expect(check.stakes.length).toBeGreaterThan(0)
    }
  })
})
