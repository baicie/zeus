import {
  isCiEnvironment,
  resolveNpmAuthToken,
  shouldRequireTwoFactorPolicy,
  verifyNpmReleaseAuth,
} from '../verify-npm-auth'

describe('npm release auth environment', () => {
  it('allows a local npm login without a token environment variable', () => {
    expect(resolveNpmAuthToken({})).toBeUndefined()
    expect(isCiEnvironment({})).toBe(false)
  })

  it('requires a token in GitHub Actions', () => {
    expect(() => resolveNpmAuthToken({ GITHUB_ACTIONS: 'true' })).toThrow(
      'NODE_AUTH_TOKEN or NPM_TOKEN is required in CI',
    )
  })

  it('accepts either supported token variable in CI', () => {
    expect(resolveNpmAuthToken({ CI: 'true', NPM_TOKEN: 'test-token' })).toBe(
      'test-token',
    )
  })

  it('falls back to NPM_TOKEN when NODE_AUTH_TOKEN is empty', () => {
    expect(
      resolveNpmAuthToken({
        GITHUB_ACTIONS: 'true',
        NODE_AUTH_TOKEN: '',
        NPM_TOKEN: 'test-token',
      }),
    ).toBe('test-token')
  })

  it('does not require account 2FA policy for local npm login', () => {
    expect(shouldRequireTwoFactorPolicy({})).toBe(false)
  })

  it('requires account 2FA policy in CI unless the token bypass is declared', () => {
    expect(shouldRequireTwoFactorPolicy({ CI: 'true' })).toBe(true)
    expect(
      shouldRequireTwoFactorPolicy({
        GITHUB_ACTIONS: 'true',
        NPM_TOKEN_BYPASS_2FA: 'true',
      }),
    ).toBe(false)
  })
})

describe('npm release auth preflight', () => {
  it('accepts a token identity with read-write access to every release package', () => {
    const result = verifyNpmReleaseAuth({
      packages: ['@zeus-js/compiler-native', '@zeus-js/compiler'],
      whoami: () => 'baicie2\n',
      readTwoFactorPolicy: () => 'auth-and-writes',
      readCollaborators: () => ({ baicie2: 'read-write' }),
    })

    expect(result).toEqual({
      username: 'baicie2',
      verifiedPackages: 2,
    })
  })

  it('rejects an authenticated identity without package write access', () => {
    expect(() =>
      verifyNpmReleaseAuth({
        packages: ['@zeus-js/compiler-native'],
        whoami: () => 'readonly-user',
        readTwoFactorPolicy: () => 'auth-and-writes',
        readCollaborators: () => ({ 'readonly-user': 'read-only' }),
      }),
    ).toThrow(
      '@zeus-js/compiler-native: readonly-user has read-only access; expected read-write',
    )
  })

  it('rejects an empty package set before contacting npm', () => {
    expect(() =>
      verifyNpmReleaseAuth({
        packages: [],
        whoami: () => 'baicie2',
        readTwoFactorPolicy: () => 'auth-and-writes',
        readCollaborators: () => ({ baicie2: 'read-write' }),
      }),
    ).toThrow('at least one release package is required')
  })

  it('rejects accounts without write-protected 2FA', () => {
    expect(() =>
      verifyNpmReleaseAuth({
        packages: ['@zeus-js/compiler-native'],
        whoami: () => 'baicie2',
        readTwoFactorPolicy: () => 'auth-only',
        readCollaborators: () => ({ baicie2: 'read-write' }),
      }),
    ).toThrow('expected auth-and-writes')
  })

  it('can verify package access without account 2FA policy for local login', () => {
    expect(
      verifyNpmReleaseAuth({
        packages: ['@zeus-js/compiler-native'],
        whoami: () => 'baicie2',
        readTwoFactorPolicy: () => 'disabled',
        requireTwoFactorPolicy: false,
        readCollaborators: () => ({ baicie2: 'read-write' }),
      }),
    ).toEqual({ username: 'baicie2', verifiedPackages: 1 })
  })

  it('defers access verification for packages that are not published yet', () => {
    expect(
      verifyNpmReleaseAuth({
        packages: ['@zeus-js/router', '@zeus-js/compiler'],
        whoami: () => 'baicie2',
        readTwoFactorPolicy: () => 'auth-and-writes',
        readCollaborators: pkg =>
          pkg === '@zeus-js/router' ? undefined : { baicie2: 'read-write' },
      }),
    ).toEqual({
      username: 'baicie2',
      verifiedPackages: 1,
      unpublishedPackages: ['@zeus-js/router'],
    })
  })
})
