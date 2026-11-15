/**
 * SLSA provenance names the source commit; the publish attestation does not.
 *
 * This repository previously recorded every registry UI package as
 * `sourceCommit: UNVERIFIED`, on the strength of the `publish/v0.1`
 * attestation's payload. That attestation indeed says only which workflow
 * published a package. The SLSA v1 attestation next to it says which commit was
 * built:
 *
 *   uri:       git+https://github.com/baicie/zeus-ui@refs/tags/v0.1.0-beta.34
 *   gitCommit: a8826dd1f81560aaf6459d8d40a3e599f705f6e0
 *
 * `a8826dd1` exists in the UI repository and is what `v0.1.0-beta.34` points
 * at, so the claim is checkable rather than merely recorded.
 */
import { describe, expect, it } from 'vitest'

import {
  SLSA_PROVENANCE_V1,
  attestationMatches,
  readAttestationSource,
} from '../ui-attestation'

/** Builds a DSSE bundle the way npm's registry returns one. */
function bundleWith(predicate: unknown): unknown {
  return {
    attestations: [
      {
        predicateType: SLSA_PROVENANCE_V1,
        bundle: {
          dsseEnvelope: {
            payload: Buffer.from(
              JSON.stringify({
                _type: 'https://in-toto.io/Statement/v1',
                predicateType: SLSA_PROVENANCE_V1,
                predicate,
              }),
            ).toString('base64'),
          },
        },
      },
    ],
  }
}

function predicateFor(commit: string, repository = 'baicie/zeus-ui') {
  return {
    buildDefinition: {
      buildType:
        'https://slsa-framework.github.io/github-actions-buildtypes/workflow/v1',
      externalParameters: {
        workflow: {
          ref: 'refs/tags/v0.1.0-beta.34',
          repository: `https://github.com/${repository}`,
          path: '.github/workflows/publish.yml',
        },
      },
      resolvedDependencies: [
        {
          uri: `git+https://github.com/${repository}@refs/tags/v0.1.0-beta.34`,
          digest: { gitCommit: commit },
        },
      ],
    },
  }
}

const COMMIT = 'a8826dd1f81560aaf6459d8d40a3e599f705f6e0'

describe('readAttestationSource', () => {
  it('extracts the commit, repository and ref', () => {
    expect(readAttestationSource(bundleWith(predicateFor(COMMIT)))).toEqual({
      commit: COMMIT,
      repository: 'baicie/zeus-ui',
      ref: 'refs/tags/v0.1.0-beta.34',
    })
  })

  it('returns undefined when there is no SLSA attestation', () => {
    const publishOnly = {
      attestations: [
        {
          predicateType:
            'https://github.com/npm/attestation/tree/main/specs/publish/v0.1',
        },
      ],
    }
    expect(readAttestationSource(publishOnly)).toBeUndefined()
  })

  it('returns undefined for an empty or malformed response', () => {
    expect(readAttestationSource(undefined)).toBeUndefined()
    expect(readAttestationSource({})).toBeUndefined()
    expect(readAttestationSource({ attestations: 'nope' })).toBeUndefined()
  })

  it('returns undefined when the payload is not base64 JSON', () => {
    const broken = {
      attestations: [
        {
          predicateType: SLSA_PROVENANCE_V1,
          bundle: { dsseEnvelope: { payload: 'not-base64-json' } },
        },
      ],
    }
    expect(readAttestationSource(broken)).toBeUndefined()
  })

  it('ignores a digest that is not a full commit', () => {
    expect(
      readAttestationSource(bundleWith(predicateFor('abc123'))),
    ).toBeUndefined()
  })

  it('ignores a uri that is not a GitHub repository', () => {
    const predicate = predicateFor(COMMIT)
    predicate.buildDefinition.resolvedDependencies[0]!.uri =
      'https://example.com/somewhere'
    expect(readAttestationSource(bundleWith(predicate))).toBeUndefined()
  })
})

describe('attestationMatches', () => {
  const observed = {
    commit: COMMIT,
    repository: 'baicie/zeus-ui',
    ref: 'refs/tags/v0.1.0-beta.34',
  }

  it('accepts the matching repository and commit', () => {
    expect(
      attestationMatches(observed, {
        repository: 'baicie/zeus-ui',
        commit: COMMIT,
      }),
    ).toBe(true)
  })

  it('accepts a repository match when no commit is claimed', () => {
    expect(attestationMatches(observed, { repository: 'baicie/zeus-ui' })).toBe(
      true,
    )
  })

  it('rejects a different repository', () => {
    expect(
      attestationMatches(observed, {
        repository: 'baicie/zeus',
        commit: COMMIT,
      }),
    ).toBe(false)
  })

  it('rejects a different commit', () => {
    expect(
      attestationMatches(observed, {
        repository: 'baicie/zeus-ui',
        commit: 'f'.repeat(40),
      }),
    ).toBe(false)
  })

  it('rejects an absent attestation', () => {
    expect(
      attestationMatches(undefined, { repository: 'baicie/zeus-ui' }),
    ).toBe(false)
  })
})
