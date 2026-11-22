/**
 * "The native compiler is broken" is four different findings (R23 TASK 09).
 *
 * rc.3 needs two of them at once: four platforms are `REGISTRY_MISSING` because
 * the publish stopped, and a consumer on npm 10 gets `NOT_INSTALLED` for a
 * platform that *is* published. R22 reported both as "cannot find native
 * binding" and blamed the registry for an npm defect — which is why the status
 * has to be a value, not a sentence in an error.
 *
 * These tests drive the classifier directly. The end-to-end path (real
 * `npm install` against a real registry) is `check-native-install` itself, run
 * by the release workflows; what is asserted here is the mapping from a
 * failure at each stage to the status it must produce.
 */
import { describe, expect, it } from 'vitest'

import { classify, type NativeStageResult } from '../native-install-status'

describe('native install status', () => {
  it('is PASS only when every stage succeeded', () => {
    expect(
      classify({
        platformPackage: 'present',
        installed: 'present',
        loaded: 'ok',
        transformed: 'ok',
      }),
    ).toBe('PASS')
  })

  it('is REGISTRY_MISSING when the registry does not have the platform package', () => {
    // The publish stopped before this platform. Nothing downstream can be
    // judged: `installed` and later stages did not run.
    expect(
      classify({
        platformPackage: 'absent',
        installed: 'not-reached',
        loaded: 'not-reached',
        transformed: 'not-reached',
      }),
    ).toBe('REGISTRY_MISSING')
  })

  it('is REGISTRY_MISSING when the registry could not be asked', () => {
    // An unreachable registry is not a verdict about the package. It is still
    // reported as REGISTRY_MISSING rather than a fifth status, because the
    // action is the same — check the registry — and the message says which.
    expect(
      classify({
        platformPackage: 'unreachable',
        installed: 'not-reached',
        loaded: 'not-reached',
        transformed: 'not-reached',
      }),
    ).toBe('REGISTRY_MISSING')
  })

  it('is NOT_INSTALLED when the package exists but npm did not place it', () => {
    // The npm 10 behaviour, and the R22 misdiagnosis. The registry is fine.
    expect(
      classify({
        platformPackage: 'present',
        installed: 'missing',
        loaded: 'not-reached',
        transformed: 'not-reached',
      }),
    ).toBe('NOT_INSTALLED')
  })

  it('is LOAD_FAILED when the package is on disk but require throws', () => {
    // ABI, architecture or libc. Everything the registry and npm did was right.
    expect(
      classify({
        platformPackage: 'present',
        installed: 'present',
        loaded: 'threw',
        transformed: 'not-reached',
      }),
    ).toBe('LOAD_FAILED')
  })

  it('is LOAD_FAILED when the binding loads but exposes no transformModule', () => {
    expect(
      classify({
        platformPackage: 'present',
        installed: 'present',
        loaded: 'no-transform',
        transformed: 'not-reached',
      }),
    ).toBe('LOAD_FAILED')
  })

  it('is TRANSFORM_FAILED when it loads and then throws', () => {
    expect(
      classify({
        platformPackage: 'present',
        installed: 'present',
        loaded: 'ok',
        transformed: 'threw',
      }),
    ).toBe('TRANSFORM_FAILED')
  })

  it('is TRANSFORM_FAILED when it loads and reports diagnostics', () => {
    // Emitting is not the same as emitting correctly. A compiler that loads,
    // runs, and rejects valid input is a compiler problem.
    expect(
      classify({
        platformPackage: 'present',
        installed: 'present',
        loaded: 'ok',
        transformed: 'diagnostics',
      }),
    ).toBe('TRANSFORM_FAILED')
  })

  it('is TRANSFORM_FAILED when it loads and emits nothing', () => {
    expect(
      classify({
        platformPackage: 'present',
        installed: 'present',
        loaded: 'ok',
        transformed: 'empty',
      }),
    ).toBe('TRANSFORM_FAILED')
  })

  it('never returns PASS for a stage that did not run', () => {
    // Exhaustive over the reachable combinations: a later stage reported as
    // `not-reached` must never collapse into a pass.
    const stages: Array<NativeStageResult> = [
      'not-reached',
      'present',
      'absent',
      'unreachable',
      'missing',
      'ok',
      'threw',
      'no-transform',
      'diagnostics',
      'empty',
    ]
    let passes = 0
    for (const platformPackage of stages) {
      for (const installed of stages) {
        for (const loaded of stages) {
          for (const transformed of stages) {
            const status = classify({
              platformPackage,
              installed,
              loaded,
              transformed,
            })
            if (status === 'PASS') {
              passes += 1
              expect({
                platformPackage,
                installed,
                loaded,
                transformed,
              }).toEqual({
                platformPackage: 'present',
                installed: 'present',
                loaded: 'ok',
                transformed: 'ok',
              })
            }
          }
        }
      }
    }
    expect(passes, 'exactly one combination may pass').toBe(1)
  })
})
