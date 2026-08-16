import { fuzzyMatchTarget, targets } from './utils'

describe('fuzzyMatchTarget', () => {
  it('prefers an exact target regardless of discovery order', () => {
    const originalTargets = [...targets]
    targets.splice(0, targets.length, 'compiler-shared', 'compiler')

    try {
      expect(fuzzyMatchTarget(['compiler'], false)).toEqual(['compiler'])
    } finally {
      targets.splice(0, targets.length, ...originalTargets)
    }
  })
})
