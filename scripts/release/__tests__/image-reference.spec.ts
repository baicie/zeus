import { describe, expect, it } from 'vitest'

import {
  DIGEST_PATTERN,
  isDigestPinned,
  parseImageReference,
  pinToDigest,
} from '../image-reference'

const SHA =
  'sha256:cdc920027ebe543166b7dc987c1ff8ba3b98b29b4ef4923ff1ced01f5f0a935b'

describe('parseImageReference', () => {
  it('parses a GHCR reference with a tag', () => {
    expect(parseImageReference('ghcr.io/baicie/zeus-admin:main')).toEqual({
      registry: 'ghcr.io',
      repository: 'baicie/zeus-admin',
      tag: 'main',
      name: 'ghcr.io/baicie/zeus-admin',
    })
  })

  it('keeps the port of a registry that has one', () => {
    // `reference.split(':')[0]` returned `registry.example.com` here, dropping
    // both the port and the repository.
    expect(
      parseImageReference('registry.example.com:5000/team/app:main'),
    ).toEqual({
      registry: 'registry.example.com:5000',
      repository: 'team/app',
      tag: 'main',
      name: 'registry.example.com:5000/team/app',
    })
  })

  it('parses a digest reference without a tag', () => {
    expect(
      parseImageReference(`registry.example.com:5000/team/app@${SHA}`),
    ).toEqual({
      registry: 'registry.example.com:5000',
      repository: 'team/app',
      digest: SHA,
      name: 'registry.example.com:5000/team/app',
    })
  })

  it('keeps both tag and digest, with the digest authoritative', () => {
    const parsed = parseImageReference(`ghcr.io/team/app:v1@${SHA}`)
    expect(parsed.tag).toBe('v1')
    expect(parsed.digest).toBe(SHA)
    expect(parsed.name).toBe('ghcr.io/team/app')
    expect(isDigestPinned(parsed)).toBe(true)
  })

  it('treats a single-segment reference as a repository on the default registry', () => {
    // `ubuntu:22.04` means docker.io/library/ubuntu:22.04; the `:` is a tag,
    // not a port, because there is no path separator before it.
    expect(parseImageReference('ubuntu:22.04')).toEqual({
      registry: '',
      repository: 'ubuntu',
      tag: '22.04',
      name: 'ubuntu',
    })
  })

  it('treats localhost as a host even without a dot', () => {
    expect(parseImageReference('localhost:5000/app')).toEqual({
      registry: 'localhost:5000',
      repository: 'app',
      name: 'localhost:5000/app',
    })
  })

  it('handles a hostless multi-segment path', () => {
    expect(parseImageReference('baicie/zeus-admin:main')).toEqual({
      registry: '',
      repository: 'baicie/zeus-admin',
      tag: 'main',
      name: 'baicie/zeus-admin',
    })
  })

  it('rejects an empty reference', () => {
    expect(() => parseImageReference('')).toThrow(/empty/)
    expect(() => parseImageReference('   ')).toThrow(/empty/)
  })

  it('rejects a digest that is not sha256:64-hex', () => {
    expect(() => parseImageReference('ghcr.io/app@sha256:abc')).toThrow(
      /sha256/,
    )
    expect(() => parseImageReference('ghcr.io/app@md5:abcd')).toThrow(/sha256/)
  })

  it('rejects a reference with an empty tag', () => {
    expect(() => parseImageReference('ghcr.io/app:')).toThrow(/empty tag/)
  })

  it('rejects a reference whose host is present but whose path is empty', () => {
    // `ghcr.io/app` is a host plus a repository; `ghcr.io/` is a host with
    // nothing after it, which cannot name an image.
    expect(() => parseImageReference('ghcr.io/')).toThrow(/no repository/)
    expect(() => parseImageReference('ghcr.io/app/')).toThrow(/no repository/)
  })
})

describe('pinToDigest', () => {
  it('drops the tag and pins the digest', () => {
    const parsed = parseImageReference('ghcr.io/baicie/zeus-admin:main')
    expect(pinToDigest(parsed, SHA)).toBe(`ghcr.io/baicie/zeus-admin@${SHA}`)
  })

  it('keeps a ported registry intact', () => {
    const parsed = parseImageReference(
      'registry.example.com:5000/team/app:main',
    )
    expect(pinToDigest(parsed, SHA)).toBe(
      `registry.example.com:5000/team/app@${SHA}`,
    )
  })

  it('refuses a malformed digest rather than producing a bad reference', () => {
    const parsed = parseImageReference('ghcr.io/app:main')
    expect(() => pinToDigest(parsed, 'sha256:abc')).toThrow(/sha256/)
  })
})

describe('DIGEST_PATTERN', () => {
  it('accepts a well-formed digest and rejects near misses', () => {
    expect(DIGEST_PATTERN.test(SHA)).toBe(true)
    expect(
      DIGEST_PATTERN.test(SHA.toUpperCase().replace('SHA256', 'sha256')),
    ).toBe(false)
    expect(DIGEST_PATTERN.test('sha256:')).toBe(false)
    expect(DIGEST_PATTERN.test(`sha256:${'a'.repeat(63)}`)).toBe(false)
  })
})
