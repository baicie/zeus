import { describe, expect, it } from 'vitest'

import { readRequireConditions } from '../check-package-cjs'

/**
 * The CommonJS contract reader.
 *
 * `types` inside a `require` condition is correct and required — a CommonJS
 * consumer without a `.d.cts` gets TS1479 or TS7016 — but the earlier reader
 * counted every key, so adding it looked like a contract violation. These
 * cases pin both halves: the types key is read past, and a real change to the
 * three runtime conditions is still refused.
 */
const runtime = {
  production: './dist/x.prod.cjs',
  development: './dist/x.cjs',
  default: './index.cjs',
}

describe('require conditions', () => {
  it('accepts the three runtime conditions as they were', () => {
    expect(readRequireConditions({ require: runtime })).toEqual(runtime)
  })

  it('accepts a types condition ahead of them', () => {
    expect(
      readRequireConditions({
        require: { types: './dist/x.d.cts', ...runtime },
      }),
    ).toEqual(runtime)
  })

  it('refuses a types condition that is not a string', () => {
    expect(
      readRequireConditions({ require: { types: 1, ...runtime } }),
    ).toBeNull()
  })

  it('refuses a missing runtime condition', () => {
    /*
     * The case the contract exists for: a package whose `require` entry points
     * somewhere else, or drops one of the three. Reading past `types` must not
     * turn into accepting anything.
     */
    expect(
      readRequireConditions({
        require: { production: './a.cjs', default: './i.cjs' },
      }),
    ).toBeNull()
    expect(
      readRequireConditions({ require: { ...runtime, extra: './x.js' } }),
    ).toBeNull()
  })

  it('refuses them in the wrong order', () => {
    expect(
      readRequireConditions({
        require: {
          types: './t.d.cts',
          development: './d.cjs',
          production: './p.cjs',
          default: './i.cjs',
        },
      }),
    ).toBeNull()
  })

  it('refuses a non-object require', () => {
    expect(readRequireConditions({ require: './x.cjs' })).toBeNull()
    expect(readRequireConditions({})).toBeNull()
    expect(readRequireConditions(null)).toBeNull()
  })
})
