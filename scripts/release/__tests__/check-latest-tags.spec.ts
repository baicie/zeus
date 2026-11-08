import { describe, expect, it } from 'vitest'

import { evaluateLatestTags } from '../check-latest-tags'

describe('RC latest dist-tag policy', () => {
  it('rejects a latest tag that points at a prerelease', () => {
    expect(
      evaluateLatestTags([
        { name: '@zeus-js/zeus', latest: '0.1.0' },
        { name: '@zeus-js/query', latest: '0.1.1-beta.20' },
        { name: '@zeus-js/shared' },
      ]),
    ).toEqual([
      '@zeus-js/query: latest points at prerelease 0.1.1-beta.20; run pnpm repair:latest-tags',
    ])
  })

  it('accepts stable and absent latest tags', () => {
    expect(
      evaluateLatestTags([
        { name: '@zeus-js/zeus', latest: '0.1.0' },
        { name: '@zeus-js/shared' },
      ]),
    ).toEqual([])
  })
})
