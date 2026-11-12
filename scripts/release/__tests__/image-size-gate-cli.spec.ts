import { describe, expect, it } from 'vitest'

import {
  measurePinned,
  OCI_IMAGE_INDEX,
  OCI_IMAGE_MANIFEST,
  type Descriptor,
} from '../image-size-gate'

const sha = (seed: string): string => `sha256:${seed.repeat(64).slice(0, 64)}`

const INDEX_DIGEST = sha('1')
const AMD64_DIGEST = sha('a')
const ARM64_DIGEST = sha('b')

function layer(size: number, digest: string): Record<string, unknown> {
  return {
    mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
    digest,
    size,
  }
}

function manifest(size: number): Record<string, unknown> {
  return {
    schemaVersion: 2,
    mediaType: OCI_IMAGE_MANIFEST,
    config: {
      mediaType: 'application/vnd.oci.image.config.v1+json',
      digest: sha('c'),
      size: 4096,
    },
    layers: [layer(size, sha('d'))],
  }
}

function index(): Record<string, unknown> {
  return {
    schemaVersion: 2,
    mediaType: OCI_IMAGE_INDEX,
    manifests: [
      {
        mediaType: OCI_IMAGE_MANIFEST,
        digest: AMD64_DIGEST,
        size: 2002,
        platform: { os: 'linux', architecture: 'amd64' },
      },
      {
        mediaType: OCI_IMAGE_MANIFEST,
        digest: ARM64_DIGEST,
        size: 2004,
        platform: { os: 'linux', architecture: 'arm64' },
      },
    ],
  }
}

/** Records every reference the code asks the registry for. */
function registry(documents: Record<string, unknown>): {
  fetchRaw: (reference: string) => unknown
  resolveDigest: (reference: string) => string
  calls: string[]
} {
  const calls: string[] = []
  return {
    calls,
    fetchRaw(reference: string) {
      calls.push(reference)
      const document = documents[reference]
      if (document === undefined) {
        throw new Error(`unexpected fetch: ${reference}`)
      }
      return document
    },
    resolveDigest(reference: string) {
      calls.push(`digest:${reference}`)
      return String(documents[`digest:${reference}`] ?? '')
    },
  }
}

const amd64 = { os: 'linux', architecture: 'amd64' } as const

describe('measurePinned — digest pinning', () => {
  it('verifies the build digest against the tag, then measures by digest only', async () => {
    const ref = `ghcr.io/team/app@${AMD64_DIGEST}`
    const reg = registry({
      'digest:ghcr.io/team/app:main': AMD64_DIGEST,
      [ref]: manifest(80_000_000),
    })
    const pinned = await measurePinned({
      reference: 'ghcr.io/team/app:main',
      knownDigest: AMD64_DIGEST,
      platform: amd64,
      fetchRaw: reg.fetchRaw,
      resolveDigest: reg.resolveDigest,
    })
    expect(pinned.result.ok).toBe(true)
    if (!pinned.result.ok) throw new Error('unreachable')
    expect(pinned.result.bytes).toBe(80_000_000)
    // Exactly one tag resolution (to prove the tag has not moved) and one
    // pinned fetch. The measurement itself never addresses the tag.
    expect(reg.calls).toEqual(['digest:ghcr.io/team/app:main', ref])
    expect(pinned.measuredDigest).toBe(AMD64_DIGEST)
  })

  it('resolves the tag once when no digest is known, then measures by digest', async () => {
    const reg = registry({
      'digest:ghcr.io/team/app:main': AMD64_DIGEST,
      [`ghcr.io/team/app@${AMD64_DIGEST}`]: manifest(50_000_000),
    })
    const pinned = await measurePinned({
      reference: 'ghcr.io/team/app:main',
      platform: amd64,
      fetchRaw: reg.fetchRaw,
      resolveDigest: reg.resolveDigest,
    })
    expect(pinned.result.ok).toBe(true)
    // Exactly one tag resolution, then one pinned fetch.
    expect(reg.calls).toEqual([
      'digest:ghcr.io/team/app:main',
      `ghcr.io/team/app@${AMD64_DIGEST}`,
    ])
  })

  it('fails when the tag moved away from the digest the build produced', async () => {
    const reg = registry({ 'digest:ghcr.io/team/app:main': ARM64_DIGEST })
    await expect(
      measurePinned({
        reference: 'ghcr.io/team/app:main',
        knownDigest: AMD64_DIGEST,
        platform: amd64,
        fetchRaw: reg.fetchRaw,
        resolveDigest: reg.resolveDigest,
      }),
    ).rejects.toThrow(/resolves to|tag moved/)
  })

  it('fails when the reference digest and the supplied digest disagree', async () => {
    const reg = registry({})
    await expect(
      measurePinned({
        reference: `ghcr.io/team/app@${ARM64_DIGEST}`,
        knownDigest: AMD64_DIGEST,
        platform: amd64,
        fetchRaw: reg.fetchRaw,
        resolveDigest: reg.resolveDigest,
      }),
    ).rejects.toThrow(/refusing to measure either/)
  })

  it('fails when a tag cannot be resolved to a digest', async () => {
    const reg = registry({ 'digest:ghcr.io/team/app:main': '' })
    await expect(
      measurePinned({
        reference: 'ghcr.io/team/app:main',
        platform: amd64,
        fetchRaw: reg.fetchRaw,
        resolveDigest: reg.resolveDigest,
      }),
    ).rejects.toThrow(/moving tag/)
  })

  it('does not fetch anything when the reference has no digest and none resolves', async () => {
    const reg = registry({ 'digest:ghcr.io/team/app:main': '' })
    await expect(
      measurePinned({
        reference: 'ghcr.io/team/app:main',
        platform: amd64,
        fetchRaw: reg.fetchRaw,
        resolveDigest: reg.resolveDigest,
      }),
    ).rejects.toThrow()
    expect(reg.calls.filter(call => !call.startsWith('digest:'))).toEqual([])
  })
})

