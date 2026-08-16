import { getNativeLatestErrors } from '../verify-native-latest'

describe('native latest policy', () => {
  it('accepts a missing or stable latest tag', () => {
    expect(
      getNativeLatestErrors(
        new Map<string, Record<string, string>>([
          ['@zeus-js/compiler-native', {}],
          ['@zeus-js/compiler-native-linux-x64-gnu', { latest: '0.1.0' }],
        ]),
      ),
    ).toEqual([])
  })

  it('rejects prerelease native latest tags', () => {
    const version = '0.1.1-canary.20260812.106.1.658fe407'
    expect(
      getNativeLatestErrors(
        new Map<string, Record<string, string>>([
          ['@zeus-js/compiler-native', { latest: version }],
        ]),
      ),
    ).toEqual([
      `@zeus-js/compiler-native: latest must not point to prerelease ${version}`,
    ])
  })
})
