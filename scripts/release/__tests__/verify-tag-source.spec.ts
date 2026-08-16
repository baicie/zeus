import { verifyReleaseTagSource } from '../verify-tag-source'

const sha = 'b919e7365230205d415a1f056359996ee20dffc6'

describe('verifyReleaseTagSource', () => {
  it('accepts a matching release tag reachable from main', () => {
    expect(() =>
      verifyReleaseTagSource({
        refName: 'v0.1.1-beta.1',
        workflowSha: sha,
        checkoutSha: sha,
        version: '0.1.1-beta.1',
        isMainAncestor: true,
      }),
    ).not.toThrow()
  })

  it('rejects a version mismatch between tag and packages', () => {
    expect(() =>
      verifyReleaseTagSource({
        refName: 'v0.1.1-beta.2',
        workflowSha: sha,
        checkoutSha: sha,
        version: '0.1.1-beta.1',
        isMainAncestor: true,
      }),
    ).toThrow('does not match')
  })

  it('rejects a release tag created from a side branch', () => {
    expect(() =>
      verifyReleaseTagSource({
        refName: 'v0.1.1-beta.1',
        workflowSha: sha,
        checkoutSha: sha,
        version: '0.1.1-beta.1',
        isMainAncestor: false,
      }),
    ).toThrow('not reachable from origin/main')
  })

  it('rejects an unsupported prerelease channel before npm publication', () => {
    expect(() =>
      verifyReleaseTagSource({
        refName: 'v0.1.1-preview.1',
        workflowSha: sha,
        checkoutSha: sha,
        version: '0.1.1-preview.1',
        isMainAncestor: true,
      }),
    ).toThrow('Unsupported release prerelease channel')
  })

  it('rejects an invalid semver tag before npm publication', () => {
    expect(() =>
      verifyReleaseTagSource({
        refName: 'vnot-a-version',
        workflowSha: sha,
        checkoutSha: sha,
        version: 'not-a-version',
        isMainAncestor: true,
      }),
    ).toThrow('Invalid release version')
  })
})