describe('measurePinned — multi-platform index', () => {
  it('records both the index digest and the platform manifest digest', async () => {
    const reg = registry({
      'digest:ghcr.io/team/app:multi': INDEX_DIGEST,
      [`ghcr.io/team/app@${INDEX_DIGEST}`]: index(),
      [`ghcr.io/team/app@${AMD64_DIGEST}`]: manifest(28_000_000),
    })
    const pinned = await measurePinned({
      reference: 'ghcr.io/team/app:multi',
      platform: amd64,
      fetchRaw: reg.fetchRaw,
      resolveDigest: reg.resolveDigest,
    })
    expect(pinned.result.ok).toBe(true)
    if (!pinned.result.ok) throw new Error('unreachable')
    expect(pinned.result.bytes).toBe(28_000_000)
    expect(pinned.indexResolved).toBe(true)
    expect(pinned.referenceDigest).toBe(INDEX_DIGEST)
    expect(pinned.measuredDigest).toBe(AMD64_DIGEST)
  })

  it('selects arm64 when that is the requested platform', async () => {
    const reg = registry({
      'digest:ghcr.io/team/app:multi': INDEX_DIGEST,
      [`ghcr.io/team/app@${INDEX_DIGEST}`]: index(),
      [`ghcr.io/team/app@${ARM64_DIGEST}`]: manifest(30_000_000),
    })
    const pinned = await measurePinned({
      reference: 'ghcr.io/team/app:multi',
      platform: { os: 'linux', architecture: 'arm64' },
      fetchRaw: reg.fetchRaw,
      resolveDigest: reg.resolveDigest,
    })
    expect(pinned.result.ok).toBe(true)
    if (!pinned.result.ok) throw new Error('unreachable')
    expect(pinned.result.bytes).toBe(30_000_000)
    expect(pinned.measuredDigest).toBe(ARM64_DIGEST)
  })

  it('fails when the index does not contain the requested platform', async () => {
    const reg = registry({
      'digest:ghcr.io/team/app:multi': INDEX_DIGEST,
      [`ghcr.io/team/app@${INDEX_DIGEST}`]: index(),
    })
    const pinned = await measurePinned({
      reference: 'ghcr.io/team/app:multi',
      platform: { os: 'linux', architecture: 's390x' },
      fetchRaw: reg.fetchRaw,
      resolveDigest: reg.resolveDigest,
    })
    expect(pinned.result.ok).toBe(false)
    if (pinned.result.ok) throw new Error('unreachable')
    expect(pinned.result.reason).toBe('platform-not-found')
  })

  it('fetches the platform manifest by digest, never by tag', async () => {
    const reg = registry({
      'digest:ghcr.io/team/app:multi': INDEX_DIGEST,
      [`ghcr.io/team/app@${INDEX_DIGEST}`]: index(),
      [`ghcr.io/team/app@${AMD64_DIGEST}`]: manifest(10_000_000),
    })
    await measurePinned({
      reference: 'ghcr.io/team/app:multi',
      platform: amd64,
      fetchRaw: reg.fetchRaw,
      resolveDigest: reg.resolveDigest,
    })
    for (const call of reg.calls.filter(call => !call.startsWith('digest:'))) {
      expect(call).toContain('@sha256:')
    }
  })
})

