import { describe, expect, it } from 'vitest'

import { escapeRegExp } from './regexp-utils'

describe('escapeRegExp', () => {
  it('escapes every regular-expression metacharacter as a literal', () => {
    const value = '.*+?^${}()|[]\\-'
    const escaped = escapeRegExp(value)

    expect(new RegExp(`^${escaped}$`).test(value)).toBe(true)
    expect(new RegExp(`^${escaped}$`).test(`${value}suffix`)).toBe(false)
  })
})
