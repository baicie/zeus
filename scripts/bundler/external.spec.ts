import { describe, expect, it } from 'vitest'

import { createExternalMatcher } from './external'

describe('createExternalMatcher', () => {
  const isExternal = createExternalMatcher(['@zeus-js/signal', 'alien-signals'])

  it('externalizes package roots and their subpath exports', () => {
    expect(isExternal('@zeus-js/signal')).toBe(true)
    expect(isExternal('@zeus-js/signal/internal')).toBe(true)
    expect(isExternal('alien-signals')).toBe(true)
    expect(isExternal('alien-signals/core')).toBe(true)
  })

  it('does not externalize packages with a shared name prefix', () => {
    expect(isExternal('@zeus-js/signals')).toBe(false)
    expect(isExternal('alien-signals-extra')).toBe(false)
  })
})