describe('measurePinned — registry with a port', () => {
  it('addresses the namespaced path and keeps the port', async () => {
    const reg = registry({
      'digest:registry.example.com:5000/team/app:main': AMD64_DIGEST,
      [`registry.example.com:5000/team/app@${AMD64_DIGEST}`]:
        manifest(5_000_000),
    })
    const pinned = await measurePinned({
      reference: 'registry.example.com:5000/team/app:main',
      knownDigest: AMD64_DIGEST,
      platform: amd64,
      fetchRaw: reg.fetchRaw,
      resolveDigest: reg.resolveDigest,
    })
    expect(pinned.result.ok).toBe(true)
    // The old code produced `registry.example.com@sha256:…` here.
    expect(reg.calls).toEqual([
      'digest:registry.example.com:5000/team/app:main',
      `registry.example.com:5000/team/app@${AMD64_DIGEST}`,
    ])
  })
})

describe('measurePinned — failure propagation', () => {
  it('reports a manifest with no layers as unmeasured, not as zero', async () => {
    const ref = `ghcr.io/team/app@${AMD64_DIGEST}`
    const reg = registry({
      'digest:ghcr.io/team/app:main': AMD64_DIGEST,
      [ref]: {
        schemaVersion: 2,
        mediaType: OCI_IMAGE_MANIFEST,
        layers: [],
      },
    })
    const pinned = await measurePinned({
      reference: 'ghcr.io/team/app:main',
      knownDigest: AMD64_DIGEST,
      platform: amd64,
      fetchRaw: reg.fetchRaw,
      resolveDigest: reg.resolveDigest,
    })
    expect(pinned.result.ok).toBe(false)
    if (pinned.result.ok) throw new Error('unreachable')
    expect(pinned.result.reason).toBe('empty-layers')
  })

  it('surfaces a registry error as a rejection the CLI turns into FAIL', async () => {
    const reg: ReturnType<typeof registry> = {
      calls: [],
      fetchRaw() {
        throw new Error('registry unreachable')
      },
      resolveDigest: () => AMD64_DIGEST,
    }
    await expect(
      measurePinned({
        reference: 'ghcr.io/team/app:main',
        knownDigest: AMD64_DIGEST,
        platform: amd64,
        fetchRaw: reg.fetchRaw,
        resolveDigest: reg.resolveDigest,
      }),
    ).rejects.toThrow(/registry unreachable/)
  })
})

describe('measurePinned — index entry without a digest', () => {
  it('refuses to resolve an index entry that names no digest', async () => {
    const reg = registry({
      'digest:ghcr.io/team/app:multi': INDEX_DIGEST,
      [`ghcr.io/team/app@${INDEX_DIGEST}`]: {
        schemaVersion: 2,
        mediaType: OCI_IMAGE_INDEX,
        manifests: [
          {
            mediaType: OCI_IMAGE_MANIFEST,
            size: 2002,
            platform: { os: 'linux', architecture: 'amd64' },
          },
        ],
      },
    })
    await expect(
      measurePinned({
        reference: 'ghcr.io/team/app:multi',
        platform: amd64,
        fetchRaw: reg.fetchRaw,
        resolveDigest: reg.resolveDigest,
      }),
    ).rejects.toThrow(/no digest/)
  })
})

describe('Descriptor type is exported for the CLI resolver', () => {
  it('is structurally usable', () => {
    const descriptor: Descriptor = { digest: sha('e'), size: 1 }
    expect(descriptor.digest).toBe(sha('e'))
  })
})
