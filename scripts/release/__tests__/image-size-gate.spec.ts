import { describe, expect, it } from 'vitest'

import {
  DOCKER_IMAGE_MANIFEST,
  DOCKER_MANIFEST_LIST,
  OCI_IMAGE_INDEX,
  OCI_IMAGE_MANIFEST,
  evaluateBudget,
  formatPlatformForReport,
  measureImageSize,
  parsePlatform,
  renderSummary,
  type Descriptor,
  type ImageSizeResult,
} from '../image-size-gate'

const sha = (seed: string): string => `sha256:${seed.repeat(64).slice(0, 64)}`

/** A realistic amd64 Node image manifest: base layer plus four app layers. */
function manifest(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    schemaVersion: 2,
    mediaType: OCI_IMAGE_MANIFEST,
    config: {
      mediaType: 'application/vnd.oci.image.config.v1+json',
      digest: sha('c'),
      size: 4096,
    },
    layers: [
      {
        mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
        digest: sha('a'),
        size: 28_000_000,
      },
      {
        mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
        digest: sha('b'),
        size: 50_000_000,
      },
      {
        mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
        digest: sha('d'),
        size: 2_000_000,
      },
    ],
    ...overrides,
  }
}

describe('measureImageSize — the current fail-open defect', () => {
  it('rejects the descriptor `imagetools inspect --format {{json .Manifest}}` returns', async () => {
    // This is the exact document the old gate parsed: a descriptor, not a
    // manifest. `(m.layers || [])` made it 0 bytes and passed every build.
    const descriptor = {
      mediaType: OCI_IMAGE_MANIFEST,
      digest: sha('e'),
      size: 2002,
    }
    const result = await measureImageSize(descriptor)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('manifest-without-layers')
    expect(result.problems.join(' ')).toContain('descriptor')
  })

  it('rejects a manifest with zero layers instead of reporting 0 bytes', async () => {
    const result = await measureImageSize(manifest({ layers: [] }))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('empty-layers')
  })

  it('rejects a manifest whose layers all report zero', async () => {
    const result = await measureImageSize(
      manifest({
        layers: [
          {
            mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
            digest: sha('a'),
            size: 0,
          },
        ],
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('zero-size')
  })
})

describe('measureImageSize — normal manifest', () => {
  it('sums layer sizes and excludes the config blob', async () => {
    const result = await measureImageSize(manifest())
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.problems.join('; '))
    expect(result.bytes).toBe(80_000_000)
    expect(result.layerCount).toBe(3)
    expect(result.platform).toEqual({ os: 'linux', architecture: 'amd64' })
    expect(result.resolvedFromIndex).toBe(false)
    expect(result.digest).toBe('')
  })

  it('accepts the Docker schema 2 media type as well as OCI', async () => {
    const result = await measureImageSize(
      manifest({ mediaType: DOCKER_IMAGE_MANIFEST }),
    )
    expect(result.ok).toBe(true)
  })

  it('reports the caller-supplied digest', async () => {
    const result = await measureImageSize(manifest(), {
      digest: sha('f'),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.digest).toBe(sha('f'))
  })
})

describe('measureImageSize — malformed documents', () => {
  it('rejects a null document', async () => {
    const result = await measureImageSize(null)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('manifest-not-an-object')
  })

  it('rejects an array where a manifest was expected', async () => {
    const result = await measureImageSize([manifest()])
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('manifest-not-an-object')
  })

  it('rejects a document with no mediaType', async () => {
    const result = await measureImageSize({ layers: [] })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('missing-media-type')
  })

  it('rejects an unknown media type rather than guessing at its shape', async () => {
    const result = await measureImageSize({
      ...manifest(),
      mediaType: 'application/vnd.example.unknown+json',
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('unsupported-media-type')
  })

  it('rejects a non-numeric layer size', async () => {
    const result = await measureImageSize(
      manifest({
        layers: [
          {
            mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
            digest: sha('a'),
            size: '80000000',
          },
        ],
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('invalid-layers')
    expect(result.problems.join(' ')).toContain('finite number')
  })

  it('rejects a negative layer size', async () => {
    const result = await measureImageSize(
      manifest({
        layers: [
          {
            mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
            digest: sha('a'),
            size: -1,
          },
        ],
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('invalid-layers')
  })

  it('rejects a layer whose digest is not a sha256 value', async () => {
    const result = await measureImageSize(
      manifest({
        layers: [
          {
            mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
            digest: 'sha256:abc',
            size: 1,
          },
        ],
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('invalid-layers')
    expect(result.problems.join(' ')).toContain('sha256')
  })

  it('rejects a layer that is not an object', async () => {
    const result = await measureImageSize(manifest({ layers: ['nope'] }))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('invalid-layers')
  })

  it('reports every bad layer in one pass instead of stopping at the first', async () => {
    const result = await measureImageSize(
      manifest({
        layers: [
          { mediaType: '', digest: 'bad', size: 'x' },
          { mediaType: '', digest: 'bad', size: 'y' },
        ],
      }),
    )
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(
      result.problems.filter(p => p.startsWith('layers[0]')).length,
    ).toBeGreaterThan(1)
    expect(
      result.problems.filter(p => p.startsWith('layers[1]')).length,
    ).toBeGreaterThan(1)
  })
})

describe('measureImageSize — multi-platform index', () => {
  const amd64 = {
    mediaType: OCI_IMAGE_MANIFEST,
    digest: sha('1'),
    size: 2002,
    platform: { os: 'linux', architecture: 'amd64' },
  }
  const arm64 = {
    mediaType: OCI_IMAGE_MANIFEST,
    digest: sha('2'),
    size: 2004,
    platform: { os: 'linux', architecture: 'arm64' },
  }
  const index = {
    schemaVersion: 2,
    mediaType: OCI_IMAGE_INDEX,
    manifests: [amd64, arm64],
  }

  it('resolves the requested platform and reports that it came from an index', async () => {
    const resolved = new Map<string, unknown>([
      [amd64.digest, manifest()],
      [
        arm64.digest,
        manifest({
          layers: [
            {
              mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
              digest: sha('a'),
              size: 10_000_000,
            },
          ],
        }),
      ],
    ])
    const result = await measureImageSize(index, {
      platform: { os: 'linux', architecture: 'amd64' },
      resolveIndex: (descriptor: Descriptor) =>
        resolved.get(descriptor.digest ?? ''),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error(result.problems.join('; '))
    expect(result.bytes).toBe(80_000_000)
    expect(result.resolvedFromIndex).toBe(true)
    expect(result.digest).toBe(amd64.digest)
    expect(result.platform).toEqual({ os: 'linux', architecture: 'amd64' })
  })

  it('selects arm64 when that is the requested platform', async () => {
    const result = await measureImageSize(index, {
      platform: { os: 'linux', architecture: 'arm64' },
      resolveIndex: () =>
        manifest({
          layers: [
            {
              mediaType: 'application/vnd.oci.image.layer.v1.tar+gzip',
              digest: sha('a'),
              size: 10_000_000,
            },
          ],
        }),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) throw new Error('unreachable')
    expect(result.bytes).toBe(10_000_000)
    expect(result.digest).toBe(arm64.digest)
  })

  it('fails when the platform is absent instead of picking another one', async () => {
    const result = await measureImageSize(index, {
      platform: { os: 'linux', architecture: 's390x' },
      resolveIndex: () => manifest(),
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('platform-not-found')
    expect(result.problems.join(' ')).toContain('linux/amd64')
  })

  it('fails when the index has no manifests array', async () => {
    const result = await measureImageSize({
      mediaType: OCI_IMAGE_INDEX,
      manifests: [],
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('index-without-manifests')
  })

  it('fails when an index needs resolution but no resolver was supplied', async () => {
    const result = await measureImageSize(index)
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('index-needs-resolution')
  })

  it('fails rather than guessing when two entries claim the same platform', async () => {
    const result = await measureImageSize(
      {
        mediaType: OCI_IMAGE_INDEX,
        manifests: [
          amd64,
          {
            ...amd64,
            digest: sha('3'),
            platform: { os: 'linux', architecture: 'amd64', variant: 'v2' },
          },
        ],
      },
      { resolveIndex: () => manifest() },
    )
    // Variant-less target matches both an entry with and without a variant.
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('ambiguous-platform')
  })

  it('propagates a failure from the resolved manifest', async () => {
    const result = await measureImageSize(index, {
      resolveIndex: () => ({
        ...manifest(),
        mediaType: OCI_IMAGE_MANIFEST,
        layers: [],
      }),
    })
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('unreachable')
    expect(result.reason).toBe('empty-layers')
  })

  it('handles the Docker manifest list media type', async () => {
    const result = await measureImageSize(
      { ...index, mediaType: DOCKER_MANIFEST_LIST },
      { resolveIndex: () => manifest() },
    )
    expect(result.ok).toBe(true)
  })
})

describe('evaluateBudget', () => {
  const measured: ImageSizeResult = {
    ok: true,
    bytes: 76_600_000,
    digest: sha('a'),
    layerCount: 3,
    platform: { os: 'linux', architecture: 'amd64' },
    resolvedFromIndex: false,
    layers: [],
  }

  it('passes under the budget', () => {
    const evaluation = evaluateBudget(measured, 120)
    expect(evaluation.ok).toBe(true)
    expect(evaluation.mb).toBeCloseTo(73.05, 1)
  })

  it('fails over the budget', () => {
    const evaluation = evaluateBudget(measured, 60)
    expect(evaluation.ok).toBe(false)
    expect(evaluation.problems[0]).toContain('over the 60 MB budget')
  })

  it('fails closed when the size is unmeasured', () => {
    const evaluation = evaluateBudget(
      { ok: false, reason: 'empty-layers', problems: ['no layers'] },
      120,
    )
    expect(evaluation.ok).toBe(false)
    expect(evaluation.problems[0]).toContain('UNMEASURED')
  })

  it('fails when the budget itself is invalid', () => {
    expect(evaluateBudget(measured, 0).ok).toBe(false)
    expect(evaluateBudget(measured, Number.NaN).ok).toBe(false)
  })

  it('treats exactly-budget as a pass', () => {
    const exact: ImageSizeResult = { ...measured, bytes: 120 * 1024 * 1024 }
    expect(evaluateBudget(exact, 120).ok).toBe(true)
  })
})

describe('parsePlatform', () => {
  it('parses os/architecture', () => {
    expect(parsePlatform('linux/amd64')).toEqual({
      os: 'linux',
      architecture: 'amd64',
    })
  })

  it('parses a variant', () => {
    expect(parsePlatform('linux/arm64/v8')).toEqual({
      os: 'linux',
      architecture: 'arm64',
      variant: 'v8',
    })
  })

  it('rejects an incomplete value', () => {
    expect(() => parsePlatform('linux')).toThrow(/Invalid platform/)
  })

  it('formats for a report', () => {
    expect(
      formatPlatformForReport({
        os: 'linux',
        architecture: 'arm64',
        variant: 'v8',
      }),
    ).toBe('linux/arm64/v8')
  })
})

describe('renderSummary', () => {
  it('names the measured value and the budget', () => {
    const result: ImageSizeResult = {
      ok: true,
      bytes: 80 * 1024 * 1024,
      digest: sha('a'),
      layerCount: 3,
      platform: { os: 'linux', architecture: 'amd64' },
      resolvedFromIndex: false,
      layers: [],
    }
    const text = renderSummary(result, evaluateBudget(result, 120), {
      reference: 'ghcr.io/example/image:main',
    })
    expect(text).toContain('80.0 MB')
    expect(text).toContain('PASS')
    expect(text).toContain('ghcr.io/example/image:main')
  })

  it('renders UNMEASURED instead of a number when measurement failed', () => {
    const result: ImageSizeResult = {
      ok: false,
      reason: 'manifest-without-layers',
      problems: ['no layers array'],
    }
    const text = renderSummary(result, evaluateBudget(result, 120))
    expect(text).toContain('UNMEASURED')
    expect(text).not.toContain('0.0 MB')
    expect(text).toContain('FAIL')
  })
})
